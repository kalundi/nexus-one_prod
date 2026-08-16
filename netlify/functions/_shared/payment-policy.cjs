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

function normalizeService(value) {
  const service = String(value || '').trim().toLowerCase();
  if (service.includes('wheelchair')) return 'wheelchair';
  if (service.includes('stretcher')) return 'stretcher';
  if (service.includes('bariatric')) return 'bariatric';
  if (service.includes('ambulatory')) return 'ambulatory';
  if (service.includes('als')) return 'als';
  if (service.includes('bls') || service.includes('ambulance')) return 'bls';
  return service;
}

function bookingPaymentPolicy({ authenticated = false, bookingSource = 'CUSTOMER', payerType = 'SELF_PAY', service = '' } = {}) {
  const source = String(bookingSource || 'CUSTOMER').toUpperCase();
  const payer = normalizePayerType(payerType, source);
  const serviceType = normalizeService(service);
  const facilityBilling = source === 'FACILITY' || payer === 'FACILITY';
  const medicareStandardNemtNotCovered = payer === 'MEDICARE' && ['ambulatory', 'wheelchair', 'bariatric'].includes(serviceType);
  const medicareMedicalNecessityReview = payer === 'MEDICARE' && ['stretcher', 'bls', 'als'].includes(serviceType);
  const requiresApproval = payer === 'MEDICAID' || payer === 'INSURANCE' || medicareMedicalNecessityReview;
  const requiresDeposit = (!authenticated && !facilityBilling && payer === 'SELF_PAY') || medicareStandardNemtNotCovered;
  let coverageStatus = 'SELF_PAY';
  let coverageMessage = '';
  if (payer === 'MEDICAID') {
    coverageStatus = 'PENDING_MEDICAID_APPROVAL';
    coverageMessage = 'Maryland Medicaid NEMT eligibility and authorization must be verified before confirmation.';
  } else if (payer === 'INSURANCE') {
    coverageStatus = 'PENDING_PLAN_VERIFICATION';
    coverageMessage = 'Private insurance transportation benefits are plan-dependent and must be verified before confirmation.';
  } else if (medicareStandardNemtNotCovered) {
    coverageStatus = 'NOT_COVERED_STANDARD';
    coverageMessage = 'Medicare generally does not cover standard ambulatory, wheelchair, or bariatric NEMT. Self-pay is required unless another payer is approved.';
  } else if (medicareMedicalNecessityReview) {
    coverageStatus = 'PENDING_MEDICAL_NECESSITY';
    coverageMessage = serviceType === 'stretcher'
      ? 'Medicare stretcher transportation requires review for ambulance-level medical necessity and an appropriately qualified provider.'
      : 'Medicare ambulance coverage requires medical necessity and an appropriately licensed provider.';
  } else if (facilityBilling) {
    coverageStatus = 'FACILITY_ACCOUNT';
  }
  return { payerType: payer, serviceType, facilityBilling, requiresDeposit, requiresApproval, coverageStatus, coverageMessage, coverageNotAvailable: medicareStandardNemtNotCovered };
}

function requiresFullPaymentBeforeBoarding({ payerType, paymentStatus } = {}) {
  const payer = normalizePayerType(payerType);
  if (COVERED_PAYER_TYPES.has(payer) || payer === 'FACILITY') return false;
  return String(paymentStatus || 'UNPAID').toUpperCase() !== 'PAID_IN_FULL';
}

module.exports = { normalizePayerType, normalizeService, bookingPaymentPolicy, requiresFullPaymentBeforeBoarding };
