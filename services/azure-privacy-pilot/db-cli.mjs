import { openDatabase } from './database.mjs';
import { migrate } from './migrate.mjs';

const action = process.argv[2];
let pool;
try {
  if (!['migrate', 'check'].includes(action)) throw new Error('Invalid action');
  pool = await openDatabase();
  const client = await pool.connect();
  try {
    if (action === 'migrate') {
      console.log(await migrate(client) ? 'Database migration applied' : 'Database migration already applied');
    } else {
      await client.query('SELECT nonce FROM azure_intake.handoff_nonces LIMIT 0');
      await client.query('SELECT operation_id FROM azure_intake.operations LIMIT 0');
      const { rows } = await client.query(`SELECT
        has_table_privilege(current_user, 'azure_intake.handoff_nonces', 'INSERT') AND
        has_table_privilege(current_user, 'azure_intake.operations', 'INSERT') AS writable`);
      if (rows[0]?.writable !== true) throw new Error('Insufficient privileges');
      console.log('Database connection, schema and runtime permissions verified');
    }
  } finally { client.release(); }
} catch {
  console.error('Database command failed. Check server configuration, credentials, network and migration state.');
  process.exitCode = 1;
} finally { await pool?.end(); }
