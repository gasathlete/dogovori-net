import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresStore, createDatabaseIntake, databaseConfig } from './database.mjs';
import { migrate } from './migrate.mjs';
import { issueHandoff } from './handoff.mjs';

const secret = crypto.getRandomValues(new Uint8Array(32));
const product = 'contract_check';
const subject = crypto.randomUUID();
const operationId = crypto.randomUUID();
const proof = (args = {}) => issueHandoff({ subject, operationId, product,
  audience: 'dogovori-azure-intake', secret, ...args });

test('PostgreSQL migration and persistent intake integration', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Match pg's simple-query protocol for unparameterized SQL batches.
  const migrationClient = { query: async (sql, params) => params
    ? db.query(sql, params) : (await db.exec(sql)).at(-1) };
  assert.equal(await migrate(migrationClient), true);
  assert.equal(await migrate(migrationClient), false);
  const store = createPostgresStore(db);

  await t.test('same nonce accepted once across independent store instances', async () => {
    const nonce = crypto.randomUUID();
    const expires = Math.floor(Date.now() / 1000) + 300;
    const results = await Promise.all(Array.from({ length: 12 }, () =>
      createPostgresStore(db).consumeOnce(nonce, expires)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await store.consumeOnce(crypto.randomUUID(), expires - 400), false);
    assert.equal(await store.consumeOnce(crypto.randomUUID(), expires + 3600), false);
  });
  await t.test('signed operation persists; replay and duplicate operation fail', async () => {
    const intake = createDatabaseIntake({ db, secret, checkEntitlement: async (claims) => {
      assert.deepEqual(claims, { subject, operationId, product });
      return true;
    } });
    const token = await proof();
    const accepted = await intake(token);
    assert.equal(accepted.operationId, operationId);
    assert.match(accepted.blobName, /^[0-9a-f-]{36}$/);
    await assert.rejects(intake(token));
    await assert.rejects(intake(await proof()));
    const reopenedStore = createPostgresStore(db);
    assert.equal((await reopenedStore.findOperation({ subject, operationId })).state, 'reserved');
    assert.equal(await reopenedStore.findOperation({ subject: crypto.randomUUID(), operationId }), null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM azure_intake.operations')).rows[0].n, 1);
  });
  await t.test('denied entitlement burns nonce without reserving an operation', async () => {
    const op = crypto.randomUUID();
    const token = await proof({ operationId: op });
    let entitled = false;
    const intake = createDatabaseIntake({ db, secret, checkEntitlement: async () => entitled });
    await assert.rejects(intake(token));
    entitled = true;
    await assert.rejects(intake(token));
    assert.equal(await store.findOperation({ subject, operationId: op }), null);
  });
  await t.test('SQL rejects invalid product without writing a row', async () => {
    await assert.rejects(store.reserveOperation({ subject, operationId: crypto.randomUUID(),
      product: 'untrusted', blobName: crypto.randomUUID() }));
  });
  await t.test('modified migration history fails and rolls back', async () => {
    await db.query("UPDATE azure_intake.schema_migrations SET checksum = 'modified'");
    await assert.rejects(migrate(migrationClient), /checksum mismatch/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM azure_intake.operations')).rows[0].n, 1);
  });
});

test('missing entitlement backend and database outage fail closed', async () => {
  assert.throws(() => createDatabaseIntake({ db: {}, secret }), /Entitlement backend/);
  let checked = false;
  const intake = createDatabaseIntake({ secret,
    db: { query: async () => { throw new Error('unavailable'); } },
    checkEntitlement: async () => { checked = true; return true; },
  });
  await assert.rejects(intake(await proof()), /unavailable/);
  assert.equal(checked, false);
});

test('production database config requires Azure hostname and verified TLS', async () => {
  await assert.rejects(databaseConfig({}), /Missing/);
  const env = { AZURE_PG_HOST: 'pilot.postgres.database.azure.com', AZURE_PG_DATABASE: 'pilot',
    AZURE_PG_USER: 'runtime', AZURE_PG_PASSWORD: 'test-only' };
  const config = await databaseConfig(env);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.minVersion, 'TLSv1.2');
  assert.equal(config.max, 3);
  await assert.rejects(databaseConfig({ ...env, AZURE_PG_HOST: 'localhost' }), /hostname/);
});
