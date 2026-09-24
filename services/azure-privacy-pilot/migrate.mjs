import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Caller supplies one dedicated connection, never pool.query: the lock and
// transaction must remain on the same PostgreSQL session.
export async function migrate(client) {
  const sql = await readFile(new URL('./migrations/001_intake.sql', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(741902601)');
    await client.query('CREATE SCHEMA IF NOT EXISTS azure_intake');
    await client.query('REVOKE ALL ON SCHEMA azure_intake FROM PUBLIC');
    await client.query(`CREATE TABLE IF NOT EXISTS azure_intake.schema_migrations (
      version integer PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    const { rows } = await client.query('SELECT checksum FROM azure_intake.schema_migrations WHERE version = 1');
    if (rows.length && rows[0].checksum !== checksum) throw new Error('Migration checksum mismatch');
    if (!rows.length) {
      await client.query(sql);
      await client.query('INSERT INTO azure_intake.schema_migrations (version, checksum) VALUES (1, $1)', [checksum]);
    }
    await client.query('COMMIT');
    return !rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
