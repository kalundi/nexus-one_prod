const crypto = require('crypto');

const FALLBACK_USERS = [
  { email: 'admin@nexusmt.com', password: 'NexusAdmin042!', role: 'ADMIN', display_name: 'Test Administrator' },
  { email: 'dispatcher@nexusmt.com', password: 'Dispatch2026!', role: 'DISPATCHER', display_name: 'Test Dispatcher' },
  { email: 'driver@nexusmt.com', password: 'Driver2026!', role: 'DRIVER', display_name: 'Test Driver' },
  { email: 'facility@nexusmt.com', password: 'Facility2026!', role: 'FACILITY', display_name: 'Test Facility' },
  { email: 'billing@nexusmt.com', password: 'Billing2026!', role: 'BILLING', display_name: 'Test Billing' },
  { email: 'qa@nexusmt.com', password: 'Quality2026!', role: 'QA', display_name: 'Test QA' },
  { email: 'executive@nexusmt.com', password: 'Exec2026!', role: 'EXECUTIVE', display_name: 'Test Executive' },
  { email: 'fletcher@nexusmt.com', password: 'Flandi01#', role: 'DRIVER', display_name: 'Fletcher Kalundi' }
];

const fallbackAssignments = new Map();
const revokedTokens = new Set();
const FALLBACK_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function isFallbackAuthEnabled() {
  const explicit = String(process.env.ALLOW_FALLBACK_AUTH || '').trim().toLowerCase();
  if (explicit === 'true' || explicit === '1' || explicit === 'yes') return true;
  if (explicit === 'false' || explicit === '0' || explicit === 'no') return false;
  const context = String(process.env.CONTEXT || '').trim().toLowerCase();
  if (context === 'production') return false;
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production') return false;
  return true;
}

