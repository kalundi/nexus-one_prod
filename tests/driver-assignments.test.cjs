const test = require('node:test');
const assert = require('node:assert/strict');
const {isDriverAssignableStatus, normalizeDriverAcceptanceStatus} = require('../netlify/functions/_shared/driver-assignments.cjs');

test('assigned bookings are shown as acceptables for drivers', () => {
  assert.equal(isDriverAssignableStatus('ASSIGNED'), true);
  assert.equal(isDriverAssignableStatus('SCHEDULED'), true);
  assert.equal(isDriverAssignableStatus('EN_ROUTE'), false);
});

test('accepting a trip moves it to an active driver status', () => {
  assert.equal(normalizeDriverAcceptanceStatus('ASSIGNED'), 'EN_ROUTE');
  assert.equal(normalizeDriverAcceptanceStatus('SCHEDULED'), 'EN_ROUTE');
});
