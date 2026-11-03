const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { createHandler } = require('../netlify/functions/_shared/staff-assistant.cjs');

// Fixed clock: Monday Nov 2, 2026, 10:00 AM Eastern. The schema below
// mirrors the production tables the module reads (bookings, employees,
// employee_shifts as recurring weekday patterns, vehicles, gps).
const FIXED_NOW = () => new Date('2026-11-02T15:00:00Z').getTime();

const USERS = {
  'auth-dispatch': { id: 'u-dispatch', role: 'DISPATCHER', display_name: 'Dana Dispatch', session_id: 'sess-1' },
  'auth-admin': { id: 'u-admin', role: 'ADMIN', display_name: 'Adam Admin', session_id: 'sess-2' },
  'auth-driverf': { id: 'u-driverf', role: 'DRIVER', display_name: 'Fletcher Kalundi', scope_id: 'DRV-F', session_id: 'sess-3' },
  'auth-driverk': { id: 'u-driverk', role: 'DRIVER', display_name: 'Kene Emelife', scope_id: 'DRV-K', session_id: 'sess-4' },
  'auth-faca': { id: 'u-faca', role: 'FACILITY', display_name: 'Fran Facility', scope_id: 'FC-A', session_id: 'sess-5' },
  'auth-patient': { id: 'u-patient', role: 'PATIENT', display_name: 'Pat Patient', email: 'pat@example.com', phone: '+1 240-555-0106', session_id: 'sess-6' },
  'auth-billing': { id: 'u-billing', role: 'BILLING', display_name: 'Bill Billing', session_id: 'sess-7' },
  // Legacy fallback session: requireUser resolves it, but it carries
  // no session_id — staff data must stay locked for it.
  'auth-fallback': { id: 'u-fallback', role: 'DISPATCHER', display_name: 'Legacy User' },
};

