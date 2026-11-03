const test = require('node:test'), assert = require('node:assert/strict');
// Production-shaped wiring: the REAL http.cjs helpers api.cjs passes in,
// and — critically — NO injected publicAsk. api.cjs does not pass one
// either, so these tests exercise the module's default public fallback,
// which is the wiring that returned HTTP 500 live for unauthenticated
// asks (its default called a visitor-core interface that does not
// exist). The PGlite suite in staff-assistant.test.cjs always injected
// a mock publicAsk, which is why the defect shipped unnoticed.
const { createHandler } = require('../netlify/functions/_shared/staff-assistant.cjs');
const { json, parseBody, bearer } = require('../netlify/functions/_shared/http.cjs');

const FIXED_NOW = () => new Date('2026-11-02T15:00:00Z').getTime();

const USERS = {
  'tok-dispatch': { id: 'u-dispatch', role: 'DISPATCHER', display_name: 'Dana Dispatch', session_id: 'sess-1' },
  'tok-billing': { id: 'u-billing', role: 'BILLING', display_name: 'Bill Billing', session_id: 'sess-7' },
  // Legacy fallback session: requireUser resolves it, but it carries
  // no session_id — the staff endpoint must stay locked for it.
  'tok-legacy': { id: 'u-legacy', role: 'DISPATCHER', display_name: 'Legacy User' },
};

function makeHandler(overrides = {}) {
  return createHandler({
    query: async () => ({ rows: [] }),
    requireUser: async (token) => {
      if (token === 'tok-expired') throw Object.assign(new Error('Session expired or invalid'), { statusCode: 401 });
      const user = USERS[token];
      if (!user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
      return user;
    },
    bearer, json, parseBody,
    audit: async () => {},
    invokeApi: async () => ({ statusCode: 200, body: '{}' }),
    fetchImpl: async () => { throw new Error('offline in tests'); },
    now: FIXED_NOW,
    mapBooking: (b) => b,
    readPlatformSettings: async () => ({}),
    serviceVehiclePrefs: {},
    resolveServicePolicyKey: (s) => String(s || '').toLowerCase(),
    caretakerListTrips: async () => [],
    ...overrides,
  });
}

async function call(handler, sub, headers, body) {
  const res = await handler(
    { httpMethod: 'POST', path: '/api/assistant/' + sub, headers: headers || {}, body },
    ['assistant', sub], 'POST'
  );
  return { status: res.statusCode, data: JSON.parse(res.body) };
}

const bearerOf = (t) => ({ authorization: 'Bearer ' + t });
const CONFIRM_401 = 'Your session has expired — sign in again and I\'ll pick this back up.';

test('ask without a session returns the same 401 JSON as confirm — it never throws', async () => {
  const handler = makeHandler();
  const askRes = await call(handler, 'ask', {}, JSON.stringify({ question: 'How many trips today?' }));
  assert.equal(askRes.status, 401);
  assert.equal(askRes.data.error, CONFIRM_401);
  assert.equal(askRes.data.answer, undefined);
  const confirmRes = await call(handler, 'confirm', {}, JSON.stringify({ token: 'x' }));
  assert.equal(confirmRes.status, 401);
  assert.equal(confirmRes.data.error, askRes.data.error);
});

test('malformed, unknown and expired tokens all return 401 on ask', async () => {
  const handler = makeHandler();
  const body = JSON.stringify({ question: 'How many trips today?' });
  // Header without the Bearer scheme (bearer() yields no token).
  const noScheme = await call(handler, 'ask', { authorization: 'tok-dispatch' }, body);
  assert.equal(noScheme.status, 401);
  // Bearer with a token requireUser does not know.
  const unknown = await call(handler, 'ask', bearerOf('tok-nope'), body);
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.error, CONFIRM_401);
  // Expired session (requireUser throws its 401, like _shared/auth.cjs).
  const expired = await call(handler, 'ask', bearerOf('tok-expired'), body);
  assert.equal(expired.status, 401);
  assert.equal(expired.data.error, CONFIRM_401);
});

test('legacy fallback session (no session_id) returns 401 on ask and confirm', async () => {
  const handler = makeHandler();
  const askRes = await call(handler, 'ask', bearerOf('tok-legacy'), JSON.stringify({ question: 'How many trips today?' }));
  assert.equal(askRes.status, 401);
  assert.equal(askRes.data.error, CONFIRM_401);
  const confirmRes = await call(handler, 'confirm', bearerOf('tok-legacy'), JSON.stringify({ token: 'x' }));
  assert.equal(confirmRes.status, 401);
});

test('valid session with an empty body takes the greeting path (200), not an error', async () => {
  const handler = makeHandler();
  const res = await call(handler, 'ask', bearerOf('tok-dispatch'), '');
  assert.equal(res.status, 200);
  assert.equal(res.data.mode, 'staff');
  assert.equal(typeof res.data.greeting, 'string');
  assert.match(res.data.greeting, /Dana/);
});

test('malformed JSON body is a clean 400 with a valid session — and auth still comes first', async () => {
  const handler = makeHandler();
  const askRes = await call(handler, 'ask', bearerOf('tok-dispatch'), 'not-json{{');
  assert.equal(askRes.status, 400);
  assert.equal(askRes.data.error, 'Invalid JSON body');
  const confirmRes = await call(handler, 'confirm', bearerOf('tok-dispatch'), 'not-json{{');
  assert.equal(confirmRes.status, 400);
  assert.equal(confirmRes.data.error, 'Invalid JSON body');
  // No session + malformed body: the 401 wins (auth precedes parsing,
  // exactly like confirm).
  const anonRes = await call(handler, 'ask', {}, 'not-json{{');
  assert.equal(anonRes.status, 401);
});

test('default publicAsk (production wiring, no mock) answers a signed-in non-staff role from the real public core', async () => {
  const handler = makeHandler();
  const res = await call(handler, 'ask', bearerOf('tok-billing'), JSON.stringify({ question: 'What services do you offer?' }));
  assert.equal(res.status, 200);
  assert.equal(typeof res.data.answer, 'string');
  assert.match(res.data.answer, /ambulatory/i);
  assert.match(res.data.answer, /wheelchair/i);
  assert.equal(res.data.staff.role, 'BILLING');
});

test('a staff data failure soft-lands on the public answer instead of throwing', async () => {
  const handler = makeHandler({
    query: async (sql) => {
      if (String(sql).includes('FROM bookings')) throw new Error('db down');
      return { rows: [] };
    },
  });
  const res = await call(handler, 'ask', bearerOf('tok-dispatch'), JSON.stringify({ question: 'How many trips today?' }));
  assert.equal(res.status, 200);
  assert.equal(typeof res.data.answer, 'string');
  assert.ok(res.data.answer.length > 0);
});
