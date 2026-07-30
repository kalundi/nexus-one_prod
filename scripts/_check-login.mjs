import crypto from 'node:crypto';
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const password = process.env.NEXUS_ADMIN_PASSWORD || 'NexusAdmin042!';
const email = process.env.NEXUS_ADMIN_EMAIL || 'fletcher@nexusmt.com';
const expectedHash = crypto.createHash('sha256').update(password).digest('hex');

const r = await pool.query('SELECT id, email, role, active, password_hash FROM users WHERE lower(email)=lower($1)', [email]);
const u = r.rows[0];
if (!u) {
  console.log('USER NOT FOUND in database for email:', email);
} else {
  console.log('User found:', u.email, '| role:', u.role, '| active:', u.active);
  console.log('Stored hash :', u.password_hash);
  console.log('Expected hash:', expectedHash);
  console.log('Match:', u.password_hash === expectedHash ? '✓ PASS' : '✗ FAIL - passwords do not match');
}
await pool.end();
