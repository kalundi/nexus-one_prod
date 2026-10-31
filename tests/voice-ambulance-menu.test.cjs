const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'netlify/functions/api.cjs'), 'utf8');

const helpersStart = api.indexOf('const AMBULANCE_MENU_PROMPT');
const helpersEnd = api.indexOf('function getCallerAreaCode');
const helpers = api.slice(helpersStart, helpersEnd);

const menuHandleStart = api.indexOf("p[1]==='menu-handle'");
const menuHandle = api.slice(menuHandleStart, menuHandleStart + 5200);

const ambHandleStart = api.indexOf("p[1]==='ambulance-menu-handle'");
const ambHandle = api.slice(ambHandleStart, ambHandleStart + 3200);

test('ambulance menu routes and helper exist', () => {
  assert.notEqual(helpersStart, -1, 'ambulance menu constants exist');
  assert.ok(api.includes("p[1]==='ambulance-menu'"), 'ambulance menu route exists');
  assert.ok(api.includes("p[1]==='ambulance-menu-handle'"), 'ambulance menu handler route exists');
  assert.ok(api.includes('function voiceAmbulanceMenuTwiml'), 'ambulance menu TwiML helper exists');
});

test('main menu points callers to the ambulance menu by keypad and by speech', () => {
  assert.ok(menuHandle.includes("digits==='4'"), 'menu handler has a press-4 branch');
  assert.ok(menuHandle.includes("/(ambulance)/i.test(speech)"), 'menu handler tests the spoken request for the word ambulance');
  assert.ok(menuHandle.includes("voiceRouteUrl('ambulance-menu')"), 'menu handler redirects to the ambulance menu');
  assert.ok(api.includes('Press 4 for ambulance services.'), 'keypad prompts name press 4 for ambulance services');
  const keypadDefaults = api.match(/Press 4 for ambulance services\./g) || [];
  assert.equal(keypadDefaults.length, 2, 'both the initial and retry keypad prompt defaults include press 4');
});

test('ambulance branch is checked before the generic intent branches', () => {
  const ambulanceAt = menuHandle.indexOf("digits==='4'");
  const tripStatusAt = menuHandle.indexOf('trip\\s*status');
  assert.ok(ambulanceAt !== -1 && tripStatusAt !== -1 && ambulanceAt < tripStatusAt, 'ambulance check runs before the trip-status branch so an ambulance status request reaches the ambulance menu');
});

test('ambulance menu opens with the 911 guardrail and lists all five departments plus press 0', () => {
  assert.ok(helpers.includes('If this is a medical emergency, hang up and dial 9 1 1.'), 'menu opens with the emergency guardrail');
  assert.ok(helpers.includes('Press 1 to request a new ambulance transport.'), 'department 1 is a new ambulance transport request');
  assert.ok(helpers.includes('Press 2 for interfacility transfers and hospital discharges.'), 'department 2 is interfacility transfers and discharges');
  assert.ok(helpers.includes('Press 3 for the status of an ambulance trip in progress.'), 'department 3 is ambulance trip status');
  assert.ok(helpers.includes('Press 4 for ambulance billing and insurance.'), 'department 4 is ambulance billing and insurance');
  assert.ok(helpers.includes('Press 5 for facility partnerships and contracts.'), 'department 5 is facility partnerships and contracts');
  assert.ok(helpers.includes('Press 0 to return to the main menu.'), 'press 0 returns to the main menu');
});

test('ambulance menu is a single-digit DTMF gather posting to its handler', () => {
  assert.ok(helpers.includes('<Gather input="dtmf" numDigits="1"'), 'menu is a single-digit DTMF gather');
  assert.ok(helpers.includes("voiceRouteUrl('ambulance-menu-handle'"), 'gather posts to the ambulance menu handler');
  assert.ok(helpers.includes('sayTag(AMBULANCE_MENU_PROMPT,config)'), 'menu prompt uses sayTag');
  const gatherEndAt = helpers.indexOf('</Gather>');
  const redirectAt = helpers.indexOf('<Redirect', gatherEndAt);
  assert.ok(gatherEndAt !== -1 && redirectAt > gatherEndAt, 'a redirect follows the gather so a silent caller still reaches the handler');
});

