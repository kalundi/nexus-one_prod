function cleanString(value) {
  return String(value ?? '').trim();
}

function buildBrokerBookingPayload(request, body = {}, bookingReference) {
  return {
    reference: cleanString(bookingReference || request?.booking_reference || ''),
    name: cleanString(body.patient_name || request?.patient_name || request?.broker_name || 'Broker Request'),
    phone: cleanString(body.patient_phone || request?.patient_phone || ''),
    email: cleanString(body.submitter_email || request?.submitter_email || body.contact_email || request?.contact_email || ''),
    service: cleanString(body.service || request?.service || ''),
    pickup: cleanString(body.pickup || request?.pickup || ''),
    destination: cleanString(body.destination || request?.destination || ''),
    pickup_time: cleanString(body.pickup_time || request?.pickup_time || body.trip_time || request?.trip_time || ''),
    trip_date: cleanString(body.trip_date || request?.trip_date || ''),
    trip_time: cleanString(body.trip_time || request?.trip_time || ''),
    notes: cleanString(body.notes || request?.notes || ''),
    pickup_lat: body.pickup_lat ?? request?.pickup_lat ?? null,
    pickup_lng: body.pickup_lng ?? request?.pickup_lng ?? null,
    destination_lat: body.destination_lat ?? request?.destination_lat ?? null,
    destination_lng: body.destination_lng ?? request?.destination_lng ?? null,
    estimated_fare: Number(body.platform_calculated_rate || request?.platform_calculated_rate || 0) || null,
    booking_source: 'STAFF',
    status: 'SCHEDULED'
  };
}

function getBrokerAutoBookStatus() {
  return 'PENDING_DISPATCH_CONFIRMATION';
}

function resolveBrokerRequestStatus() {
  return 'PENDING_DISPATCH_CONFIRMATION';
}

module.exports = {
  buildBrokerBookingPayload,
  getBrokerAutoBookStatus,
  resolveBrokerRequestStatus
};