async function setup() {
  const db = new PGlite();
  await db.exec(`
   CREATE TABLE users(id text PRIMARY KEY, scope_id text, active boolean);
   INSERT INTO users VALUES ('u-driverf','DRV-F',true),('u-driverk','DRV-K',true);
   CREATE TABLE employees(id text PRIMARY KEY, display_name text, email text, phone text, role text, active boolean, user_id text);
   INSERT INTO employees VALUES
    ('emp-fletcher','Fletcher Kalundi','fletcher@nexusmt.com','','DRIVER',true,'u-driverf'),
    ('emp-kene','Kene Emelife','kene@nexusmt.com','','DRIVER',true,'u-driverk');
   CREATE TABLE employee_shifts(id serial PRIMARY KEY, employee_id text, weekday_iso int, start_time time, end_time time, effective_start_date date, effective_end_date date, active boolean, assignment_role text);
   INSERT INTO employee_shifts(employee_id, weekday_iso, start_time, end_time, effective_start_date, effective_end_date, active, assignment_role) VALUES
    ('emp-fletcher',1,'06:00','18:00','2026-01-01',NULL,true,'DRIVER'),
    ('emp-kene',1,'06:00','18:00','2026-01-01',NULL,true,'DRIVER');
   CREATE TABLE vehicles(unit_number text PRIMARY KEY, vehicle_type text, status text, driver_scope_id text);
   INSERT INTO vehicles VALUES
    ('SE-254-01','Sedan','ACTIVE','DRV-F'),
    ('WV-254-01','Wheelchair Van','ACTIVE',NULL),
    ('AMB-254-01','Ambulance','ACTIVE',NULL);
   CREATE TABLE gps_positions(id serial PRIMARY KEY, vehicle_unit text, latitude double precision, longitude double precision, recorded_at timestamptz);
   INSERT INTO gps_positions(vehicle_unit, latitude, longitude, recorded_at) VALUES ('SE-254-01',39.24,-77.28,'2026-11-02T14:55:00Z');
   CREATE TABLE bookings(
    reference text PRIMARY KEY, name text, phone text, email text, service text, pickup text, destination text,
    trip_date date, trip_time time, pickup_time text, trip_type text, return_trip_date date, return_trip_time time,
    status text, driver_name text, driver_user_id text, driver_scope_id text, vehicle_unit text,
    facility_id text, patient_user_id text, duplicate_of text, booking_source text, payment_status text,
    pickup_lat double precision, pickup_lng double precision, destination_lat double precision, destination_lng double precision,
    route_fare_inputs jsonb, created_at timestamptz);
   INSERT INTO bookings(reference, name, email, phone, service, pickup, destination, trip_date, trip_time, trip_type, status, driver_name, driver_user_id, driver_scope_id, vehicle_unit, facility_id, patient_user_id, booking_source, created_at, route_fare_inputs) VALUES
    ('NMT-20261102-1001','Alice Anderson',NULL,NULL,'ambulatory','100 Main St, Annapolis, MD','200 Hospital Ave, Baltimore, MD','2026-11-02','09:00','ONE_WAY','SCHEDULED','Fletcher Kalundi','u-driverf','DRV-F','SE-254-01',NULL,NULL,'CUSTOMER','2026-11-01T12:00:00Z','{"route":{"durationMinutes":48,"trafficDurationMinutes":57}}'),
    ('NMT-20261102-1002','Bob Baker',NULL,NULL,'wheelchair','300 Center St, Rockville, MD','400 Clinic Rd, Bethesda, MD','2026-11-02','10:30','ONE_WAY','REQUESTED',NULL,NULL,NULL,NULL,NULL,NULL,'CUSTOMER','2026-11-01T12:00:00Z',NULL),
    ('NMT-20261102-1003','Carol Clark',NULL,NULL,'wheelchair','500 North Ave, Gaithersburg, MD','600 South Ave, Germantown, MD','2026-11-02','11:15','ONE_WAY','REQUESTED',NULL,NULL,NULL,NULL,NULL,NULL,'CUSTOMER','2026-11-01T12:00:00Z',NULL),
    ('MOCK-NMT-20261102-9001','Mock Person',NULL,NULL,'ambulatory','300 Center St, Rockville, MD','400 Clinic Rd, Bethesda, MD','2026-11-02','08:00','ONE_WAY','MOCK',NULL,NULL,NULL,NULL,NULL,NULL,'MOCK','2026-11-01T12:00:00Z',NULL),
    ('NMT-20261102-1004','Frank Foster',NULL,NULL,'ambulatory','700 Bay St, Annapolis, MD','800 Shore Rd, Annapolis, MD','2026-11-02','13:00','ONE_WAY','SCHEDULED','Fletcher Kalundi','u-driverf','DRV-F','SE-254-01','FC-A',NULL,'FACILITY','2026-11-01T12:00:00Z',NULL),
    ('NMT-20261102-1005','Grace Green',NULL,NULL,'ambulatory','900 Elm St, Columbia, MD','200 Hospital Ave, Baltimore, MD','2026-11-02','14:00','ONE_WAY','SCHEDULED','Kene Emelife','u-driverk','DRV-K','SE-254-01','FC-B',NULL,'FACILITY','2026-11-01T12:00:00Z',NULL),
    ('NMT-20261102-1006','Pat Patient','pat@example.com','240-555-0106','ambulatory','155 Limpkin Ave, Clarksburg, MD','300 Center St, Rockville, MD','2026-11-02','15:30','ONE_WAY','SCHEDULED','Fletcher Kalundi','u-driverf','DRV-F','SE-254-01',NULL,'u-patient','CUSTOMER','2026-11-01T12:00:00Z',NULL),
    ('NMT-20261103-2001','Alice Anderson',NULL,NULL,'ambulatory','100 Main St, Annapolis, MD','200 Hospital Ave, Baltimore, MD','2026-11-03','08:00','ONE_WAY','REQUESTED',NULL,NULL,NULL,NULL,NULL,NULL,'CUSTOMER','2026-11-01T12:00:00Z',NULL);
   CREATE TABLE driveflex_open_shifts(id text PRIMARY KEY, start_at timestamptz, end_at timestamptz, service_level text, operating_area text, vehicle_unit text, status text, created_by text);
   INSERT INTO driveflex_open_shifts(id, start_at, end_at, service_level, operating_area, vehicle_unit, status) VALUES
    ('shift-1','2026-11-03T11:00:00Z','2026-11-03T23:00:00Z','WHEELCHAIR','Montgomery County','WV-254-01','OPEN');
  `);
  const audits = [];
  const invokeApi = async (ev) => {
    const body = JSON.parse(ev.body || '{}');
    if (ev.path === '/api/dispatch/auto-assign') {
      return { statusCode: 200, body: JSON.stringify({ assigned: true, driverName: 'Kene Emelife', vehicleUnit: 'WV-254-01', message: 'Assigned.' }) };
    }
    const ref = decodeURIComponent(ev.path.split('/').pop());
    if (ref === 'NMT-20261102-1003' && body.driverName) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Driver is not scheduled for the full trip window.' }) };
    }
    const { rows } = await db.query('SELECT * FROM bookings WHERE reference=$1', [ref]);
    if (!rows[0]) return { statusCode: 404, body: JSON.stringify({ error: 'Trip not found' }) };
    const dn = 'driverName' in body ? body.driverName : rows[0].driver_name;
    const vu = 'vehicleUnit' in body ? body.vehicleUnit : rows[0].vehicle_unit;
    await db.query('UPDATE bookings SET driver_name=$1, vehicle_unit=$2 WHERE reference=$3', [dn, vu, ref]);
    return { statusCode: 200, body: JSON.stringify({ booking: { reference: ref, driverName: dn, vehicleUnit: vu } }) };
  };
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/alerts')) return { ok: true, json: async () => ({ features: [{ properties: { event: 'Winter Storm Warning', severity: 'Severe', headline: 'Winter Storm Warning in effect until 6 PM' } }] }) };
    if (u.includes('/points/')) return { ok: true, json: async () => ({ properties: { forecast: 'https://api.weather.gov/gridpoints/TEST/1,1/forecast' } }) };
    return { ok: true, json: async () => ({ properties: { periods: [{ name: 'Today', temperature: 46, temperatureUnit: 'F', shortForecast: 'Partly cloudy', detailedForecast: 'Partly cloudy with a high near 46.' }, { name: 'Tonight', temperature: 33, temperatureUnit: 'F', shortForecast: 'Clear', detailedForecast: 'Clear and cold.' }] } }) };
  };
  const handler = createHandler({
    query: (...args) => db.query(...args),
    requireUser: async (authValue) => {
      const user = USERS[authValue];
      if (!user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
      return user;
    },
    bearer: (e) => {
      const h = (e.headers && (e.headers.authorization || e.headers.Authorization)) || '';
      const m = String(h).match(/^Bearer\s+(.+)$/i);
      return m ? m[1].trim() : (h || null);
    },
    json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
    parseBody: (e) => { try { return JSON.parse(e.body || '{}'); } catch { return {}; } },
    audit: async (...args) => { audits.push(args); },
    invokeApi,
    fetchImpl,
    now: FIXED_NOW,
    publicAsk: async () => ({ statusCode: 200, body: JSON.stringify({ answer: 'PUBLIC-ANSWER', mode: 'knowledge' }) }),
    mapBooking: (b) => ({ reference: b.reference, driverName: b.driver_name, vehicleUnit: b.vehicle_unit, passengerName: b.name, status: b.status }),
    readPlatformSettings: async () => ({}),
    serviceVehiclePrefs: { wheelchair: ['WV-254-01'], ambulatory: ['SE-254-01', 'WV-254-01'] },
    resolveServicePolicyKey: (service) => String(service || '').toLowerCase(),
    caretakerListTrips: async () => [],
  });
  const ask = async (authValue, body, sub = 'ask') => {
    const res = await handler(
      { httpMethod: 'POST', path: '/api/assistant/' + sub, headers: authValue ? { authorization: 'Bearer ' + authValue } : {}, body: JSON.stringify(body || {}) },
      ['assistant', sub], 'POST'
    );
    return { status: res.statusCode, data: JSON.parse(res.body) };
  };
  return { db, handler, ask, audits };
}

