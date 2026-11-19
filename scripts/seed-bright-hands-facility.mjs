import Email from '../netlify/functions/_shared/email.cjs';
import crypto from 'node:crypto';
import pg from 'pg';

// Provisions the three Bright Hands Assisted Living homes and their
// manager, Nimmi Perera, for the facility portal: her primary facility is
// users.scope_id and all three homes are linked in user_facilities
// (migration 101.001), so one login can open each home. Runs on
// production deploys only (mirrors seed-annapolis-demo-user.mjs) and is
// fully idempotent: repeated deploys never reset the manager's password
// and never resend the invite — the set-password email goes out only
// when the account is first created.
if (process.env.CONTEXT !== 'production') {
  console.log('Bright Hands facility seed skipped outside production.');
  process.exit(0);
}

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(1);
}

const FACILITIES = [
  { code: 'bright-hands-assisted-living', name: 'Bright Hands Assisted Living', address: '14109 Burning Bush Lane, Silver Spring, MD 20906', phone: '301-871-1021' },
  { code: 'bright-hands-assisted-living-ii', name: 'Bright Hands Assisted Living II', address: '9720 Breckenridge Place, Montgomery Village, MD 20886', phone: '301-869-8202' },
  { code: 'bright-hands-assisted-living-iii', name: 'Bright Hands Assisted Living III', address: '808 East Franklin Avenue, Silver Spring, MD 20901', phone: '301-608-8720' }
];
const MANAGER = { displayName: 'Nimmi Perera', email: 'brighthandsassistedliving@gmail.com', phone: '240-722-9373' };
const PRIMARY_CODE = FACILITIES[0].code;
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
let created = false;
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

  for (const facility of FACILITIES) {
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
      [facility.code, facility.name, MANAGER.displayName, MANAGER.email, facility.phone, facility.address]
    );
  }

  const setupTable = await client.query("SELECT to_regclass('public.password_setup_tokens') AS name");
  if (!setupTable.rows[0]?.name) {
    throw new Error('The password_setup_tokens table does not exist. Run the database migrations first.');
  }

  const existing = await client.query('SELECT id, scope_id FROM users WHERE lower(email)=lower($1) LIMIT 1', [MANAGER.email]);
  let userId;
  if (existing.rows[0]) {
    userId = existing.rows[0].id;
    const updateParts = ["role='FACILITY'", 'active=true'];
    const updateValues = [userId];
    if (existing.rows[0].scope_id !== PRIMARY_CODE) {
      updateParts.push(`scope_id=$${updateValues.length + 1}`);
      updateValues.push(PRIMARY_CODE);
    }
    if (columns.has('updated_at')) {
      updateParts.push('updated_at=now()');
    }
    await client.query(`UPDATE users SET ${updateParts.join(',')} WHERE id=$1`, updateValues);
    console.log('[BRIGHT HANDS] Manager account already exists; facility access ensured.');
  } else {
    const names = ['email', 'display_name', 'password_hash', 'role', 'active'];
    const values = [MANAGER.email, MANAGER.displayName, passwordHash, 'FACILITY', true];
    if (columns.has('phone')) { names.push('phone'); values.push(MANAGER.phone); }
    if (columns.has('identity_subject')) { names.push('identity_subject'); values.push(identitySubject); }
    if (columns.has('scope_id')) { names.push('scope_id'); values.push(PRIMARY_CODE); }
    if (columns.has('organization_id')) { names.push('organization_id'); values.push(organizationId); }
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');

    const result = await client.query(
      `INSERT INTO users(${names.join(',')}) VALUES(${placeholders}) RETURNING id`,
      values
    );
    userId = result.rows[0].id;
    created = true;
    console.log('[BRIGHT HANDS] Manager account created.');
  }

  for (const facility of FACILITIES) {
    await client.query(
      'INSERT INTO user_facilities(user_id, facility_code) VALUES($1, $2) ON CONFLICT DO NOTHING',
      [userId, facility.code]
    );
  }

  if (created) {
    await client.query(
      `INSERT INTO password_setup_tokens(user_id, token_digest, expires_at)
       VALUES($1, $2, $3)`,
      [userId, inviteDigest, inviteExpiresAt]
    );
  }

  await client.query('COMMIT');
  console.log('[BRIGHT HANDS] Facilities and manager links are ready.');

  if (created) {
    const inviteUrl = String(process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://nexusmt.com').replace(/\/$/, '') + `/set-password.html?token=${inviteToken}`;
    const inviteHtml = `<h1>Set your Nexus password</h1><p>Your facility account for <strong>Bright Hands Assisted Living</strong> is ready.</p><p>Click this secure link to create your permanent password:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>This link expires in 7 days.</p>`;

    const delivery = await Email.sendEmail(MANAGER.email, 'Set your Nexus password', inviteHtml);
    console.log(delivery.status === 'sent'
      ? '[BRIGHT HANDS] Password setup email sent.'
      : '[BRIGHT HANDS] Password setup email was not sent (email service not configured or delivery failed).');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[BRIGHT HANDS] Error:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
