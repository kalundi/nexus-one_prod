#!/usr/bin/env node
/**
 * Seed Real Fleet Vehicles
 * Populates the database with the actual Nexus Medical Transit fleet
 * 7-vehicle fleet across 6 service tiers
 */

import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;

if (!connectionString) {
  console.log('[FLEET-SEED] No database connection — skipping fleet seeding.');
  process.exit(0);
}

const sslMode = String(process.env.DB_SSL || '').trim().toLowerCase();
const useSsl = sslMode ? !(sslMode === 'false' || sslMode === '0' || sslMode === 'off' || sslMode === 'no') : !/localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

// REAL NEXUS FLEET — 7 vehicles across 6 service tiers
const realFleet = [
  {
    unit: 'SE-254-01',
    type: 'SEDAN',
    status: 'AVAILABLE',
    name: '2016 Tesla Model 3',
    lat: 39.1434,
    lng: -77.2014,
    heading: 0,
    speed: 0,
    seats: 2,
    wheelchairs: 0,
    fuelType: 'Electric',
    mpg: null, // EV — no MPG
    intervalDays: 250, // Service every ~12,500 miles (tire rotation, brake fluid, cabin filter)
    maintenance: 'Tesla-recommended annual service; tire rotation every 6,250 mi, brake fluid every 2 years, cabin air filter annually',
    equipmentDesc: 'First aid kit, emergency flashers, autopilot driver assist, GPS, backup camera, premium audio, all-wheel drive, climate control, ambulatory transport configured'
  },
  {
    unit: 'SUV-254-01',
    type: 'SUV',
    status: 'AVAILABLE',
    name: '2017 Land Rover Range Rover HSE',
    lat: 39.0840,
    lng: -77.1528,
    heading: 90,
    speed: 0,
    seats: 3,
    wheelchairs: 0,
    fuelType: 'Gasoline',
    mpg: 20,
    intervalDays: 150, // Service every 7,500 miles
    maintenance: 'Service every 7,500 miles; Land Rover InControl checks, air suspension inspection, differential service annually',
    equipmentDesc: 'Meridian surround sound, heated/ventilated/massaging seats, panoramic sunroof, 4-zone climate control, adaptive cruise, lane keep assist, blind spot monitor, 360° surround camera, terrain response, air suspension, ambulatory luxury transport configured'
  },
  {
    unit: 'WV-254-01',
    type: 'WHEELCHAIR_VAN',
    status: 'AVAILABLE',
    name: '2017 Ford Transit 350 HD',
    lat: 39.2085,
    lng: -77.2446,
    heading: 180,
    speed: 0,
    seats: 12,
    wheelchairs: 3,
    fuelType: 'Diesel',
    mpg: 18,
    intervalDays: 125, // Service every 5,000 miles
    maintenance: 'Service every 5,000 miles; hydraulic lift inspection quarterly, wheelchair securement systems monthly, ADA compliance inspection annually',
    equipmentDesc: 'ADA compliant (AOA certified), hydraulic side-door ramp, rear hydraulic lift (1,000 lb capacity), 3x Q\'Straint auto-lock wheelchair securements, 12x lap/shoulder belts, emergency exit hatch, dual-zone climate control, oxygen system, suction unit, patient intercom, 360° camera, blind spot monitoring, lane departure warning'
  },
  {
    unit: 'SH-254-01',
    type: 'SHUTTLE',
    status: 'AVAILABLE',
    name: '2017 Ford Transit 350 HD',
    lat: 39.1765,
    lng: -77.2713,
    heading: 270,
    speed: 0,
    seats: 14,
    wheelchairs: 1,
    fuelType: 'Diesel',
    mpg: 17,
    intervalDays: 150, // Service every 7,500 miles
    maintenance: 'Service every 7,500 miles; hydraulic lift inspection quarterly, ADA access systems monthly',
    equipmentDesc: 'ADA compliant, hydraulic side-door ramp, 1x Q\'Straint wheelchair securement, 14x passenger seats with lap/shoulder belts, emergency exit hatch, climate control, onboard WiFi, USB charging ports, first aid kit, GPS, backup camera — shuttle/group transport configured'
  },
  {
    unit: 'AMB-254-01',
    type: 'AMBULANCE',
    status: 'AVAILABLE',
    name: '2010 Ford Transit CG Ambulance — BLS',
    lat: 38.9807,
    lng: -77.1003,
    heading: 45,
    speed: 0,
    seats: 2,
    wheelchairs: 0,
    fuelType: 'Gasoline',
    mpg: 14,
    intervalDays: 75, // Service every 3,000 miles per MIEMSS
    maintenance: 'Service every 3,000 miles per MIEMSS protocol; medical equipment inspection monthly, oxygen systems quarterly, stretcher/cot certification annually',
    equipmentDesc: 'BLS certified; power stretcher/cot (700 lb capacity), AED/defibrillator, BVM, oxygen (portable + onboard), suction unit, trauma kit, spinal immobilization board, BP cuffs, pulse oximeter, glucometer, IV start kit, first aid advanced, climate-controlled patient compartment, LED lightbar, multi-tone siren, reflective striping, mobile data terminal, GPS-AVL, backup camera'
  },
  {
    unit: 'AMB-254-02',
    type: 'AMBULANCE',
    status: 'AVAILABLE',
    name: '2010 Ford Transit CG Ambulance — ALS 2',
    lat: 39.4143,
    lng: -77.4105,
    heading: 135,
    speed: 0,
    seats: 2,
    wheelchairs: 0,
    fuelType: 'Gasoline',
    mpg: 14,
    intervalDays: 75, // Service every 3,000 miles per MIEMSS
    maintenance: 'Service every 3,000 miles per MIEMSS protocol; medical equipment inspection monthly, ALS equipment quarterly, ventilator certification every 6 months',
    equipmentDesc: 'ALS 2 certified; cardiac monitor/defibrillator (12-lead ECG), IV pump, advanced airway management, ventilator, high-flow oxygen, suction, waveform capnography, 12-lead transmission, external pacing capability, IO/IV access, drug administration kit, spinal board, KED, power stretcher/cot, ICT telemedicine capable, LED lightbar, multi-tone siren, mobile data terminal, GPS-AVL, collision avoidance, automatic emergency braking'
  },
  {
    unit: 'ST-254-01',
    type: 'STRETCHER',
    status: 'AVAILABLE',
    name: '2010 Ford Transit CG — Stretcher',
    lat: 38.9843,
    lng: -77.0786,
    heading: 315,
    speed: 0,
    seats: 2,
    wheelchairs: 0,
    fuelType: 'Gasoline',
    mpg: 14,
    intervalDays: 75, // Service every 3,000 miles
    maintenance: 'Service every 3,000 miles; stretcher/cot load system inspection monthly, oxygen systems quarterly',
    equipmentDesc: 'Stretcher transport configured; power stretcher/cot (700 lb capacity), auto-load system, oxygen (portable + onboard), suction unit, BVM, AED, trauma kit, BP/pulse monitoring, climate-controlled patient compartment, bariatric capability, GPS, backup camera, LED lights, reflective striping — non-emergency stretcher transport'
  }
];

