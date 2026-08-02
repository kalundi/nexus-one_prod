const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value) {
  return String(value ?? '').trim();
}

function ensureState() {
  if (!global.__nexusBrokerMemory) {
    global.__nexusBrokerMemory = {
      nextBrokerId: 1,
      nextRateId: 1,
      nextRequestId: 1,
      brokers: [],
      brokerRates: [],
      brokerRequests: [],
      auditLog: []
    };
  }
  return global.__nexusBrokerMemory;
}

function resetState() {
  global.__nexusBrokerMemory = {
    nextBrokerId: 1,
    nextRateId: 1,
    nextRequestId: 1,
    brokers: [],
    brokerRates: [],
    brokerRequests: [],
    auditLog: []
  };
  return global.__nexusBrokerMemory;
}

function createBroker(input) {
  const state = ensureState();
  const name = cleanString(input.name);
  if (!name) {
    throw Object.assign(new Error('name is required'), { statusCode: 400 });
  }
  if (state.brokers.some((broker) => broker.name.toLowerCase() === name.toLowerCase())) {
    return { conflict: true, rows: [] };
  }
  const broker = {
    id: state.nextBrokerId++,
    name,
    contact_email: cleanString(input.contact_email) || null,
    contact_person: cleanString(input.contact_person) || null,
    contact_phone: cleanString(input.contact_phone) || null,
    net_terms_days: Number(input.net_terms_days) || 30,
    notes: cleanString(input.notes) || null,
    status: 'ACTIVE',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  state.brokers.push(broker);
  return { rows: [broker] };
}

function listBrokers() {
  const state = ensureState();
  return { rows: state.brokers.filter((broker) => broker.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name)) };
}

function getBroker(id) {
  const state = ensureState();
  const broker = state.brokers.find((entry) => entry.id === Number(id));
  return { rows: broker ? [broker] : [] };
}

function updateBroker(id, input) {
  const state = ensureState();
  const broker = state.brokers.find((entry) => entry.id === Number(id));
  if (!broker) {
    return { rows: [] };
  }
  if (input.contact_person !== undefined) broker.contact_person = cleanString(input.contact_person) || null;
  if (input.contact_phone !== undefined) broker.contact_phone = cleanString(input.contact_phone) || null;
  if (input.net_terms_days !== undefined) broker.net_terms_days = Number(input.net_terms_days) || 30;
  if (input.notes !== undefined) broker.notes = cleanString(input.notes) || null;
  broker.updated_at = nowIso();
  return { rows: [broker] };
}

function listRates(brokerId) {
  const state = ensureState();
  const rows = state.brokerRates.filter((entry) => entry.broker_id === Number(brokerId) && entry.effective_to === null).sort((a, b) => a.service.localeCompare(b.service));
  return { rows };
}

function createRate(brokerId, input) {
  const state = ensureState();
  const broker = state.brokers.find((entry) => entry.id === Number(brokerId));
  if (!broker) {
    return { rows: [] };
  }
  const service = cleanString(input.service);
  if (!service) {
    throw Object.assign(new Error('service is required'), { statusCode: 400 });
  }
  state.brokerRates
    .filter((entry) => entry.broker_id === Number(brokerId) && entry.service === service && entry.effective_to === null)
    .forEach((entry) => {
      entry.effective_to = nowIso();
    });
  const rate = {
    id: state.nextRateId++,
    broker_id: Number(brokerId),
    service,
    base_rate: Number(input.base_rate) || 0,
    per_mile_rate: Number(input.per_mile_rate) || 0,
    notes: cleanString(input.notes) || null,
    effective_from: nowIso(),
    effective_to: null,
    created_at: nowIso()
  };
  state.brokerRates.push(rate);
  return { rows: [rate] };
}

