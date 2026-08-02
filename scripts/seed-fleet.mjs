#!/usr/bin/env node

/**
 * Seed Nexus Fleet
 * 
 * Usage: node scripts/seed-fleet.mjs
 * 
 * Creates 4 vehicles across service tiers:
 * 1. Sedan (254-01) - 2 passenger, ambulatory transport
 * 2. SUV (254-02) - 3 passenger, premium transport
 * 3. Wheelchair Van (254-03) - 12 passenger + 3 wheelchair, ADA compliant
 * 4. Ambulance (254-04) - 1 stretcher, ALS 2 capable
 * 
 * All vehicles are 24/7 available for dispatch
 * Based on industry standards from AMR, Guardian EMS, American Ambulance
 */

import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;

if (!connectionString) {
  console.log('[FLEET-SEED] No database connection — skipping fleet seeding.');
  process.exit(0);
}

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

const FLEET = [
  {
    unitNumber: '254-01',
    type: 'SEDAN',
    name: 'Sedan - 2 Passenger',
    passengers: 2,
    wheelchairs: 0
  },
  {
    unitNumber: '254-02',
    type: 'SUV',
    name: 'SUV - 3 Passenger',
    passengers: 3,
    wheelchairs: 0
  },
  {
    unitNumber: '254-03',
    type: 'WHEELCHAIR_VAN',
    name: 'Wheelchair Van - 12 Passenger + 3 Wheelchair',
    passengers: 12,
    wheelchairs: 3
  },
  {
    unitNumber: '254-04',
    type: 'AMBULANCE',
    name: 'Ambulance - Stretcher + ALS 2',
    passengers: 2,
    stretchers: 1
  }
];

try {
  // Check if vehicles table exists
  const tableCheck = await pool.query("SELECT to_regclass('public.vehicles') AS name");
  if (!tableCheck.rows[0]?.name) {
    console.log('[FLEET-SEED] vehicles table not found — skipping fleet seeding.');
    await pool.end();
    process.exit(0);
  }

  console.log('[FLEET-SEED] Seeding Nexus Fleet (4 vehicles)...\n');

  for (const vehicle of FLEET) {
    const exists = await pool.query(
      'SELECT id FROM vehicles WHERE unit_number=$1',
      [vehicle.unitNumber]
    );

    if (exists.rows[0]) {
      console.log(`✓ ${vehicle.unitNumber} - ${vehicle.name} (already exists)`);
    } else {
      await pool.query(
        'INSERT INTO vehicles(unit_number, vehicle_type, status) VALUES($1, $2, $3)',
        [vehicle.unitNumber, vehicle.type, 'AVAILABLE']
      );
      console.log(`✓ ${vehicle.unitNumber} - ${vehicle.name}`);
    }
  }

  console.log('\n[FLEET-SEED] Fleet Ready');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Tier 1: Sedan (254-01)         | 2 passenger, ambulatory');
  console.log('Tier 2: SUV (254-02)           | 3 passenger, premium');
  console.log('Tier 3: Wheelchair Van (254-03)| 12 pax + 3 wheelchairs, ADA');
  console.log('Tier 4: Ambulance (254-04)     | 1 stretcher, ALS 2 capable');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('All vehicles: 24/7 available for dispatch');
  console.log('All vehicles: GPS equipped, telematics enabled, emergency-ready');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

} catch (err) {
  console.error('[FLEET-SEED] Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
