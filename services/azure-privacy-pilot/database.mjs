import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { authorizeIntakeOperation } from './intake.mjs';

// Separate parameters avoid connection-string sslmode overriding verified TLS.
export async function databaseConfig(env = process.env) {
  for (const name of ['AZURE_PG_HOST', 'AZURE_PG_DATABASE', 'AZURE_PG_USER', 'AZURE_PG_PASSWORD']) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*\.postgres\.database\.azure\.com$/i.test(env.AZURE_PG_HOST)) {
    throw new Error('AZURE_PG_HOST must be an Azure PostgreSQL hostname');
  }
  const ca = env.AZURE_PG_CA_FILE ? await readFile(env.AZURE_PG_CA_FILE, 'utf8') : undefined;
  return {
    host: env.AZURE_PG_HOST, database: env.AZURE_PG_DATABASE,
    user: env.AZURE_PG_USER, password: env.AZURE_PG_PASSWORD, port: 5432,
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(ca ? { ca } : {}) },
    max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    statement_timeout: 10000, lock_timeout: 5000,
    application_name: 'dogovori-azure-intake',
  };
}

export async function openDatabase(env = process.env) {
  const pool = new pg.Pool(await databaseConfig(env));
  // Never log connection options, SQL parameters or driver error details.
  pool.on('error', () => console.error('Database idle connection failed'));
  return pool;
}

export function createPostgresStore(db) {
  return {
    async consumeOnce(nonce, expiresAt) {
      const result = await db.query(`
        INSERT INTO azure_intake.handoff_nonces (nonce, expires_at)
        SELECT $1::uuid, to_timestamp($2::double precision)
        WHERE to_timestamp($2::double precision) > clock_timestamp()
          AND to_timestamp($2::double precision) <= clock_timestamp() + interval '330 seconds'
        ON CONFLICT (nonce) DO NOTHING RETURNING nonce`, [nonce, expiresAt]);
      return result.rows.length === 1;
    },
    async reserveOperation({ subject, operationId, product, blobName }) {
      const result = await db.query(`
        INSERT INTO azure_intake.operations (operation_id, subject_id, product, blob_name)
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
        ON CONFLICT (operation_id) DO NOTHING RETURNING operation_id`,
      [operationId, subject, product, blobName]);
      return result.rows.length === 1;
    },
    async findOperation({ subject, operationId }) {
      const result = await db.query(`
        SELECT operation_id, product, state, created_at
        FROM azure_intake.operations WHERE operation_id = $1::uuid AND subject_id = $2::uuid`,
      [operationId, subject]);
      return result.rows[0] ?? null;
    },
  };
}

// An authoritative server-side entitlement checker remains mandatory. Never
// replace it with a client boolean or infer payment from a signed handoff.
export function createDatabaseIntake({ db, secret, checkEntitlement }) {
  if (typeof checkEntitlement !== 'function') throw new Error('Entitlement backend is required');
  const store = createPostgresStore(db);
  return (token) => authorizeIntakeOperation({
    token, secret, checkEntitlement,
    consumeOnce: store.consumeOnce, reserveOperation: store.reserveOperation,
  });
}
