import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.log('[TEST-USERS] No database connection — skipping test user creation.');
  process.exit(0);
}

const testUsers = [
  { email: 'dispatcher@nexusmt.com', name: 'Test Dispatcher', role: 'DISPATCHER', password: 'Dispatch2026!' },
  { email: 'driver@nexusmt.com',     name: 'Test Driver',     role: 'DRIVER',      password: 'Driver2026!'   },
  { email: 'facility@nexusmt.com',   name: 'Test Facility',   role: 'FACILITY',    password: 'Facility2026!' },
  { email: 'billing@nexusmt.com',    name: 'Test Billing',    role: 'BILLING',     password: 'Billing2026!'  },
  { email: 'qa@nexusmt.com',         name: 'Test QA',         role: 'QA',          password: 'Quality2026!'  },
  { email: 'executive@nexusmt.com',  name: 'Test Executive',  role: 'EXECUTIVE',   password: 'Exec2026!'     },
];

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

try {
  const tableCheck = await pool.query("SELECT to_regclass('public.users') AS name");
  if (!tableCheck.rows[0]?.name) {
    console.log('[TEST-USERS] users table not found — skipping.');
    await pool.end();
    process.exit(0);
  }

  for (const u of testUsers) {
    const passwordHash = crypto.createHash('sha256').update(u.password).digest('hex');
    const existing = await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [u.email]);
    if (existing.rows[0]) {
      await pool.query(
        'UPDATE users SET display_name=$2, role=$3, password_hash=$4, active=true, updated_at=now() WHERE id=$1',
        [existing.rows[0].id, u.name, u.role, passwordHash]
      );
      console.log(`[TEST-USERS] Updated: ${u.email} (${u.role})`);
    } else {
      await pool.query(
        'INSERT INTO users(id,email,display_name,role,password_hash,active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,now(),now())',
        [crypto.randomUUID(), u.email, u.name, u.role, passwordHash]
      );
      console.log(`[TEST-USERS] Created: ${u.email} (${u.role})`);
    }
  }
  console.log(`[TEST-USERS] Done. Each account has a role-specific password.`);
} catch (err) {
  console.error('[TEST-USERS] Error:', err.message);
} finally {
  await pool.end();
}
