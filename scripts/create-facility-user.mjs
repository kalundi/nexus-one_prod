import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(1);
}

const facilityName = String(process.env.NEXUS_FACILITY_NAME || 'Adventist HealthCare Rehabilitation Rockville').trim();
const facilityCode = String(process.env.NEXUS_FACILITY_CODE || facilityName)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const displayName = String(process.env.NEXUS_FACILITY_CONTACT_NAME || 'Katherine Eames').trim();
const email = String(process.env.NEXUS_FACILITY_EMAIL || 'keames@adventisthealthcare.com').trim().toLowerCase();
const phone = String(process.env.NEXUS_FACILITY_CONTACT_PHONE || '1-240-620-1940').trim();
const password = String(process.env.NEXUS_FACILITY_PASSWORD || 'TemporaryPassw0rd!');
const address = String(process.env.NEXUS_FACILITY_ADDRESS || '').trim();
const identitySubject = crypto.randomUUID();
const inviteToken = crypto.randomBytes(32).toString('base64url');
const inviteDigest = crypto.createHash('sha256').update(inviteToken).digest('hex');
const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

if (password.length < 12) {
  console.error('NEXUS_FACILITY_PASSWORD must contain at least 12 characters.');
  process.exit(1);
}

console.log(`[FACILITY] Upserting facility: ${facilityName} (${facilityCode})`);
console.log(`[FACILITY] Contact: ${displayName} <${email}>`);

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const usersTable = await client.query("SELECT to_regclass('public.users') AS name");
  const facilitiesTable = await client.query("SELECT to_regclass('public.facilities') AS name");
  if (!usersTable.rows[0]?.name) throw new Error('The users table does not exist.');
  if (!facilitiesTable.rows[0]?.name) throw new Error('The facilities table does not exist.');

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
    [facilityCode, facilityName, displayName, email, phone, address]
  );

  const setupTable = await client.query("SELECT to_regclass('public.password_setup_tokens') AS name");
  if (!setupTable.rows[0]?.name) {
    throw new Error('The password_setup_tokens table does not exist. Run the database migrations first.');
  }

  const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
  let userId;
  if (existing.rows[0]) {
    const updateParts = ['display_name=$2', 'password_hash=$3', "role='FACILITY'", 'active=true'];
    const updateValues = [existing.rows[0].id, displayName, passwordHash];

    if (columns.has('identity_subject')) {
      updateParts.push(`identity_subject=$${updateValues.length + 1}`);
      updateValues.push(identitySubject);
    }
    if (columns.has('scope_id')) {
      updateParts.push(`scope_id=$${updateValues.length + 1}`);
      updateValues.push(facilityCode);
    }
    if (columns.has('organization_id')) {
      updateParts.push(`organization_id=$${updateValues.length + 1}`);
      updateValues.push(organizationId);
    }
    if (columns.has('updated_at')) {
      updateParts.push('updated_at=now()');
    }

    const result = await client.query(
      `UPDATE users SET ${updateParts.join(',')} WHERE id=$1 RETURNING id, email, role, active, scope_id`,
      updateValues
    );
    console.log(`[FACILITY] User updated: ${result.rows[0]?.email}, role=${result.rows[0]?.role}, scope_id=${result.rows[0]?.scope_id}`);
    userId = result.rows[0].id;
  } else {
    const names = ['email', 'display_name', 'password_hash', 'role', 'active'];
    const values = [email, displayName, passwordHash, 'FACILITY', true];
    if (columns.has('identity_subject')) { names.push('identity_subject'); values.push(identitySubject); }
    if (columns.has('scope_id')) { names.push('scope_id'); values.push(facilityCode); }
    if (columns.has('organization_id')) { names.push('organization_id'); values.push(organizationId); }
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');

    const result = await client.query(
      `INSERT INTO users(${names.join(',')}) VALUES(${placeholders}) RETURNING id, email, role, active, scope_id`,
      values
    );
    console.log(`[FACILITY] User created: ${result.rows[0]?.email}, role=${result.rows[0]?.role}, scope_id=${result.rows[0]?.scope_id}`);
    userId = result.rows[0].id;
  }

  await client.query(
    `INSERT INTO password_setup_tokens(user_id, token_digest, expires_at)
     VALUES($1, $2, $3)`,
    [userId, inviteDigest, inviteExpiresAt]
  );

  await client.query('COMMIT');
  console.log('[FACILITY] Facility user is ready.');
  console.log(`[FACILITY] Email: ${email}`);
  console.log(`[FACILITY] Facility code: ${facilityCode}`);

  const inviteUrl = String(process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://nexusmt.com').replace(/\/$/, '') + `/set-password.html?token=${inviteToken}`;
  const inviteHtml = `<h1>Set your Nexus password</h1><p>Your facility account for <strong>${facilityName}</strong> is ready.</p><p>Click this secure link to create your permanent password:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>This link expires in 7 days.</p>`;

  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{to: [{email}]}],
        from: {email: process.env.SENDGRID_FROM_EMAIL, name: 'Nexus Medical Transit'},
        subject: 'Set your Nexus password',
        content: [{type: 'text/html', value: inviteHtml}]
      })
    });
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`SendGrid request failed (${response.status}) ${details}`.trim());
    }
    console.log('[FACILITY] Password setup email sent.');
  } else {
    console.log('[FACILITY] SENDGRID_API_KEY or SENDGRID_FROM_EMAIL is not configured; email was not sent.');
    console.log(`[FACILITY] Invite link: ${inviteUrl}`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[FACILITY] Error:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}