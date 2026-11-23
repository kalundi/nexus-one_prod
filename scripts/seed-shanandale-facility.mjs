import crypto from 'node:crypto';
import pg from 'pg';

// Provisions Shanandale Assisted Living, LLC for the facility portal and
// links its two Designated Managers (facility agreement, Exhibit F):
//   1. Nimmi Perera — already holds a FACILITY account for her three
//      Bright Hands homes (seed-bright-hands-facility.mjs, which runs
//      earlier in the build). Her primary facility (users.scope_id) stays
//      Bright Hands; Shanandale is added as a user_facilities link
//      (migration 101.001), so her one login can open all four homes.
//   2. Susie John — gets her own FACILITY account with Shanandale as her
//      primary facility (users.scope_id), using the Shanandale office
//      email she was listed under in Nimmi Perera's Nov 23, 2026 email.
//      A password setup token is created so her set-password invite CAN
//      be sent, but — unlike the Bright Hands seed — this script never
//      sends email: the invite goes out only when the owner approves it.
//      If the token expires first, an admin can issue credentials from
//      User Management (resend-credentials) instead.
// Runs on production deploys only (mirrors seed-bright-hands-facility.mjs)
// and is fully idempotent: repeated deploys never reset either manager's
// password, never change Nimmi's primary facility, and never create a
// second setup token for Susie.
if (process.env.CONTEXT !== 'production') {
  console.log('Shanandale facility seed skipped outside production.');
  process.exit(0);
}

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(1);
}

