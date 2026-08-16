'use strict';

const COVERED_PAYER_TYPES = new Set(['INSURANCE', 'MEDICARE', 'MEDICAID']);

function normalizePayerType(value, bookingSource = '') {
  if (String(bookingSource || '').toUpperCase() === 'FACILITY') return 'FACILITY';
  const normalized = String(value || 'SELF_PAY').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'PRIVATE_PAY' || normalized === 'CASH' || normalized === 'CARD') return 'SELF_PAY';
  return ['SELF_PAY', 'INSURANCE', 'MEDICARE', 'MEDICAID', 'FACILITY'].includes(normalized)
    ? normalized
    : 'SELF_PAY';
}

function bookingPaymentPolicy({ authenticated = false, bookingSource = 'CUSTOMER', payerType = 'SELF_PAY' } = {}) {
  const source = String(bookingSource || 'CUSTOMER').toUpperCase();
  const payer = normalizePayerType(payerType, source);
  const facilityBilling = source === 'FACILITY' || payer === 'FACILITY';
  const requiresDeposit = !authenticated && !facilityBilling && payer === 'SELF_PAY';
  return { payerType: payer, facilityBilling, requiresDeposit };
}

function requiresFullPaymentBeforeBoarding({ payerType, paymentStatus } = {}) {
  const payer = normalizePayerType(payerType);
  if (COVERED_PAYER_TYPES.has(payer) || payer === 'FACILITY') return false;
  return String(paymentStatus || 'UNPAID').toUpperCase() !== 'PAID_IN_FULL';
}

module.exports = { normalizePayerType, bookingPaymentPolicy, requiresFullPaymentBeforeBoarding };