function createBrokerRequest(input) {
  const state = ensureState();
  const brokerRate = Number(input.broker_quoted_rate) || 0;
  const platformRate = Number(input.platform_calculated_rate) || 0;
  const request = {
    id: state.nextRequestId++,
    broker_id: input.broker_id !== undefined && input.broker_id !== null ? Number(input.broker_id) : null,
    booking_reference: cleanString(input.booking_reference) || null,
    broker_name: cleanString(input.broker_name) || 'Unknown',
    service: cleanString(input.service) || 'MEDICAL_TRANSPORT',
    pickup: cleanString(input.pickup),
    destination: cleanString(input.destination),
    pickup_lat: input.pickup_lat !== undefined && input.pickup_lat !== null ? Number(input.pickup_lat) : null,
    pickup_lng: input.pickup_lng !== undefined && input.pickup_lng !== null ? Number(input.pickup_lng) : null,
    destination_lat: input.destination_lat !== undefined && input.destination_lat !== null ? Number(input.destination_lat) : null,
    destination_lng: input.destination_lng !== undefined && input.destination_lng !== null ? Number(input.destination_lng) : null,
    trip_date: cleanString(input.trip_date),
    trip_time: cleanString(input.trip_time),
    broker_quoted_rate: brokerRate,
    platform_calculated_rate: platformRate,
    rate_delta: brokerRate - platformRate,
    submission_method: cleanString(input.submission_method) || 'FORM',
    submitted_by: cleanString(input.submitted_by) || 'ANONYMOUS',
    request_status: 'AUTO_CONFIRMED',
    dispatch_reviewed: false,
    dispatch_reviewed_at: null,
    dispatch_reviewed_by: null,
    dispatch_notes: null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  state.brokerRequests.push(request);
  return { rows: [request] };
}

function listBrokerRequests(status) {
  const state = ensureState();
  const requestedStatus = cleanString(status) || 'AUTO_CONFIRMED';
  const rows = state.brokerRequests.filter((entry) => entry.request_status === requestedStatus).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { rows };
}

function updateBrokerRequest(id, input) {
  const state = ensureState();
  const request = state.brokerRequests.find((entry) => entry.id === Number(id));
  if (!request) {
    return { rows: [] };
  }
  if (input.dispatch_status !== undefined) request.request_status = cleanString(input.dispatch_status);
  request.dispatch_reviewed = true;
  request.dispatch_reviewed_at = nowIso();
  request.dispatch_reviewed_by = cleanString(input.dispatch_reviewed_by) || 'SYSTEM';
  request.dispatch_notes = cleanString(input.dispatch_notes) || null;
  request.updated_at = nowIso();
  return { rows: [request] };
}

function getBrokerDashboard(brokerId) {
  const state = ensureState();
  const broker = state.brokers.find((entry) => entry.id === Number(brokerId));
  if (!broker) {
    return { rows: [] };
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const currentPeriod = {
    start,
    end,
    rides: state.brokerRequests.filter((entry) => entry.broker_id === Number(brokerId) && entry.trip_date >= start && entry.trip_date <= end && entry.request_status === 'AUTO_CONFIRMED').length,
    revenue: state.brokerRequests.filter((entry) => entry.broker_id === Number(brokerId) && entry.trip_date >= start && entry.trip_date <= end && entry.request_status === 'AUTO_CONFIRMED').reduce((sum, entry) => sum + (Number(entry.broker_quoted_rate) || 0), 0)
  };
  const recentInvoices = state.auditLog.filter((entry) => entry.entity_type === 'BROKER' && entry.entity_id === String(brokerId)).slice(-12);
  return { broker, currentPeriod, recentInvoices };
}

function exportBrokerCsv(brokerId) {
  const state = ensureState();
  const rows = state.brokerRequests.filter((entry) => entry.broker_id === Number(brokerId));
  const header = 'booking_reference,service,pickup,destination,date,time,broker_rate,platform_rate,delta,status';
  const body = rows.map((row) => `${row.booking_reference || 'N/A'},${row.service},"${row.pickup}","${row.destination}",${row.trip_date},${row.trip_time},${row.broker_quoted_rate},${row.platform_calculated_rate},${row.rate_delta},${row.request_status}`).join('\n');
  return { csv: `${header}\n${body}` };
}

function logAudit(entityType, entityId, action, details) {
  const state = ensureState();
  state.auditLog.push({
    id: crypto.randomUUID(),
    entity_type: entityType,
    entity_id: String(entityId),
    action,
    details,
    created_at: nowIso()
  });
}

module.exports = {
  resetState,
  createBroker,
  listBrokers,
  getBroker,
  updateBroker,
  listRates,
  createRate,
  createBrokerRequest,
  listBrokerRequests,
  updateBrokerRequest,
  getBrokerDashboard,
  exportBrokerCsv,
  logAudit,
  ensureState
};