test('ask without a valid DB session is a clean 401, exactly like confirm', async () => {
  const { ask, db } = await setup();
  try {
    // No token at all. Guests ask through the standalone visitor
    // function; this endpoint is staff-only, so an unauthenticated ask
    // is the same auth error confirm returns — never data, never a 500.
    const guest = await ask(null, { question: 'How many trips today?' });
    assert.equal(guest.status, 401);
    assert.match(guest.data.error, /session has expired/i);
    assert.equal(guest.data.answer, undefined);
    // Unknown / malformed token (requireUser rejects it).
    const badAuth = await ask('auth-nope', { question: 'How many trips today?' });
    assert.equal(badAuth.status, 401);
    assert.match(badAuth.data.error, /session has expired/i);
    assert.equal(badAuth.data.answer, undefined);
    // Legacy fallback session: requireUser resolves it, but it carries
    // no session_id, so the staff endpoint stays locked — same 401.
    const fallback = await ask('auth-fallback', { question: 'How many trips today?' });
    assert.equal(fallback.status, 401);
    assert.match(fallback.data.error, /session has expired/i);
    // Parity anchor: confirm without a session returns the same 401.
    const confirmGuest = await ask(null, { token: 'whatever' }, 'confirm');
    assert.equal(confirmGuest.status, 401);
    assert.equal(confirmGuest.data.error, guest.data.error);
  } finally { await db.close(); }
});

