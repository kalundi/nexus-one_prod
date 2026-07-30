import pg from 'pg';
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if(!connectionString){
  console.log('[LIST-USERS] No database connection string found. Set DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(0);
}

const sslMode = String(process.env.DB_SSL || '').trim().toLowerCase();
const useSsl = sslMode ? !(sslMode === 'false' || sslMode === '0' || sslMode === 'off' || sslMode === 'no') : !/localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

const r = await pool.query(`SELECT id, email, role, active FROM users ORDER BY id`);
console.log('All users in database:');
console.table(r.rows);
await pool.end();
