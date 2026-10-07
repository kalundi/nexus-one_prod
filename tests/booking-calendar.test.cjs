const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calendarConfig,
  eventPayload,
  isCalendarEligible,
  syncBookingCalendar,
  cancelBookingCalendar
} = require('../netlify/functions/_shared/booking-calendar.cjs');
const calendarRetryHandler = require('../netlify/functions/booking-calendar-sync.cjs').handler;

const eligibleBooking = {
  reference: 'NMT-TEST-1',
  name: 'Test Rider <script>',
  service: 'wheelchair',
  pickup: '10 Main St, Testville',
  destination: '20 Clinic Way, Testville',
  trip_date: '2030-08-15',
  trip_time: '10:05:00',
  estimated_duration: '45 mins',
  status: 'SUBMITTED',
  payment_status: 'UNPAID',
  requires_deposit: false
};

test('calendarConfig requires an explicit mailbox and defaults to Eastern time', () => {
  assert.deepEqual(calendarConfig({}), { mailbox: '', timeZone: 'Eastern Standard Time' });
  assert.deepEqual(calendarConfig({ M365_CALENDAR_MAILBOX_ADDRESS: 'fletcher@nexusmt.com', M365_CALENDAR_TIME_ZONE: 'Eastern Standard Time' }), {
    mailbox: 'fletcher@nexusmt.com', timeZone: 'Eastern Standard Time'
  });
});

test('calendar eligibility waits for payment or approval and blocks cancelled/pending requests', () => {
  assert.equal(isCalendarEligible(eligibleBooking), true);
  assert.equal(isCalendarEligible({ ...eligibleBooking, status: 'PENDING_PAYMENT', requires_deposit: true }), false);
  assert.equal(isCalendarEligible({ ...eligibleBooking, status: 'PENDING_APPROVAL', coverage_status: 'PENDING_PLAN_VERIFICATION' }), false);
  assert.equal(isCalendarEligible({ ...eligibleBooking, status: 'SUBMITTED', coverage_status: 'PENDING_PLAN_VERIFICATION' }), true);
  assert.equal(isCalendarEligible({ ...eligibleBooking, status: 'CANCELLED' }), false);
  assert.equal(isCalendarEligible({ ...eligibleBooking, status: 'SUBMITTED', requires_deposit: true, payment_status: 'UNPAID' }), false);
  assert.equal(isCalendarEligible({ ...eligibleBooking, status: 'SUBMITTED', requires_deposit: true, payment_status: 'DEPOSIT_PAID' }), true);
});

test('event payload uses pickup time, private visibility, and escapes rider/route details', () => {
  const payload = eventPayload(eligibleBooking, { timeZone: 'Eastern Standard Time' });
  assert.equal(payload.start.dateTime, '2030-08-15T10:05:00');
  assert.equal(payload.start.timeZone, 'Eastern Standard Time');
  assert.equal(payload.end.dateTime, '2030-08-15T10:50:00');
  assert.equal(payload.end.timeZone, 'Eastern Standard Time');
  assert.equal(payload.sensitivity, 'private');
  assert.match(payload.body.content, /Test Rider &lt;script&gt;/);
  assert.equal(payload.transactionId.length, 64);
});

test('event duration crossing midnight rolls the local calendar date correctly', () => {
  const payload = eventPayload({ ...eligibleBooking, trip_time: '23:45:00', estimated_duration: '45' });
  assert.equal(payload.end.dateTime, '2030-08-16T00:30:00');
});

test('sync creates an event once and updates the stored event on repeat calls', async () => {
  const saved = new Map();
  const calls = [];
  const dbQuery = async (sql, params) => {
    if (sql.startsWith('SELECT graph_event_id')) return { rows: saved.has(params[0]) ? [{ graph_event_id: saved.get(params[0]) }] : [] };
    if (sql.startsWith('INSERT INTO booking_calendar_sync')) {
      saved.set(params[0], params[2] || saved.get(params[0]));
      return { rows: [] };
    }
    throw new Error(`unexpected query ${sql}`);
  };
  const graph = async (path, options) => {
    calls.push({ path, options });
    return options.method === 'POST' ? { id: 'graph-event-1' } : {};
  };
  const config = { env: { M365_CALENDAR_MAILBOX_ADDRESS: 'calendar@example.com' }, dbQuery, graph };
  assert.equal((await syncBookingCalendar(eligibleBooking, config)).status, 'synced');
  assert.equal((await syncBookingCalendar(eligibleBooking, config)).status, 'synced');
  assert.deepEqual(calls.map((call) => call.options.method), ['POST', 'PATCH']);
  assert.match(calls[0].path, /calendar%40example\.com\/calendar\/events$/);
});

test('missing calendar target skips safely without API calls', async () => {
  let called = false;
  const result = await syncBookingCalendar(eligibleBooking, { env: {}, graph: async () => { called = true; } });
  assert.equal(result.status, 'skipped');
  assert.equal(called, false);
});

test('failed calendar writes are recorded without throwing into booking flow', async () => {
  const updates = [];
  const dbQuery = async (sql, params) => {
    if (sql.startsWith('SELECT graph_event_id')) return { rows: [] };
    if (sql.startsWith('INSERT INTO booking_calendar_sync')) { updates.push(params); return { rows: [] }; }
    throw new Error(`unexpected query ${sql}`);
  };
  const result = await syncBookingCalendar(eligibleBooking, {
    env: { M365_CALENDAR_MAILBOX_ADDRESS: 'calendar@example.com' },
    dbQuery,
    graph: async () => { throw new Error('Graph temporarily unavailable'); }
  });
  assert.equal(result.status, 'failed');
  assert.equal(updates[0][1], 'FAILED');
  assert.match(updates[0][3], /temporarily unavailable/);
});

test('cancellation deletes the linked event and records cancelled state', async () => {
  const updates = [];
  const dbQuery = async (sql, params) => {
    if (sql.startsWith('SELECT graph_event_id')) return { rows: [{ graph_event_id: 'event/42' }] };
    if (sql.startsWith('UPDATE booking_calendar_sync')) { updates.push(params); return { rows: [] }; }
    throw new Error(`unexpected query ${sql}`);
  };
  let request;
  const result = await cancelBookingCalendar('NMT-TEST-1', {
    env: { M365_CALENDAR_MAILBOX_ADDRESS: 'calendar@example.com' }, dbQuery,
    graph: async (path, options) => { request = { path, options }; return {}; }
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(request.options.method, 'DELETE');
  assert.match(request.path, /events\/event%2F42$/);
  assert.equal(updates.length, 1);
});

test('scheduled calendar retries are disabled in test mode', async () => {
  const previous = process.env.NEXUS_TEST_MODE;
  process.env.NEXUS_TEST_MODE = 'true';
  try {
    const response = await calendarRetryHandler();
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /test-mode/);
  } finally {
    if (previous === undefined) delete process.env.NEXUS_TEST_MODE;
    else process.env.NEXUS_TEST_MODE = previous;
  }
});
