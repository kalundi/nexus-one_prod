import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.NETLIFY_DB_URL,
  ssl: { rejectUnauthorized: false }
});

// Check the actual column types
const r = await pool.query(`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='users'
  ORDER BY ordinal_position
`);
console.log('Users table columns:');
console.table(r.rows);
await pool.end();