function fallbackSecret() {
  return String(process.env.FALLBACK_AUTH_SECRET || 'nexus-fallback-local-secret');
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function fromBase64UrlJson(value) {
  return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
}

function signFallbackPayload(payloadSegment) {
  return crypto.createHmac('sha256', fallbackSecret()).update(payloadSegment).digest('base64url');
}

function findFallbackUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const match = FALLBACK_USERS.find((user) => user.email.toLowerCase() === normalizedEmail);
  if (!match) return null;
  return {
    id: `fallback-${normalizedEmail}`,
    email: match.email,
    display_name: match.display_name,
    role: match.role,
    scope_id: null,
    must_change_password: false,
    active: true
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function addDaysIso(days) {
  return new Date(Date.now() + (Number(days) || 0) * 86400000).toISOString().slice(0, 10);
}

function futureDateTime(offsetMinutes) {
  const dt = new Date(Date.now() + (Number(offsetMinutes) || 0) * 60000);
  const date = dt.toISOString().slice(0, 10);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return { date, time: `${hh}:${mm}` };
}

function mergeMissingAssignments(existingList, templateList) {
  const existing = Array.isArray(existingList) ? existingList : [];
  const template = Array.isArray(templateList) ? templateList : [];
  const seen = new Set(existing.map((item) => String(item.reference || '')));
  const additions = template.filter((item) => !seen.has(String(item.reference || '')));
  return [...existing, ...additions];
}

function buildDefaultAssignments(user) {
  const name = user.display_name || 'Assigned Driver';
  const quick0 = futureDateTime(55);
  const quick1 = futureDateTime(30);
  const quick2 = futureDateTime(90);
  const quick3 = futureDateTime(165);
  const trips = [
    { reference: 'NMT-DRV-DEMO-2000', date: quick0.date, time: quick0.time, patient: 'Quick Test Rider Zero',  service: 'AMBULATORY', pickup: 'Howard University Hospital', destination: 'George Washington University Hospital', distanceMiles: 11.6, note: `Testing trip within next 60 minutes for ${name}` },
    { reference: 'NMT-DRV-DEMO-2001', date: quick1.date, time: quick1.time, patient: 'Quick Test Rider One',   service: 'WHEELCHAIR', pickup: 'Washington Hospital Center', destination: 'Sibley Memorial Hospital', distanceMiles: 18.4, note: `Testing trip within next hour for ${name}` },
    { reference: 'NMT-DRV-DEMO-2002', date: quick2.date, time: quick2.time, patient: 'Quick Test Rider Two',   service: 'AMBULATORY', pickup: 'MedStar Georgetown University Hospital', destination: 'Inova Fairfax Medical Campus', distanceMiles: 24.9, note: `Testing trip within next 2 hours for ${name}` },
    { reference: 'NMT-DRV-DEMO-2003', date: quick3.date, time: quick3.time, patient: 'Quick Test Rider Three', service: 'STRETCHER',   pickup: 'Holy Cross Hospital', destination: 'Suburban Hospital', distanceMiles: 31.2, note: `Testing trip within next 3 hours for ${name}` },

    { reference: 'NMT-DRV-DEMO-1001', offset: 0,  time: '09:30', patient: 'Preview Rider One',   service: 'WHEELCHAIR', pickup: 'Washington Hospital Center', destination: 'Sibley Memorial Hospital', distanceMiles: 18.4 },
    { reference: 'NMT-DRV-DEMO-1002', offset: 0,  time: '11:15', patient: 'Preview Rider Two',   service: 'AMBULATORY', pickup: 'MedStar Georgetown University Hospital', destination: 'Inova Fairfax Medical Campus', distanceMiles: 24.9 },

    { reference: 'NMT-DRV-DEMO-1003', offset: 1,  time: '08:00', patient: 'Preview Rider Three', service: 'STRETCHER',   pickup: 'Holy Cross Hospital', destination: 'Suburban Hospital', distanceMiles: 31.2 },
    { reference: 'NMT-DRV-DEMO-1004', offset: 3,  time: '10:45', patient: 'Preview Rider Four',  service: 'AMBULATORY',  pickup: 'George Washington University Hospital', destination: 'MedStar Washington Hospital Center', distanceMiles: 12.1 },
    { reference: 'NMT-DRV-DEMO-1005', offset: 5,  time: '07:50', patient: 'Preview Rider Five',  service: 'WHEELCHAIR',  pickup: 'Sibley Memorial Hospital', destination: 'Children\'s National Hospital', distanceMiles: 28.7 },
    { reference: 'NMT-DRV-DEMO-1006', offset: 7,  time: '14:20', patient: 'Preview Rider Six',    service: 'AMBULATORY',  pickup: 'Inova Fairfax Medical Campus', destination: 'Reston Hospital Center', distanceMiles: 34.6 },
    { reference: 'NMT-DRV-DEMO-1007', offset: 10, time: '11:10', patient: 'Preview Rider Seven',  service: 'WHEELCHAIR',  pickup: 'Adventist HealthCare White Oak Medical Center', destination: 'Washington Hospital Center', distanceMiles: 16.8 },
    { reference: 'NMT-DRV-DEMO-1008', offset: 13, time: '09:00', patient: 'Preview Rider Eight',  service: 'AMBULATORY',  pickup: 'Prince George\'s Hospital Center', destination: 'MedStar Georgetown University Hospital', distanceMiles: 21.5 },
    { reference: 'NMT-DRV-DEMO-1009', offset: 16, time: '15:25', patient: 'Preview Rider Nine',   service: 'BLS',         pickup: 'University of Maryland Medical Center', destination: 'Union Station', distanceMiles: 41.3 },
    { reference: 'NMT-DRV-DEMO-1010', offset: 19, time: '08:40', patient: 'Preview Rider Ten',    service: 'WHEELCHAIR',  pickup: 'Suburban Hospital', destination: 'Sibley Memorial Hospital', distanceMiles: 29.8 },
    { reference: 'NMT-DRV-DEMO-1011', offset: 23, time: '12:30', patient: 'Preview Rider Eleven', service: 'AMBULATORY',  pickup: 'Holy Cross Germantown Hospital', destination: 'Inova Fairfax Medical Campus', distanceMiles: 9.7 },
    { reference: 'NMT-DRV-DEMO-1012', offset: 27, time: '16:10', patient: 'Preview Rider Twelve', service: 'STRETCHER',   pickup: 'Children\'s National Hospital', destination: 'MedStar Washington Hospital Center', distanceMiles: 36.4 }
  ];
  const unique = new Set();
  const normalized = [];
  for (const trip of trips) {
    const reference = String(trip.reference || '').trim();
    if (!reference || unique.has(reference)) continue;
    unique.add(reference);
    normalized.push({
      reference,
      name: trip.patient,
      service: trip.service,
      pickup: trip.pickup,
      destination: trip.destination,
      trip_date: trip.date || addDaysIso(trip.offset),
      trip_time: trip.time,
      status: 'ASSIGNED',
      notes: trip.note || `Assigned to ${name} for local preview`,
      distanceMiles: trip.distanceMiles
    });
  }
  return normalized;
}

function getFallbackAssignments(user) {
  if (!isFallbackAuthEnabled()) return [];
  const key = String(user?.email || '').toLowerCase();
  if (!key) return [];
  const template = buildDefaultAssignments(user);
  if (!fallbackAssignments.has(key)) {
    fallbackAssignments.set(key, template);
  } else {
    const merged = mergeMissingAssignments(fallbackAssignments.get(key), template);
    fallbackAssignments.set(key, merged);
  }
  return fallbackAssignments.get(key).map((item) => ({ ...item }));
}

function acceptFallbackAssignment(user, reference) {
  if (!isFallbackAuthEnabled()) return null;
  const key = String(user?.email || '').toLowerCase();
  if (!key) return null;
  if (!fallbackAssignments.has(key)) {
    const seededUser = findFallbackUserByEmail(key) || user;
    fallbackAssignments.set(key, buildDefaultAssignments(seededUser));
  }
  const list = fallbackAssignments.get(key);
  const idx = list.findIndex((item) => String(item.reference) === String(reference));
  if (idx === -1) return null;
  const current = list[idx];
  if (['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(String(current.status || '').toUpperCase())) {
    return null;
  }
  list[idx] = { ...current, status: 'ASSIGNED' };
  fallbackAssignments.set(key, list);
  return { ...list[idx] };
}

function updateFallbackAssignmentStatus(user, reference, status, meta = {}) {
  if (!isFallbackAuthEnabled()) return null;
  const key = String(user?.email || '').toLowerCase();
  if (!key) return null;
  if (!fallbackAssignments.has(key)) {
    const seededUser = findFallbackUserByEmail(key) || user;
    fallbackAssignments.set(key, buildDefaultAssignments(seededUser));
  }
  const normalizedStatus = String(status || '').toUpperCase().replaceAll('-', '_');
  if (!normalizedStatus) return null;
  const list = fallbackAssignments.get(key);
  const idx = list.findIndex((item) => String(item.reference) === String(reference));
  if (idx === -1) return null;
  const current = list[idx];
  if (['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(String(current.status || '').toUpperCase())) {
    return null;
  }
  list[idx] = {
    ...current,
    status: normalizedStatus,
    earlyPickupReason: normalizedStatus === 'EN_ROUTE' && meta?.earlyPickupReason ? String(meta.earlyPickupReason).trim() : current.earlyPickupReason || null
  };
  fallbackAssignments.set(key, list);
  return { ...list[idx] };
}

function getFallbackUser(email, password) {
  if (!isFallbackAuthEnabled()) return null;
  const user = findFallbackUserByEmail(email);
  if (!user) return null;
  const matchingSource = FALLBACK_USERS.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
  if (!matchingSource) return null;
  if (String(password || '') !== matchingSource.password) return null;
  return user;
}

function createFallbackSession(user) {
  if (!isFallbackAuthEnabled()) return null;
  const issuedAt = Date.now();
  const payload = {
    type: 'fallback',
    email: user.email,
    role: user.role,
    iat: issuedAt,
    exp: issuedAt + FALLBACK_TOKEN_TTL_MS
  };
  const payloadSegment = base64UrlJson(payload);
  const signature = signFallbackPayload(payloadSegment);
  return `fb.${payloadSegment}.${signature}`;
}

function getFallbackSession(token) {
  if (!isFallbackAuthEnabled()) return null;
  const raw = String(token || '');
  if (!raw || revokedTokens.has(raw)) return null;
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== 'fb') return null;
  const payloadSegment = parts[1];
  const signature = parts[2];
  const expected = signFallbackPayload(payloadSegment);
  if (signature !== expected) return null;
  let payload;
  try {
    payload = fromBase64UrlJson(payloadSegment);
  } catch {
    return null;
  }
  if (payload.type !== 'fallback') return null;
  if (!payload.exp || Date.now() > Number(payload.exp)) return null;
  const user = findFallbackUserByEmail(payload.email);
  if (!user) return null;
  if (String(user.role) !== String(payload.role || '')) return null;
  return { user, createdAt: Number(payload.iat || Date.now()) };
}

function revokeFallbackSession(token) {
  if (token) revokedTokens.add(String(token));
}

module.exports = {
  FALLBACK_USERS,
  getFallbackUser,
  createFallbackSession,
  getFallbackSession,
  revokeFallbackSession,
  getFallbackAssignments,
  acceptFallbackAssignment,
  updateFallbackAssignmentStatus
};
