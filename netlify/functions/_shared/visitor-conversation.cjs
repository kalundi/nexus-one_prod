'use strict';
/*
 * Nexus Medical Transit — visitor conversation state + follow-ups (Nex).
 *
 * The smart-Nex conversation layer, deterministic half. The widget
 * keeps the conversation in page memory only and sends it with each
 * chat message:
 *
 *   state:   { lastEstimate: { inputs, result } | null }
 *   history: [{ role: 'user' | 'assistant', text }]  (recent turns)
 *
 * inputs are the exact fields the visitor-estimate service priced:
 * the addresses as entered AND as resolved, the measured road miles,
 * service, trip type, and pickup date/time. result is the estimate
 * object the service returned (displayTotal, service label, ...).
 *
 * Privacy: state and history are per-request only. Nothing here (or
 * in the callers) persists, logs, or writes them anywhere — the same
 * rule the estimate flow has always kept for addresses.
 *
 * This module is the trust boundary for that client-supplied state:
 * every field is type-, format-, and range-checked, and anything
 * unusable is dropped rather than trusted. detectFollowUp() then
 * reads a visitor's message against the stored trip and recognizes
 * one-change follow-ups — a different ride type, a one-way/round-trip
 * flip, a new date or time, a changed address, a fresh start — so the
 * assistant can re-price the SAME trip instead of restarting the
 * estimate wizard. Detection is deliberately conservative: knowledge
 * questions ("Do you offer stretcher transport?", "Are you open on
 * Saturday?") must fall through to the knowledge base untouched.
 */

const SERVICE_KEYS = ['ambulatory', 'wheelchair', 'stretcher', 'bariatric', 'bls'];
const MAX_STATE_TEXT = 300;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_TEXT = 500;
const MAX_TRIP_MILES = 3000;

// ---------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanNumber(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function validDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validTimeString(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  return !!match && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function sanitizeInputs(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pickup = cleanText(raw.pickup, MAX_STATE_TEXT);
  const dropoff = cleanText(raw.dropoff, MAX_STATE_TEXT);
  const service = SERVICE_KEYS.includes(raw.service) ? raw.service : null;
  const tripType = raw.tripType === 'ROUND_TRIP' ? 'ROUND_TRIP' : raw.tripType === 'ONE_WAY' ? 'ONE_WAY' : null;
  const date = validDateString(raw.date) ? raw.date : null;
  const time = validTimeString(raw.time) ? raw.time : null;
  const loadedMiles = cleanNumber(raw.loadedMiles, 0.1, MAX_TRIP_MILES);
  if (!pickup || !dropoff || !service || !tripType || !date || !time || loadedMiles == null) return null;
  const inputs = {
    pickup,
    dropoff,
    pickupResolved: cleanText(raw.pickupResolved, MAX_STATE_TEXT) || pickup,
    dropoffResolved: cleanText(raw.dropoffResolved, MAX_STATE_TEXT) || dropoff,
    service,
    tripType,
    date,
    time,
    loadedMiles,
    durationMinutes: cleanNumber(raw.durationMinutes, 0, 10000) || 0
  };
  const returnMiles = cleanNumber(raw.returnMiles, 0.1, MAX_TRIP_MILES);
  if (returnMiles != null) inputs.returnMiles = returnMiles;
  for (const key of ['pickupState', 'dropoffState']) {
    const state = typeof raw[key] === 'string' ? raw[key].trim().toUpperCase() : '';
    if (/^[A-Z]{2}$/.test(state)) inputs[key] = state;
  }
  for (const [key, min, max] of [['pickupLat', -90, 90], ['dropoffLat', -90, 90], ['pickupLng', -180, 180], ['dropoffLng', -180, 180]]) {
    const n = cleanNumber(raw[key], min, max);
    if (n != null) inputs[key] = n;
  }
  return inputs;
}

function sanitizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const displayTotal = cleanNumber(raw.displayTotal, 0, 1000000);
  if (displayTotal == null) return null;
  const result = {
    displayTotal,
    total: cleanNumber(raw.total, 0, 1000000) ?? displayTotal,
    service: SERVICE_KEYS.includes(raw.service) ? raw.service : null,
    serviceLabel: cleanText(raw.serviceLabel, 60) || null,
    tripType: raw.tripType === 'ROUND_TRIP' ? 'ROUND_TRIP' : 'ONE_WAY',
    loadedMiles: cleanNumber(raw.loadedMiles, 0, MAX_TRIP_MILES * 2) ?? null,
    deadheadMiles: cleanNumber(raw.deadheadMiles, 0, MAX_TRIP_MILES) ?? 0,
    premiumReason: typeof raw.premiumReason === 'string' ? raw.premiumReason.slice(0, 40) : null,
    premiumPct: cleanNumber(raw.premiumPct, 0, 500) ?? 0,
    shortNotice: raw.shortNotice === true
  };
  return result;
}