test('signed-in role without a staff surface gets the public answer with its staff envelope', async () => {
  const { ask, db } = await setup();
  try {
    const billing = await ask('auth-billing', { question: 'How many trips today?' });
    assert.equal(billing.status, 200);
    assert.equal(billing.data.answer, 'PUBLIC-ANSWER');
    assert.equal(billing.data.staff.role, 'BILLING');
  } finally { await db.close(); }
});

test('dispatch board counts real trips only, with counts and unassigned', async () => {
  const { ask, db } = await setup();
  try {
    const board = await ask('auth-dispatch', { question: 'How many trips today?' });
    assert.equal(board.data.mode, 'staff');
    assert.equal(board.data.staff.role, 'DISPATCHER');
    assert.match(board.data.answer, /6 trips on the board/);
    assert.match(board.data.answer, /2 still need a driver or vehicle/);
    assert.match(board.data.answer, /NMT-20261102-1002/);
    assert.doesNotMatch(board.data.answer, /MOCK/);
    const duty = await ask('auth-dispatch', { question: "Who's on duty?" });
    assert.match(duty.data.answer, /Fletcher Kalundi/);
    assert.match(duty.data.answer, /Kene Emelife/);
    const lookup = await ask('auth-dispatch', { question: 'Tell me about NMT-20261102-1005' });
    assert.match(lookup.data.answer, /Grace Green/);
    const unassigned = await ask('auth-dispatch', { question: "What's unassigned?" });
    assert.match(unassigned.data.answer, /2 trips still need/);
    assert.doesNotMatch(unassigned.data.answer, /MOCK/);
  } finally { await db.close(); }
});

test('dispatch greeting is personal, proactive and conversational', async () => {
  const { ask, db } = await setup();
  try {
    const greet = await ask('auth-dispatch', { greeting: true });
    assert.equal(greet.data.mode, 'staff');
    assert.match(greet.data.greeting, /Dana/);
    assert.match(greet.data.greeting, /NMT-20261102-1002/);
    assert.doesNotMatch(greet.data.greeting, /\|/);
    assert.ok(Array.isArray(greet.data.chips) && greet.data.chips.length >= 3);
    assert.equal(greet.data.staff.firstName, 'Dana');
  } finally { await db.close(); }
});

