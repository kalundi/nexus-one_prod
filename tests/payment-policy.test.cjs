'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bookingPaymentPolicy, requiresFullPaymentBeforeBoarding } = require('../netlify/functions/_shared/payment-policy.cjs');

test('guest self-pay booking requires a deposit', () => {
  assert.equal(bookingPaymentPolicy({ authenticated: false, payerType: 'SELF_PAY' }).requiresDeposit, true);
});

test('authenticated and covered bookings do not require a guest deposit', () => {
  assert.equal(bookingPaymentPolicy({ authenticated: true, payerType: 'SELF_PAY' }).requiresDeposit, false);
  assert.equal(bookingPaymentPolicy({ authenticated: false, payerType: 'MEDICAID' }).requiresDeposit, false);
  assert.equal(bookingPaymentPolicy({ authenticated: false, payerType: 'MEDICARE' }).requiresDeposit, false);
  assert.equal(bookingPaymentPolicy({ authenticated: false, payerType: 'INSURANCE' }).requiresDeposit, false);
});

test('Maryland Medicaid and private insurance bookings require approval', () => {
  for (const payerType of ['INSURANCE', 'MEDICAID']) {
    const policy = bookingPaymentPolicy({ authenticated: true, payerType, service: 'wheelchair' });
    assert.equal(policy.requiresApproval, true);
    assert.equal(policy.requiresDeposit, false);
  }
  assert.equal(bookingPaymentPolicy({ payerType: 'SELF_PAY' }).requiresApproval, false);
});

test('standard Medicare NEMT stays unconfirmed and requires self-pay', () => {
  for (const service of ['ambulatory', 'wheelchair', 'bariatric']) {
    const policy = bookingPaymentPolicy({ authenticated: true, payerType: 'MEDICARE', service });
    assert.equal(policy.coverageStatus, 'NOT_COVERED_STANDARD');
    assert.equal(policy.coverageNotAvailable, true);
    assert.equal(policy.requiresDeposit, true);
    assert.equal(policy.requiresApproval, false);
  }
});

test('Medicare stretcher requires ambulance-level medical necessity review', () => {
  const policy = bookingPaymentPolicy({ payerType: 'MEDICARE', service: 'stretcher' });
  assert.equal(policy.requiresApproval, true);
  assert.equal(policy.coverageStatus, 'PENDING_MEDICAL_NECESSITY');
  assert.match(policy.coverageMessage, /ambulance-level medical necessity/i);
});

test('facility trips are invoiced and do not require a deposit', () => {
  const policy = bookingPaymentPolicy({ authenticated: true, bookingSource: 'FACILITY' });
  assert.equal(policy.facilityBilling, true);
  assert.equal(policy.requiresDeposit, false);
});

test('self-pay passenger cannot board until paid in full', () => {
  assert.equal(requiresFullPaymentBeforeBoarding({ payerType: 'SELF_PAY', paymentStatus: 'DEPOSIT_PAID' }), true);
  assert.equal(requiresFullPaymentBeforeBoarding({ payerType: 'SELF_PAY', paymentStatus: 'PAID_IN_FULL' }), false);
  assert.equal(requiresFullPaymentBeforeBoarding({ payerType: 'MEDICARE', paymentStatus: 'UNPAID' }), false);
});
