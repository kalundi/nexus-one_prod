// Nex staff mode: the role-aware assistant for signed-in Nexus users.
//
// Public visitors keep using the standalone visitor-assistant function
// (unchanged). This module is mounted by api.cjs at /api/assistant/*
// and answers ONLY from the caller's own session:
//   - the role and scope come from requireUser() on the caller's DB
//     session — never from the request body;
//   - the legacy fallback session (which carries no session_id) never
//     unlocks staff data; those callers get the public assistant;
//   - every data read below is pinned to the caller's role: dispatch
//     and admin see the board, a driver sees only trips pinned to
//     them, a facility sees only its own facility_id, a patient or
//     caretaker sees only their own trips;
//   - MOCK / demo trips are excluded from every default view;
//   - assignment changes are propose → confirm → execute: a proposal
//     runs the same checks the bookings PATCH endpoint runs, the user
//     confirms in chat against a single-use key bound to their user id
//     and the exact payload, and execution goes back through the API
//     handler itself (deps.invokeApi) under the caller's own session,
//     so endpoint validation (409s included) is never bypassed.
//
// Conversation contract (visitor style): replies are short natural
// sentences, at most one or two proactive details, structured data
// only when asked. Question text is never logged.

'use strict';

const REF_RE = /\b((?:MOCK-)?NMT-\d{8}-\d+)\b/i;
const TERMINAL = new Set(['COMPLETED', 'DELIVERED', 'BILLED', 'PAID', 'PAID_IN_FULL', 'CANCELLED', 'CANCELED', 'NO_SHOW']);
const ACTIVE_STATUSES = ['ASSIGNED', 'SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_PROGRESS', 'IN_TRANSIT', 'PATIENT_ON_BOARD', 'DEPARTED', 'STARTED'];
const PENDING_STATUSES = ['SUBMITTED', 'REQUESTED', 'PENDING', 'PENDING_REVIEW', 'UNASSIGNED'];
// Demo trips enter through the facility demo surface with a 'demo'
// booking_source; real sources are CUSTOMER / FACILITY / BROKER / etc.
const REAL = "(upper(coalesce(b.status,'')) <> 'MOCK' AND upper(coalesce(b.booking_source,'')) NOT IN ('MOCK','DEMO'))";
const TRIP_COLS = 'b.reference,b.name,b.service,b.pickup,b.destination,b.trip_date,b.trip_time,b.trip_type,b.return_trip_date,b.return_trip_time,b.status,b.driver_name,b.driver_user_id,b.driver_scope_id,b.vehicle_unit,b.facility_id,b.patient_user_id,b.pickup_lat,b.pickup_lng,b.destination_lat,b.destination_lng,b.route_fare_inputs,b.duplicate_of,b.booking_source,b.created_at';
const NexInsightsChat = require('./nex-insights-chat.cjs');
const NexInsightReviews = require('./nex-insight-reviews.cjs');
const {isPublicIntent}=require('./nex-public-role-intent.cjs');
const ACTION_ROLES = ['DISPATCHER', 'ADMIN'];
const ROLE_LABELS = {
  ADMIN: 'Admin', DISPATCHER: 'Dispatch', DRIVER: 'Driver', FACILITY: 'Facility',
  PATIENT: 'Patient', CARETAKER: 'Caretaker', BILLING: 'Billing', QA: 'QA',
  EXECUTIVE: 'Executive', STAFF: 'Staff',
};
const GREETING_CHIPS = {
  dispatch: ["What's unassigned?", "Who's on duty?", "How's the board looking?", "What's the weather?"],
  driver: ['What are my trips today?', 'Any open shifts?', "What's my schedule?"],
  facility: ['How many trips today?', 'Any trips without a driver?', 'How many trips this month?'],
  patient: ['When is my next ride?', 'Where is my driver?'],
};
const YARD = { name: 'the Clarksburg yard', lat: 39.2353, lng: -77.2844 };
const CITY_COORDS = {
  clarksburg: [39.2353, -77.2844], germantown: [39.1732, -77.2717], gaithersburg: [39.1434, -77.2014],
  rockville: [39.084, -77.1528], bethesda: [38.9847, -77.0947], silver_spring: [38.9907, -77.0261],
  annapolis: [38.9784, -76.4922], baltimore: [39.2904, -76.6122], frederick: [39.4143, -77.4105],
  columbia: [39.2037, -76.861], olney: [39.1532, -77.0669], damascus: [39.2883, -77.206],
  washington: [38.9072, -77.0369], sterling: [39.0062, -77.4286],
};

