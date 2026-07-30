import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.NETLIFY_DB_URL,
  ssl: { rejectUnauthorized: false }
});

// Check sessions table exists
const tables = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('users','sessions','audit_log')
  ORDER BY table_name
`);
console.log('Tables present:', tables.rows.map(r => r.table_name).join(', '));

// Try a test INSERT into sessions (then rollback)
const crypto = await import('node:crypto');
const testToken = crypto.randomBytes(8).toString('hex');
try {
  await pool.query('BEGIN');
  await pool.query(
    `INSERT INTO sessions(token_digest,user_id,expires_at) VALUES($1,1,now()+interval '1 minute')`,
    [testToken]
  );
  await pool.query('ROLLBACK');
  console.log('Sessions INSERT: ✓ works');
} catch(e) {
  await pool.query('ROLLBACK').catch(() => {});
  console.log('Sessions INSERT: ✗ FAILED -', e.message);
}

await pool.end();