async function tableExists(name) {
  const r = await pool.query("SELECT to_regclass($1) AS name", [`public.${name}`]);
  return Boolean(r.rows[0]?.name);
}

async function tableColumns(name) {
  const r = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [name]
  );
  return new Set(r.rows.map((row) => String(row.column_name)));
}

try {
  const hasVehicles = await tableExists('vehicles');
  if (!hasVehicles) {
    console.log('[FLEET-SEED] vehicles table not found — run migrations first.');
    process.exit(0);
  }

  const units = realFleet.map((v) => v.unit);
  const columns = await tableColumns('vehicles');
  const hasMaintenanceColumns = columns.has('seat_capacity') && columns.has('wheelchair_capacity') && columns.has('maintenance_interval_days');
  const today = new Date();

  let inserted = 0;
  let updated = 0;

  for (const v of realFleet) {
    const lastMaintenance = new Date(today.getTime() - Math.floor(v.intervalDays / 2) * 86400000);
    const nextMaintenance = new Date(today.getTime() + v.intervalDays * 86400000);

    if (hasMaintenanceColumns) {
      const result = await pool.query(
        `INSERT INTO vehicles(
          unit_number, vehicle_type, status,
          latitude, longitude, heading, speed_mph,
          driver_scope_id, seat_capacity, wheelchair_capacity,
          maintenance_interval_days, last_maintenance_date, next_maintenance_date,
          maintenance_notes, last_seen_at, created_at, updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now(),now())
        ON CONFLICT (unit_number) DO UPDATE SET
          vehicle_type = EXCLUDED.vehicle_type,
          status = EXCLUDED.status,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          heading = EXCLUDED.heading,
          speed_mph = EXCLUDED.speed_mph,
          driver_scope_id = EXCLUDED.driver_scope_id,
          seat_capacity = EXCLUDED.seat_capacity,
          wheelchair_capacity = EXCLUDED.wheelchair_capacity,
          maintenance_interval_days = EXCLUDED.maintenance_interval_days,
          last_maintenance_date = EXCLUDED.last_maintenance_date,
          next_maintenance_date = EXCLUDED.next_maintenance_date,
          maintenance_notes = EXCLUDED.maintenance_notes,
          last_seen_at = now(),
          updated_at = now()
        RETURNING xmax`,
        [
          v.unit, v.type, v.status, v.lat, v.lng, v.heading, v.speed, null,
          v.seats, v.wheelchairs, v.intervalDays,
          lastMaintenance.toISOString().slice(0, 10),
          nextMaintenance.toISOString().slice(0, 10),
          `${v.maintenance} | ${v.equipmentDesc}`
        ]
      );

      if (result.rows[0]?.xmax === '0') {
        inserted++;
        console.log(`[FLEET-SEED] ✓ Inserted ${v.unit}: ${v.name}`);
      } else {
        updated++;
        console.log(`[FLEET-SEED] ✓ Updated ${v.unit}: ${v.name}`);
      }
    } else {
      await pool.query(
        `INSERT INTO vehicles(
          unit_number, vehicle_type, status,
          latitude, longitude, heading, speed_mph,
          last_seen_at, created_at, updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now(),now())
        ON CONFLICT (unit_number) DO UPDATE SET
          vehicle_type = EXCLUDED.vehicle_type,
          status = EXCLUDED.status,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          heading = EXCLUDED.heading,
          speed_mph = EXCLUDED.speed_mph,
          last_seen_at = now(),
          updated_at = now()`,
        [v.unit, v.type, v.status, v.lat, v.lng, v.heading, v.speed]
      );
      console.log(`[FLEET-SEED] ✓ Seeded ${v.unit}: ${v.name}`);
    }
  }

  // Remove any vehicles not in the real fleet
  const deletion = await pool.query('DELETE FROM vehicles WHERE unit_number <> ALL($1::text[])', [units]);
  const removed = Number(deletion.rowCount || 0);

  console.log(`\n[FLEET-SEED] Fleet Seeding Complete:`);
  console.log(`  ✓ Inserted: ${inserted}`);
  console.log(`  ✓ Updated:  ${updated}`);
  console.log(`  ✓ Removed:  ${removed}`);
  console.log(`  ✓ Total:    ${realFleet.length} vehicles`);
  console.log(`\nNexus Fleet:`);
  realFleet.forEach(v => {
    console.log(`  • ${v.unit.padEnd(12)} ${v.name.padEnd(45)} [${v.type}]`);
  });

  process.exit(0);
} catch (e) {
  console.error('[FLEET-SEED] Error:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
