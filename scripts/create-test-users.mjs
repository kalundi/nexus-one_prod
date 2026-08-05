import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.log('[TEST-USERS] No database connection — skipping test user creation.');
  process.exit(0);
}

const testUsers = [
  { email: 'admin@nexusmt.com',      name: 'Test Administrator', role: 'ADMIN',      password: 'NexusAdmin042!' },
  { email: 'dispatcher@nexusmt.com', name: 'Test Dispatcher',    role: 'DISPATCHER', password: 'Dispatch2026!'  },
  { email: 'driver@nexusmt.com',     name: 'Test Driver',        role: 'DRIVER',     password: 'Driver2026!'   },
  { email: 'facility@nexusmt.com',   name: 'Test Facility',      role: 'FACILITY',   password: 'Facility2026!' },
  { email: 'billing@nexusmt.com',    name: 'Test Billing',       role: 'BILLING',    password: 'Billing2026!'  },
  { email: 'qa@nexusmt.com',         name: 'Test QA',            role: 'QA',         password: 'Quality2026!'  },
  { email: 'executive@nexusmt.com',  name: 'Test Executive',     role: 'EXECUTIVE',  password: 'Exec2026!'     },
  { email: 'patient@example.com',    name: 'Demo Patient',       role: 'PATIENT',    password: 'Patient123!'   },
];

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

// Retry helper — DB may be momentarily unavailable during deploys
async function withRetry(fn, label, retries = 4, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[TEST-USERS] ${label} attempt ${attempt} failed: ${err.message} — retrying in ${delayMs}ms…`);
      await new Promise(r => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 2, 10000); // exponential back-off, max 10s
    }
  }
}

try {
  const tableCheck = await withRetry(
    () => pool.query("SELECT to_regclass('public.users') AS name"),
    'table-check'
  );
  if (!tableCheck.rows[0]?.name) {
    console.log('[TEST-USERS] users table not found — skipping.');
    await pool.end();
    process.exit(0);
  }

  let updated = 0, created = 0;

  // organization_id is NOT NULL — look it up from the existing admin account
  const orgRow = await withRetry(
    () => pool.query("SELECT organization_id FROM users WHERE role='ADMIN' LIMIT 1"),
    'org-lookup'
  );
  const orgId = orgRow.rows[0]?.organization_id || null;
  console.log(`[TEST-USERS] Organization ID: ${orgId ? orgId.substring(0, 8) + '...' : 'NOT FOUND (will try without)'}`);

  for (const u of testUsers) {
    const passwordHash = crypto.createHash('sha256').update(u.password).digest('hex');
    const existing = await withRetry(
      () => pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [u.email]),
      `lookup-${u.email}`
    );
    if (existing.rows[0]) {
      await withRetry(
        () => pool.query(
          'UPDATE users SET display_name=$2, role=$3, password_hash=$4, active=true, updated_at=now() WHERE id=$1',
          [existing.rows[0].id, u.name, u.role, passwordHash]
        ),
        `update-${u.email}`
      );
      console.log(`[TEST-USERS] Updated: ${u.email} (${u.role})`);
      updated++;
    } else if (orgId) {
      await withRetry(
        () => pool.query(
          'INSERT INTO users(id,email,display_name,role,password_hash,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now())',
          [crypto.randomUUID(), u.email, u.name, u.role, passwordHash, orgId, crypto.randomUUID()]
        ),
        `insert-${u.email}`
      );
      console.log(`[TEST-USERS] Created: ${u.email} (${u.role})`);
      created++;
    } else {
      await withRetry(
        () => pool.query(
          'INSERT INTO users(id,email,display_name,role,password_hash,active,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,now(),now())',
          [crypto.randomUUID(), u.email, u.name, u.role, passwordHash, crypto.randomUUID()]
        ),
        `insert-noorg-${u.email}`
      );
      console.log(`[TEST-USERS] Created (no org): ${u.email} (${u.role})`);
      created++;
    }
  }
  console.log(`[TEST-USERS] Done. Created: ${created}, Updated: ${updated}. All credentials are active.`);
  console.log('[TEST-USERS] Credentials summary:');
  for (const u of testUsers) {
    console.log(`  ${u.role.padEnd(12)} ${u.email.padEnd(28)} password: ${u.password}`);
  }
} catch (err) {
  console.error('[TEST-USERS] FATAL: Failed to ensure test credentials:', err.message);
  // Exit 0 so it doesn't block the build — but log prominently
  console.error('[TEST-USERS] *** CREDENTIALS MAY NOT BE ACTIVE — RUN npm run test:create-users MANUALLY ***');
  process.exit(0);
} finally {
  await pool.end();
}