test('conversation follow-ups keep date and topic context', async () => {
  const { ask, db } = await setup();
  try {
    const first = await ask('auth-dispatch', { question: 'How many trips today?' });
    const tomorrow = await ask('auth-dispatch', { question: 'And tomorrow?', staffState: first.data.staff.state });
    assert.match(tomorrow.data.answer, /Tue, Nov 3/);
    assert.match(tomorrow.data.answer, /1 trip on the board/);
    const filtered = await ask('auth-dispatch', { question: 'What about the wheelchair ones?', staffState: tomorrow.data.staff.state });
    assert.match(filtered.data.answer, /wheelchair/);
    assert.match(filtered.data.answer, /Tue, Nov 3/);
    assert.match(filtered.data.answer, /no wheelchair trips/);
  } finally { await db.close(); }
});

test('driver sees only own trips — board, roster and other drivers are out of scope', async () => {
  const { ask, db } = await setup();
  try {
    const mine = await ask('auth-driverf', { question: 'How many trips do I have today?' });
    assert.equal(mine.data.mode, 'staff');
    assert.match(mine.data.answer, /3 trips today/);
    assert.match(mine.data.answer, /NMT-20261102-1001/);
    assert.doesNotMatch(mine.data.answer, /NMT-20261102-1005/);
    const boardAsk = await ask('auth-driverf', { question: "What's on the board today?" });
    assert.doesNotMatch(boardAsk.data.answer, /on the board for/);
    assert.doesNotMatch(boardAsk.data.answer, /Grace Green/);
    const otherTrip = await ask('auth-driverf', { question: 'Tell me about NMT-20261102-1005' });
    assert.match(otherTrip.data.answer, /isn't on your schedule/);
    assert.doesNotMatch(otherTrip.data.answer, /Grace Green/);
    const greet = await ask('auth-driverf', { greeting: true });
    assert.match(greet.data.greeting, /Fletcher/);
    assert.match(greet.data.greeting, /NMT-20261102-1004/);
    const shifts = await ask('auth-driverf', { question: 'Any open shifts?' });
    assert.match(shifts.data.answer, /Tue, Nov 3/);
  } finally { await db.close(); }
});

test('facility sees only its own facility — cross-facility is impossible', async () => {
  const { ask, db } = await setup();
  try {
    const mine = await ask('auth-faca', { question: 'How many trips today?' });
    assert.equal(mine.data.mode, 'staff');
    assert.match(mine.data.answer, /1 trip on the board/);
    assert.match(mine.data.answer, /NMT-20261102-1004/);
    assert.doesNotMatch(mine.data.answer, /NMT-20261102-1005/);
    const other = await ask('auth-faca', { question: 'Tell me about NMT-20261102-1005' });
    assert.match(other.data.answer, /isn't one of your facility's trips/);
    assert.doesNotMatch(other.data.answer, /Grace Green/);
    const named = await ask('auth-faca', { question: 'How many trips does FC-B have today?' });
    assert.doesNotMatch(named.data.answer, /NMT-20261102-1005/);
    assert.doesNotMatch(named.data.answer, /Grace Green/);
  } finally { await db.close(); }
});

test('patient sees only own trips', async () => {
  const { ask, db } = await setup();
  try {
    const mine = await ask('auth-patient', { question: 'When is my next ride?' });
    assert.equal(mine.data.mode, 'staff');
    assert.match(mine.data.answer, /NMT-20261102-1006/);
    assert.doesNotMatch(mine.data.answer, /NMT-20261102-1001/);
    const other = await ask('auth-patient', { question: 'Tell me about NMT-20261102-1001' });
    assert.match(other.data.answer, /isn't on your account/);
    assert.doesNotMatch(other.data.answer, /Alice Anderson/);
  } finally { await db.close(); }
});

test('weather answers come from the NWS stub, labeled with source and time', async () => {
  const { ask, db } = await setup();
  try {
    const wx = await ask('auth-dispatch', { question: "What's the weather today?" });
    assert.match(wx.data.answer, /National Weather Service/);
    assert.match(wx.data.answer, /Winter Storm Warning/);
    assert.match(wx.data.answer, /checked/);
  } finally { await db.close(); }
});

test('traffic answers use the stored traffic-aware route for the trip', async () => {
  const { ask, db } = await setup();
  try {
    const traffic = await ask('auth-dispatch', { question: "How's traffic for NMT-20261102-1001?" });
    assert.match(traffic.data.answer, /57 minutes in current traffic/);
    assert.match(traffic.data.answer, /usually 48/);
  } finally { await db.close(); }
});

test('assign flow: proposal, confirmation discipline, execution and audit', async () => {
  const { ask, db, audits } = await setup();
  try {
    // Proposal only — nothing written yet.
    const proposal = await ask('auth-dispatch', { question: 'Assign Kene Emelife with WV-254-01 to NMT-20261102-1002' });
    assert.equal(proposal.data.mode, 'staff');
    assert.ok(proposal.data.proposal && proposal.data.proposal.token, 'a proposal token is issued');
    assert.match(proposal.data.proposal.summary, /Kene Emelife/);
    let row = (await db.query('SELECT driver_name FROM bookings WHERE reference=$1', ['NMT-20261102-1002'])).rows[0];
    assert.equal(row.driver_name, null);
    assert.ok(audits.some((a) => a[2] === 'ASSISTANT_PROPOSED'), 'proposal audited');

    // Garbage token fails.
    const garbage = await ask('auth-dispatch', { token: 'not-a-real-token', action: 'confirm' }, 'confirm');
    assert.equal(garbage.status, 400);

    // Another user cannot confirm someone else's proposal.
    const hijack = await ask('auth-driverf', { token: proposal.data.proposal.token, action: 'confirm' }, 'confirm');
    assert.equal(hijack.status, 403);
    row = (await db.query('SELECT driver_name FROM bookings WHERE reference=$1', ['NMT-20261102-1002'])).rows[0];
    assert.equal(row.driver_name, null);

    // Fresh proposal, confirmed by its owner, executes for real.
    const proposal2 = await ask('auth-dispatch', { question: 'Assign Kene Emelife with WV-254-01 to NMT-20261102-1002' });
    const done = await ask('auth-dispatch', { token: proposal2.data.proposal.token, action: 'confirm' }, 'confirm');
    assert.equal(done.status, 200);
    assert.match(done.data.answer, /Done — Kene Emelife is assigned to NMT-20261102-1002 with WV-254-01/);
    row = (await db.query('SELECT driver_name, vehicle_unit FROM bookings WHERE reference=$1', ['NMT-20261102-1002'])).rows[0];
    assert.equal(row.driver_name, 'Kene Emelife');
    assert.equal(row.vehicle_unit, 'WV-254-01');
    assert.ok(audits.some((a) => a[2] === 'ASSISTANT_EXECUTED'), 'execution audited');

    // Token reuse fails (single-use).
    const reuse = await ask('auth-dispatch', { token: proposal2.data.proposal.token, action: 'confirm' }, 'confirm');
    assert.equal(reuse.status, 400);
  } finally { await db.close(); }
});

test('pre-check surfaces vehicle-service mismatch before any proposal', async () => {
  const { ask, db } = await setup();
  try {
    const blocked = await ask('auth-dispatch', { question: 'Assign Kene Emelife with AMB-254-01 to NMT-20261102-1002' });
    assert.equal(blocked.data.proposal, undefined);
    assert.match(blocked.data.answer, /doesn't fit a wheelchair trip/);
    const unknown = await ask('auth-dispatch', { question: 'Assign Nobody Here to NMT-20261102-1002' });
    assert.equal(unknown.data.proposal, undefined);
    assert.match(unknown.data.answer, /on the active driver roster/);
  } finally { await db.close(); }
});

test('endpoint 409 at confirm time is surfaced and nothing is written', async () => {
  const { ask, db } = await setup();
  try {
    const proposal = await ask('auth-dispatch', { question: 'Assign Fletcher Kalundi with WV-254-01 to NMT-20261102-1003' });
    assert.ok(proposal.data.proposal && proposal.data.proposal.token);
    const failed = await ask('auth-dispatch', { token: proposal.data.proposal.token, action: 'confirm' }, 'confirm');
    assert.equal(failed.status, 200);
    assert.match(failed.data.answer, /couldn't complete that change/);
    assert.match(failed.data.answer, /not scheduled for the full trip window/);
    const row = (await db.query('SELECT driver_name FROM bookings WHERE reference=$1', ['NMT-20261102-1003'])).rows[0];
    assert.equal(row.driver_name, null);
  } finally { await db.close(); }
});

test('cancel leaves the trip untouched; unassign executes through the same discipline', async () => {
  const { ask, db, audits } = await setup();
  try {
    const proposal = await ask('auth-dispatch', { question: 'Unassign NMT-20261102-1001' });
    assert.ok(proposal.data.proposal && proposal.data.proposal.token);
    const cancelled = await ask('auth-dispatch', { token: proposal.data.proposal.token, action: 'cancel' }, 'confirm');
    assert.match(cancelled.data.answer, /didn't change anything/);
    let row = (await db.query('SELECT driver_name FROM bookings WHERE reference=$1', ['NMT-20261102-1001'])).rows[0];
    assert.equal(row.driver_name, 'Fletcher Kalundi');
    assert.ok(audits.some((a) => a[2] === 'ASSISTANT_CANCELLED'), 'cancel audited');

    const proposal2 = await ask('auth-dispatch', { question: 'Unassign NMT-20261102-1001' });
    const done = await ask('auth-dispatch', { token: proposal2.data.proposal.token, action: 'confirm' }, 'confirm');
    assert.match(done.data.answer, /cleared/);
    row = (await db.query('SELECT driver_name, vehicle_unit FROM bookings WHERE reference=$1', ['NMT-20261102-1001'])).rows[0];
    assert.equal(row.driver_name, null);
    assert.equal(row.vehicle_unit, null);
  } finally { await db.close(); }
});

test('drivers and patients cannot run assignment actions', async () => {
  const { ask, db } = await setup();
  try {
    const byDriver = await ask('auth-driverf', { question: 'Assign Kene Emelife to NMT-20261102-1002' });
    assert.equal(byDriver.data.proposal, undefined);
    const byPatient = await ask('auth-patient', { question: 'Unassign NMT-20261102-1006' });
    assert.equal(byPatient.data.proposal, undefined);
  } finally { await db.close(); }
});

test('widget surface: loader enables Nex on staff pages, no idle-close anywhere', () => {
  const platform = fs.readFileSync('platform.js', 'utf8');
  assert.doesNotMatch(platform, /data-backoffice-workspace/);
  assert.doesNotMatch(platform, /staffOrApp/);
  const widget = fs.readFileSync('visitor-assistant.js', 'utf8');
  assert.match(widget, /STAFF_ENDPOINT = '\/api\/assistant\/ask'/);
  assert.match(widget, /STAFF_CONFIRM_ENDPOINT = '\/api\/assistant\/confirm'/);
  assert.doesNotMatch(widget, /PANEL_IDLE_CLOSE_MS|idleCloseMs/);
  const api = fs.readFileSync('netlify/functions/api.cjs', 'utf8');
  assert.match(api, /handleStaffAssistant/);
  assert.match(api, /p\[0\]==='assistant'/);
  const facility = fs.readFileSync('facility.html', 'utf8');
  assert.match(facility, /NEXUS_VISITOR_ASSISTANT=\{enabled:true,side:'right'\}/);
});
