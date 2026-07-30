import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if(!connectionString){
  console.log('[SEED-WORKLOAD] No database connection string found. Set DATABASE_URL or NETLIFY_DB_URL.');
  process.exit(0);
}

const sslMode = String(process.env.DB_SSL || '').trim().toLowerCase();
const useSsl = sslMode ? !(sslMode === 'false' || sslMode === '0' || sslMode === 'off' || sslMode === 'no') : !/localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

const WORKLOAD_NOTE_PREFIX = '[WORKLOAD-DEMO]';
const TRIPS_PER_DAY = 10;
const PAST_WEEKDAYS = 5;
const FUTURE_WEEKDAYS = 5;

const workforce = {
  dispatchers: [
    { code: 'DISP001', email: 'dispatcher1@nexusmt.com', name: 'Dispatcher One', role: 'DISPATCHER', password: 'Dispatch2026!', shiftStart: '07:00', shiftEnd: '16:00' },
    { code: 'DISP002', email: 'dispatcher2@nexusmt.com', name: 'Dispatcher Two', role: 'DISPATCHER', password: 'Dispatch2026!', shiftStart: '10:00', shiftEnd: '19:00' }
  ],
  drivers: Array.from({ length: 10 }, (_, idx) => {
    const n = idx + 1;
    return {
      email: `driver${String(n).padStart(2, '0')}@nexusmt.com`,
      name: `Demo Driver ${String(n).padStart(2, '0')}`,
      role: 'DRIVER',
      password: 'Driver2026!',
      unit: `NEXD${String(n).padStart(3, '0')}`
    };
  })
};

const pickupLocations = [
  { address: '155 Limpkin Avenue, Clarksburg, Maryland, 20841', lat: 39.2163562, lng: -77.2863314 },
  { address: '8600 Old Georgetown Rd, Bethesda, Maryland, 20814', lat: 39.000596, lng: -77.111257 },
  { address: '110 Irving Street NW, Washington, DC 20010', lat: 38.9235, lng: -77.0379 },
  { address: '3800 Reservoir Road NW, Washington, DC 20007', lat: 38.9086, lng: -77.0732 },
  { address: '3300 Gallows Road, Falls Church, VA 22042', lat: 38.8817, lng: -77.1714 }
];

const destinationLocations = [
  { address: '2000 Medical Parkway, Annapolis, Maryland, 21401', lat: 38.9893676, lng: -76.5369406 },
  { address: '1 Medical Center Drive, Morgantown, West Virginia, 26506', lat: 39.6549175, lng: -79.9601399 },
  { address: '18101 Prince Philip Drive, Olney, MD 20832', lat: 39.1163, lng: -77.0407 },
  { address: '2041 Georgia Avenue NW, Washington, DC 20060', lat: 38.9275, lng: -77.0213 },
  { address: '600 North Wolfe Street, Baltimore, MD 21287', lat: 39.2974, lng: -76.5898 }
];

