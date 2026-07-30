import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(1);
}

const email = String(process.env.NEXUS_ADMIN_EMAIL || 'admin@nexusmt.com').trim().toLowerCase();
const password = String(process.env.NEXUS_ADMIN_PASSWORD || 'NexusAdmin042!');
const displayName = String(process.env.NEXUS_ADMIN_NAME || 'Nexus Test Administrator').trim();
const identitySubject = crypto.randomUUID();

if (password.length < 12) {
  console.error('NEXUS_ADMIN_PASSWORD must contain at least 12 characters.');
  process.exit(1);
}

console.log(`[ADMIN] Creating/updating admin user: ${email}`);

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
console.log(`[ADMIN] Password hash (first 16 chars): ${passwordHash.substring(0, 16)}...`);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const table = await client.query("SELECT to_regclass('public.users') AS name");
  if (!table.rows[0]?.name) throw new Error('The users table does not exist. Run the earlier database migrations first.');

  const columnResult = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
  `);
  const columns = new Set(columnResult.rows.map(row => row.column_name));
  console.log(`[ADMIN] Users table columns: ${Array.from(columns).join(', ')}`);
  
  for (const required of ['email', 'display_name', 'password_hash', 'role', 'active']) {
    if (!columns.has(required)) throw new Error(`The users table is missing required column: ${required}`);
  }

  const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
  
  // Get or create default organization for organization_id column
  let organizationId = null;
  if (columns.has('organization_id')) {
    const orgResult = await client.query(
      `SELECT id FROM organizations WHERE name = 'Nexus Medical Transit' LIMIT 1`
    );
    organizationId = orgResult.rows[0]?.id;
    console.log(`[ADMIN] Organization ID: ${organizationId ? organizationId.substring(0, 8) + '...' : 'NOT FOUND'}`);
  }
  
  if (existing.rows[0]) {
    console.log(`[ADMIN] User exists with ID: ${existing.rows[0].id.substring(0, 8)}... - updating...`);
    const updateParts = ['display_name=$2', 'password_hash=$3', "role='ADMIN'", 'active=true'];
    const updateValues = [existing.rows[0].id, displayName, passwordHash];
    
    if (columns.has('identity_subject')) {
      const paramIndex = updateValues.length + 1;
      updateParts.push(`identity_subject=$${paramIndex}`);
      updateValues.push(identitySubject);
    }
    if (columns.has('scope_id')) {
      const paramIndex = updateValues.length + 1;
      updateParts.push(`scope_id=$${paramIndex}`);
      updateValues.push(null);
    }
    if (columns.has('organization_id')) {
      const paramIndex = updateValues.length + 1;
      updateParts.push(`organization_id=$${paramIndex}`);
      updateValues.push(organizationId);
    }
    
    const result = await client.query(
      `UPDATE users SET ${updateParts.join(',')} WHERE id=$1 RETURNING id, email, role, active`,
      updateValues
    );
    console.log(`[ADMIN] User updated: ${result.rows[0]?.email}, role=${result.rows[0]?.role}, active=${result.rows[0]?.active}`);
  } else {
    console.log(`[ADMIN] User does not exist - creating...`);
    const names = ['email', 'display_name', 'password_hash', 'role', 'active'];
    const values = [email, displayName, passwordHash, 'ADMIN', true];
    if (columns.has('identity_subject')) { names.push('identity_subject'); values.push(identitySubject); }
    if (columns.has('scope_id')) { names.push('scope_id'); values.push(null); }
    if (columns.has('organization_id')) { names.push('organization_id'); values.push(organizationId); }
    
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    const result = await client.query(`INSERT INTO users(${names.join(',')}) VALUES(${placeholders}) RETURNING id, email, role, active`, values);
    console.log(`[ADMIN] User created: ${result.rows[0]?.email}, role=${result.rows[0]?.role}, active=${result.rows[0]?.active}`);
  }

  await client.query('COMMIT');
  console.log('[ADMIN] Admin test account is ready.');
  console.log(`[ADMIN] Email: ${email}`);
  console.log(`[ADMIN] Password: ${password}`);
  console.log('[ADMIN] Sign in through Livecare using Dispatch sign in, then open /admin.html.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[ADMIN] Error:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