function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') return { lastEstimate: null };
  const last = raw.lastEstimate && typeof raw.lastEstimate === 'object' ? raw.lastEstimate : null;
  if (!last) return { lastEstimate: null };
  const inputs = sanitizeInputs(last.inputs);
  const result = sanitizeResult(last.result);
  if (!inputs || !result) return { lastEstimate: null };
  return { lastEstimate: { inputs, result } };
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const turns = [];
  for (const turn of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!turn || typeof turn !== 'object') continue;
    const role = turn.role === 'assistant' ? 'assistant' : turn.role === 'user' ? 'user' : null;
    const text = cleanText(turn.text, MAX_HISTORY_TEXT);
    if (role && text) turns.push({ role, text });
  }
  return turns;
}

// The $ figures a model answer may state: exactly the totals the
// estimate service returned in this conversation (stored result plus
// any fresh tool results). Everything else stays forbidden.
function allowedFigures(state, extraResults = []) {
  const amounts = new Set();
  const pcts = new Set();
  const collect = (result) => {
    if (!result) return;
    if (Number.isFinite(result.displayTotal)) amounts.add(result.displayTotal);
    if (Number.isFinite(result.total)) amounts.add(Math.round(result.total * 100) / 100);
    if (Number.isFinite(result.premiumPct) && result.premiumPct > 0) pcts.add(result.premiumPct);
  };
  if (state && state.lastEstimate) collect(state.lastEstimate.result);
  for (const r of extraResults) collect(r);
  return { amounts, pcts };
}

// ---------------------------------------------------------------------
// Pickup date/time parsing (visitor phrasing, America/New_York).
// Mirrors the widget's flow parser: weekday names land on their next
// occurrence, month names and M/D dates on the next future date.
// ---------------------------------------------------------------------

function pad2(n) { return String(n).padStart(2, '0'); }

function etToday(nowMs) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(new Date(nowMs));
  const get = (type) => parts.find((p) => p.type === type).value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return { date: get('year') + '-' + get('month') + '-' + get('day'), dow };
}

function ymd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y + '-' + pad2(m) + '-' + pad2(d);
}

function addDays(dateStr, days) {
  const p = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
}

function extractTime(t) {
  let m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) { let h = Number(m[1]) % 12; if (m[3] === 'pm') h += 12; return pad2(h) + ':' + pad2(Number(m[2] || 0)); }
  m = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return pad2(Number(m[1])) + ':' + pad2(Number(m[2]));
  if (/\bnoon\b/.test(t)) return '12:00';
  if (/\bmidnight\b/.test(t)) return '00:00';
  return null;
}

const MONTH_NAMES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const WEEKDAY_NAMES = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

// Returns { date?, time? } for the date/time phrases in the text, or
// null when the text carries neither. Past explicit dates are dropped
// (a follow-up can only move a trip forward).
function parseDateTimeChange(text, nowMs) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const today = etToday(nowMs);
  const time = extractTime(t);
  let date = null;
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) date = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  if (!date) {
    m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.date.slice(0, 4));
      date = ymd(year, Number(m[1]), Number(m[2]));
      if (date && !m[3] && date < today.date) date = ymd(year + 1, Number(m[1]), Number(m[2]));
    }
  }
  if (!date) {
    m = t.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
    if (m) {
      const month = MONTH_NAMES[m[1]];
      const yr = m[3] ? Number(m[3]) : Number(today.date.slice(0, 4));
      date = ymd(yr, month, Number(m[2]));
      if (date && !m[3] && date < today.date) date = ymd(yr + 1, month, Number(m[2]));
    }
  }
  if (!date) {
    if (/\btoday\b/.test(t)) date = today.date;
    else if (/\btomorrow\b/.test(t)) date = addDays(today.date, 1);
    else {
      const wd = t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
      if (wd) {
        const target = WEEKDAY_NAMES[wd[1]];
        let diff = (target - today.dow + 7) % 7;
        if (diff === 0 && /\bnext\b/.test(t)) diff = 7;
        date = addDays(today.date, diff);
      }
    }
  }
  if (date && date < today.date) date = null;
  if (!date && !time) return null;
  const out = {};
  if (date) out.date = date;
  if (time) out.time = time;
  return out;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ---------------------------------------------------------------------
