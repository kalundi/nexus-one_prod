import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

try {
  // Check if admin user exists
  const result = await pool.query(
    `SELECT id, email, password_hash, display_name, role, active, identity_subject, organization_id 
     FROM users WHERE lower(email) = lower('admin@nexusmt.com')`
  );

  if (result.rows[0]) {
    const user = result.rows[0];
    console.log('Admin user found:');
    console.log(`  Email: ${user.email}`);
    console.log(`  Display Name: ${user.display_name}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Active: ${user.active}`);
    console.log(`  Password Hash Length: ${user.password_hash?.length || 'NULL'}`);
    console.log(`  Password Hash: ${user.password_hash?.substring(0, 32)}...`);
    console.log(`  Identity Subject: ${user.identity_subject?.substring(0, 8)}...`);
    console.log(`  Organization ID: ${user.organization_id}`);

    // Test password hash
    const testPassword = 'NexusAdmin042!';
    const testHash = crypto.createHash('sha256').update(testPassword).digest('hex');
    console.log(`\nTest password hash: ${testHash.substring(0, 32)}...`);
    console.log(`Hashes match: ${testHash === user.password_hash}`);
  } else {
    console.log('Admin user NOT FOUND in database');
  }

  // Check organizations table
  const orgs = await pool.query('SELECT id, name, display_name FROM organizations WHERE name = $1', ['Nexus Medical Transit']);
  if (orgs.rows[0]) {
    console.log(`\nDefault organization found: ${orgs.rows[0].name} (ID: ${orgs.rows[0].id.substring(0, 8)}...)`);
  } else {
    console.log('\nDefault organization NOT FOUND');
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
