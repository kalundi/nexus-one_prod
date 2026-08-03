const crypto = require('crypto');

const FALLBACK_USERS = [
  { email: 'admin@nexusmt.com', password: 'NexusAdmin042!', role: 'ADMIN', display_name: 'Test Administrator' },
  { email: 'dispatcher@nexusmt.com', password: 'Dispatch2026!', role: 'DISPATCHER', display_name: 'Test Dispatcher' },
  { email: 'driver@nexusmt.com', password: 'Driver2026!', role: 'DRIVER', display_name: 'Test Driver' },
  { email: 'facility@nexusmt.com', password: 'Facility2026!', role: 'FACILITY', display_name: 'Test Facility' },
  { email: 'billing@nexusmt.com', password: 'Billing2026!', role: 'BILLING', display_name: 'Test Billing' },
  { email: 'qa@nexusmt.com', password: 'Quality2026!', role: 'QA', display_name: 'Test QA' },
  { email: 'executive@nexusmt.com', password: 'Exec2026!', role: 'EXECUTIVE', display_name: 'Test Executive' },
  { email: 'fletcher@nexusmt.com', password: 'Fletcher2026!', role: 'DRIVER', display_name: 'Fletcher Kalundi' }
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

function buildDefaultAssignments(user) {
  const name = user.display_name || 'Assigned Driver';
  return [
    {
      reference: 'NMT-DRV-DEMO-1001',
      name: 'Preview Rider One',
      service: 'WHEELCHAIR',
      pickup: 'Washington Hospital Center',
      destination: 'Sibley Memorial Hospital',
      trip_date: todayIso(),
      trip_time: '09:30',
      status: 'ASSIGNED',
      notes: `Assigned to ${name} for local preview`
    },
    {
      reference: 'NMT-DRV-DEMO-1002',
      name: 'Preview Rider Two',
      service: 'AMBULATORY',
      pickup: 'MedStar Georgetown University Hospital',
      destination: 'Inova Fairfax Medical Campus',
      trip_date: tomorrowIso(),
      trip_time: '13:15',
      status: 'SCHEDULED',
      notes: `Assigned to ${name} for local preview`
    }
  ];
}

function getFallbackAssignments(user) {
  if (!isFallbackAuthEnabled()) return [];
  const key = String(user?.email || '').toLowerCase();
  if (!key) return [];
  if (!fallbackAssignments.has(key)) {
    fallbackAssignments.set(key, buildDefaultAssignments(user));
  }
  return fallbackAssignments.get(key).map((item) => ({ ...item }));
}

function acceptFallbackAssignment(user, reference) {
  if (!isFallbackAuthEnabled()) return null;
  const key = String(user?.email || '').toLowerCase();
  if (!key || !fallbackAssignments.has(key)) return null;
  const list = fallbackAssignments.get(key);
  const idx = list.findIndex((item) => String(item.reference) === String(reference));
  if (idx === -1) return null;
  const current = list[idx];
  if (['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(String(current.status || '').toUpperCase())) {
    return null;
  }
  list[idx] = { ...current, status: 'EN_ROUTE' };
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
  acceptFallbackAssignment
};