// Follow-up detection
// ---------------------------------------------------------------------

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SERVICE_PATTERNS = [
  { key: 'wheelchair', re: /\bwheelchair\b/ },
  { key: 'stretcher', re: /\bstretcher\b/ },
  { key: 'bariatric', re: /\bbariatric\b/ },
  { key: 'bls', re: /\bambulance\b|\bbls\b|\bals\b/ },
  { key: 'ambulatory', re: /\bambulatory\b|\bsedan\b/ }
];

// Strong change framing: the visitor is explicitly tying the message
// to the trip already priced ("for the same", "instead", ...).
const STRONG_FRAMING_RE = /\b(same|instead|switch|switched|change|changed|convert|for the same)\b/;
// Softer conversational framing ("what about…", "and …?").
const SOFT_FRAMING_RE = /\b(what about|how about|what if|make it|back to|add a|add the)\b/;
// Knowledge-question markers: with no strong framing these win, so
// KB questions are never mistaken for changes to the stored trip.
const KB_MARKER_RE = /\b(do you|does|can i|can we|can you|how do|how does|what is|what are|tell me|is there|are there|are you|do i need)\b/;

function detectFollowUp(question, state, nowMs = Date.now()) {
  if (!state || !state.lastEstimate) return null;
  const raw = String(question || '');
  const text = ' ' + normalize(raw) + ' ';
  const trimmed = text.trim();

  // Fresh start.
  if (/^(start over|start again|new estimate|another estimate|new trip|another trip|different trip|forget it|forget that|scrap that)\b/.test(trimmed)) {
    return { kind: 'reset' };
  }

  const strong = STRONG_FRAMING_RE.test(text);
  const soft = SOFT_FRAMING_RE.test(text);
  const kbMarker = KB_MARKER_RE.test(text);

  // Address changes. An inline address ("pickup from X instead")
  // is carried through so the widget can resolve it immediately.
  const changeWord = /\b(change|switch|update|different|new)\b/.test(text);
  const inlinePickup = raw.match(/\bpick(?:up| me up| us up)?\s+(?:from|at|to)\s+(.+?)\s*$/i);
  const inlineDrop = raw.match(/\bdrop(?:[ -]?off| me| us)?\s+(?:to|at|in)\s+(.+?)\s*$/i) || raw.match(/\bheaded to\s+(.+?)\s*$/i);
  const cleanCandidate = (s) => {
    const c = String(s || '').replace(/\s+instead\s*$/i, '').replace(/[?.!\s]+$/, '').trim();
    if (c.length < 6 || c.length > 300) return { address: null, datePhrase: false };
    // "Change the pickup to tomorrow at 9" is a date/time change,
    // not an address: a candidate that parses as only a date/time
    // phrase (no comma, no street suffix) is not an address, and the
    // message must fall through to the date/time detection below.
    if (parseDateTimeChange(c, nowMs) && !/,/.test(c) &&
        !/\b(street|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|highway|hwy|parkway|pkwy|place|pl|circle|cir|terrace|trail|square)\b/i.test(c)) {
      return { address: null, datePhrase: true };
    }
    return { address: c, datePhrase: false };
  };
  if (inlinePickup && (strong || /\binstead\b/.test(text) || changeWord)) {
    const cand = cleanCandidate(inlinePickup[1]);
    if (!cand.datePhrase) return { kind: 'address', which: 'pickup', address: cand.address };
  }
  if (inlineDrop && (strong || /\binstead\b/.test(text) || changeWord)) {
    const cand = cleanCandidate(inlineDrop[1]);
    if (!cand.datePhrase) return { kind: 'address', which: 'dropoff', address: cand.address };
  }
  if (changeWord) {
    // "Change the pickup to tomorrow at 9" names the pickup but is a
    // date/time change: when the whole message parses as a date/time
    // phrase with no address content, let the reprice detection below
    // have it instead of asking for an address.
    const looksDateOnly = Boolean(parseDateTimeChange(raw, nowMs)) && !/,/.test(raw) &&
      !/\b(street|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|highway|hwy|parkway|pkwy|place|pl|circle|cir|terrace|trail|square)\b/i.test(raw);
    if (!looksDateOnly) {
      if (/\bpick ?up\b|\bpickup\b/.test(text)) return { kind: 'address', which: 'pickup', address: null };
      if (/\bdrop ?off\b|\bdropoff\b|\bdestination\b/.test(text)) return { kind: 'address', which: 'dropoff', address: null };
      if (/\baddress\b|\blocation\b/.test(text)) return { kind: 'address', which: null, address: null };
    }
  }

  const changes = {};

  // Ride-type change.
  const serviceHit = SERVICE_PATTERNS.find((s) => s.re.test(text));
  if (serviceHit) {
    const bareService = new RegExp(
      '^(and |or |what about |how about )?(the )?(ambulatory|wheelchair|stretcher|bariatric|ambulance( bls)?|bls|sedan)[? ]*$'
    ).test(trimmed);
    if (strong || bareService || (soft && !kbMarker) || /\b(price|cost|quote|fare) for\b/.test(text) || /\bas an?\b/.test(text) || /\bin an?\b/.test(text)) {
      if (!kbMarker || strong || bareService) changes.service = serviceHit.key;
    }
  }

  // One-way / round-trip flip.
  const wantsRound = /\bround[ -]?trip\b|\broundtrip\b|\breturn trip\b/.test(text);
  const wantsOneWay = /\bone[ -]?way\b|\bsingle trip\b|\bjust there\b|\bonly there\b/.test(text);
  if ((wantsRound || wantsOneWay) && (!kbMarker || strong || soft || trimmed.length <= 60)) {
    if (wantsRound && !wantsOneWay) changes.tripType = 'ROUND_TRIP';
    else if (wantsOneWay && !wantsRound) changes.tripType = 'ONE_WAY';
  }

  // Date / time change.
  const dt = parseDateTimeChange(raw, nowMs);
  if (dt) {
    const aboutHours = /\b(open|opening|hours|available|availability)\b/.test(text) && !strong && !/\bwhat if\b/.test(text);
    const mostlyDate = (() => {
      const rest = trimmed
        .replace(/\b(what if|what about|how about|instead|same|trip|ride|pickup|pick up|change|move|switch|make it|it is|it's|its|on|at|for|the|to|be)\b/g, ' ')
        .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|today|tomorrow|next|noon|midnight|am|pm)\b/g, ' ')
        .replace(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}/g, ' ')
        .replace(/\d{1,2}(:\d{2})?/g, ' ')
        .replace(/\s+/g, ' ').trim();
      return rest.length <= 3;
    })();
    if (!aboutHours && (strong || soft || mostlyDate)) {
      if (dt.date) changes.date = dt.date;
      if (dt.time) changes.time = dt.time;
    }
  }

  if (Object.keys(changes).length) return { kind: 'reprice', changes };
  return null;
}