const services = ['ambulatory', 'wheelchair', 'broda', 'stretcher', 'bariatric'];
const slotTimes = ['06:30', '07:15', '08:00', '08:45', '09:30', '10:30', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00'];

function ymd(date){
  return date.toISOString().split('T')[0];
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekday(date){
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function randomItem(list){
  return list[Math.floor(Math.random() * list.length)];
}

function generateReference(){
  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `NMT-${datePart}-${crypto.randomInt(1000, 9999)}`;
}

function businessDays(offsetStart, count){
  const out = [];
  let cursor = addDays(new Date(), offsetStart);
  while(out.length < count){
    if(isWeekday(cursor)) out.push(ymd(cursor));
    cursor = addDays(cursor, offsetStart >= 0 ? 1 : -1);
  }
  return out;
}

async function tableExists(name){
  const r = await pool.query("SELECT to_regclass($1) AS name", [`public.${name}`]);
  return Boolean(r.rows[0]?.name);
}

async function upsertUsers(users){
  for(const u of users){
    const passwordHash = crypto.createHash('sha256').update(u.password).digest('hex');
    const existing = await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [u.email]);
    if(existing.rows[0]){
      await pool.query(
        'UPDATE users SET display_name=$2, role=$3, password_hash=$4, active=true, updated_at=now() WHERE id=$1',
        [existing.rows[0].id, u.name, u.role, passwordHash]
      );
    }else{
      await pool.query(
        'INSERT INTO users(id,email,display_name,role,password_hash,active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,now(),now())',
        [crypto.randomUUID(), u.email, u.name, u.role, passwordHash]
      );
    }
  }
}

async function loadUsersByEmail(emails){
  if(!emails.length) return new Map();
  const r = await pool.query(
    'SELECT id, email FROM users WHERE lower(email) = ANY($1::text[])',
    [emails.map((email) => String(email).toLowerCase())]
  );
  const out = new Map();
  for(const row of r.rows){
    out.set(String(row.email).toLowerCase(), row.id);
  }
  return out;
}

async function syncEmployeesAndShifts(usersByEmail, hasEmployees, hasEmployeeShifts){
  const employeeIds = new Map();
  if(!hasEmployees) return employeeIds;

  const people = [
    ...workforce.dispatchers.map((dispatcher) => ({
      code: dispatcher.code,
      role: 'DISPATCHER',
      name: dispatcher.name,
      email: dispatcher.email,
      unit: null
    })),
    ...workforce.drivers.map((driver) => ({
      code: driver.unit,
      role: 'DRIVER',
      name: driver.name,
      email: driver.email,
      unit: driver.unit
    }))
  ];

  for(const person of people){
    const userId = usersByEmail.get(String(person.email).toLowerCase()) || null;
    await pool.query(
      `INSERT INTO employees(employee_code, user_id, role, display_name, email, unit_number, active, metadata, created_at, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,true,$7::jsonb,now(),now())
       ON CONFLICT (employee_code) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, employees.user_id),
         role = EXCLUDED.role,
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         unit_number = EXCLUDED.unit_number,
         active = true,
         updated_at = now()`,
      [
        person.code,
        userId,
        person.role,
        person.name,
        person.email,
        person.unit,
        JSON.stringify({ source: 'seed:workload' })
      ]
    );
  }

  const seededEmployees = await pool.query(
    'SELECT id, employee_code FROM employees WHERE employee_code = ANY($1::text[])',
    [people.map((person) => person.code)]
  );
  for(const row of seededEmployees.rows){
    employeeIds.set(String(row.employee_code), row.id);
  }

  if(hasEmployeeShifts){
    for(const dispatcher of workforce.dispatchers){
      const employeeId = employeeIds.get(dispatcher.code);
      if(!employeeId) continue;
      for(const weekdayIso of [1,2,3,4,5]){
        await pool.query(
          `INSERT INTO employee_shifts(employee_id, assignment_role, weekday_iso, start_time, end_time, effective_start_date, active, notes, created_at, updated_at)
           VALUES($1,'DISPATCHER',$2,$3,$4,CURRENT_DATE,true,$5,now(),now())
           ON CONFLICT (employee_id, assignment_role, weekday_iso, start_time, end_time, effective_start_date)
           DO UPDATE SET active = true, updated_at = now()`,
          [
            employeeId,
            weekdayIso,
            dispatcher.shiftStart,
            dispatcher.shiftEnd,
            `${WORKLOAD_NOTE_PREFIX} dispatcher schedule`
          ]
        );
      }
    }
  }

  return employeeIds;
}

async function loadBookingColumns(){
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings'");
  return new Set(r.rows.map((row) => row.column_name));
}

async function clearPriorSeed(minDate, maxDate, hasHistory){
  const refs = await pool.query(
    'SELECT reference FROM bookings WHERE notes ILIKE $1 AND trip_date BETWEEN $2 AND $3',
    [`${WORKLOAD_NOTE_PREFIX}%`, minDate, maxDate]
  );
  const list = refs.rows.map((r) => r.reference).filter(Boolean);
  if(!list.length) return 0;
  if(hasHistory){
    await pool.query('DELETE FROM trip_status_history WHERE booking_reference = ANY($1::text[])', [list]);
  }
  await pool.query('DELETE FROM bookings WHERE reference = ANY($1::text[])', [list]);
  return list.length;
}

try{
  const hasUsers = await tableExists('users');
  const hasBookings = await tableExists('bookings');
  const hasHistory = await tableExists('trip_status_history');
  const hasEmployees = await tableExists('employees');
  const hasEmployeeShifts = await tableExists('employee_shifts');
  const hasTripWorkAssignments = await tableExists('trip_work_assignments');

  if(!hasUsers){
    console.log('[SEED-WORKLOAD] users table not found — cannot seed dispatchers/drivers.');
    process.exit(0);
  }

  await upsertUsers([...workforce.dispatchers, ...workforce.drivers]);
  const usersByEmail = await loadUsersByEmail([...workforce.dispatchers, ...workforce.drivers].map((u) => u.email));
  const employeeIdsByCode = await syncEmployeesAndShifts(usersByEmail, hasEmployees, hasEmployeeShifts);

  if(!hasBookings){
    console.log('[SEED-WORKLOAD] bookings table not found — users were seeded, trips skipped.');
    const roleCounts = await pool.query(
      "SELECT role, count(*)::int AS total FROM users WHERE role IN ('DISPATCHER','DRIVER') AND active=true GROUP BY role ORDER BY role"
    );
    console.table(roleCounts.rows);
    process.exit(0);
  }

  const bookingColumns = await loadBookingColumns();
  const hasDriverName = bookingColumns.has('driver_name');
  const hasVehicleUnit = bookingColumns.has('vehicle_unit');

  const past = businessDays(-1, PAST_WEEKDAYS).sort();
  const future = businessDays(1, FUTURE_WEEKDAYS).sort();
  const workingDays = [...past, ...future].sort();

  const minDate = workingDays[0];
  const maxDate = workingDays[workingDays.length - 1];
  const removed = await clearPriorSeed(minDate, maxDate, hasHistory);

  let created = 0;
  const perDay = new Map();

  for(let dayIndex = 0; dayIndex < workingDays.length; dayIndex++){
    const tripDate = workingDays[dayIndex];
    for(let i = 0; i < TRIPS_PER_DAY; i++){
      const driver = workforce.drivers[(dayIndex * TRIPS_PER_DAY + i) % workforce.drivers.length];
      const dispatcher = workforce.dispatchers[(dayIndex * TRIPS_PER_DAY + i) % workforce.dispatchers.length];
      const pickup = randomItem(pickupLocations);
      let destination = randomItem(destinationLocations);
      if(destination.address === pickup.address) destination = randomItem(destinationLocations);

      const service = randomItem(services);
      const tripTime = slotTimes[(i + dayIndex) % slotTimes.length];
      const reference = generateReference();
      const riderNum = String(((dayIndex * TRIPS_PER_DAY) + i + 1)).padStart(4, '0');
      const riderName = `Demo Rider ${riderNum}`;
      const riderPhone = `(${200 + (i % 8)}01) 555-${String(1000 + ((dayIndex * TRIPS_PER_DAY + i) % 9000)).padStart(4, '0')}`;
      const riderEmail = `demo.rider.${riderNum}@example.com`;
      const note = `${WORKLOAD_NOTE_PREFIX} weekday workload seed • ${driver.name} (${driver.unit})`;

      const status = hasDriverName || hasVehicleUnit ? 'ASSIGNED' : 'SUBMITTED';

      await pool.query(
        `INSERT INTO bookings(
          reference, name, phone, email, service,
          pickup, destination, trip_date, trip_time,
          pickup_lat, pickup_lng, destination_lat, destination_lng,
          status, notes, created_at, updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())`,
        [
          reference, riderName, riderPhone, riderEmail, service,
          pickup.address, destination.address,
          tripDate, tripTime,
          pickup.lat, pickup.lng, destination.lat, destination.lng,
          status, note
        ]
      );

      if(hasDriverName || hasVehicleUnit){
        const setParts = [];
        const values = [reference];
        let argIndex = 2;
        if(hasDriverName){
          setParts.push(`driver_name=$${argIndex++}`);
          values.push(driver.name);
        }
        if(hasVehicleUnit){
          setParts.push(`vehicle_unit=$${argIndex++}`);
          values.push(driver.unit);
        }
        values.push(status);
        await pool.query(`UPDATE bookings SET ${setParts.join(',')}, status=$${argIndex}, updated_at=now() WHERE reference=$1`, values);
      }

      if(hasHistory){
        await pool.query(
          'INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',
          [reference, status, status.toLowerCase().replaceAll('_', '-'), `${WORKLOAD_NOTE_PREFIX} seeded trip`, 'SEEDER']
        );
      }

      if(hasTripWorkAssignments){
        const driverEmployeeId = employeeIdsByCode.get(driver.unit) || null;
        const dispatcherEmployeeId = employeeIdsByCode.get(dispatcher.code) || null;
        await pool.query(
          `INSERT INTO trip_work_assignments(
            booking_reference, driver_employee_id, dispatcher_employee_id, assignment_status,
            assigned_at, note, created_at, updated_at
          ) VALUES($1,$2,$3,'ASSIGNED',now(),$4,now(),now())`,
          [
            reference,
            driverEmployeeId,
            dispatcherEmployeeId,
            `${WORKLOAD_NOTE_PREFIX} ${dispatcher.name} assigned ${driver.name}`
          ]
        );
      }

      created++;
      perDay.set(tripDate, (perDay.get(tripDate) || 0) + 1);
    }
  }

  const roleCounts = await pool.query(
    "SELECT role, count(*)::int AS total FROM users WHERE role IN ('DISPATCHER','DRIVER') AND active=true GROUP BY role ORDER BY role"
  );
  const demoCount = await pool.query(
    'SELECT count(*)::int AS total FROM bookings WHERE notes ILIKE $1 AND trip_date BETWEEN $2 AND $3',
    [`${WORKLOAD_NOTE_PREFIX}%`, minDate, maxDate]
  );
  let shiftCount = 0;
  let assignmentCount = 0;
  if(hasEmployeeShifts){
    const r = await pool.query(
      'SELECT count(*)::int AS total FROM employee_shifts s JOIN employees e ON e.id=s.employee_id WHERE s.active=true AND e.employee_code IN ($1,$2)',
      ['DISP001','DISP002']
    );
    shiftCount = Number(r.rows[0]?.total || 0);
  }
  if(hasTripWorkAssignments){
    const r = await pool.query(
      'SELECT count(*)::int AS total FROM trip_work_assignments twa JOIN bookings b ON b.reference=twa.booking_reference WHERE b.notes ILIKE $1 AND b.trip_date BETWEEN $2 AND $3',
      [`${WORKLOAD_NOTE_PREFIX}%`, minDate, maxDate]
    );
    assignmentCount = Number(r.rows[0]?.total || 0);
  }

  console.log(`[SEED-WORKLOAD] Removed old workload trips: ${removed}`);
  console.log(`[SEED-WORKLOAD] Created workload trips: ${created}`);
  console.log(`[SEED-WORKLOAD] Window: ${minDate} to ${maxDate} (${workingDays.length} weekdays)`);
  console.log('[SEED-WORKLOAD] Active role counts:');
  console.table(roleCounts.rows);
  console.log(`[SEED-WORKLOAD] Seeded workload trips in window: ${demoCount.rows[0]?.total || 0}`);
  if(hasEmployees) console.log(`[SEED-WORKLOAD] Workforce employees synchronized: ${employeeIdsByCode.size}`);
  if(hasEmployeeShifts) console.log(`[SEED-WORKLOAD] Dispatcher shift rows active: ${shiftCount}`);
  if(hasTripWorkAssignments) console.log(`[SEED-WORKLOAD] Trip work assignments created: ${assignmentCount}`);
  console.log('[SEED-WORKLOAD] Trips per weekday:');
  console.table(Array.from(perDay.entries()).map(([date, total]) => ({ date, total })));
}catch(err){
  console.error('[SEED-WORKLOAD] Error:', err.message);
  process.exitCode = 1;
}finally{
  await pool.end();
}