test('ambulance menu speech all goes through sayTag with the configured voice', () => {
  assert.doesNotMatch(helpers, /<Say /, 'no raw Say elements in the ambulance menu helpers');
  assert.doesNotMatch(helpers, /<Say>/, 'no raw Say elements in the ambulance menu helpers');
  assert.ok(helpers.includes("sayTag('Sorry, I did not catch that.',config)"), 'the retry prompt uses sayTag');
});

test('a retry of the ambulance menu acknowledges the missed keypress first', () => {
  assert.ok(helpers.includes('retryCount>0'), 'helper varies its output on retry');
  assert.ok(helpers.includes("sayTag('Sorry, I did not catch that.',config)"), 'retry prepends the did-not-catch line');
});

test('ambulance handler sends each department to dispatch with its own line', () => {
  const lines = {
    '1': 'For a new ambulance transport request, I will connect you with Nexus dispatch now.',
    '2': 'For interfacility transfers and hospital discharges, I will connect you with Nexus dispatch for coordination.',
    '3': 'For the status of an ambulance trip in progress, I will connect you with Nexus dispatch now.',
    '4': 'For ambulance billing and insurance questions, I will connect you with a Nexus representative now.',
    '5': 'For facility partnerships and contracts, I will connect you with our team now.'
  };
  for (const [digit, line] of Object.entries(lines)) {
    assert.ok(helpers.includes(`'${digit}':'${line}'`), `department ${digit} line is defined`);
  }
  assert.ok(ambHandle.includes('AMBULANCE_DEPARTMENT_LINES[digits]'), 'handler looks the pressed digit up in the department lines');
  assert.ok(ambHandle.includes('sayTag(departmentLine,config)'), 'department line is spoken through sayTag');
  assert.ok(ambHandle.includes("voiceRouteUrl('transfer-dispatch')"), 'every department redirects to the existing dispatch transfer');
});

test('ambulance handler press 0 returns to the main menu', () => {
  assert.ok(ambHandle.includes("digits==='0'"), 'handler has a press-0 branch');
  assert.ok(ambHandle.includes("voiceRouteUrl('menu')"), 'press 0 redirects to the main menu route');
});

test('ambulance handler falls back like the main menu after a second miss', () => {
  assert.ok(ambHandle.includes('retry>=1'), 'handler stops re-offering the menu after the retry budget');
  assert.ok(ambHandle.includes("message:'I will connect you with Nexus dispatch for further assistance.'"), 'fallback dials dispatch with the same message as the main menu fallback');
  assert.ok(ambHandle.includes('config.afterHoursVoicemail'), 'fallback keeps the after-hours voicemail dial when no dispatch target exists');
  assert.ok(ambHandle.includes('voiceAmbulanceMenuTwiml(config,retry+1)'), 'a first miss re-offers the ambulance menu once');
});

test('assistant instructions carry the ambulance services section and routing', () => {
  assert.ok(api.includes("'AMBULANCE SERVICES'"), 'instructions include an ambulance services section');
  assert.ok(api.includes('Nexus operates a dedicated ambulance line: (888) 760-4990, for BLS and ALS ambulance transport.'), 'instructions name the dedicated ambulance line');
  assert.ok(api.includes('Route all of these to dispatch.'), 'instructions route ambulance needs to dispatch');
  assert.ok(api.includes('Nexus ambulance transport is scheduled, planned transport.'), 'instructions keep ambulance transport planned, not emergency');
  assert.ok(api.includes("ambulance:'Route ambulance requests, transfers, trip status, billing, and facility partnership questions to dispatch; direct emergencies to 911'"), 'call routing includes the ambulance entry');
});
