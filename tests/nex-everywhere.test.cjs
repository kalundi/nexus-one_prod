const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { createHandler } = require('../netlify/functions/_shared/staff-assistant.cjs');

// PR 2 of the staff-mode rollout: Nex on the app pages (compact app
// format) and the role-scoped site-knowledge layer.

test('widget surface: Nex loads everywhere except the password/payment utility pages', () => {
  const platform = fs.readFileSync('platform.js', 'utf8');
  assert.match(platform, /utilityPage=\/\\\/\(set-password\|test-payment\)/);
  assert.doesNotMatch(platform, /staffOrApp/);
  assert.doesNotMatch(platform, /driver-app\|patient\|booking-app\|set-password\|test-payment/);
  // The apps that don't load platform.js include the widget directly.
  assert.match(fs.readFileSync('driver-app.html', 'utf8'), /<script src="\/visitor-assistant\.js" defer><\/script>/);
  assert.match(fs.readFileSync('patient.html', 'utf8'), /<script src="\/visitor-assistant\.js" defer><\/script>/);
  // The booking app loads platform.js, and the loader no longer
  // excludes pages carrying the booking form.
  assert.match(fs.readFileSync('booking-app.html', 'utf8'), /platform\.js/);
  const loaderBlock = platform.slice(platform.indexOf('BEGIN Nexus visitor assistant loader'));
  assert.doesNotMatch(loaderBlock, /bookingForm/);
});

test('widget app format: round button above the app bar, bottom-sheet panel, 44px+ targets', () => {
  const widget = fs.readFileSync('visitor-assistant.js', 'utf8');
  assert.match(widget, /APP_PAGE = \/\\\/\(driver-app\|patient\|booking-app\)/);
  assert.match(widget, /tab\.classList\.add\('nvaApp'\)/);
  assert.match(widget, /panel\.classList\.add\('nvaApp'\)/);
  assert.match(widget, /\.nvaTab\.nvaApp\{[^}]*bottom:84px[^}]*width:52px;height:52px/);
  assert.match(widget, /\.nvaPanel\.nvaApp\{[^}]*bottom:84px/);
  assert.match(widget, /\.nvaPanel\.nvaApp\{[^}]*height:min\(560px,calc\(100dvh - 180px\)\)/);
  assert.doesNotMatch(widget, /PANEL_IDLE_CLOSE_MS|idleCloseMs/);
});

const KNOWLEDGE_USERS = {
  'auth-dispatch': { id: 'u-dispatch', role: 'DISPATCHER', display_name: 'Dana Dispatch', session_id: 'k1' },
  'auth-admin': { id: 'u-admin', role: 'ADMIN', display_name: 'Adam Admin', session_id: 'k2' },
  'auth-driver': { id: 'u-driver', role: 'DRIVER', display_name: 'Fletcher Kalundi', session_id: 'k3' },
  'auth-facility': { id: 'u-facility', role: 'FACILITY', display_name: 'Fran Facility', scope_id: 'FC-A', session_id: 'k4' },
  'auth-patient': { id: 'u-patient', role: 'PATIENT', display_name: 'Pat Patient', session_id: 'k5' },
};

async function knowledgeSetup() {
  const db = new PGlite();
  const handler = createHandler({
    query: (...args) => db.query(...args),
    requireUser: async (authValue) => {
      const user = KNOWLEDGE_USERS[authValue];
      if (!user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
      return user;
    },
    bearer: (e) => {
      const h = (e.headers && e.headers.authorization) || '';
      const m = String(h).match(/^Bearer\s+(.+)$/i);
      return m ? m[1].trim() : (h || null);
    },
    json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
    parseBody: (e) => { try { return JSON.parse(e.body || '{}'); } catch { return {}; } },
    audit: async () => {},
    publicAsk: async () => ({ statusCode: 200, body: JSON.stringify({ answer: 'PUBLIC-ANSWER', mode: 'knowledge' }) }),
    now: () => new Date('2026-11-02T15:00:00Z').getTime(),
  });
  const ask = async (authValue, question) => {
    const res = await handler(
      { httpMethod: 'POST', path: '/api/assistant/ask', headers: authValue ? { authorization: 'Bearer ' + authValue } : {}, body: JSON.stringify({ question }) },
      ['assistant', 'ask'], 'POST'
    );
    return JSON.parse(res.body);
  };
  return { db, ask };
}

test('site knowledge answers how-to questions for roles that can open the area', async () => {
  const { ask, db } = await knowledgeSetup();
  try {
    const addDriver = await ask('auth-dispatch', 'How do I add a driver?');
    assert.equal(addDriver.mode, 'staff');
    assert.match(addDriver.answer, /Administration workspace \(admin\.html\)/);
    const reports = await ask('auth-facility', 'Where do I find reports?');
    assert.match(reports.answer, /Reporting tab is right in this portal/);
    const booking = await ask('auth-patient', 'How do I book a ride?');
    assert.match(booking.answer, /booking app/);
    const directory = await ask('auth-admin', 'What is the Enterprise Directory?');
    assert.match(directory.answer, /enterprise\.html/);
    const pricing = await ask('auth-admin', 'Where is the Pricing Manager?');
    assert.match(pricing.answer, /Pricing Manager in the Administration workspace/);
  } finally { await db.close(); }
});

test('site knowledge refuses cross-role guidance and redirects to what the role can do', async () => {
  const { ask, db } = await knowledgeSetup();
  try {
    const driverAdd = await ask('auth-driver', 'How do I add a driver?');
    assert.match(driverAdd.answer, /not part of your Driver access/);
    assert.doesNotMatch(driverAdd.answer, /employee record/);
    assert.match(driverAdd.answer, /what are my trips today/);
    const driverReports = await ask('auth-driver', 'Where do I find reports?');
    assert.match(driverReports.answer, /not part of your Driver access/);
    assert.doesNotMatch(driverReports.answer, /Reporting tab is right in this portal/);
    const patientDirectory = await ask('auth-patient', 'What is the Enterprise Directory?');
    assert.match(patientDirectory.answer, /not part of your Patient access/);
    assert.doesNotMatch(patientDirectory.answer, /deactivate or remove entries/);
    const facilityPricing = await ask('auth-facility', 'Where is the Pricing Manager?');
    assert.match(facilityPricing.answer, /not part of your Facility access/);
    assert.doesNotMatch(facilityPricing.answer, /per-mile rates/);
  } finally { await db.close(); }
});

test('site knowledge is staff-only: an ask with no session is a 401 and leaks no guidance', async () => {
  const { ask, db } = await knowledgeSetup();
  try {
    // Guests keep the public assistant via its own standalone function;
    // the staff endpoint itself answers an unauthenticated ask with the
    // same 401 as /confirm — no answer, no site knowledge.
    const guest = await ask(null, 'How do I add a driver?');
    assert.equal(guest.answer, undefined);
    assert.match(guest.error, /session has expired/i);
  } finally { await db.close(); }
});
