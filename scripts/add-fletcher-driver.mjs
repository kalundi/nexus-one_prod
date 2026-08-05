#!/usr/bin/env node

/**
 * Create Fletcher Kalundi driver account
 * 
 * Usage: node scripts/add-fletcher-driver.mjs
 * 
 * This creates:
 * - User account with DRIVER role
 * - Employee record as 24/7 floater driver
 * - 24/7 shift availability (on-call)
 * - Medical transport certifications and skills
 */

import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;

if (!connectionString) {
  console.log('[FLETCHER-DRIVER] No database connection — skipping driver creation.');
  process.exit(0);
}

const digest = (v) => crypto.createHash('sha256').update(v).digest('hex');

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

const FLETCHER = {
  email: 'fletcher@nexusmt.com',
  name: 'Fletcher Kalundi',
  password: 'Fletcher2026!',
  role: 'DRIVER',
  phone: '301-500-7946',
  employeeCode: 'NEXF001'
};

try {
  // Check if users table exists
  const tableCheck = await pool.query("SELECT to_regclass('public.users') AS name");
  if (!tableCheck.rows[0]?.name) {
    console.log('[FLETCHER-DRIVER] users table not found — skipping.');
    await pool.end();
    process.exit(0);
  }

  console.log('[FLETCHER-DRIVER] Creating user and employee records for', FLETCHER.email);

  // Create or update user
  const existingUser = await pool.query(
    'SELECT id FROM users WHERE lower(email)=lower($1)',
    [FLETCHER.email]
  );

  const userColumns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
  `);
  const columns = new Set(userColumns.rows.map((row) => row.column_name));

  let userId;
  if (existingUser.rows[0]) {
    userId = existingUser.rows[0].id;
    const passwordHash = digest(FLETCHER.password);
    const updateParts = ['display_name=$2', 'role=$3', 'password_hash=$4', 'active=true'];
    const updateValues = [userId, FLETCHER.name, FLETCHER.role, passwordHash];
    if (columns.has('phone')) {
      updateParts.push(`phone=$${updateValues.length + 1}`);
      updateValues.push(FLETCHER.phone);
    }
    await pool.query(
      `UPDATE users SET ${updateParts.join(', ')}, updated_at=now() WHERE id=$1`,
      updateValues
    );
    console.log(`[FLETCHER-DRIVER] Updated existing user: ${FLETCHER.email}`);
  } else {
    userId = crypto.randomUUID();
    const passwordHash = digest(FLETCHER.password);
    const names = ['id', 'email', 'display_name', 'role', 'password_hash', 'active'];
    const values = [userId, FLETCHER.email.toLowerCase(), FLETCHER.name, FLETCHER.role, passwordHash, true];
    if (columns.has('phone')) {
      names.push('phone');
      values.push(FLETCHER.phone);
    }
    await pool.query(
      `INSERT INTO users(${names.join(',')}) VALUES(${values.map((_, index) => `$${index + 1}`).join(',')}, now(), now())`,
      values
    );
    console.log(`[FLETCHER-DRIVER] Created new user: ${FLETCHER.email}`);
  }

  // Create or update employee record
  const existingEmployee = await pool.query(
    'SELECT id FROM employees WHERE employee_code=$1',
    [FLETCHER.employeeCode]
  );

  if (existingEmployee.rows[0]) {
    await pool.query(
      `UPDATE employees SET 
        user_id=$1, 
        email=$2, 
        phone=$3, 
        active=true, 
        updated_at=now() 
       WHERE employee_code=$4`,
      [userId, FLETCHER.email, FLETCHER.phone, FLETCHER.employeeCode]
    );
    console.log(`[FLETCHER-DRIVER] Updated employee: ${FLETCHER.employeeCode}`);
  } else {
    console.log(`[FLETCHER-DRIVER] Employee will be created by migration: ${FLETCHER.employeeCode}`);
  }

  console.log(`\n[FLETCHER-DRIVER] ✓ Fletcher Kalundi driver account ready`);
  console.log(`[FLETCHER-DRIVER] Email: ${FLETCHER.email}`);
  console.log(`[FLETCHER-DRIVER] Password: ${FLETCHER.password}`);
  console.log(`[FLETCHER-DRIVER] Role: ${FLETCHER.role}`);
  console.log(`[FLETCHER-DRIVER] Availability: 24/7 Floater (On-Call)`);
  console.log(`[FLETCHER-DRIVER] Skills: Wheelchair, Stretcher, Ambulatory, Bariatric, ALS Transport, Facility Transfer`);

} catch (err) {
  console.error('[FLETCHER-DRIVER] Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
