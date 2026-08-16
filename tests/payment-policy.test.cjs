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

test('insurance, Medicare, and Medicaid bookings require approval', () => {
  for (const payerType of ['INSURANCE', 'MEDICARE', 'MEDICAID']) {
    const policy = bookingPaymentPolicy({ authenticated: true, payerType });
    assert.equal(policy.requiresApproval, true);
    assert.equal(policy.requiresDeposit, false);
  }
  assert.equal(bookingPaymentPolicy({ payerType: 'SELF_PAY' }).requiresApproval, false);
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
