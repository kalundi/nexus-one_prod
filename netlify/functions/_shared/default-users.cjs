const crypto = require('crypto');
const {hashPassword} = require('./password.cjs');

const DEFAULT_TEST_USERS = [
  { email: 'admin@nexusmt.com', name: 'Test Administrator', role: 'ADMIN', password: 'NexusAdmin042!' },
  { email: 'dispatcher@nexusmt.com', name: 'Test Dispatcher', role: 'DISPATCHER', password: 'Dispatch2026!' },
  { email: 'driver@nexusmt.com', name: 'Test Driver', role: 'DRIVER', password: 'Driver2026!' },
  { email: 'facility@nexusmt.com', name: 'Test Facility', role: 'FACILITY', password: 'Facility2026!' },
  { email: 'billing@nexusmt.com', name: 'Test Billing', role: 'BILLING', password: 'Billing2026!' },
  { email: 'qa@nexusmt.com', name: 'Test QA', role: 'QA', password: 'Quality2026!' },
  { email: 'executive@nexusmt.com', name: 'Test Executive', role: 'EXECUTIVE', password: 'Exec2026!' }
];

async function ensureDefaultTestUsers(query, {organizationId = null} = {}) {
  const results = [];
  let created = 0;
  let updated = 0;

  for (const user of DEFAULT_TEST_USERS) {
    const passwordHash = hashPassword(user.password);
    const existing = await query('SELECT id FROM users WHERE lower(email)=lower($1)', [user.email]);
    if (existing.rows[0]) {
      await query(
        'UPDATE users SET display_name=$2, role=$3, password_hash=$4, active=true, updated_at=now() WHERE id=$1',
        [existing.rows[0].id, user.name, user.role, passwordHash]
      );
      updated += 1;
      results.push({ email: user.email, action: 'updated' });
    } else if (organizationId) {
      await query(
        'INSERT INTO users(id,email,display_name,role,password_hash,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now())',
        [crypto.randomUUID(), user.email, user.name, user.role, passwordHash, organizationId, crypto.randomUUID()]
      );
      created += 1;
      results.push({ email: user.email, action: 'created' });
    } else {
      await query(
        'INSERT INTO users(id,email,display_name,role,password_hash,active,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,now(),now())',
        [crypto.randomUUID(), user.email, user.name, user.role, passwordHash, crypto.randomUUID()]
      );
      created += 1;
      results.push({ email: user.email, action: 'created' });
    }
  }

  return { created, updated, results };
}

module.exports = {
  DEFAULT_TEST_USERS,
  ensureDefaultTestUsers
};
