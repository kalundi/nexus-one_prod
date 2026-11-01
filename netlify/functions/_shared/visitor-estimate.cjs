'use strict';
/*
 * Nexus Medical Transit — visitor rough-estimate service (Nex chat).
 *
 * Computes the in-chat rough estimate for the visitor assistant. Rate
 * grounding (do not break):
 *  - The math is the platform's own fare engine, nexus-fare.js
 *    (Fare.calculate) — the same code the booking app runs in the
 *    browser and the API runs server-side for saved bookings.
 *  - The rates come from the live platform settings (the Pricing
 *    Manager's `pricing` table + `fareRules`), read from the same
 *    `system_settings` row ('platform') the API uses, via
 *    _shared/db.cjs. When the database is unreachable, the platform's
 *    coded default pricing table (DEFAULT_PRICING in api.cjs) is the
 *    fallback — the same defaults a fresh settings row starts from.
 *  - Loaded (passenger) miles are road miles measured in the visitor's
 *    browser with the Google Maps Directions service, exactly how the
 *    booking app measures them (browser key from /api/integrations/
 *    config). They are cross-checked here against the straight-line
 *    distance between the geocoded points; implausible figures are
 *    rejected, never adjusted silently.
 *  - Deadhead (empty) miles cannot be measured without the yard route,
 *    so total deadhead is modeled as 50% of the loaded miles and the
 *    platform's billing rule is applied to that figure (owner directive,
 *    2026-11-01, v2): for Ambulatory, Wheelchair, Stretcher and
 *    Bariatric, the first 25 modeled empty miles are not billed and
 *    only the miles over 25 are charged, at the service's per-mile
 *    rate; at or under 25 modeled miles the answer makes no deadhead
 *    claim at all. BLS keeps the earlier model — half the loaded miles
 *    billed as the return-to-yard leg. Proxy limits, stated plainly:
 *    the platform itself measures the real yard segments and applies
 *    the same 25-mile allowance to that measured total, pricing the
 *    billable miles at the deadhead percentage of the per-mile rate;
 *    the chat proxy can do neither, so its figures stay rough. The
 *    answer says which treatment it used.
 *  - Premium timing (after-hours / weekend / holiday, +30% under the
 *    platform defaults) comes from the fare engine itself, which reads
 *    the pickup date/time in America/New_York against the platform's
 *    7 AM–7 PM regular-hours window.
 *
 * Privacy: inputs are used for this calculation only. Nothing is
 * logged, stored, or written to the database — the settings read is
 * the only query.
 */

const Fare = require('../../../nexus-fare.js');

// ---------------------------------------------------------------------------
// Platform default pricing — copied from DEFAULT_PRICING /
// DEFAULT_SERVICE_POLICIES in netlify/functions/api.cjs (the seed a
// platform-settings row starts from). The live settings row overrides
// these field by field whenever it can be read.
// ---------------------------------------------------------------------------
const DEFAULT_PRICING = {
  wheelchair: { label: 'Wheelchair Transportation', base: 98, includedMiles: 8, perMile: 4.1, waitPer15: 18.75 },
  ambulatory: { label: 'Ambulatory Transportation', base: 75, includedMiles: 5, perMile: 3.55, waitPer15: 12.5 },
  facility_transfer: { label: 'Facility-to-Facility Transfer (Routine IFT)', base: 165, includedMiles: 8, perMile: 5.25, waitPer15: 30 },
  facility_transfer_critical: { label: 'Facility-to-Facility Transfer (High-Acuity IFT)', base: 340, includedMiles: 8, perMile: 8.75, waitPer15: 45 },
  broda: { label: 'Broda Chair Transportation', base: 165, includedMiles: 8, perMile: 5.5, waitPer15: 25 },
  stretcher: { label: 'Stretcher Transportation', base: 455, includedMiles: 8, perMile: 7.95, waitPer15: 36.25 },
  bariatric: { label: 'Bariatric Transportation', base: 430, includedMiles: 8, perMile: 9.95, waitPer15: 45 },
  bls: { label: 'BLS Ambulance', base: 1125, includedMiles: 0, perMile: 18.5, waitPer15: 50 },
  als1: { label: 'ALS I Ambulance', base: 1395, includedMiles: 0, perMile: 21.5, waitPer15: 62.5 },
  als2: { label: 'ALS II Ambulance', base: 1450, includedMiles: 0, perMile: 24.5, waitPer15: 75 }
};

