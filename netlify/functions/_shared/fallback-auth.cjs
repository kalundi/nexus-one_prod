const crypto = require('crypto');

const FALLBACK_USERS = [
  { email: 'admin@nexusmt.com', password: 'NexusAdmin042!', role: 'ADMIN', display_name: 'Test Administrator' },
  { email: 'dispatcher@nexusmt.com', password: 'Dispatch2026!', role: 'DISPATCHER', display_name: 'Test Dispatcher' },
  { email: 'driver@nexusmt.com', password: 'Driver2026!', role: 'DRIVER', display_name: 'Test Driver' },
  { email: 'facility@nexusmt.com', password: 'Facility2026!', role: 'FACILITY', display_name: 'Test Facility' },
  { email: 'billing@nexusmt.com', password: 'Billing2026!', role: 'BILLING', display_name: 'Test Billing' },
  { email: 'qa@nexusmt.com', password: 'Quality2026!', role: 'QA', display_name: 'Test QA' },
  { email: 'executive@nexusmt.com', password: 'Exec2026!', role: 'EXECUTIVE', display_name: 'Test Executive' },
  { email: 'patient@example.com', password: 'Patient123!', role: 'PATIENT', display_name: 'Demo Patient' },
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
  if (['dev','deploy-preview','branch-deploy'].includes(context)) return true;
  if (String(process.env.NETLIFY_DEV || '').trim().toLowerCase() === 'true') return true;
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'development' || nodeEnv === 'test') return true;
  const appEnv = String(process.env.APP_ENV || '').trim().toLowerCase();
  if (appEnv === 'development' || appEnv === 'test') return true;
  return false;
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

function isFallbackTerminalStatus(status) {
  return ['COMPLETED', 'DELIVERED', 'CANCELLED', 'NO_SHOW', 'MISSED'].includes(String(status || '').toUpperCase());
}

function shouldAutoMarkFallbackMissed(item) {
  const status = String(item?.status || '').toUpperCase();
  if (isFallbackTerminalStatus(status)) return false;
  if (!['ASSIGNED', 'SCHEDULED', 'REQUESTED', 'SUBMITTED', 'PENDING_DISPATCH_CONFIRMATION'].includes(status)) return false;
  const tripDate = String(item?.trip_date || item?.date || '').trim();
  const tripTime = String(item?.trip_time || item?.time || '00:00').trim();
  if (!tripDate) return false;
  const parsed = new Date(`${tripDate}T${tripTime.length === 5 ? `${tripTime}:00` : tripTime}`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

function autoMarkFallbackMissed(list) {
  const input = Array.isArray(list) ? list : [];
  return input.map((item) => {
    if (!shouldAutoMarkFallbackMissed(item)) return item;
    return {
      ...item,
      status: 'MISSED',
      notes: item?.notes ? `${item.notes} | Auto-marked MISSED after scheduled time passed.` : 'Auto-marked MISSED after scheduled time passed.'
    };
  });
}

function mergeMissingAssignments(existingList, templateList) {
  const existing = Array.isArray(existingList) ? existingList : [];
  const template = Array.isArray(templateList) ? templateList : [];
  const seen = new Set(existing.map((item) => String(item.reference || '')));
  const additions = template.filter((item) => !seen.has(String(item.reference || '')));
  return [...existing, ...additions];
}

function buildDefaultAssignments(user) {
  return [];
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
  const normalized = autoMarkFallbackMissed(fallbackAssignments.get(key));
  fallbackAssignments.set(key, normalized);
  return normalized.map((item) => ({ ...item }));
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
  if (['COMPLETED', 'DELIVERED', 'CANCELLED', 'NO_SHOW', 'MISSED'].includes(String(current.status || '').toUpperCase())) {
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
  if (['COMPLETED', 'DELIVERED', 'CANCELLED', 'NO_SHOW', 'MISSED'].includes(String(current.status || '').toUpperCase())) {
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