const FACILITY = {
  code: 'shanandale-assisted-living',
  name: 'Shanandale Assisted Living, LLC',
  address: '3032 Shanandale Drive, Silver Spring, MD 20904',
  contactName: 'Nimmi Perera',
  contactEmail: 'shanandaleoffice1@gmail.com',
  contactPhone: '301-572-1595'
};
const MANAGER_1 = { displayName: 'Nimmi Perera', email: 'brighthandsassistedliving@gmail.com' };
const MANAGER_2 = { displayName: 'Susie John', email: 'shanandaleoffice1@gmail.com', phone: '301-828-7635' };
const identitySubject = crypto.randomUUID();
const inviteToken = crypto.randomBytes(32).toString('base64url');
const inviteDigest = crypto.createHash('sha256').update(inviteToken).digest('hex');
const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
// Random one-time password behind the setup link; never printed or logged.
const passwordHash = crypto.createHash('sha256').update(crypto.randomBytes(32).toString('base64url')).digest('hex');

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const usersTable = await client.query("SELECT to_regclass('public.users') AS name");
  const facilitiesTable = await client.query("SELECT to_regclass('public.facilities') AS name");
  const linksTable = await client.query("SELECT to_regclass('public.user_facilities') AS name");
  if (!usersTable.rows[0]?.name) throw new Error('The users table does not exist.');
  if (!facilitiesTable.rows[0]?.name) throw new Error('The facilities table does not exist.');
  if (!linksTable.rows[0]?.name) throw new Error('The user_facilities table does not exist. Run the database migrations first.');

  const columnResult = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
  `);
  const columns = new Set(columnResult.rows.map(row => row.column_name));

  for (const required of ['email', 'display_name', 'password_hash', 'role', 'active']) {
    if (!columns.has(required)) throw new Error(`The users table is missing required column: ${required}`);
  }

  const orgResult = await client.query(
    `SELECT id FROM organizations WHERE name = 'Nexus Medical Transit' LIMIT 1`
  );
  const organizationId = orgResult.rows[0]?.id || null;
  if (!organizationId && columns.has('organization_id')) {
    throw new Error('Could not find the Nexus Medical Transit organization.');
  }

  await client.query(
    `INSERT INTO facilities(facility_code, name, contact_name, contact_email, contact_phone, address, active, updated_at)
     VALUES($1, $2, $3, $4, $5, NULLIF($6, ''), true, now())
     ON CONFLICT (facility_code) DO UPDATE
     SET name = EXCLUDED.name,
         contact_name = EXCLUDED.contact_name,
         contact_email = EXCLUDED.contact_email,
         contact_phone = EXCLUDED.contact_phone,
         address = COALESCE(EXCLUDED.address, facilities.address),
         active = true,
         updated_at = now()`,
    [FACILITY.code, FACILITY.name, FACILITY.contactName, FACILITY.contactEmail, FACILITY.contactPhone, FACILITY.address]
  );
  console.log('[SHANANDALE] Facility row is ready.');

  // Designated Manager 1: link Nimmi Perera's existing FACILITY account.
  // Her scope_id (primary facility) is deliberately left untouched.
  const manager1 = await client.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [MANAGER_1.email]);
  if (manager1.rows[0]) {
    await client.query(
      'INSERT INTO user_facilities(user_id, facility_code) VALUES($1, $2) ON CONFLICT DO NOTHING',
      [manager1.rows[0].id, FACILITY.code]
    );
    console.log('[SHANANDALE] Manager 1 (Nimmi Perera) linked to Shanandale on her existing account.');
  } else {
    console.warn('[SHANANDALE] WARNING: Nimmi Perera\'s FACILITY account was not found; run the Bright Hands seed first, then redeploy so she is linked.');
  }

  // Designated Manager 2: Susie John's own FACILITY account.
  const setupTable = await client.query("SELECT to_regclass('public.password_setup_tokens') AS name");
  if (!setupTable.rows[0]?.name) {
    throw new Error('The password_setup_tokens table does not exist. Run the database migrations first.');
  }

  const existing2 = await client.query('SELECT id, scope_id FROM users WHERE lower(email)=lower($1) LIMIT 1', [MANAGER_2.email]);
  let manager2Id;
  let manager2Created = false;
  if (existing2.rows[0]) {
    manager2Id = existing2.rows[0].id;
    const updateParts = ["role='FACILITY'", 'active=true'];
    const updateValues = [manager2Id];
    if (!existing2.rows[0].scope_id && columns.has('scope_id')) {
      updateParts.push(`scope_id=$${updateValues.length + 1}`);
      updateValues.push(FACILITY.code);
    }
    if (columns.has('updated_at')) {
      updateParts.push('updated_at=now()');
    }
    await client.query(`UPDATE users SET ${updateParts.join(',')} WHERE id=$1`, updateValues);
    console.log('[SHANANDALE] Manager 2 (Susie John) account already exists; facility access ensured.');
  } else {
    const names = ['email', 'display_name', 'password_hash', 'role', 'active'];
    const values = [MANAGER_2.email, MANAGER_2.displayName, passwordHash, 'FACILITY', true];
    if (columns.has('phone')) { names.push('phone'); values.push(MANAGER_2.phone); }
    if (columns.has('identity_subject')) { names.push('identity_subject'); values.push(identitySubject); }
    if (columns.has('scope_id')) { names.push('scope_id'); values.push(FACILITY.code); }
    if (columns.has('organization_id')) { names.push('organization_id'); values.push(organizationId); }
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');

    const result = await client.query(
      `INSERT INTO users(${names.join(',')}) VALUES(${placeholders}) RETURNING id`,
      values
    );
    manager2Id = result.rows[0].id;
    manager2Created = true;
    console.log('[SHANANDALE] Manager 2 (Susie John) account created.');
  }

  await client.query(
    'INSERT INTO user_facilities(user_id, facility_code) VALUES($1, $2) ON CONFLICT DO NOTHING',
    [manager2Id, FACILITY.code]
  );

  if (manager2Created) {
    await client.query(
      `INSERT INTO password_setup_tokens(user_id, token_digest, expires_at)
       VALUES($1, $2, $3)`,
      [manager2Id, inviteDigest, inviteExpiresAt]
    );
    console.log('[SHANANDALE] Password setup token prepared for Susie John. Invite email intentionally NOT sent — it goes out only on owner approval.');
  }

  await client.query('COMMIT');
  console.log('[SHANANDALE] Facility and manager links are ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[SHANANDALE] Error:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