const DEFAULT_SERVICE_POLICIES = {
  wheelchair: { trafficOverageFeePerHour: 25, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  ambulatory: { trafficOverageFeePerHour: 20, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  facility_transfer: { trafficOverageFeePerHour: 42, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  facility_transfer_critical: { trafficOverageFeePerHour: 75, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  broda: { trafficOverageFeePerHour: 35, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  stretcher: { trafficOverageFeePerHour: 50, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  bariatric: { trafficOverageFeePerHour: 65, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  bls: { trafficOverageFeePerHour: 85, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  als1: { trafficOverageFeePerHour: 95, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 },
  als2: { trafficOverageFeePerHour: 110, afterHoursSurchargePct: 30, weekendSurchargePct: 30, holidaySurchargePct: 30 }
};

const DEFAULT_FARE_RULES = {
  minimumFare: 0,
  fuelSurchargePerMile: 0,
  vehicleFuelRatesPerMile: Object.fromEntries(Object.entries(Fare.fuelProfiles).map(([key, profile]) => [key, profile.rate])),
  ambulatoryFuelProfile: 'land_rover',
  vehicleFuelProfiles: {},
  afterHoursSurchargePct: 30,
  weekendSurchargePct: 30,
  holidaySurchargePct: 30,
  freeWaitMinutes: 15,
  waitingPolicyVersion: 2,
  serviceTravelPolicyVersion: 4,
  serviceSpeedModel: 'CRUISING_CEILING',
  cruisingReferenceSpeedMph: 65,
  minimumPlanningSpeedMph: 5,
  deadheadRatePct: 50,
  shortNoticeHours: 24,
  shortNoticeSurchargePct: 30,
  cardProcessingFeePct: 3,
  trafficOverageFeePerHour: 0,
  trafficOverageGraceMinutes: 0,
  servicePolicies: DEFAULT_SERVICE_POLICIES
};

// Ride types the chat flow offers. `bls` is the public "Ambulance"
// choice; its rate is the platform's BLS ambulance pricing.
const SERVICE_TYPES = {
  ambulatory: { key: 'ambulatory', label: 'Ambulatory' },
  wheelchair: { key: 'wheelchair', label: 'Wheelchair' },
  stretcher: { key: 'stretcher', label: 'Stretcher' },
  bariatric: { key: 'bariatric', label: 'Bariatric' },
  bls: { key: 'bls', label: 'Ambulance (BLS)' }
};
const SERVICE_ALIASES = { ambulance: 'bls', amb: 'bls', car: 'ambulatory', sedan: 'ambulatory', walking: 'ambulatory' };

// Coverage (owner directive, 2026-11-01): Nexus's local region is
// MD/DC/VA, and it also covers the rest of the 48 contiguous states for
// inter-state and long-distance requests. Only AK and HI are out of
// area for estimates, matching the assistant's coverage answers.
const OUT_OF_AREA_STATES = new Set(['AK', 'HI']);
// Longest plausible contiguous-US road trips run under ~3,000 miles;
// the straight-line plausibility cross-check below still guards the
// figure, so the cap only rejects nonsense distances.
const MAX_TRIP_MILES = 3000;
const MAIN_PHONE = '(888) 639-5766';
const BOOKING_URL = 'https://mynexusride.com';
const DEADHEAD_FRACTION = 0.5; // modeled empty miles, as a share of loaded miles
const DEADHEAD_ALLOWANCE_MILES = 25; // per-trip free empty miles for the covered services (deadhead rule v2)

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Overlay a stored platform-settings row onto the platform defaults,
// field by field — the same merge semantics as api.cjs's mergePricing /
// mergePlatformSettings, limited to what the fare engine reads.
function mergeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pricing = {};
  for (const [key, base] of Object.entries(DEFAULT_PRICING)) {
    const over = src.pricing && typeof src.pricing === 'object' ? src.pricing[key] || {} : {};
    pricing[key] = {
      label: typeof over.label === 'string' && over.label ? over.label : base.label,
      base: num(over.base, base.base),
      includedMiles: num(over.includedMiles, base.includedMiles),
      perMile: num(over.perMile, base.perMile),
      waitPer15: num(over.waitPer15, base.waitPer15)
    };
  }
  const rulesSrc = src.fareRules && typeof src.fareRules === 'object' ? src.fareRules : {};
  const fareRules = { ...DEFAULT_FARE_RULES };
  for (const key of Object.keys(DEFAULT_FARE_RULES)) {
    if (key === 'servicePolicies' || key === 'vehicleFuelRatesPerMile' || key === 'vehicleFuelProfiles') continue;
    if (typeof DEFAULT_FARE_RULES[key] === 'number') fareRules[key] = num(rulesSrc[key], DEFAULT_FARE_RULES[key]);
    else if (typeof rulesSrc[key] === 'string' && rulesSrc[key]) fareRules[key] = rulesSrc[key];
  }
  const fuelRates = { ...DEFAULT_FARE_RULES.vehicleFuelRatesPerMile };
  if (rulesSrc.vehicleFuelRatesPerMile && typeof rulesSrc.vehicleFuelRatesPerMile === 'object') {
    for (const key of Object.keys(fuelRates)) fuelRates[key] = num(rulesSrc.vehicleFuelRatesPerMile[key], fuelRates[key]);
  }
  fareRules.vehicleFuelRatesPerMile = fuelRates;
  const policies = {};
  for (const [key, base] of Object.entries(DEFAULT_SERVICE_POLICIES)) {
    const over = rulesSrc.servicePolicies && typeof rulesSrc.servicePolicies === 'object' ? rulesSrc.servicePolicies[key] || {} : {};
    policies[key] = {
      trafficOverageFeePerHour: num(over.trafficOverageFeePerHour, base.trafficOverageFeePerHour),
      afterHoursSurchargePct: num(over.afterHoursSurchargePct, base.afterHoursSurchargePct),
      weekendSurchargePct: num(over.weekendSurchargePct, base.weekendSurchargePct),
      holidaySurchargePct: num(over.holidaySurchargePct, base.holidaySurchargePct)
    };
    // Travel-policy fields the engine reads from the stored policy.
    for (const extra of ['freeWaitMinutes', 'speedReductionMph', 'transitionBufferMinutes']) {
      if (Number.isFinite(Number(over[extra]))) policies[key][extra] = Number(over[extra]);
    }
  }
  fareRules.servicePolicies = policies;
  return { pricing, fareRules };
}

// Default settings source: the live platform settings row. Any failure
// (no DATABASE_URL, table missing, DB down) falls back to the platform
// defaults so the estimate still works.
async function loadPlatformSettings() {
  try {
    const { query } = require('./db.cjs');
    const result = await query(`SELECT value FROM system_settings WHERE key='platform' LIMIT 1`);
    const row = result && result.rows && result.rows[0];
    return mergeSettings(row ? row.value : null);
  } catch {
    return mergeSettings(null);
  }
}

function straightLineMiles(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
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

function fmtMiles(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function roundEstimate(total) {
  return total >= 100 ? Math.round(total / 5) * 5 : Math.round(total);
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

function createEstimator({ fareEngine = Fare, loadSettings = loadPlatformSettings, now = Date.now } = {}) {
  const buckets = new Map(); // ip -> array of timestamps (ms)
  const WINDOW_MS = 10 * 60 * 1000;
  const MAX_PER_WINDOW = 12;

  function rateLimited(ip) {
    const key = String(ip || 'unknown');
    const cutoff = now() - WINDOW_MS;
    const hits = (buckets.get(key) || []).filter(t => t > cutoff);
    if (hits.length >= MAX_PER_WINDOW) { buckets.set(key, hits); return true; }
    hits.push(now());
    buckets.set(key, hits);
    return false;
  }

  async function estimate(input, ip) {
    if (rateLimited(ip)) {
      return { status: 429, body: { error: `Too many estimate requests in a short time. Please wait a moment, or call us at ${MAIN_PHONE}.` } };
    }
    const body = input && typeof input === 'object' ? input : {};
    const pickup = String(body.pickup || '').trim().slice(0, 300);
    const dropoff = String(body.dropoff || '').trim().slice(0, 300);
    if (!pickup || !dropoff) {
      return { status: 400, body: { mode: 'needs_input', error: 'I need both the pickup and drop-off addresses before I can work out an estimate.' } };
    }
    const rawService = String(body.service || '').trim().toLowerCase();
    const serviceKey = SERVICE_TYPES[rawService] ? rawService : SERVICE_ALIASES[rawService];
    if (!serviceKey) {
      return { status: 400, body: { mode: 'needs_input', error: 'Please choose the ride type: ambulatory, wheelchair, stretcher, bariatric, or ambulance.' } };
    }
    const tripType = String(body.tripType || 'ONE_WAY').trim().toUpperCase() === 'ROUND_TRIP' ? 'ROUND_TRIP' : 'ONE_WAY';
    const date = String(body.date || '').trim();
    const time = String(body.time || '').trim();
    if (!validDateString(date) || !validTimeString(time)) {
      return { status: 400, body: { mode: 'needs_input', error: 'I need the pickup date and time to judge regular hours versus after-hours pricing.' } };
    }
    const loadedMiles = Number(body.loadedMiles);
    if (!Number.isFinite(loadedMiles) || loadedMiles <= 0 || loadedMiles > MAX_TRIP_MILES) {
      return { status: 400, body: { mode: 'needs_input', error: 'I could not get a road distance for that trip, so I can\u2019t work out an estimate. Please check the addresses and try again.' } };
    }
    const returnMilesInput = Number(body.returnMiles);
    const returnMiles = tripType === 'ROUND_TRIP' && Number.isFinite(returnMilesInput) && returnMilesInput > 0 && returnMilesInput <= MAX_TRIP_MILES
      ? returnMilesInput : loadedMiles;

    // Service area: geocoded state components, when provided, must be
    // inside the 48 contiguous states — only AK and HI are out of area.
    const pickupState = String(body.pickupState || '').trim().toUpperCase();
    const dropoffState = String(body.dropoffState || '').trim().toUpperCase();
    for (const state of [pickupState, dropoffState]) {
      if (state && OUT_OF_AREA_STATES.has(state)) {
        return {
          status: 200,
          body: {
            mode: 'out_of_area',
            answer: `That trip is outside the area I can estimate for — Nexus covers the 48 contiguous states for inter-state trips, so Alaska and Hawaii are out of area. If part of the trip is inside the 48 contiguous states, please call ${MAIN_PHONE} and the team will help, or book online at ${BOOKING_URL}.`
          }
        };
      }
    }
    // Distance sanity: road miles must be plausible against the
    // straight-line distance between the geocoded points.
    const pLat = Number(body.pickupLat), pLng = Number(body.pickupLng);
    const dLat = Number(body.dropoffLat), dLng = Number(body.dropoffLng);
    if ([pLat, pLng, dLat, dLng].every(Number.isFinite)) {
      const straight = straightLineMiles({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng });
      if (straight > 0.5 && (loadedMiles < straight * 0.95 || loadedMiles > straight * 3 + 2)) {
        return { status: 400, body: { mode: 'needs_input', error: 'That distance doesn\u2019t line up with the addresses, so I can\u2019t trust an estimate from it. Please check the addresses and try again.' } };
      }
    }

    const settings = await loadSettings();
    const rate = settings.pricing[serviceKey];
    if (!rate) {
      return { status: 503, body: { error: `Pricing for that ride type is unavailable right now. Please call ${MAIN_PHONE} and the team will quote it.` } };
    }
    const duration = Number.isFinite(Number(body.durationMinutes)) && Number(body.durationMinutes) > 0 ? Number(body.durationMinutes) : 0;
    const leg = miles => ({ miles, durationMinutes: duration, trafficDurationMinutes: duration });
    const passengerLegs = tripType === 'ROUND_TRIP' ? [leg(loadedMiles), leg(returnMiles)] : [leg(loadedMiles)];
    const fare = fareEngine.calculate({
      service: serviceKey,
      miles: loadedMiles,
      date, time, rate,
      rules: settings.fareRules,
      tripType,
      returnDate: date,
      returnTime: time,
      metrics: { passengerLegs, deadheadSegments: [0, 0], durationMinutes: duration, trafficDurationMinutes: duration }
    });

    const totalLoaded = tripType === 'ROUND_TRIP' ? loadedMiles + returnMiles : loadedMiles;
    // Modeled empty miles: half the loaded miles stand in for the trip's
    // total deadhead, since no yard route can be measured in chat.
    const modeledDeadheadMiles = DEADHEAD_FRACTION * totalLoaded;
    // The platform's 25-mile deadhead allowance (owner directive,
    // 2026-11-01, v2), as closely as the proxy allows: for the covered
    // services the first 25 modeled empty miles are not billed and only
    // the miles over 25 are figured in, priced on the proxy's existing
    // basis (the service's per-mile rate). BLS — the only non-covered
    // service the chat offers — keeps the earlier return-to-yard proxy
    // exactly: the modeled miles are billed as they stand.
    const deadheadAllowanceApplies = ['ambulatory', 'wheelchair', 'stretcher', 'bariatric'].includes(serviceKey);
    const deadheadMiles = deadheadAllowanceApplies ? Math.max(0, modeledDeadheadMiles - DEADHEAD_ALLOWANCE_MILES) : modeledDeadheadMiles;
    const deadheadCharge = deadheadMiles * Number(rate.perMile || 0);
    const cardPct = Number(fare.taxRatePct ?? settings.fareRules.cardProcessingFeePct ?? 0);
    const total = (Number(fare.subtotal || 0) + deadheadCharge) * (1 + cardPct / 100);
    const displayTotal = roundEstimate(total);
    const service = SERVICE_TYPES[serviceKey];

    const premiumReason = fare.premiumRateReason || '';
    const premiumPct = Number(fare.premiumRatePct || 0);
    let premiumSentence = '';
    if (Number(fare.premiumAmount || 0) > 0 && premiumPct > 0) {
      if (premiumReason === 'weekend') premiumSentence = ` That pickup falls on a weekend, so the +${premiumPct}% weekend uplift is included.`;
      else if (premiumReason === 'holiday') premiumSentence = ` That pickup falls on a holiday, so the +${premiumPct}% holiday uplift is included.`;
      else premiumSentence = ` That pickup is outside regular hours (Monday\u2013Friday, 7 AM\u20137 PM), so the +${premiumPct}% after-hours uplift is included.`;
    }
    const shortNoticeSentence = Number(fare.shortNoticeCharge || 0) > 0
      ? ' It also includes the short-notice charge for a pickup within 24 hours.'
      : '';

    const milesLine = tripType === 'ROUND_TRIP'
      ? `about ${fmtMiles(loadedMiles)} miles each way (${fmtMiles(totalLoaded)} miles of driving in total), round trip`
      : `about ${fmtMiles(totalLoaded)} miles, one way`;
    const includedLine = Number(rate.includedMiles || 0) > 0
      ? `mileage beyond the first ${rate.includedMiles} miles the base fare covers`
      : 'mileage for the full trip distance';
    const article = /^[aeiou]/i.test(service.label) ? 'an' : 'a';
    let deadheadClause = '';
    if (deadheadMiles > 0 && deadheadAllowanceApplies) {
      // Covered services: name the modeled empty miles, the 25-mile
      // allowance, and the over-25 miles actually figured in.
      deadheadClause = tripType === 'ROUND_TRIP'
        ? `, and estimated deadhead \u2014 the empty miles to reach you and return afterwards, figured at about ${fmtMiles(modeledDeadheadMiles)} miles; the first 25 empty miles aren\u2019t billed, so only the ${fmtMiles(deadheadMiles)} miles over 25 are figured in`
        : `, and estimated deadhead \u2014 the trip\u2019s empty miles, figured at about ${fmtMiles(modeledDeadheadMiles)} miles; the first 25 empty miles aren\u2019t billed, so only the ${fmtMiles(deadheadMiles)} miles over 25 are figured in`;
    } else if (deadheadMiles > 0) {
      // BLS keeps the earlier return-to-yard wording.
      deadheadClause = tripType === 'ROUND_TRIP'
        ? `, and estimated deadhead \u2014 the empty miles to reach you and return afterwards, figured at about ${fmtMiles(deadheadMiles)} miles (50% of the trip distance)`
        : `, and estimated deadhead \u2014 the empty miles back to the yard after drop-off, billed at half and figured at about ${fmtMiles(deadheadMiles)} miles`;
    }
    const answer =
      `For ${article} ${service.label} ride, ${milesLine}, with pickup on ${formatDate(date)} at ${formatTime(time)}, your rough estimate is about $${displayTotal}.\n\n` +
      `How I got there: the ${service.label} base fare, plus ${includedLine}, fuel${deadheadClause}.${premiumSentence}${shortNoticeSentence}\n\n` +
      `That is a rough estimate, not a final quote. For the exact quote, your reservation and booking, use the booking app at ${BOOKING_URL} \u2014 or call ${MAIN_PHONE} and the team will set it up.`;

    return {
      status: 200,
      body: {
        mode: 'estimate',
        answer,
        estimate: {
          displayTotal,
          total: Math.round(total * 100) / 100,
          service: serviceKey,
          serviceLabel: service.label,
          tripType,
          loadedMiles: totalLoaded,
          deadheadMiles: Math.round(deadheadMiles * 10) / 10,
          premiumReason: premiumReason || null,
          premiumPct: premiumAmountApplies(fare) ? premiumPct : 0,
          shortNotice: Number(fare.shortNoticeCharge || 0) > 0
        }
      }
    };
  }

  function premiumAmountApplies(fare) { return Number(fare.premiumAmount || 0) > 0; }

  return { estimate };
}

module.exports = {
  createEstimator,
  mergeSettings,
  loadPlatformSettings,
  roundEstimate,
  straightLineMiles,
  SERVICE_TYPES,
  DEFAULT_PRICING
};
