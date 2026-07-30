import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if(!connectionString){
  console.log('[SEED-FLEET] No database connection string found. Set DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(0);
}

const sslMode = String(process.env.DB_SSL || '').trim().toLowerCase();
const useSsl = sslMode ? !(sslMode === 'false' || sslMode === '0' || sslMode === 'off' || sslMode === 'no') : !/localhost|127\.0\.0\.1/.test(connectionString);
const forceExact = String(process.env.FLEET_FORCE_EXACT || 'true').trim().toLowerCase() !== 'false';

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

const targetFleet = [
  { unit: 'BUS-01', type: 'BUS_12_SEATER', status: 'AVAILABLE', lat: 39.2534, lng: -77.2794, heading: 12, speed: 0, driverScopeId: 'DISP001', seats: 12, wheelchairs: 1, intervalDays: 30 },
  { unit: 'BUS-02', type: 'BUS_12_SEATER', status: 'AVAILABLE', lat: 39.2174, lng: -77.2717, heading: 26, speed: 0, driverScopeId: 'DISP002', seats: 12, wheelchairs: 1, intervalDays: 30 },
  { unit: 'VAN-01', type: 'VAN_4_SEAT_WHEELCHAIR', status: 'AVAILABLE', lat: 39.2085, lng: -77.2446, heading: 34, speed: 0, driverScopeId: 'NEXD001', seats: 4, wheelchairs: 1, intervalDays: 30 },
  { unit: 'VAN-02', type: 'VAN_4_SEAT_WHEELCHAIR', status: 'AVAILABLE', lat: 39.1457, lng: -77.2013, heading: 48, speed: 0, driverScopeId: 'NEXD002', seats: 4, wheelchairs: 1, intervalDays: 30 },
  { unit: 'VAN-03', type: 'VAN_4_SEAT_WHEELCHAIR', status: 'AVAILABLE', lat: 39.2860, lng: -77.2050, heading: 73, speed: 0, driverScopeId: 'NEXD003', seats: 4, wheelchairs: 1, intervalDays: 30 },
  { unit: 'VAN-04', type: 'VAN_4_SEAT_WHEELCHAIR', status: 'AVAILABLE', lat: 39.1251, lng: -77.1761, heading: 91, speed: 0, driverScopeId: 'NEXD004', seats: 4, wheelchairs: 1, intervalDays: 30 },
  { unit: 'VAN-05', type: 'VAN_4_SEAT_WHEELCHAIR', status: 'AVAILABLE', lat: 39.1910, lng: -77.2320, heading: 102, speed: 0, driverScopeId: 'NEXD005', seats: 4, wheelchairs: 1, intervalDays: 30 },
  { unit: 'VAN-06', type: 'VAN_4_SEAT_WHEELCHAIR', status: 'AVAILABLE', lat: 39.1710, lng: -77.1530, heading: 118, speed: 0, driverScopeId: 'NEXD006', seats: 4, wheelchairs: 1, intervalDays: 30 },
  { unit: 'AMB-01', type: 'AMBULANCE_BLS', status: 'AVAILABLE', lat: 39.1774, lng: -77.2717, heading: 144, speed: 0, driverScopeId: 'NEXD007', seats: 2, wheelchairs: 0, intervalDays: 21 },
  { unit: 'AMB-02', type: 'AMBULANCE_ALS', status: 'AVAILABLE', lat: 39.2260, lng: -77.1890, heading: 168, speed: 0, driverScopeId: 'NEXD008', seats: 2, wheelchairs: 0, intervalDays: 21 }
];

async function tableExists(name){
  const r = await pool.query("SELECT to_regclass($1) AS name", [`public.${name}`]);
  return Boolean(r.rows[0]?.name);
}

async function tableColumns(name){
  const r=await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [name]
  );
  return new Set(r.rows.map((row)=>String(row.column_name)));
}

try{
  const hasVehicles = await tableExists('vehicles');
  if(!hasVehicles){
    console.log('[SEED-FLEET] vehicles table not found — run migrations first.');
    process.exit(0);
  }

  const units = targetFleet.map((v) => v.unit);
  const columns = await tableColumns('vehicles');
  const hasMaintenanceColumns = columns.has('seat_capacity') && columns.has('wheelchair_capacity') && columns.has('maintenance_interval_days') && columns.has('next_maintenance_date');
  const today = new Date();

  for(const v of targetFleet){
    if(hasMaintenanceColumns){
      const lastMaintenance = new Date(today.getTime() - Math.floor(v.intervalDays / 2) * 86400000);
      const nextMaintenance = new Date(today.getTime() + v.intervalDays * 86400000);
      await pool.query(
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
          updated_at = now()`,
        [
          v.unit, v.type, v.status, v.lat, v.lng, v.heading, v.speed, v.driverScopeId,
          v.seats, v.wheelchairs, v.intervalDays,
          lastMaintenance.toISOString().slice(0,10),
          nextMaintenance.toISOString().slice(0,10),
          'PM schedule seeded'
        ]
      );
    }else{
      await pool.query(
        `INSERT INTO vehicles(
          unit_number, vehicle_type, status,
          latitude, longitude, heading, speed_mph,
          driver_scope_id, last_seen_at, created_at, updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),now())
        ON CONFLICT (unit_number) DO UPDATE SET
          vehicle_type = EXCLUDED.vehicle_type,
          status = EXCLUDED.status,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          heading = EXCLUDED.heading,
          speed_mph = EXCLUDED.speed_mph,
          driver_scope_id = EXCLUDED.driver_scope_id,
          last_seen_at = now(),
          updated_at = now()`,
        [v.unit, v.type, v.status, v.lat, v.lng, v.heading, v.speed, v.driverScopeId]
      );
    }
  }

  let removed = 0;
  if(forceExact){
    const deletion = await pool.query('DELETE FROM vehicles WHERE unit_number <> ALL($1::text[])', [units]);
    removed = Number(deletion.rowCount || 0);
  }

  const counts = await pool.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE vehicle_type='BUS_12_SEATER')::int AS buses,
       count(*) FILTER (WHERE vehicle_type='VAN_4_SEAT_WHEELCHAIR')::int AS vans,
       count(*) FILTER (WHERE vehicle_type LIKE 'AMBULANCE_%')::int AS ambulances
     FROM vehicles`
  );

  const composition = counts.rows[0] || { total: 0, buses: 0, vans: 0, ambulances: 0 };
  console.log('[SEED-FLEET] Fleet seed complete.');
  console.log(`[SEED-FLEET] Force exact mode: ${forceExact ? 'ON' : 'OFF'} (removed ${removed} non-target vehicles)`);
  console.table([composition]);

  const roster = await pool.query('SELECT unit_number, vehicle_type, status FROM vehicles ORDER BY unit_number');
  console.table(roster.rows);
}catch(err){
  console.error('[SEED-FLEET] Error:', err.message);
  process.exitCode = 1;
}finally{
  await pool.end();
}
