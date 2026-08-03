const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBrokerBookingPayload, getBrokerAutoBookStatus } = require('../netlify/functions/_shared/broker-auto-book.cjs');

test('buildBrokerBookingPayload maps broker request data into a booking payload', () => {
  const request = {
    booking_reference: 'NMT-20240101-1234',
    patient_name: 'Alicia Brown',
    patient_phone: '2025550101',
    submitter_email: 'ops@example.com',
    service: 'wheelchair',
    pickup: '123 Main St',
    destination: '456 Oak Ave',
    trip_date: '2024-01-02',
    trip_time: '10:00',
    notes: 'Requires lift'
  };

  const payload = buildBrokerBookingPayload(request, {}, 'NMT-20240101-1234');

  assert.equal(payload.reference, 'NMT-20240101-1234');
  assert.equal(payload.name, 'Alicia Brown');
  assert.equal(payload.phone, '2025550101');
  assert.equal(payload.email, 'ops@example.com');
  assert.equal(payload.service, 'wheelchair');
  assert.equal(payload.pickup, '123 Main St');
  assert.equal(payload.destination, '456 Oak Ave');
  assert.equal(payload.trip_date, '2024-01-02');
  assert.equal(payload.trip_time, '10:00');
  assert.equal(payload.notes, 'Requires lift');
  assert.equal(payload.status, 'SCHEDULED');
});

test('getBrokerAutoBookStatus returns AUTO_BOOKED when assignment succeeds', () => {
  assert.equal(getBrokerAutoBookStatus(true), 'AUTO_BOOKED');
  assert.equal(getBrokerAutoBookStatus(false), 'AUTO_CONFIRMED');
});