function createHandler(deps) {
  const { query, requireUser, bearer, json, parseBody } = deps;
  if (!query || !requireUser || !bearer || !json || !parseBody) {
    throw new Error('staff-assistant requires query, requireUser, bearer, json and parseBody deps');
  }
  const audit = deps.audit || (async (...args) => {
    try { return await require('./auth.cjs').audit(...args); } catch { return null; }
  });
  const invokeApi = deps.invokeApi || null;
  const fetchImpl = deps.fetchImpl || ((...args) => fetch(...args));
  const now = deps.now || Date.now;
  const mapBooking = deps.mapBooking || ((b) => b);
  const proposals = new Map(); // confirm key -> { userId, expires, kind, ref, fields, summary }
  const rateBuckets = new Map(); // user id (or ip) -> timestamps
  const weatherCache = new Map(); // key -> { at, value }

  // The public assistant core, required lazily so the public path is
  // untouched when this module is loaded.
  let publicCore = null;
  const publicAsk = deps.publicAsk || (async (event) => {
    if (!publicCore) publicCore = require('./visitor-assistant-core.cjs').createVisitorAssistant();
    const res = await publicCore.handler(event);
    return { statusCode: res.statusCode, body: res.body };
  });

  /* ------------------------------------------------------------ utils */

  function clean(value) { return String(value == null ? '' : value).trim(); }

  function easternDateTime(ms) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date(ms));
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      time: `${get('hour')}:${get('minute')}`,
      weekday: get('weekday'),
    };
  }

  function addDays(iso, days) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function weekdayIso(iso) {
    // Mon=1 .. Sun=7, matching employee_shifts.weekday_iso.
    return ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  }

  function fmtDateWords(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
  }

  // DATE columns arrive as 'YYYY-MM-DD' strings from some drivers
  // and as JS Date objects from node-pg — normalize both.
  function dateStr(value) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  function fmtTime(value) {
    const t = clean(value).slice(0, 5);
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    let h = Number(m[1]);
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m[2]} ${suffix}`;
  }

  function timeMins(value) {
    const m = clean(value).slice(0, 5).match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function statusWord(status) {
    const s = String(status || '').toUpperCase().replace(/-/g, '_');
    if (['SUBMITTED', 'REQUESTED', 'PENDING', 'PENDING_REVIEW'].includes(s)) return 'requested';
    if (s === 'SCHEDULED' || s === 'ASSIGNED') return 'scheduled';
    if (s === 'EN_ROUTE') return 'en route to pickup';
    if (s === 'ARRIVED' || s === 'ARRIVED_PICKUP') return 'at the pickup';
    if (s === 'PICKED_UP' || s === 'PATIENT_ON_BOARD') return 'picked up';
    if (s === 'IN_PROGRESS' || s === 'IN_TRANSIT' || s === 'DEPARTED' || s === 'STARTED') return 'in progress';
    if (['COMPLETED', 'DELIVERED'].includes(s)) return 'completed';
    if (['BILLED', 'PAID', 'PAID_IN_FULL'].includes(s)) return 'done and billed';
    if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
    if (s === 'NO_SHOW') return 'no-show';
    return 'on the board';
  }

  function serviceWord(service) {
    const key = deps.resolveServicePolicyKey ? deps.resolveServicePolicyKey(service) : fallbackServiceKey(service);
    const words = {
      ambulatory: 'ambulatory', wheelchair: 'wheelchair', bariatric: 'bariatric',
      stretcher: 'stretcher', broda: 'Broda chair', bls: 'BLS ambulance',
      als1: 'ALS I ambulance', als2: 'ALS II ambulance',
      facility_transfer: 'facility transfer', facility_transfer_critical: 'high-acuity transfer',
    };
    return words[key] || clean(service).toLowerCase() || 'ride';
  }

  function fallbackServiceKey(service) {
    const s = clean(service).toLowerCase();
    if (s.includes('wheelchair')) return 'wheelchair';
    if (s.includes('bariatric')) return 'bariatric';
    if (s.includes('stretcher')) return 'stretcher';
    if (s.includes('broda')) return 'broda';
    if (s.includes('als ii') || s.includes('als2')) return 'als2';
    if (s.includes('als')) return 'als1';
    if (s.includes('bls') || s.includes('ambulance')) return 'bls';
    if (s.includes('critical') || s.includes('high-acuity') || s.includes('high acuity')) return 'facility_transfer_critical';
    if (s.includes('transfer')) return 'facility_transfer';
    return 'ambulatory';
  }

  function serviceMatches(booking, filterKey) {
    const key = deps.resolveServicePolicyKey ? deps.resolveServicePolicyKey(booking.service) : fallbackServiceKey(booking.service);
    return key === filterKey;
  }

  function cityOf(address) {
    const text = clean(address);
    if (!text) return '';
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return '';
    // "123 Main St, Rockville, MD 20850" → Rockville; a bare place
    // name with no comma reads as the place itself.
    return parts.length >= 2 ? parts[parts.length - 2].replace(/\b(MD|VA|DC)\b/i, '').trim() || parts[0] : parts[0];
  }

  function coordFor(booking, which) {
    const lat = which === 'pickup' ? booking.pickup_lat : booking.destination_lat;
    const lng = which === 'pickup' ? booking.pickup_lng : booking.destination_lng;
    if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng), name: cityOf(which === 'pickup' ? booking.pickup : booking.destination) || 'the trip area' };
    }
    const city = cityOf(which === 'pickup' ? booking.pickup : booking.destination).toLowerCase().replace(/\s+/g, '_');
    if (CITY_COORDS[city]) return { lat: CITY_COORDS[city][0], lng: CITY_COORDS[city][1], name: cityOf(which === 'pickup' ? booking.pickup : booking.destination) };
    return null;
  }

  function haversineKm(aLat, aLng, bLat, bLng) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat);
    const dLng = rad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  function relWhen(recordedAt, nowMs) {
    if (!recordedAt) return '';
    const mins = Math.max(0, Math.round((nowMs - new Date(recordedAt).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins === 1) return 'a minute ago';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.round(mins / 60);
    return hrs === 1 ? 'about an hour ago' : `about ${hrs} hours ago`;
  }

  function clientIp(event) {
    const headers = event.headers || {};
    return String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  }

  function rateLimited(key, limit, windowMs) {
    const t = now();
    const arr = (rateBuckets.get(key) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    rateBuckets.set(key, arr);
    return arr.length > limit;
  }

  // Staff data unlocks ONLY for a real DB session. requireUser also
  // resolves the legacy fallback session; that user carries no
  // session_id, and demo accounts already throw inside requireUser.
  async function resolveStaffUser(event) {
    const authValue = bearer(event);
    if (!authValue) return null;
    let user;
    try { user = await requireUser(authValue); } catch { return null; }
    if (!user || !user.session_id) return null;
    return user;
  }

  function sanitizeStaffState(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const state = {};
    if (['board', 'unassigned', 'duty', 'fleet', 'mine', 'weather', 'traffic', 'trip', 'shifts'].includes(raw.intent)) state.intent = raw.intent;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))) state.date = String(raw.date);
    if (REF_RE.test(String(raw.ref || ''))) state.ref = String(raw.ref).toUpperCase();
    if (clean(raw.driverName)) state.driverName = clean(raw.driverName).slice(0, 80);
    if (clean(raw.serviceFilter)) state.serviceFilter = clean(raw.serviceFilter).slice(0, 40);
    if (REF_RE.test(String(raw.pendingAssignRef || ''))) state.pendingAssignRef = String(raw.pendingAssignRef).toUpperCase();
    return state;
  }

  function staffEnvelope(user, state) {
    return {
      role: user.role,
      roleLabel: ROLE_LABELS[user.role] || user.role,
      displayName: clean(user.display_name || user.email || ''),
      firstName: clean(user.display_name || '').split(/\s+/)[0] || 'there',
      state: state || {},
    };
  }

  function staffReply(user, state, answer, extra = {}) {
    return json(200, { answer, mode: 'staff', staff: staffEnvelope(user, state), ...extra });
  }

  /* ---------------------------------------------------- data builders */

  async function boardForDate(dateStr) {
    const r = await query(
      `SELECT ${TRIP_COLS} FROM bookings b
        WHERE ${REAL} AND (b.trip_date = $1::date OR (b.trip_type = 'ROUND_TRIP' AND b.return_trip_date = $1::date))
        ORDER BY b.trip_time`,
      [dateStr]
    );
    const trips = r.rows;
    const count = (set) => trips.filter((t) => set.includes(String(t.status || '').toUpperCase().replace(/-/g, '_'))).length;
    const unassigned = trips.filter((t) => {
      const s = String(t.status || '').toUpperCase().replace(/-/g, '_');
      return !TERMINAL.has(s) && !clean(t.driver_name) && !t.driver_user_id && !clean(t.vehicle_unit);
    });
    return {
      trips,
      total: trips.length,
      pending: count(PENDING_STATUSES),
      active: count(ACTIVE_STATUSES),
      complete: count(['COMPLETED', 'DELIVERED', 'BILLED', 'PAID', 'PAID_IN_FULL']),
      cancelled: count(['CANCELLED', 'CANCELED', 'NO_SHOW']),
      unassigned,
    };
  }

  async function dutyRoster(dateStr) {
    const drivers = await query(
      `SELECT e.id, e.display_name AS name, e.user_id, u.scope_id
         FROM employees e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.role = 'DRIVER' AND e.active = true
        ORDER BY e.display_name`
    );
    const shifts = await query(
      `SELECT employee_id, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
         FROM employee_shifts
        WHERE assignment_role = 'DRIVER' AND active = true AND weekday_iso = $1
          AND effective_start_date <= $2::date AND (effective_end_date IS NULL OR effective_end_date >= $2::date)`,
      [weekdayIso(dateStr), dateStr]
    );
    const shiftByEmp = new Map(shifts.rows.map((s) => [String(s.employee_id), s]));
    const counts = await query(
      `SELECT driver_user_id, driver_name, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE upper(replace(status, '-', '_')) IN ('EN_ROUTE','ARRIVED','ARRIVED_PICKUP','PICKED_UP','PATIENT_ON_BOARD','IN_PROGRESS','IN_TRANSIT','DEPARTED'))::int AS active
         FROM bookings b
        WHERE ${REAL} AND b.trip_date = $1::date
        GROUP BY driver_user_id, driver_name`,
      [dateStr]
    );
    const vehicles = await query('SELECT unit_number, vehicle_type, driver_scope_id FROM vehicles WHERE driver_scope_id IS NOT NULL');
    const vehicleByScope = new Map(vehicles.rows.map((v) => [String(v.driver_scope_id), v]));
    return drivers.rows.map((d) => {
      const mine = counts.rows.filter((c) => (c.driver_user_id && String(c.driver_user_id) === String(d.user_id)) || (!c.driver_user_id && c.driver_name === d.name));
      const trips = mine.reduce((n, c) => n + Number(c.total || 0), 0);
      const active = mine.reduce((n, c) => n + Number(c.active || 0), 0);
      const shift = shiftByEmp.get(String(d.id)) || null;
      const vehicle = d.scope_id ? vehicleByScope.get(String(d.scope_id)) : null;
      const status = active > 0 ? 'ON_TRIP' : (shift || trips > 0 ? 'ON_DUTY' : 'OFF_DUTY');
      return { name: d.name, userId: d.user_id, scopeId: d.scope_id, status, trips, shift, vehicle: vehicle ? vehicle.unit_number : null };
    });
  }

  async function tripsForDriver(user, fromDate, toDate) {
    const r = await query(
      `SELECT ${TRIP_COLS} FROM bookings b
        WHERE ${REAL} AND b.trip_date >= $1::date AND b.trip_date <= $2::date
          AND (b.driver_user_id = $3
               OR (b.driver_user_id IS NULL AND ((b.driver_scope_id IS NOT NULL AND b.driver_scope_id = $4)
                    OR lower(trim(b.driver_name)) = lower(trim($5)))))
        ORDER BY b.trip_date, b.trip_time
        LIMIT 40`,
      [fromDate, toDate, user.id, clean(user.scope_id || ''), clean(user.display_name || '')]
    );
    return r.rows;
  }

  async function driverScheduleRows(user) {
    const r = await query(
      `SELECT es.weekday_iso, to_char(es.start_time, 'HH24:MI') AS start_time, to_char(es.end_time, 'HH24:MI') AS end_time
         FROM employee_shifts es JOIN employees e ON e.id = es.employee_id
        WHERE e.user_id = $1 AND es.assignment_role = 'DRIVER' AND es.active = true
          AND es.effective_start_date <= CURRENT_DATE AND (es.effective_end_date IS NULL OR es.effective_end_date >= CURRENT_DATE)
        ORDER BY es.weekday_iso, es.start_time`,
      [user.id]
    );
    return r.rows;
  }

  async function driverOpenShifts() {
    const r = await query(
      `SELECT id, start_at, end_at, service_level, operating_area, vehicle_unit
         FROM driveflex_open_shifts
        WHERE status = 'OPEN' AND start_at > now()
        ORDER BY start_at LIMIT 5`
    );
    return r.rows;
  }

  async function facilityTrips(scopeId, dateStr) {
    const r = await query(
      `SELECT ${TRIP_COLS} FROM bookings b
        WHERE ${REAL} AND b.facility_id = $2
          AND (b.trip_date = $1::date OR (b.trip_type = 'ROUND_TRIP' AND b.return_trip_date = $1::date))
        ORDER BY b.trip_time LIMIT 30`,
      [dateStr, scopeId]
    );
    return r.rows;
  }

  async function facilityMonthCounts(scopeId, monthStart) {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE coalesce(b.driver_name, '') = '' AND b.driver_user_id IS NULL AND upper(replace(b.status, '-', '_')) NOT IN ('COMPLETED','DELIVERED','BILLED','PAID','PAID_IN_FULL','CANCELLED','CANCELED','NO_SHOW'))::int AS nodriver
         FROM bookings b
        WHERE ${REAL} AND b.facility_id = $2 AND b.trip_date >= $1::date AND b.trip_date < ($1::date + interval '1 month')`,
      [monthStart, scopeId]
    );
    return r.rows[0] || { total: 0, nodriver: 0 };
  }

  async function patientTrips(user) {
    if (user.role === 'CARETAKER' && deps.caretakerListTrips) {
      const trips = await deps.caretakerListTrips(user.id);
      return trips.map((t) => (t && t.reference ? t : mapBooking(t)));
    }
    const digits = String(user.phone || '').replace(/\D/g, '');
    const alt = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    const r = await query(
      `SELECT ${TRIP_COLS} FROM bookings b
        WHERE ${REAL}
          AND (b.patient_user_id = $1
               OR (b.patient_user_id IS NULL AND (lower(b.email) = lower($2)
                    OR ($3 <> '' AND regexp_replace(coalesce(b.phone, ''), '\\D', '', 'g') IN ($3, $4)))))
          AND b.trip_date >= $5::date
        ORDER BY b.trip_date, b.trip_time LIMIT 20`,
      [user.id, clean(user.email || ''), digits, alt, easternDateTime(now()).date]
    );
    return r.rows;
  }

  async function getBookingByRef(ref) {
    const r = await query('SELECT * FROM bookings WHERE reference = $1', [ref]);
    return r.rows[0] || null;
  }

  async function searchTripsByName(name, scopeClause = '', scopeArgs = []) {
    const r = await query(
      `SELECT ${TRIP_COLS} FROM bookings b WHERE ${REAL} AND b.name ILIKE $1 ${scopeClause} ORDER BY b.trip_date DESC, b.trip_time LIMIT 5`,
      [`%${name}%`, ...scopeArgs]
    );
    return r.rows;
  }

  /* ------------------------------------------- weather (NWS) + traffic */

  async function nwsJson(url, ttlMs, key) {
    const hit = weatherCache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'NexusMT Nex Assistant (dispatch@nexusmt.com)', Accept: 'application/geo+json' } });
    if (!res || !res.ok) throw new Error('NWS request failed');
    const value = await res.json();
    weatherCache.set(key, { at: now(), value });
    return value;
  }

  async function weatherFor(lat, lng) {
    const checkedAt = fmtTime(easternDateTime(now()).time);
    let alert = null;
    try {
      const alerts = await nwsJson(`https://api.weather.gov/alerts/active?point=${lat},${lng}`, 5 * 60000, `alerts:${lat},${lng}`);
      const features = (alerts && alerts.features) || [];
      if (features.length) {
        const p = features[0].properties || {};
        alert = `${p.event || 'Weather alert'}${p.headline ? ` — ${p.headline}` : ''}`;
      }
    } catch { /* alerts are best-effort; the forecast still answers */ }
    let sentence = '';
    try {
      const points = await nwsJson(`https://api.weather.gov/points/${lat},${lng}`, 30 * 60000, `points:${lat},${lng}`);
      const forecastUrl = points && points.properties && points.properties.forecast;
      if (forecastUrl) {
        const fc = await nwsJson(forecastUrl, 20 * 60000, `forecast:${forecastUrl}`);
        const periods = (fc && fc.properties && fc.properties.periods) || [];
        if (periods[0]) {
          const p0 = periods[0];
          sentence = `${p0.name}: ${p0.detailedForecast || p0.shortForecast || ''} Around ${p0.temperature}°${p0.temperatureUnit || 'F'}.`;
        }
        if (periods[1]) sentence += ` ${periods[1].name}: ${periods[1].shortForecast || ''}, around ${periods[1].temperature}°${periods[1].temperatureUnit || 'F'}.`;
      }
    } catch { /* fall through to the failure sentence */ }
    if (!sentence && !alert) return `I couldn't pull the National Weather Service feed just now — try me again in a few minutes.`;
    return `${alert ? `Heads up: ${alert}. ` : ''}${sentence} (National Weather Service, checked ${checkedAt}.)`.trim();
  }

  function digRouteMinutes(routeFareInputs) {
    let inputs = routeFareInputs;
    if (typeof inputs === 'string') { try { inputs = JSON.parse(inputs); } catch { inputs = null; } }
    let traffic = null;
    let normal = null;
    const visit = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 5) return;
      for (const [key, value] of Object.entries(node)) {
        const k = key.toLowerCase();
        if (typeof value === 'number' && Number.isFinite(value)) {
          if (traffic == null && (k.includes('traffic') && k.includes('minute'))) traffic = value;
          if (normal == null && ((k === 'durationminutes' || k === 'duration_minutes' || k === 'normalminutes') )) normal = value;
        } else if (value && typeof value === 'object') visit(value, depth + 1);
      }
    };
    visit(inputs, 0);
    return { traffic, normal };
  }

  function trafficSentence(booking) {
    const { traffic, normal } = digRouteMinutes(booking.route_fare_inputs);
    if (traffic != null) {
      return `For ${booking.reference}, the booked route is running about ${Math.round(traffic)} minutes in current traffic${normal != null ? ` (usually ${Math.round(normal)} minutes)` : ''} — that's the traffic-aware time stored with the trip.`;
    }
    return `I don't have a live traffic time stored for ${booking.reference} yet — it gets calculated when the route is priced. The run is ${cityOf(booking.pickup) || 'pickup'} to ${cityOf(booking.destination) || 'drop-off'}.`;
  }

  /* ------------------------------------------------------- composers */

  function tripLine(b, withDriver = true) {
    const bits = [`${b.reference} — ${clean(b.name) || 'Passenger'}, ${serviceWord(b.service)}, ${fmtTime(b.trip_time) || 'time TBD'}`];
    const route = [cityOf(b.pickup), cityOf(b.destination)].filter(Boolean).join(' to ');
    if (route) bits.push(route);
    bits.push(statusWord(b.status));
    if (withDriver) bits.push(clean(b.driver_name) ? `driver ${b.driver_name}` : 'no driver yet');
    if (withDriver && clean(b.vehicle_unit)) bits.push(b.vehicle_unit);
    return bits.join(', ') + '.';
  }

  function dayLabel(dateStr, today) {
    if (dateStr === today) return 'today';
    if (dateStr === addDays(today, 1)) return `tomorrow, ${fmtDateWords(dateStr)}`;
    return fmtDateWords(dateStr);
  }

  function boardReply(board, dateStr, today, filterKey) {
    const label = dayLabel(dateStr, today);
    const shown = filterKey ? board.trips.filter((t) => serviceMatches(t, filterKey)) : board.trips;
    const shownUnassigned = filterKey ? board.unassigned.filter((t) => serviceMatches(t, filterKey)) : board.unassigned;
    const whatPlural = filterKey ? `${serviceWord(filterKey)} trips` : 'trips';
    const what = shown.length === 1 ? whatPlural.replace(/trips$/, 'trip') : whatPlural;
    if (!shown.length) return `There are no ${whatPlural} on the board for ${label}.`;
    let answer = `${shown.length} ${what} on the board for ${label}: ${filterKey ? '' : `${board.pending} still requested, ${board.active} scheduled or under way, ${board.complete} completed.`} ${shownUnassigned.length} still need${shownUnassigned.length === 1 ? 's' : ''} a driver or vehicle.`;
    const next = [...shown].sort((a, b) => String(a.trip_time).localeCompare(String(b.trip_time))).slice(0, 3);
    if (next.length) answer += ` Coming up: ${next.map((t) => tripLine(t)).join(' ')}`;
    return answer.trim();
  }

  function dutyReply(roster, dateStr, today) {
    const label = dayLabel(dateStr, today);
    if (!roster.length) return `I don't see any active drivers on the roster right now.`;
    const lines = roster.map((d) => {
      const shift = d.shift ? ` (shift ${fmtTime(d.shift.start_time)}–${fmtTime(d.shift.end_time)})` : '';
      if (d.status === 'ON_TRIP') return `${d.name} is on a trip now — ${d.trips} trip${d.trips === 1 ? '' : 's'} ${label}${d.vehicle ? `, in ${d.vehicle}` : ''}.`;
      if (d.status === 'ON_DUTY') return `${d.name} is on duty${shift} — ${d.trips} trip${d.trips === 1 ? '' : 's'} ${label}${d.vehicle ? `, in ${d.vehicle}` : ''}.`;
      return `${d.name} is off duty ${label}.`;
    });
    const onDuty = roster.filter((d) => d.status !== 'OFF_DUTY').length;
    return `${onDuty} of ${roster.length} drivers on duty ${label}. ${lines.join(' ')}`;
  }

  function fleetReply(rows) {
    if (!rows.length) return `I don't see any vehicles on the fleet list right now.`;
    const lines = rows.slice(0, 12).map((v) => {
      const where = v.latitude != null ? `last GPS ${relWhen(v.recorded_at, now())}` : 'no recent GPS';
      return `${v.unit_number} (${clean(v.vehicle_type) || 'vehicle'}) — ${String(v.status || 'unknown').toLowerCase()}, ${where}.`;
    });
    return `${rows.length} vehicles on the fleet list. ${lines.join(' ')}`;
  }

  /* --------------------------------------------------------- openers */

  async function roleOpener(user, today) {
    const first = staffEnvelope(user).firstName;
    const { date, time } = easternDateTime(now());
    const hour = Number(time.split(':')[0]);
    const hello = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
    try {
      if (ACTION_ROLES.includes(user.role) || user.role === 'EXECUTIVE') {
        const board = await boardForDate(today);
        const items = [];
        if (board.unassigned.length) {
          const firstU = board.unassigned[0];
          items.push(`${board.unassigned.length} trip${board.unassigned.length === 1 ? '' : 's'} still need${board.unassigned.length === 1 ? 's' : ''} a driver or vehicle — earliest is ${firstU.reference}, ${clean(firstU.name)}, pickup ${fmtTime(firstU.trip_time) || 'time TBD'}${cityOf(firstU.pickup) ? ` in ${cityOf(firstU.pickup)}` : ''}`);
        }
        const wx = await weatherFor(YARD.lat, YARD.lng).catch(() => '');
        if (/Heads up:/.test(wx)) items.push(wx.split(' (National Weather Service')[0].replace(/^Heads up: /, 'Weather at the yard: '));
        return {
          greeting: `${hello}, ${first}. ${board.total} trip${board.total === 1 ? '' : 's'} on the board today, ${board.active} scheduled or under way.${items.length ? ` What needs you: ${items.slice(0, 2).join('. ')}.` : ' Nothing is waiting on a driver right now.'}`,
          chips: GREETING_CHIPS.dispatch,
        };
      }
      if (user.role === 'DRIVER') {
        const trips = await tripsForDriver(user, today, today);
        const nowMins = timeMins(time);
        const upcoming = trips.filter((t) => { const m = timeMins(t.trip_time); return m == null || nowMins == null || m >= nowMins; });
        let greeting = `${hello}, ${first}. `;
        if (!trips.length) greeting += `You have no trips on your schedule today.`;
        else if (upcoming.length) {
          greeting += `Your next pickup is ${upcoming[0].reference} at ${fmtTime(upcoming[0].trip_time) || 'a time still to confirm'} — ${clean(upcoming[0].name)}, ${cityOf(upcoming[0].pickup) || 'pickup'} to ${cityOf(upcoming[0].destination) || 'drop-off'}.`;
          if (upcoming.length > 1) greeting += ` You have ${upcoming.length - 1} more pickup${upcoming.length - 1 === 1 ? '' : 's'} after that.`;
        } else greeting += `All ${trips.length} of today's pickups are behind you.`;
        return { greeting, chips: GREETING_CHIPS.driver };
      }
      if (user.role === 'FACILITY') {
        const scopeId = clean(user.scope_id || '');
        if (!scopeId) return { greeting: `${hello}, ${first}. Your facility account isn't linked to a facility yet, so I can't pull your trips — dispatch can fix the link.` };
        const trips = await facilityTrips(scopeId, today);
        const noDriver = trips.filter((t) => !clean(t.driver_name) && !t.driver_user_id && !TERMINAL.has(String(t.status || '').toUpperCase().replace(/-/g, '_'))).length;
        return {
          greeting: `${hello}, ${first}. You have ${trips.length} trip${trips.length === 1 ? '' : 's'} with us today${noDriver ? `, and ${noDriver} still need${noDriver === 1 ? 's' : ''} a driver assigned` : ' — all have drivers assigned'}.`,
          chips: GREETING_CHIPS.facility,
        };
      }
      if (user.role === 'PATIENT' || user.role === 'CARETAKER') {
        const trips = await patientTrips(user);
        let greeting = `${hello}, ${first}. `;
        if (!trips.length) greeting += `You don't have any rides coming up with us right now.`;
        else {
          const nxt = trips[0];
          greeting += `Your next ride is ${nxt.reference} on ${fmtDateWords(dateStr(nxt.trip_date))} at ${fmtTime(nxt.trip_time) || 'a time still to confirm'} — pickup in ${cityOf(nxt.pickup) || 'your pickup area'}${clean(nxt.driver_name) ? `, and ${nxt.driver_name} is your driver` : ''}.`;
        }
        return { greeting, chips: GREETING_CHIPS.patient };
      }
    } catch { /* fall through to the plain greeting */ }
    return { greeting: `${hello}, ${first}. You're signed in as ${ROLE_LABELS[user.role] || user.role} — ask me about your work and I'll pull it up.`, chips: [] };
  }

  /* --------------------------------------------------- actions (Phase 2) */

  async function resolveDriver(nameText) {
    const like = `%${nameText.replace(/[%_]/g, '')}%`;
    const r = await query(
      `SELECT e.display_name AS name FROM employees e
        WHERE e.role = 'DRIVER' AND e.active = true AND e.display_name ILIKE $1
        ORDER BY (lower(e.display_name) = lower($2)) DESC, e.display_name LIMIT 3`,
      [like, nameText]
    );
    return r.rows.map((row) => row.name);
  }

  async function vehicleTypeOf(unit) {
    const r = await query('SELECT vehicle_type, status FROM vehicles WHERE unit_number = $1', [unit]);
    return r.rows[0] || null;
  }

  // The pre-check mirrors the bookings PATCH endpoint's own rules:
  // recurring-shift coverage for the trip's weekday and pickup time
  // (the endpoint re-validates the full trip window at confirm time)
  // plus service→vehicle eligibility from the platform's vehicle
  // preferences — the same table auto-assign uses.
  async function precheckAssign(booking, fields) {
    const problems = [];
    const notes = [];
    if (fields.driverName) {
      try {
        const coverage = await query(
          `SELECT COUNT(*)::int AS covered, COUNT(*) FILTER (WHERE true)::int AS any_rows
             FROM employee_shifts es JOIN employees e ON e.id = es.employee_id
            WHERE e.display_name = $1 AND es.assignment_role = 'DRIVER'`,
          [fields.driverName]
        );
        // any_rows above counts every DRIVER shift row for the driver;
        // coverage needs the window check, done in a second query so a
        // driver with no pattern at all reads as "unverified", not "no".
        const windowed = await query(
          `SELECT COUNT(*)::int AS covered
             FROM employee_shifts es JOIN employees e ON e.id = es.employee_id
            WHERE e.display_name = $1 AND es.assignment_role = 'DRIVER' AND es.active = true
              AND es.weekday_iso = $2 AND es.effective_start_date <= $3::date
              AND (es.effective_end_date IS NULL OR es.effective_end_date >= $3::date)
              AND es.start_time::time <= $4::time AND es.end_time::time > $4::time`,
          [fields.driverName, weekdayIso(dateStr(booking.trip_date)), dateStr(booking.trip_date), clean(booking.trip_time).slice(0, 5) || '00:00']
        );
        const hasPattern = coverage.rows[0] && Number(coverage.rows[0].any_rows) > 0;
        const covered = windowed.rows[0] && Number(windowed.rows[0].covered) > 0;
        if (covered) notes.push(`${fields.driverName} is scheduled over the pickup time`);
        else if (hasPattern) problems.push(`${fields.driverName} isn't scheduled over this trip's pickup time (${fmtDateWords(dateStr(booking.trip_date))}, ${fmtTime(booking.trip_time)})`);
        else notes.push(`no regular shift pattern on file for ${fields.driverName} — the full check runs when you confirm`);
      } catch { notes.push('schedule coverage could not be verified in the pre-check'); }
    }
    if (fields.vehicleUnit) {
      try {
        const prefs = deps.serviceVehiclePrefs || null;
        const key = deps.resolveServicePolicyKey ? deps.resolveServicePolicyKey(booking.service) : fallbackServiceKey(booking.service);
        const allowed = prefs && Array.isArray(prefs[key]) ? prefs[key] : null;
        if (allowed && !allowed.includes(fields.vehicleUnit)) {
          problems.push(`${fields.vehicleUnit} doesn't fit a ${serviceWord(booking.service)} trip — that service runs on ${allowed.join(', ')}`);
        } else {
          const vehicle = await vehicleTypeOf(fields.vehicleUnit);
          if (!vehicle) problems.push(`I can't find a vehicle with unit ${fields.vehicleUnit} on the fleet list`);
          else if (String(vehicle.status || '').toUpperCase() !== 'ACTIVE') notes.push(`${fields.vehicleUnit} shows as ${String(vehicle.status).toLowerCase()} on the fleet list`);
          else notes.push(`${fields.vehicleUnit} (${vehicle.vehicle_type || 'vehicle'}) fits`);
        }
      } catch { notes.push('vehicle eligibility could not be verified in the pre-check'); }
    }
    return { problems, notes };
  }

  function issueProposal(user, data) {
    const proposalKey = require('crypto').randomBytes(24).toString('base64url');
    proposals.set(proposalKey, { userId: user.id, expires: now() + 120000, ...data });
    return proposalKey;
  }

  async function proposeAction(user, state, parsed, today) {
    const booking = await getBookingByRef(parsed.ref);
    if (!booking) return staffReply(user, state, `I can't find a trip with reference ${parsed.ref} — check the reference and try me again.`);
    if (booking.duplicate_of) return staffReply(user, state, `${parsed.ref} is a duplicate of ${booking.duplicate_of} — changes have to be made on that trip instead.`);
    const isMock = String(booking.booking_source || '').toUpperCase() === 'MOCK' || String(booking.status || '').toUpperCase() === 'MOCK';
    if (isMock) return staffReply(user, state, `${parsed.ref} is a mock trip — I only work on real trips.`);
    const statusU = String(booking.status || '').toUpperCase().replace(/-/g, '_');
    if (TERMINAL.has(statusU)) return staffReply(user, state, `${parsed.ref} is already ${statusWord(booking.status)} — assignment changes don't apply any more.`);

    if (parsed.kind === 'auto') {
      if (clean(booking.driver_name) && clean(booking.vehicle_unit)) {
        return staffReply(user, state, `${parsed.ref} already has ${booking.driver_name} in ${booking.vehicle_unit} — nothing to auto-assign. If you want a different crew, tell me who.`);
      }
      const summary = `Auto-assign the best available driver and vehicle to ${parsed.ref} (${clean(booking.name)}, ${serviceWord(booking.service)}, ${fmtTime(booking.trip_time)} pickup)`;
      const proposalKey = issueProposal(user, { kind: 'auto', ref: parsed.ref, fields: {}, summary });
      await audit('BOOKING', parsed.ref, 'ASSISTANT_PROPOSED', { actor: user.id, role: user.role, kind: 'auto' }).catch(() => {});
      return staffReply(user, state, `Here's what I'd do: ${summary}. The system picks the best available driver and vehicle and runs its normal checks — nothing is saved until you confirm.`, { proposal: { token: proposalKey, kind: 'auto', ref: parsed.ref, summary } });
    }

    if (parsed.kind === 'unassign') {
      if (!clean(booking.driver_name) && !clean(booking.vehicle_unit) && !booking.driver_user_id) {
        return staffReply(user, state, `${parsed.ref} has no driver or vehicle assigned — nothing to clear.`);
      }
      const fields = {};
      if (clean(booking.driver_name) || booking.driver_user_id) fields.driverName = null;
      if (clean(booking.vehicle_unit)) fields.vehicleUnit = null;
      const summary = `Clear the assignment on ${parsed.ref} — ${clean(booking.driver_name) || 'the driver'}${clean(booking.vehicle_unit) ? ` and ${booking.vehicle_unit}` : ''} come off, and the trip goes back to unassigned`;
      const proposalKey = issueProposal(user, { kind: 'unassign', ref: parsed.ref, fields, summary });
      await audit('BOOKING', parsed.ref, 'ASSISTANT_PROPOSED', { actor: user.id, role: user.role, kind: 'unassign' }).catch(() => {});
      return staffReply(user, state, `Here's the change: ${summary}. Nothing is saved until you confirm.`, { proposal: { token: proposalKey, kind: 'unassign', ref: parsed.ref, summary, fields } });
    }

    // assign
    const fields = {};
    const summaryBits = [];
    if (parsed.driverText) {
      const matches = await resolveDriver(parsed.driverText);
      if (!matches.length) return staffReply(user, state, `I can't find "${parsed.driverText}" on the active driver roster — check the name and try me again.`);
      if (matches.length > 1) return staffReply(user, state, `A few drivers match "${parsed.driverText}": ${matches.join(', ')}. Which one did you mean?`);
      fields.driverName = matches[0];
      summaryBits.push(`driver ${matches[0]}`);
    }
    if (parsed.vehicleText) {
      fields.vehicleUnit = parsed.vehicleText.toUpperCase();
      summaryBits.push(`vehicle ${fields.vehicleUnit}`);
    }
    if (!Object.keys(fields).length) {
      return staffReply(user, state, `Tell me who should take ${parsed.ref} — a driver name, a vehicle unit, or both — and I'll set it up for your confirmation.`);
    }
    if (fields.driverName && fields.driverName === clean(booking.driver_name) && (!fields.vehicleUnit || fields.vehicleUnit === clean(booking.vehicle_unit))) {
      return staffReply(user, state, `${parsed.ref} already has ${fields.driverName}${clean(booking.vehicle_unit) ? ` in ${booking.vehicle_unit}` : ''} — no change needed.`);
    }
    const { problems, notes } = await precheckAssign(booking, fields);
    if (problems.length) {
      return staffReply(user, state, `I can't set that up for ${parsed.ref}: ${problems.join('; ')}. Nothing was proposed — adjust and ask me again.`);
    }
    const summary = `Assign ${summaryBits.join(' and ')} to ${parsed.ref} (${clean(booking.name)}, ${serviceWord(booking.service)}, ${fmtDateWords(dateStr(booking.trip_date))} ${fmtTime(booking.trip_time)} pickup)`;
    const proposalKey = issueProposal(user, { kind: 'assign', ref: parsed.ref, fields, summary });
    await audit('BOOKING', parsed.ref, 'ASSISTANT_PROPOSED', { actor: user.id, role: user.role, kind: 'assign', fields }).catch(() => {});
    return staffReply(user, state, `Here's the change: ${summary}. Pre-check passed${notes.length ? ` (note: ${notes.join('; ')})` : ''} — nothing is saved until you confirm.`, { proposal: { token: proposalKey, kind: 'assign', ref: parsed.ref, summary, fields } });
  }

  async function handleConfirm(event) {
    const user = await resolveStaffUser(event);
    if (!user) return json(401, { error: 'Your session has expired — sign in again and I\'ll pick this back up.' });
    const body = parseBody(event);
    const submittedKey = clean(body.token);
    const action = clean(body.action || 'confirm');
    const entry = submittedKey ? proposals.get(submittedKey) : null;
    if (!entry) return json(400, { error: 'That proposal has expired or was already used — ask me again and I\'ll set it up fresh.' });
    proposals.delete(submittedKey); // single-use, whatever happens next
    if (entry.userId !== user.id) return json(403, { error: 'That proposal belongs to a different signed-in user.' });
    if (entry.expires < now()) return json(400, { error: 'That proposal expired (they last about two minutes) — ask me again and I\'ll set it up fresh.' });
    if(entry.kind==='nex-review'){
      if(user.role!=='ADMIN')return json(403,{error:'Nex recommendations are administrator-only.'});
      if(action==='cancel')return json(200,{answer:'No changes made to the recommendation.',mode:'staff',staff:staffEnvelope(user,{})});
      const updated=await NexInsightReviews.setStatus(query,entry.ref,entry.fields.status,user.id);
      if(!updated)return json(409,{error:'Recommendation already finalized or not found.'});
      await audit('NEX_INSIGHT',entry.ref,'NEX_REVIEW_'+updated.status.toUpperCase(),{actor:user.id}).catch(()=>{});
      return json(200,{answer:'Recommendation #'+entry.ref+' marked '+updated.status+'. No changes were published to the Nex knowledge base.',mode:'staff',staff:staffEnvelope(user,{})});
    }
    if (!ACTION_ROLES.includes(user.role)) return json(403, { error: 'Your role can\'t make assignment changes.' });
    if (action === 'cancel') {
      await audit('BOOKING', entry.ref, 'ASSISTANT_CANCELLED', { actor: user.id, role: user.role, kind: entry.kind }).catch(() => {});
      return json(200, { answer: `No problem — I didn't change anything on ${entry.ref}.`, mode: 'staff', staff: staffEnvelope(user, {}) });
    }
    await audit('BOOKING', entry.ref, 'ASSISTANT_CONFIRMED', { actor: user.id, role: user.role, kind: entry.kind, fields: entry.fields }).catch(() => {});
    if (!invokeApi) return json(200, { answer: `I can't execute changes from this surface yet — the proposal was: ${entry.summary}.`, mode: 'staff', staff: staffEnvelope(user, {}) });
    const callerAuth = bearer(event);
    let result;
    if (entry.kind === 'auto') {
      result = await invokeApi({ httpMethod: 'POST', path: '/api/dispatch/auto-assign', headers: { authorization: `Bearer ${callerAuth}`, 'content-type': 'application/json' }, body: JSON.stringify({ bookingReference: entry.ref }), queryStringParameters: {} });
    } else {
      result = await invokeApi({ httpMethod: 'PATCH', path: '/api/admin/bookings/' + encodeURIComponent(entry.ref), headers: { authorization: `Bearer ${callerAuth}`, 'content-type': 'application/json' }, body: JSON.stringify(entry.fields), queryStringParameters: {} });
    }
    let payload = {};
    try { payload = JSON.parse(result.body || '{}'); } catch { payload = {}; }
    if (result.statusCode >= 200 && result.statusCode < 300) {
      await audit('BOOKING', entry.ref, 'ASSISTANT_EXECUTED', { actor: user.id, role: user.role, kind: entry.kind, fields: entry.fields }).catch(() => {});
      if (entry.kind === 'auto') {
        const assigned = payload.driverName || payload.booking?.driverName;
        return json(200, { answer: assigned ? `Done — ${assigned} is assigned to ${entry.ref}${payload.vehicleUnit || payload.booking?.vehicleUnit ? ` with ${payload.vehicleUnit || payload.booking.vehicleUnit}` : ''}.` : `Done — auto-assign ran for ${entry.ref}.`, mode: 'staff', staff: staffEnvelope(user, {}) });
      }
      const after = await getBookingByRef(entry.ref);
      const mapped = after ? mapBooking(after) : null;
      const who = mapped && mapped.driverName ? mapped.driverName : (after ? clean(after.driver_name) : '');
      const unit = mapped && mapped.vehicleUnit ? mapped.vehicleUnit : (after ? clean(after.vehicle_unit) : '');
      const answer = entry.kind === 'unassign'
        ? `Done — ${entry.ref} is cleared and back on the unassigned list.`
        : `Done — ${who || 'the driver'} is assigned to ${entry.ref}${unit ? ` with ${unit}` : ''}.`;
      return json(200, { answer, mode: 'staff', staff: staffEnvelope(user, {}) });
    }
    await audit('BOOKING', entry.ref, 'ASSISTANT_EXECUTION_FAILED', { actor: user.id, role: user.role, kind: entry.kind, statusCode: result.statusCode, error: clean(payload.error || '') }).catch(() => {});
    return json(200, { answer: `I couldn't complete that change — the system said: ${clean(payload.error || 'the change was rejected')}. Nothing was saved; the trip is unchanged.`, mode: 'staff', staff: staffEnvelope(user, {}) });
  }

  /* ------------------------------------------- site knowledge (how-tos)
     Curated guidance about how the Nexus site itself works — pages,
     features and workflows — grounded in the repo's pages and docs.
     Scoped by role: an entry is only ever READ to a role that can
     open that area. A guidance question about an area outside the
     caller's access gets a redirect to what their role CAN do, never
     the restricted content. */
  const SITE_KNOWLEDGE = [
    { id: 'dispatch', area: 'the Dispatch Center', roles: ['DISPATCHER', 'ADMIN', 'EXECUTIVE'], keys: ['dispatch board', 'dispatch center', 'trip board', 'the board work', 'work the board'], answer: 'The Dispatch Center (dispatch.html) is where trips are worked live — the board, assignments and driver status in one place. You can also ask me board questions right here: "what\'s unassigned?", "who\'s on duty?", or a trip reference.' },
    { id: 'add-driver', area: 'Administration', roles: ['ADMIN', 'DISPATCHER'], keys: ['add a driver', 'new driver', 'add driver', 'create a driver', 'driver account', 'onboard a driver'], answer: 'Drivers are set up in the Administration workspace (admin.html), where user accounts, roles and employee records live: a driver needs an account with the DRIVER role and an employee record — that is what puts them on the dispatch roster, gives them a recurring shift pattern, and lets trips be assigned to them.' },
    { id: 'accounts', area: 'Administration', roles: ['ADMIN'], keys: ['user accounts', 'reset a password', 'reset password', 'manage roles', 'permissions', 'role approvals', 'deactivate a user'], answer: 'User accounts, roles and access are managed in the Administration workspace (admin.html). Approved roles decide which workspaces a sign-in can open; the account menu also carries role switching for people with more than one approved role.' },
    { id: 'pricing', area: 'Administration', roles: ['ADMIN'], keys: ['pricing manager', 'fare settings', 'change the rates', 'change rates', 'set the rates', 'pricing settings'], answer: 'Fares are set in the Pricing Manager in the Administration workspace (admin.html) — service base rates, per-mile rates, wait time and surcharges live there, and every estimate and booked price is calculated from those settings.' },
    { id: 'fleet', area: 'Fleet Management', roles: ['DISPATCHER', 'ADMIN', 'EXECUTIVE'], keys: ['fleet management', 'vehicle list', 'add a vehicle', 'vehicle status page', 'fleet page'], answer: 'Fleet Management (fleet.html) is the vehicle list — units, types and status. Live positions are on LiveCare (livecare.html) and in the Dispatch Center, and you can ask me "where are the vehicles?" right here.' },
    { id: 'livecare', area: 'LiveCare', roles: 'ALL', keys: ['livecare', 'live tracking', 'tracking map', 'track my ride', 'live map'], answer: 'LiveCare (livecare.html) is the live tracking map. Dispatch sees the whole fleet and every active trip; patients and caretakers see their own ride and driver once the trip is under way.' },
    { id: 'billing', area: 'Billing', roles: ['BILLING', 'ADMIN', 'EXECUTIVE'], keys: ['billing page', 'revenue cycle', 'invoices', 'billing workspace', 'where are invoices'], answer: 'Revenue Cycle & Billing (billing.html) is where invoices, payments and balances live for the operation.' },
    { id: 'facility-reports', area: 'the facility Reporting tab', roles: ['FACILITY'], keys: ['reports', 'reporting', 'report tab', 'summary of our trips', 'destination summary'], answer: 'Your Reporting tab is right in this portal, next to the Trip board. For the timeframe you pick it totals your facility\'s trips — completed vs upcoming, service mix, top destination cities and average booking lead time. It shows totals only, and only for your facility.' },
    { id: 'facility-portal', area: 'the facility portal', roles: ['FACILITY'], keys: ['facility portal', 'this portal', 'message dispatch', 'portal work'], answer: 'This portal is your window into your facility\'s trips: the Trip board follows the timeframe you select, the Reporting tab totals them up, and each trip has a conversation where you can message dispatch. You can also just ask me "how many trips today?" here.' },
    { id: 'driver-app', area: 'the Driver app', roles: ['DRIVER'], keys: ['driver app', 'driveflex', 'claim a shift', 'my assignments page'], answer: 'The Driver app (driver-app.html) is your home base — today\'s assignments with trip details, and DriveFlex for posted open shifts. You can also ask me "what are my trips today?" or "any open shifts?" right here.' },
    { id: 'patient-app', area: 'the Patient app', roles: ['PATIENT', 'CARETAKER'], keys: ['patient app', 'my rides page', 'where are my rides'], answer: 'The Patient app (patient.html) holds your rides, and LiveCare shows your driver live once a trip starts. You can also just ask me "when is my next ride?" here.' },
    { id: 'booking', area: 'Booking', roles: 'ALL', keys: ['book a ride', 'book a trip', 'how do i book', 'booking app', 'make a booking', 'book a transport'], answer: 'Rides are booked in the booking app (mynexusride.com, also linked as Book a Ride across the site) — pickup, drop-off, ride type and date, with multi-date booking for repeat appointments. Facilities book through their portal, and patients can book from the Patient app too.' },
    { id: 'enterprise', area: 'the Enterprise Directory', roles: ['ADMIN'], keys: ['enterprise directory', 'enterprise actors', 'actor directory', 'the directory'], answer: 'The Enterprise Directory (enterprise.html) is the shared directory of the people, facilities and organizations Nexus works with — the Actor records behind accounts and relationships. Admins can deactivate or remove entries there when the safety checks allow it.' },
    { id: 'keymark', area: 'KeyMark', roles: ['ADMIN', 'EXECUTIVE'], keys: ['keymark', 'epic connection', 'fhir', 'appointment feed', 'outreach queue'], answer: 'KeyMark (keymark.html) is the appointment-to-arrival integration — Epic/FHIR connections, the sync status, the outreach queue and arrival-risk scoring that turn appointments into booked rides.' },
    { id: 'training', area: 'Nexus Academy', roles: ['ADMIN', 'DISPATCHER', 'DRIVER', 'BILLING', 'QA', 'EXECUTIVE', 'STAFF'], keys: ['training', 'policies', 'nexus academy', 'courses'], answer: 'Nexus Academy (training.html) holds policies and training — it is in every staff account menu under "Policies & training".' },
    { id: 'qa', area: 'the QA workspace', roles: ['QA', 'ADMIN'], keys: ['qa workspace', 'quality review', 'qa page'], answer: 'The QA workspace (qa.html) is the quality review area for the operation.' },
    { id: 'executive', area: 'the Executive workspace', roles: ['EXECUTIVE', 'ADMIN'], keys: ['executive workspace', 'executive dashboard', 'big picture', 'company overview'], answer: 'The Executive workspace (executive.html) is the high-level view — volumes, revenue and performance across the operation.' },
  ];

  function rolePointer(role) {
    if (role === 'DRIVER') return 'your own trips, schedule and open shifts — try "what are my trips today?"';
    if (role === 'FACILITY') return 'your facility\'s trips and reports — try "how many trips today?"';
    if (role === 'PATIENT' || role === 'CARETAKER') return 'your own rides — try "when is my next ride?"';
    if (ACTION_ROLES.includes(role) || role === 'EXECUTIVE') return 'the board, duty roster and trips — try "what\'s unassigned?"';
    return 'the public site knowledge — services, areas, hours and booking';
  }

  function siteKnowledgeAnswer(user, state, text) {
    const t = ` ${text.toLowerCase()} `;
    const guidance = /^(how|where|what|can i|can we|is there|do we have|does)\b/i.test(text) || (text.includes('?') && text.length < 140);
    if (!guidance) return null;
    let best = null;
    for (const entry of SITE_KNOWLEDGE) {
      for (const key of entry.keys) {
        if (t.includes(key) && (!best || key.length > best.key.length)) best = { entry, key };
      }
    }
    if (!best) return null;
    const { entry } = best;
    const allowed = entry.roles === 'ALL' || entry.roles.includes(user.role);
    state.intent = 'knowledge';
    if (!allowed) {
      return staffReply(user, state, `That lives in ${entry.area} — that's not part of your ${ROLE_LABELS[user.role] || user.role} access, so I can't walk you through it. What I can pull up for you here is ${rolePointer(user.role)}.`);
    }
    return staffReply(user, state, entry.answer);
  }

  /* ------------------------------------------------------ role answers */

  function parseActionIntent(text) {
    const refMatch = text.match(REF_RE);
    if (!refMatch) return null;
    const ref = refMatch[1].toUpperCase();
    if (/\b(unassign|remove|clear|take off|pull off)\b/i.test(text)) return { kind: 'unassign', ref };
    if (/\bauto[-\s]?assign\b/i.test(text)) return { kind: 'auto', ref };
    if (/\bassign\b/i.test(text)) {
      const rest = text.replace(refMatch[0], ' ');
      const vehicleMatch = rest.match(/\b([A-Z]{2,3}-\d{3}-\d{2})\b/i);
      let driverText = rest
        .replace(/\bassign\b/i, ' ')
        .replace(vehicleMatch ? vehicleMatch[0] : '', ' ')
        .replace(/\b(to|with|in|on|the|a|an|driver|vehicle|please)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { kind: 'assign', ref, driverText: driverText || null, vehicleText: vehicleMatch ? vehicleMatch[1] : null };
    }
    return null;
  }

  function parseDateShift(text, state, today) {
    if (/\btomorrow\b/i.test(text)) return addDays(today, 1);
    if (/\byesterday\b/i.test(text)) return addDays(today, -1);
    if (/\btoday\b/i.test(text)) return today;
    return state.date || today;
  }

  function parseServiceFilter(text) {
    if (/\bwheelchair\b/i.test(text)) return 'wheelchair';
    if (/\bambulatory\b/i.test(text)) return 'ambulatory';
    if (/\bstretcher\b/i.test(text)) return 'stretcher';
    if (/\bbariatric\b/i.test(text)) return 'bariatric';
    if (/\b(ambulance|bls|als)\b/i.test(text)) return 'bls';
    return null;
  }

  async function dispatchAnswer(user, state, text, today) {
    const action = parseActionIntent(text);
    if (action) { state.pendingAssignRef = action.ref; state.intent = 'trip'; state.ref = action.ref; return proposeAction(user, state, action, today); }
    if (state.pendingAssignRef && /^(yes|yeah|yep|do it|go ahead|confirm)/i.test(text)) {
      return staffReply(user, state, `Almost — use the Confirm button on the proposal card for ${state.pendingAssignRef} so the change is recorded exactly. If the card scrolled away, ask me to set it up again.`);
    }

    const refMatch = text.match(REF_RE);
    const dateOnly = /^(and |what about )?(tomorrow|today|yesterday)\??$/i.test(text.trim());
    const serviceOnly = /^(and |what about )?(the )?(wheelchair|ambulatory|stretcher|bariatric|ambulance) (ones|trips)\??$/i.test(text.trim());

    if (/\b(weather|forecast|rain|snow|storm)\b/i.test(text)) {
      state.intent = 'weather';
      let target = YARD;
      if (refMatch) {
        const booking = await getBookingByRef(refMatch[1].toUpperCase());
        const coord = booking ? (coordFor(booking, 'pickup') || coordFor(booking, 'destination')) : null;
        if (coord) target = coord;
      } else {
        for (const key of Object.keys(CITY_COORDS)) {
          if (text.toLowerCase().includes(key.replace(/_/g, ' '))) { target = { name: key.replace(/_/g, ' '), lat: CITY_COORDS[key][0], lng: CITY_COORDS[key][1] }; break; }
        }
      }
      const wx = await weatherFor(target.lat, target.lng);
      return staffReply(user, state, target.name && target !== YARD ? `For ${target.name}: ${wx}` : wx);
    }

    if (/\b(traffic|congestion|delays?|how long.*(drive|run|trip))\b/i.test(text) && refMatch) {
      state.intent = 'traffic';
      const booking = await getBookingByRef(refMatch[1].toUpperCase());
      if (!booking) return staffReply(user, state, `I can't find a trip with reference ${refMatch[1].toUpperCase()}.`);
      return staffReply(user, state, trafficSentence(booking));
    }

    if (/\b(on duty|who'?s working|duty roster|drivers? (on|working|today))\b/i.test(text) || (dateOnly && state.intent === 'duty')) {
      state.intent = 'duty';
      state.date = parseDateShift(text, state, today);
      const roster = await dutyRoster(state.date);
      return staffReply(user, state, dutyReply(roster, state.date, today));
    }

    const driverDay = text.match(/\bwhat(?:'s| is| does)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:have|doing|got)\b/i) || text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s trips\b/i);
    if (driverDay) {
      const roster = await dutyRoster(today);
      const person = roster.find((d) => d.name.toLowerCase().includes(driverDay[1].toLowerCase()) || driverDay[1].toLowerCase().includes(d.name.toLowerCase()));
      if (person) {
        state.intent = 'duty';
        const statusText = person.status === 'ON_TRIP' ? 'on a trip right now' : person.status === 'ON_DUTY' ? 'on duty' : 'off duty today';
        return staffReply(user, state, `${person.name} is ${statusText} — ${person.trips} trip${person.trips === 1 ? '' : 's'} today${person.shift ? `, shift ${fmtTime(person.shift.start_time)}–${fmtTime(person.shift.end_time)}` : ''}${person.vehicle ? `, in ${person.vehicle}` : ''}.`);
      }
    }

    if (refMatch || (state.ref && /\b(that|it|this) (trip|one)\b/i.test(text))) {
      state.intent = 'trip';
      const ref = (refMatch ? refMatch[1] : state.ref).toUpperCase();
      state.ref = ref;
      const booking = await getBookingByRef(ref);
      if (!booking) return staffReply(user, state, `I can't find a trip with reference ${ref} — check it and try me again.`);
      const traffic = /\btraffic\b/i.test(text) ? ` ${trafficSentence(booking)}` : '';
      return staffReply(user, state, `${tripLine(booking)} Pickup is ${clean(booking.pickup) || 'not set'}; drop-off ${clean(booking.destination) || 'not set'}.${traffic}`);
    }

    const nameSearch = text.match(/(?:trip|ride|booking) for ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) || text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s (?:trip|ride)/i);
    if (nameSearch) {
      const found = await searchTripsByName(nameSearch[1]);
      if (!found.length) return staffReply(user, state, `I don't see a trip for ${nameSearch[1]} on the board.`);
      state.intent = 'trip';
      state.ref = found[0].reference;
      return staffReply(user, state, found.map((b) => `${tripLine(b)} (${fmtDateWords(dateStr(b.trip_date))})`).join(' '));
    }

    if (/\b(fleet|vehicles?|units?|gps|where is (the )?(van|bus|ambulance|unit))\b/i.test(text)) {
      state.intent = 'fleet';
      const r = await query(
        `SELECT v.unit_number, v.vehicle_type, v.status, g.latitude, g.longitude, g.recorded_at
           FROM vehicles v
           LEFT JOIN LATERAL (SELECT latitude, longitude, recorded_at FROM gps_positions WHERE vehicle_unit = v.unit_number ORDER BY recorded_at DESC LIMIT 1) g ON true
          ORDER BY v.unit_number LIMIT 25`
      );
      return staffReply(user, state, fleetReply(r.rows));
    }

    if (/\bunassigned\b/i.test(text) || (dateOnly && state.intent === 'unassigned') || (serviceOnly && state.intent === 'unassigned')) {
      state.intent = 'unassigned';
      state.date = parseDateShift(text, state, today);
      const filter = parseServiceFilter(text) || (serviceOnly ? state.serviceFilter : null);
      if (filter) state.serviceFilter = filter;
      const board = await boardForDate(state.date);
      const list = state.serviceFilter ? board.unassigned.filter((t) => serviceMatches(t, state.serviceFilter)) : board.unassigned;
      if (!list.length) return staffReply(user, state, `Nothing is unassigned for ${dayLabel(state.date, today)}${state.serviceFilter ? ` on ${serviceWord(state.serviceFilter)} trips` : ''} — every trip has a driver and a vehicle.`);
      return staffReply(user, state, `${list.length} trip${list.length === 1 ? '' : 's'} still need${list.length === 1 ? 's' : ''} a driver or vehicle for ${dayLabel(state.date, today)}: ${list.slice(0, 5).map((t) => tripLine(t)).join(' ')}${list.length > 5 ? ` …and ${list.length - 5} more.` : ''} Tell me who should take one and I'll set it up.`);
    }

    // Board / counts — the default dispatch question, plus follow-ups.
    state.intent = 'board';
    state.date = parseDateShift(text, state, today);
    const filter = parseServiceFilter(text);
    if (filter) state.serviceFilter = filter;
    else if (!serviceOnly) state.serviceFilter = state.serviceFilter && /\b(all|everything|whole board|full board)\b/i.test(text) ? undefined : state.serviceFilter;
    const board = await boardForDate(state.date);
    return staffReply(user, state, boardReply(board, state.date, today, state.serviceFilter));
  }

  async function driverAnswer(user, state, text, today) {
    const refMatch = text.match(REF_RE);
    if (/\bopen shifts?\b/i.test(text)) {
      state.intent = 'shifts';
      const open = await driverOpenShifts();
      if (!open.length) return staffReply(user, state, `There are no open shifts posted right now — I'll see them here as soon as dispatch posts one.`);
      const lines = open.map((s) => {
        const et = easternDateTime(new Date(s.start_at).getTime());
        return `${fmtDateWords(et.date)} at ${fmtTime(et.time)}${s.operating_area ? ` — ${s.operating_area}` : ''}${s.service_level ? ` (${s.service_level})` : ''}${s.vehicle_unit ? `, ${s.vehicle_unit}` : ''}`;
      });
      return staffReply(user, state, `There ${open.length === 1 ? 'is 1 open shift' : `are ${open.length} open shifts`} posted: ${lines.join('; ')}. Claiming happens in DriveFlex — I can't claim one for you from chat yet.`);
    }
    if (/\b(my )?(schedule|shifts?|hours)\b/i.test(text) && !refMatch) {
      state.intent = 'mine';
      const rows = await driverScheduleRows(user);
      if (!rows.length) return staffReply(user, state, `I don't see a regular shift pattern on file for you — dispatch can confirm your schedule.`);
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const lines = rows.map((s) => `${dayNames[Number(s.weekday_iso) - 1] || ''} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`);
      return staffReply(user, state, `Your regular pattern is: ${lines.join('; ')}.`);
    }
    if (/\b(traffic)\b/i.test(text) && refMatch) {
      const booking = await getBookingByRef(refMatch[1].toUpperCase());
      if (!booking) return staffReply(user, state, `I can't find a trip with reference ${refMatch[1].toUpperCase()}.`);
      const mine = await tripsForDriver(user, dateStr(booking.trip_date), dateStr(booking.trip_date));
      if (!mine.some((t) => t.reference === booking.reference)) return staffReply(user, state, `${booking.reference} isn't on your schedule, so I can't pull its route up.`);
      return staffReply(user, state, trafficSentence(booking));
    }
    if (refMatch) {
      state.intent = 'trip';
      const booking = await getBookingByRef(refMatch[1].toUpperCase());
      if (!booking) return staffReply(user, state, `I can't find a trip with reference ${refMatch[1].toUpperCase()}.`);
      const mine = await tripsForDriver(user, dateStr(booking.trip_date), dateStr(booking.trip_date));
      if (!mine.some((t) => t.reference === booking.reference)) {
        return staffReply(user, state, `${booking.reference} isn't on your schedule — I can only pull up your own trips.`);
      }
      state.ref = booking.reference;
      return staffReply(user, state, `${tripLine(booking, false)} Pickup: ${clean(booking.pickup) || 'not set'}. Drop-off: ${clean(booking.destination) || 'not set'}.`);
    }
    // Default: the driver's own day.
    state.intent = 'mine';
    const date = parseDateShift(text, state, today);
    state.date = date;
    const trips = await tripsForDriver(user, date, date);
    if (!trips.length) return staffReply(user, state, `You have no trips on your schedule for ${dayLabel(date, today)} — enjoy the quiet, or ask me about open shifts.`);
    return staffReply(user, state, `You have ${trips.length} trip${trips.length === 1 ? '' : 's'} ${dayLabel(date, today)}: ${trips.map((t) => tripLine(t, false)).join(' ')}`);
  }

  async function facilityAnswer(user, state, text, today) {
    const scopeId = clean(user.scope_id || '');
    if (!scopeId) return staffReply(user, state, `Your facility account isn't linked to a facility yet, so I can't pull your trips — dispatch can fix the link.`);
    const refMatch = text.match(REF_RE);
    if (refMatch) {
      const booking = await getBookingByRef(refMatch[1].toUpperCase());
      if (!booking) return staffReply(user, state, `I can't find a trip with reference ${refMatch[1].toUpperCase()}.`);
      if (clean(booking.facility_id) !== scopeId) return staffReply(user, state, `${refMatch[1].toUpperCase()} isn't one of your facility's trips, so I can't open it here.`);
      state.intent = 'trip';
      state.ref = booking.reference;
      return staffReply(user, state, tripLine(booking));
    }
    if (/\bthis month\b/i.test(text)) {
      const counts = await facilityMonthCounts(scopeId, `${today.slice(0, 7)}-01`);
      return staffReply(user, state, `Your facility has ${counts.total} trips with us this month${counts.nodriver ? `, and ${counts.nodriver} still need a driver` : ' — all with drivers assigned'}.`);
    }
    state.intent = 'board';
    const date = parseDateShift(text, state, today);
    state.date = date;
    const trips = await facilityTrips(scopeId, date);
    const noDriver = trips.filter((t) => !clean(t.driver_name) && !t.driver_user_id && !TERMINAL.has(String(t.status || '').toUpperCase().replace(/-/g, '_')));
    if (/\bwithout a driver|no driver|unassigned\b/i.test(text)) {
      if (!noDriver.length) return staffReply(user, state, `Every one of your trips for ${dayLabel(date, today)} has a driver assigned.`);
      return staffReply(user, state, `${noDriver.length} of your trips for ${dayLabel(date, today)} still need a driver: ${noDriver.map((t) => tripLine(t, false)).join(' ')}`);
    }
    if (!trips.length) return staffReply(user, state, `You have no trips with us for ${dayLabel(date, today)}.`);
    return staffReply(user, state, `${trips.length} trip${trips.length === 1 ? '' : 's'} on the board for ${dayLabel(date, today)}: ${trips.map((t) => tripLine(t)).join(' ')}`);
  }

  async function patientAnswer(user, state, text, today) {
    const refMatch = text.match(REF_RE);
    const trips = await patientTrips(user);
    if (/\b(where|driver|eta|arriv|track|location)\b/i.test(text)) {
      const active = trips.find((t) => ACTIVE_STATUSES.includes(String(t.status || '').toUpperCase().replace(/-/g, '_')));
      const target = active || trips[0];
      if (!target) return staffReply(user, state, `You don't have a ride under way right now, so there's no driver to locate.`);
      if (!active) return staffReply(user, state, `Your ride ${target.reference} hasn't started yet — it's ${statusWord(target.status)} for ${fmtDateWords(dateStr(target.trip_date))} at ${fmtTime(target.trip_time)}. Live driver location appears here once the trip is under way, and LiveCare tracking shows it on the map.`);
      if (!clean(target.vehicle_unit)) return staffReply(user, state, `Your trip ${target.reference} is ${statusWord(target.status)}, but I don't have its vehicle yet — dispatch can confirm at (888) 639-5766.`);
      const gps = await query('SELECT latitude, longitude, recorded_at FROM gps_positions WHERE vehicle_unit = $1 ORDER BY recorded_at DESC LIMIT 1', [target.vehicle_unit]);
      const pos = gps.rows[0];
      if (!pos) return staffReply(user, state, `Your trip ${target.reference} is ${statusWord(target.status)} with ${clean(target.driver_name) || 'your driver'} in ${target.vehicle_unit}, but the vehicle hasn't reported a GPS position yet.`);
      const dest = coordFor(target, 'destination');
      const distance = dest ? haversineKm(Number(pos.latitude), Number(pos.longitude), dest.lat, dest.lng) : null;
      const miles = distance != null ? (distance * 0.621371).toFixed(1) : null;
      return staffReply(user, state, `${clean(target.driver_name) || 'Your driver'} is on the way in ${target.vehicle_unit} — last position ${relWhen(pos.recorded_at, now())}${miles ? `, about ${miles} miles from the drop-off area` : ''}. LiveCare tracking shows the live map.`);
    }
    if (refMatch) {
      const found = trips.find((t) => t.reference === refMatch[1].toUpperCase());
      if (!found) return staffReply(user, state, `That reference isn't on your account — I can only look up your own rides.`);
      state.ref = found.reference;
      return staffReply(user, state, tripLine(found));
    }
    if (!trips.length) return staffReply(user, state, `You don't have any rides coming up with us right now. When you book, your trips and driver details will show up here.`);
    return staffReply(user, state, `Your upcoming rides: ${trips.slice(0, 4).map((t) => `${t.reference} — ${fmtDateWords(dateStr(t.trip_date))} at ${fmtTime(t.trip_time)}, ${cityOf(t.pickup) || 'pickup'} to ${cityOf(t.destination) || 'drop-off'}, ${statusWord(t.status)}${clean(t.driver_name) ? `, driver ${t.driver_name}` : ''}`).join('. ')}.`);
  }

  /* ------------------------------------------------------------ handler */

  async function handlePublicFallback(event, user, body) {
    const res = await publicAsk({
      httpMethod: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: body.question || '', state: body.state || null, history: Array.isArray(body.history) ? body.history : [] }),
    });
    let parsed = null;
    try { parsed = JSON.parse(res.body); } catch { parsed = null; }
    if (!parsed || !parsed.answer) {
      return json(200, { answer: 'I can help with questions about Nexus services, areas, hours and booking. For anything else, call us at (888) 639-5766.', mode: 'fallback' });
    }
    if (user && parsed.mode !== 'emergency') {
      // A signed-in user whose role has no staff surface in this phase
      // (billing, QA, staff) still gets the public knowledge answer,
      // with their staff envelope attached.
      const clearlyStaff = /\b(board|unassigned|on duty|roster|assign|my trips|my schedule)\b/i.test(String(body.question || ''));
      if (clearlyStaff) {
        return json(200, {
          answer: `You're signed in as ${ROLE_LABELS[user.role] || user.role} — my ${ROLE_LABELS[user.role] || user.role} tools aren't part of this first rollout, so I can't pull live operations data for your role yet. Dispatch and Admin have the full board view if you need it now.`,
          mode: 'staff', staff: staffEnvelope(user, {}),
        });
      }
      parsed.staff = staffEnvelope(user, {});
      if (!parsed.mode) parsed.mode = 'staff';
    }
    return json(res.statusCode || 200, parsed);
  }

  async function handler(event, parts, method) {
    const sub = clean(parts && parts[1]).toLowerCase();
    if (String(method || event.httpMethod || 'POST').toUpperCase() !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }
    if (sub === 'confirm') return handleConfirm(event);

    const body = parseBody(event);
    const user = await resolveStaffUser(event);

    if (!user) {
      if (rateLimited(`pub:${clientIp(event)}`, 40, 60000)) {
        return json(429, { error: 'Too many questions in a row — give me a moment and try again.' });
      }
      return handlePublicFallback(event, null, body);
    }

    if (rateLimited(`user:${user.id}`, 40, 60000)) {
      return json(429, { error: 'Too many questions in a row — give me a moment and try again.' });
    }

    const role = user.role;
    const staffRole = ACTION_ROLES.includes(role) || ['DRIVER', 'FACILITY', 'PATIENT', 'CARETAKER', 'EXECUTIVE'].includes(role);
    if (!staffRole) return handlePublicFallback(event, user, body);

    const { date: today } = easternDateTime(now());
    const state = sanitizeStaffState(body.staffState);
    const question = clean(body.question || '');

    if (body.greeting === true || !question) {
      const opener = await roleOpener(user, today);
      return json(200, {
        greeting: opener.greeting, answer: opener.greeting, mode: 'staff',
        staff: staffEnvelope(user, state), chips: opener.chips,
      });
    }

    await audit('USER', user.id, 'ASSISTANT_ASK', { role, scope: clean(user.scope_id || ''), intent: state.intent || null }).catch(() => {});

    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b[^?]*$/i.test(question) && question.length < 40) {
      const opener = await roleOpener(user, today);
      return json(200, { answer: opener.greeting, mode: 'staff', staff: staffEnvelope(user, state), chips: opener.chips });
    }

    const reviewAction=question.match(/\b(?:mark|set|flag)\s+(?:Nex\s+)?(?:recommendation|suggestion|review)\s*#?(\d{1,15})\s+(?:as\s+)?(reviewed|dismissed)\b/i);
    const reviewQuery=/\b(?:Nex\s+)?(?:recommendation|suggestion|review)\s*(?:queue|list|items?|pending)\b|\b(?:pending|saved)\s+(?:Nex\s+)?(?:recommendations|suggestions)\b/i.test(question);
    if(reviewAction||reviewQuery){
      if(user.role!=='ADMIN')return staffReply(user,state,'Nex recommendation reviews are restricted to administrators.');
      try{
        if(reviewAction){
          const item=await NexInsightReviews.get(query,reviewAction[1]);
          if(!item)return staffReply(user,state,'That Nex recommendation was not found.');
          if(item.status!=='pending')return staffReply(user,state,'Recommendation #'+item.id+' is already '+item.status+'.');
          const status=reviewAction[2].toLowerCase();
          const summary='Mark Nex recommendation #'+item.id+' '+status+' (review only; this will NOT publish any website knowledge)';
          const token=issueProposal(user,{kind:'nex-review',ref:String(item.id),fields:{status},summary});
          return staffReply(user,state,summary+'. Use the Confirm button to finish.',{proposal:{token,kind:'nex-review',ref:String(item.id),summary}});
        }
        const items=await NexInsightReviews.list(query,10);
        const pending=items.filter(x=>x.status==='pending');
        return staffReply(user,state,pending.length?
          'Pending Nex recommendations: '+pending.map(x=>'#'+x.id+' ('+x.period_days+'-day report)').join(', ')+'. Ask me to mark a specific recommendation reviewed or dismissed; I will ask for confirmation.':
          'No pending Nex recommendations among the latest saved items. Open Nex Insights in Admin Apps to generate or review drafts.');
      }catch{
        return staffReply(user,state,'The Nex review queue is unavailable. Verify that the review database migration has deployed.');
      }
    }

    // Existing authenticated staff-chat session controls access; no request-body role is trusted.
    // Nex analytics is strictly read-only and available only to real ADMIN sessions.
    if (NexInsightsChat.isInsightsQuery(question)) {
      try {
        const insightAnswer = await NexInsightsChat.answer(user, question, query);
        if (insightAnswer) return staffReply(user, state, insightAnswer);
      } catch {
        return staffReply(user, state, 'Nex analytics are temporarily unavailable. Check the authenticated Nex Insights dashboard or ask an administrator to review the deployment.');
      }
    }

    // All signed-in roles inherit visitor knowledge; protected staff requests
    // continue through authenticated role- and scope-checked handlers.
    if (isPublicIntent(question, state)) return handlePublicFallback(event, user, body);

    const knowledge = siteKnowledgeAnswer(user, state, question);
    if (knowledge) return knowledge;

    try {
      if (ACTION_ROLES.includes(role) || role === 'EXECUTIVE') {
        if (role === 'EXECUTIVE' && parseActionIntent(question)) {
          return staffReply(user, state, `I can show you the board, but assignment changes run through Dispatch or Admin — I don't execute them from an Executive session.`);
        }
        return await dispatchAnswer(user, state, question, today);
      }
      if (role === 'DRIVER') return await driverAnswer(user, state, question, today);
      if (role === 'FACILITY') return await facilityAnswer(user, state, question, today);
      return await patientAnswer(user, state, question, today);
    } catch (err) {
      if (err && err.statusCode) throw err;
      // A data question that fails still deserves the public answer
      // rather than an error wall — unless it was clearly an action.
      if (parseActionIntent(question)) throw err;
      return handlePublicFallback(event, user, body);
    }
  }

  return handler;
}

module.exports = { createHandler };