// "Same trip as a stretcher — everything else unchanged." style lead
// for a reprice answer, naming exactly what changed.
function describeChanges(changes, serviceLabelFor) {
  const phrases = [];
  if (changes.service) phrases.push('as ' + articleFor(serviceLabelFor(changes.service)) + ' ' + serviceLabelFor(changes.service).toLowerCase().replace(/ \(bls\)$/, '') + ' ride');
  if (changes.tripType === 'ROUND_TRIP') phrases.push('as a round trip');
  if (changes.tripType === 'ONE_WAY') phrases.push('as a one-way trip');
  if (changes.date && changes.time) phrases.push('on ' + formatDate(changes.date) + ' at ' + formatTime(changes.time));
  else if (changes.date) phrases.push('on ' + formatDate(changes.date));
  else if (changes.time) phrases.push('at ' + formatTime(changes.time));
  if (!phrases.length) return 'Same trip — repriced.';
  return 'Same trip ' + joinPhrases(phrases) + ' — everything else unchanged.';
}

function articleFor(label) {
  return /^[aeiou]/i.test(label || '') ? 'an' : 'a';
}

function joinPhrases(phrases) {
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return phrases[0] + ', and ' + phrases[1];
  return phrases.slice(0, -1).join(', ') + ', and ' + phrases[phrases.length - 1];
}

module.exports = {
  sanitizeState,
  sanitizeHistory,
  allowedFigures,
  detectFollowUp,
  parseDateTimeChange,
  describeChanges,
  formatDate,
  formatTime,
  SERVICE_KEYS
};
