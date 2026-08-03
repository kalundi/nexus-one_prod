const test = require('node:test');
const assert = require('node:assert/strict');
const { canAdvanceBookingForAvailability } = require('../netlify/functions/_shared/dispatch-approval.cjs');

test('blocks dispatch approval when no driver or vehicle is available', () => {
  const result = canAdvanceBookingForAvailability({
    currentStatus: 'SUBMITTED',
    nextStatus: 'SCHEDULED',
    availability: { available: false, drivers: { available: 0 }, vehicles: { available: 0 } }
  });

  assert.equal(result.allowed, false);
  assert.match(result.message, /available driver and vehicle/i);
});

test('allows dispatch approval when both driver and vehicle are available', () => {
  const result = canAdvanceBookingForAvailability({
    currentStatus: 'SUBMITTED',
    nextStatus: 'SCHEDULED',
    availability: { available: true, drivers: { available: 1 }, vehicles: { available: 1 } }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.message, 'Approval allowed');
});
