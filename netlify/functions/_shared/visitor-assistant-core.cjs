'use strict';
/*
 * Nexus Medical Transit — visitor assistant core.
 *
 * Answers visitor questions ONLY from the website knowledge base
 * (visitor-knowledge.cjs), and — since the smart-Nex build — follows
 * the conversation: the widget sends the page-session state (the
 * last estimate's inputs and result) and recent turns with each
 * message (see visitor-conversation.cjs; per-request only, never
 * stored or logged). Three layers answer, in order:
 *  1. Deterministic follow-ups over the stored trip — a one-change
 *     re-price ("for the same, what would be the price for
 *     stretcher", "and round trip?", "what if it's Saturday") runs
 *     the same visitor-estimate engine on the stored road miles; an
 *     address change or a fresh start is handed back to the widget,
 *     which re-enters its address-resolution path with every other
 *     detail kept. Works with no model configured.
 *  2. Retrieval + composed answers from the knowledge base.
 *  3. Optional model layer: when an OpenAI-compatible key/model are
 *     present in the environment (VISITOR_ASSISTANT_API_KEY /
 *     VISITOR_ASSISTANT_MODEL, falling back to the platform's
 *     OPENAI_API_KEY / OPENAI_MODEL, the same pattern as
 *     _shared/maintenance.cjs), the model gets the conversation
 *     history, the stored trip, the retrieved entries, and one tool —
 *     the estimate engine — and phrases the reply. The model may
 *     only state a price the estimate tool returned in this
 *     conversation; the output filter discards anything else with a
 *     dollar figure, a discount percentage, or a non-public phone
 *     number, and any provider failure falls back silently to the
 *     deterministic/composed answer. Nothing here pretends to be an
 *     AI model when no credentials are configured.
 *
 * Safety rules enforced here, before any retrieval or phrasing:
 *  - Emergency signals -> "call 911" immediately.
 *  - Price questions -> the pricing entry only; never an invented figure.
 *  - The assistant never asks for or stores personal/medical details.
 *  - Per-IP rate limiting (in-memory, per function instance).
 */

const { CONTACT, ENTRIES } = require('./visitor-knowledge.cjs');
const { SERVICE_TYPES } = require('./visitor-estimate.cjs');
const {
  sanitizeState, sanitizeHistory, allowedFigures, detectFollowUp, describeChanges
} = require('./visitor-conversation.cjs');

const BOOKING_CTA = `You can book online at ${CONTACT.bookingUrl} or call ${CONTACT.mainPhoneDisplay}.`;
const FALLBACK_ANSWER =
  `I don\u2019t have that in the information on our website, and I don\u2019t want to guess. ` +
  `Please call us at ${CONTACT.mainPhoneDisplay} and the team will help, or book online at ${CONTACT.bookingUrl}. ` +
  `I can answer questions about our services, service areas, hours, booking, and ride tracking.`;
const EMERGENCY_ANSWER =
  'If this is a medical emergency, call 911 immediately. Nexus Medical Transit provides planned, non-emergency transportation only, so please do not wait for a booking if someone needs emergency help.';
const PRIVACY_NOTE =
  'Please don\u2019t share personal or medical details with me — I don\u2019t collect or store them. The Nexus team can take trip details securely by phone.';

// Signals that short-circuit to the 911 answer. Checked before retrieval so
// a keyword overlap (e.g. "ambulance") can never soften the response.
const EMERGENCY_SIGNALS = [
  '911', 'emergency', 'hurt', 'injur', 'unconscious', 'not breathing',
  'cant breathe', 'can\u2019t breathe', 'chest pain', 'heart attack', 'stroke',
  'bleed', 'accident', 'dying', 'overdose', 'choking', 'seizure', 'suicide',
  'passed out', 'collapsed', 'unresponsive'
];

const PRICE_SIGNALS = [
  'cost', 'price', 'pricing', 'how much', 'fare', 'rate', 'rates', 'charge',
  'quote', 'fee', 'fees', 'expensive', 'afford', 'per mile', 'payment cost'
];

// "Estimate" is a pricing word on this site (the pricing entry answers it),
// matched on a word boundary so "estimated arrival" (a tracking question)
// does not get pinned to pricing.
function hasPriceIntent(text) {
  return PRICE_SIGNALS.some(s => text.includes(s)) || /\bestimates?\b/.test(text);
}

// Availability intent: the visitor wants to know whether a ride can be
// had at a time. "Opening hours" is an hours question, not availability,
// so bare "opening(s)" only counts when "hours" is not attached to it.
function hasAvailabilityIntent(text) {
  if (text.includes('availab')) return true;
  if (/\bopenings?\b/.test(text) && !text.includes('opening hours')) return true;
  if (/\breserv/.test(text)) return true;
  return ['book ahead', 'book in advance', 'same day', 'same-day',
    'short notice', 'last minute', 'fit me in', 'fit us in']
    .some(s => text.includes(s));
}

const STOPWORDS = new Set((
  'a an the do does did you your yours we our ours i me my is are was were can could ' +
  'should would will shall have has had to of in on at for with and or if then than ' +
  'what when where who whom how why which this that it its be been being from by as ' +
  'about into over under any some all get got please tell need needs want wants like ' +
  'offer offers provide provides service services ride rides trip trips transport transportation'
).split(' '));

const PLACE_ALIASES = [
  { entry: 'area-montgomery-county', label: 'Montgomery County', names: ['montgomery county', 'clarksburg', 'rockville', 'bethesda', 'gaithersburg', 'germantown', 'silver spring'] },
  { entry: 'area-annapolis', label: 'Annapolis and Anne Arundel County', names: ['annapolis', 'anne arundel'] },
  { entry: 'area-dc', label: 'Washington, DC', names: ['washington dc', 'washington, dc', 'district of columbia', 'in dc', 'to dc'] },
  { entry: 'area-northern-virginia', label: 'Northern Virginia', names: ['northern virginia', 'arlington', 'alexandria', 'fairfax', 'virginia'] }
];

// Coverage (owner directive, 2026-11-01) has two tiers: the local
// region — Maryland, Washington, DC, and Northern Virginia — for
// day-to-day service, and the rest of the 48 contiguous states for
// inter-state and long-distance requests planned in advance. Only
// Alaska, Hawaii, and places outside the United States are out of
// area; naming one with travel intent gets an explicit, honest no.
// Naming any other US state with travel intent gets the inter-state
// yes (built from the long-distance entry). Maryland and Virginia are
// not in the state list below because PLACE_ALIASES already routes
// them to their local entries.
const NON_COVERAGE_PLACES = [
  { name: 'alaska', label: 'Alaska' },
  { name: 'hawaii', label: 'Hawaii' },
  { name: 'canada', label: 'Canada' },
  { name: 'mexico', label: 'Mexico' },
  { name: 'united kingdom', label: 'the United Kingdom' },
  { name: 'england', label: 'England' },
  { name: 'scotland', label: 'Scotland' },
  { name: 'wales', label: 'Wales' },
  { name: 'ireland', label: 'Ireland' },
  { name: 'france', label: 'France' },
  { name: 'germany', label: 'Germany' },
  { name: 'spain', label: 'Spain' },
  { name: 'italy', label: 'Italy' },
  { name: 'portugal', label: 'Portugal' },
  { name: 'netherlands', label: 'the Netherlands' },
  { name: 'switzerland', label: 'Switzerland' },
  { name: 'australia', label: 'Australia' },
  { name: 'japan', label: 'Japan' },
  { name: 'china', label: 'China' },
  { name: 'india', label: 'India' },
  { name: 'brazil', label: 'Brazil' },
  { name: 'south korea', label: 'South Korea' },
  { name: 'south africa', label: 'South Africa' }
];

const COVERED_STATES = [
  'alabama', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri',
  'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
  'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'washington', 'west virginia',
  'wisconsin', 'wyoming'
];

// Any phrasing that treats the named place as a trip endpoint or a
// service question — used to route named places to the coverage answers
// instead of letting a bare place name drift into a generic booking reply.
const TRAVEL_INTENT_RE = /(book|ride|trip|take|go|travel|drive|serve|serving|cover|operate|pick ?up|pickup|headed|going|get to|come to|transport|bring|visit)/;

const SERVICE_ENTRY_IDS = [
  'wheelchair', 'stretcher', 'bariatric', 'ambulance', 'dialysis',
  'hospital-discharge', 'medical-shuttle', 'ambulatory'
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text) {
  return normalize(text).split(' ').filter(t => t && !STOPWORDS.has(t));
}

function entryById(id) {
  return ENTRIES.find(e => e.id === id);
}

function scoreEntry(entry, questionText, questionTokens) {
  let score = 0;
  const hay = ' ' + normalize(entry.questions.join(' ') + ' ' + entry.keywords.join(' ') + ' ' + entry.topic) + ' ';
  for (const kw of entry.keywords) {
    const k = normalize(kw);
    if (k.includes(' ')) { if (questionText.includes(k)) score += 6; }
    else if (questionTokens.includes(k)) score += 3;
  }
  const questionWords = new Set(questionTokens);
  for (const q of entry.questions) {
    for (const t of tokens(q)) if (questionWords.has(t)) score += 1.5;
  }
  // Topic word mentioned verbatim is a strong signal.
  if (questionText.includes(normalize(entry.topic))) score += 2;
  return score;
}

function retrieve(question, limit = 3) {
  const text = ' ' + normalize(question) + ' ';
  const toks = tokens(question);
  return ENTRIES
    .map(entry => ({ entry, score: scoreEntry(entry, text, toks) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function detectPlace(question) {
  const text = ' ' + normalize(question) + ' ';
  for (const place of PLACE_ALIASES) {
    if (place.names.some(n => text.includes(' ' + n) || text.includes(n + ' ') || text.includes(n + '?'))) {
      return { entry: entryById(place.entry), label: place.label };
    }
  }
  return null;
}

function mentionsPlace(text, name) {
  return text.includes(' ' + name + ' ') || text.includes(' ' + name + '?') || text.includes(' ' + name + ',');
}

// Places Nexus cannot cover at all: Alaska, Hawaii, and anywhere
// outside the United States. "New Mexico" is scrubbed before the
// country check so the covered state can never read as Mexico.
function detectNonCoveragePlace(question) {
  let text = ' ' + normalize(question) + ' ';
  const scrubbed = text.replace(/new mexico/g, ' nm ');
  for (const place of NON_COVERAGE_PLACES) {
    if (mentionsPlace(scrubbed, place.name)) return place.label;
  }
  if (/(outside the (us|united states)|another country|overseas|international)/.test(scrubbed)) {
    return 'outside the United States';
  }
  return null;
}

function detectCoveredState(question) {
  const text = ' ' + normalize(question) + ' ';
  for (const state of COVERED_STATES) {
    if (mentionsPlace(text, state)) return state.replace(/\b\w/g, c => c.toUpperCase());
  }
  return null;
}

function composeAnswer(question) {
  const text = normalize(question);

  // Price questions are pinned to the pricing entry: no retrieval drift,
  // never a figure. A question that also asks about availability gets
  // both halves answered, and estimate answers close with the booking
  // call to action.
  if (hasPriceIntent(text)) {
    const pricing = entryById('pricing');
    if (hasAvailabilityIntent(text)) {
      const availability = entryById('availability');
      const answer = pricing.answer + '\n\n' + availability.answer + ' ' + BOOKING_CTA;
      return { answer, sources: ['pricing', 'availability'], mode: 'composed' };
    }
    return { answer: pricing.answer + ' ' + BOOKING_CTA, sources: ['pricing'], mode: 'composed' };
  }

  // Place outside coverage entirely (Alaska, Hawaii, outside the US):
  // a warm, explicit, honest no — and no booking call to action, so the
  // answer never implies the booking app can take the trip.
  const outsidePlace = detectNonCoveragePlace(question);
  if (outsidePlace && TRAVEL_INTENT_RE.test(text)) {
    const answer =
      `I\u2019m sorry — ${outsidePlace} is outside the area Nexus covers. ` +
      entryById('area-outside').answer;
    return { answer, sources: ['area-outside'], mode: 'composed' };
  }

  // Any other named US state is inside the 48-state inter-state
  // coverage: a yes, answered with the long-distance facts, with the
  // booking step as the closing actualization only.
  const coveredState = detectCoveredState(question);
  // "Washington" beside a DC place signal means the District, which the
  // place composition below answers with DC specifics — not the state.
  const washingtonDc = coveredState === 'Washington' && Boolean(detectPlace(question));
  if (coveredState && !washingtonDc && TRAVEL_INTENT_RE.test(text)) {
    const answer =
      `Yes — ${coveredState} is within Nexus\u2019s coverage. ` +
      entryById('long-distance').answer + ' ' + BOOKING_CTA;
    return { answer, sources: ['long-distance', 'areas-overview'], mode: 'composed' };
  }

  const hits = retrieve(question);
  const place = detectPlace(question);
  const serviceHit = hits.find(h => SERVICE_ENTRY_IDS.includes(h.entry.id));

  // Service + place composition: "Do you offer X in Y?"
  if (place && serviceHit && serviceHit.score >= 4.5) {
    const fromOffer = serviceHit.entry.questions[0].match(/^Do you offer (.+)\?$/);
    const serviceAnswer = serviceHit.entry.answer.replace(/^Yes\.\s*/, '');
    const lead = fromOffer
      ? `Yes — Nexus offers ${fromOffer[1].charAt(0).toLowerCase() + fromOffer[1].slice(1)} in ${place.label}. `
      : `Yes — in ${place.label}, too. `;
    const answer = lead + serviceAnswer + ' ' + BOOKING_CTA;
    return { answer, sources: [serviceHit.entry.id, place.entry.id], mode: 'composed' };
  }

  if (!hits.length || hits[0].score < 4) {
    return { answer: FALLBACK_ANSWER, sources: [], mode: 'fallback' };
  }

  const top = hits[0].entry;
  let answer = top.answer;
  const second = hits[1];
  // Add a genuinely complementary second entry (different topic) only when
  // it scores close to the top hit — e.g. tracking questions that also
  // mention caregivers.
  if (second && second.entry.topic !== top.topic && second.score >= hits[0].score * 0.75) {
    answer += '\n\n' + second.entry.answer;
  }
  if (top.id !== 'contact' && top.id !== 'emergency' && top.id !== 'pricing' && !answer.includes(CONTACT.bookingUrl)) {
    answer += ' ' + BOOKING_CTA;
  }
  return { answer, sources: hits.filter(h => h.score >= 4).map(h => h.entry.id), mode: 'composed' };
}

function aiConfig(env) {
  return {
    key: env.VISITOR_ASSISTANT_API_KEY || env.OPENAI_API_KEY,
    model: env.VISITOR_ASSISTANT_MODEL || env.OPENAI_MODEL
  };
}

const ALLOWED_NUMBERS = ['8886395766', '8887604990', '911'];
// Output filter for model text. With no `allowed` figures (the
// original contract), ANY dollar figure or percentage is rejected —
// the site publishes none. In the conversation layer the caller
// passes the figures the estimate tool returned in this conversation
// (visitor-conversation.allowedFigures); exactly those amounts — and
// a tool-returned premium percentage — may be stated, nothing else.
function guardrailOk(text, allowed) {
  if (!text) return false;
  const amounts = allowed && allowed.amounts instanceof Set ? allowed.amounts : new Set();
  const pcts = allowed && allowed.pcts instanceof Set ? allowed.pcts : new Set();
  const dollarFigures = text.match(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g) || [];
  for (const figure of dollarFigures) {
    const value = Number(figure.replace(/[$,\s]/g, ''));
    if (![...amounts].some(a => Math.abs(a - value) < 0.005)) return false;
  }
  const pctFigures = text.match(/\d+(?:\.\d+)?\s?%/g) || [];
  for (const figure of pctFigures) {
    const value = Number(figure.replace(/[%\s]/g, ''));
    if (![...pcts].some(p => Math.abs(p - value) < 0.005)) return false;
  }
  // Reject any phone-shaped digit sequence that is not a public number.
  const phoneLike = text.match(/(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}|\d{7,}/g) || [];
  for (const candidate of phoneLike) {
    const digits = candidate.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!ALLOWED_NUMBERS.includes(digits)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------
// Model conversation layer (layer 3)
// ---------------------------------------------------------------------

const ESTIMATE_TOOL = {
  type: 'function',
  name: 'estimate_ride',
  description:
    'Re-price the trip the visitor already has an estimate for, changing only the fields provided. ' +
    'Use it when the visitor asks what the same trip would cost with a different ride type, a round trip instead of one way (or back), ' +
    'or a different pickup date/time. The route and road miles are already known and never change here. ' +
    'Returns the rough estimate for the changed trip; quote ONLY the displayTotal it returns.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      service: { type: 'string', enum: ['ambulatory', 'wheelchair', 'stretcher', 'bariatric', 'bls'], description: 'Ride type. bls is the ambulance choice.' },
      tripType: { type: 'string', enum: ['ONE_WAY', 'ROUND_TRIP'] },
      date: { type: 'string', description: 'Pickup date, YYYY-MM-DD.' },
      time: { type: 'string', description: 'Pickup time, 24-hour HH:MM.' }
    }
  }
};

function modelInstructions() {
  return (
    'You are Nex, the Nexus Medical Transit Virtual Assistant on the company website, continuing a conversation with a visitor. ' +
    'Answer using ONLY the website information provided below and the results of the estimate_ride tool. ' +
    'Rules: never state or estimate a price, fare, rate, or discount except a displayTotal the estimate_ride tool returned in this conversation (or the stored estimate summarized below) — quote it exactly as a rough estimate, never as a final quote; ' +
    'never give a phone number other than (888) 639-5766, (888) 760-4990, or 911; ' +
    'never ask for or repeat personal or medical details; if the provided information does not answer the question, say so and direct the visitor to call (888) 639-5766 or book at https://mynexusride.com; ' +
    'for any medical emergency, tell them to call 911. Keep the reply under 120 words, plain and helpful.'
  );
}

function stateSummary(state) {
  if (!state || !state.lastEstimate) return '';
  const { inputs, result } = state.lastEstimate;
  const label = result.serviceLabel || inputs.service;
  return (
    `The visitor already has a rough estimate in this conversation: ${label} ride, ` +
    `${inputs.tripType === 'ROUND_TRIP' ? 'round trip' : 'one way'}, pickup at "${inputs.pickupResolved}", drop-off at "${inputs.dropoffResolved}", ` +
    `about ${inputs.loadedMiles} road miles, pickup on ${inputs.date} at ${inputs.time}. ` +
    `The estimate tool priced it at about $${result.displayTotal} (a rough estimate, not a final quote).`
  );
}

function extractModelText(data) {
  return (data.output || []).filter(i => i.type === 'message')
    .flatMap(i => i.content || []).filter(c => c.type === 'output_text')
    .map(c => c.text).join('\n').trim().slice(0, 1600);
}

// One model round-trip conversation. Returns { answer, estimateBody,
// newInputs } on success (estimateBody/newInputs set when the model
// used the tool), or null on any failure or guardrail rejection —
// the caller then keeps its deterministic/composed answer.
async function converseWithModel({ fetchImpl, env, question, history, state, composed, runEstimate }) {
  const config = aiConfig(env);
  if (!config.key || !config.model) return null;
  const context = composed.sources.map(id => entryById(id)).filter(Boolean)
    .map(e => `## ${e.topic} — ${e.id}\n${e.answer}`).join('\n\n');
  const summary = stateSummary(state);
  if (!context && !summary) return null;

  const input = [];
  for (const turn of history) input.push({ role: turn.role, content: turn.text });
  input.push({
    role: 'user',
    content:
      (context ? `Website information:\n${context}\n\n` : '') +
      (summary ? `Conversation state:\n${summary}\n\n` : '') +
      `Visitor question: ${question}`
  });
  const post = async (payload) => {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(9000),
      headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    return response.json();
  };

  const hasTrip = Boolean(state && state.lastEstimate);
  const first = await post({
    model: config.model, store: false, max_output_tokens: 400,
    instructions: modelInstructions(),
    input,
    ...(hasTrip ? { tools: [ESTIMATE_TOOL] } : {})
  });
  if (!first) return null;

  const call = (first.output || []).find(i => i.type === 'function_call' && i.name === 'estimate_ride');
  if (!call) {
    const text = extractModelText(first);
    return guardrailOk(text, allowedFigures(state)) ? { answer: text } : null;
  }
  if (!hasTrip || typeof runEstimate !== 'function') return null;

  let args = {};
  try { args = JSON.parse(call.arguments || '{}'); } catch { return null; }
  const toolResult = await runEstimate(args);
  if (!toolResult || toolResult.status !== 200 || !toolResult.body || toolResult.body.mode !== 'estimate') {
    // The tool could not price that change (e.g. out of area): let
    // the model explain with the tool's own words, no figures.
    const toolText = toolResult && toolResult.body && typeof toolResult.body.answer === 'string' ? toolResult.body.answer : '';
    if (!toolText) return null;
    const second = await post({
      model: config.model, store: false, max_output_tokens: 400,
      instructions: modelInstructions(),
      input: [...input,
        { type: 'function_call', name: 'estimate_ride', call_id: call.call_id, arguments: call.arguments || '{}' },
        { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ note: toolText }) }]
    });
    if (!second) return null;
    const text = extractModelText(second);
    return guardrailOk(text, allowedFigures(state)) ? { answer: text } : null;
  }

  const fresh = toolResult.body.estimate;
  const second = await post({
    model: config.model, store: false, max_output_tokens: 400,
    instructions: modelInstructions(),
    input: [...input,
      { type: 'function_call', name: 'estimate_ride', call_id: call.call_id, arguments: call.arguments || '{}' },
      { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(toolResult.body.estimate) }]
  });
  if (!second) return null;
  const text = extractModelText(second);
  if (!guardrailOk(text, allowedFigures(state, [fresh]))) return null;
  return { answer: text, estimateBody: toolResult.body, newInputs: toolResult.newInputs };
}

// Default estimate runner: the platform's own visitor-estimate
// service (live Pricing Manager settings via its settings loader).
// Lazy-required so tests can inject a stub and the module loads even
// if the fare engine moves.
function defaultEstimator() {
  const { createEstimator } = require('./visitor-estimate.cjs');
  return createEstimator({});
}

function createAssistant({ fetchImpl = fetch, env = process.env, now = Date.now, estimator = null } = {}) {
  const buckets = new Map(); // ip -> array of timestamps (ms)
  const WINDOW_MS = 10 * 60 * 1000;
  const MAX_PER_WINDOW = 20;
  let estimateService = estimator;

  function rateLimited(ip) {
    const key = String(ip || 'unknown');
    const cutoff = now() - WINDOW_MS;
    const hits = (buckets.get(key) || []).filter(t => t > cutoff);
    if (hits.length >= MAX_PER_WINDOW) { buckets.set(key, hits); return true; }
    hits.push(now());
    buckets.set(key, hits);
    return false;
  }

  // Price the stored trip with some fields changed, reusing the
  // stored road miles — no new measuring is needed or done.
  async function runEstimateOnStored(state, changes, ip) {
    if (!estimateService) estimateService = defaultEstimator();
    const inputs = { ...state.lastEstimate.inputs, ...changes };
    const result = await estimateService.estimate({
      pickup: inputs.pickup,
      dropoff: inputs.dropoff,
      service: inputs.service,
      tripType: inputs.tripType,
      date: inputs.date,
      time: inputs.time,
      loadedMiles: inputs.loadedMiles,
      returnMiles: inputs.returnMiles,
      durationMinutes: inputs.durationMinutes,
      pickupState: inputs.pickupState,
      dropoffState: inputs.dropoffState,
      pickupLat: inputs.pickupLat,
      pickupLng: inputs.pickupLng,
      dropoffLat: inputs.dropoffLat,
      dropoffLng: inputs.dropoffLng
    }, ip);
    return { result, inputs };
  }

  // Layer 1: deterministic follow-ups over the stored trip.
  async function followUpAnswer(followUp, state, ip) {
    const stored = state.lastEstimate;
    if (followUp.kind === 'reset') {
      return {
        status: 200,
        body: {
          answer: 'Of course — let\u2019s start fresh. Tell me the pickup and drop-off for the new trip and I\u2019ll work out a rough estimate, or ask me anything about our services.',
          sources: [], mode: 'followup-reset', state: { lastEstimate: null }
        }
      };
    }
    if (followUp.kind === 'address') {
      const whichLabel = followUp.which === 'pickup' ? 'pickup' : followUp.which === 'dropoff' ? 'drop-off' : null;
      const answer = followUp.address
        ? `Sure — I\u2019ll use ${followUp.address} as the new ${whichLabel || 'address'} and re-price the same trip with everything else unchanged. One moment\u2026`
        : whichLabel
          ? `Sure — what\u2019s the new ${whichLabel} address? A street address with city and state works, or a place name like \u201cCostco in Germantown\u201d. Everything else about the trip stays the same.`
          : 'Sure — is the new address the pickup or the drop-off? Tell me which one, with the address — for example, \u201cpickup, 123 Main Street, Clarksburg, MD\u201d — and I\u2019ll re-price the same trip with everything else unchanged.';
      return {
        status: 200,
        body: {
          answer, sources: [], mode: 'followup-address',
          followup: { kind: 'address', which: followUp.which || null, address: followUp.address || null },
          state
        }
      };
    }
    // kind === 'reprice'
    const changes = followUp.changes;
    const noop = Object.entries(changes).every(([k, v]) => stored.inputs[k] === v);
    if (noop) {
      const label = stored.result.serviceLabel || stored.inputs.service;
      const tripWord = stored.inputs.tripType === 'ROUND_TRIP' ? 'round trip' : 'one way';
      return {
        status: 200,
        body: {
          answer: `That\u2019s the trip I already priced — the same ${label} ride, ${tripWord} — and the rough estimate is unchanged at about $${stored.result.displayTotal}. For the exact quote, book at ${CONTACT.bookingUrl} or call ${CONTACT.mainPhoneDisplay}.`,
          sources: [], mode: 'followup-estimate', estimate: stored.result, state
        }
      };
    }
    const { result, inputs } = await runEstimateOnStored(state, changes, ip);
    if (result.status === 429) return result;
    if (result.status !== 200 || !result.body || result.body.mode !== 'estimate') {
      if (result.body && result.body.mode === 'out_of_area') {
        return { status: 200, body: { answer: result.body.answer, sources: [], mode: 'followup-estimate', state } };
      }
      return {
        status: 200,
        body: {
          answer: `I couldn\u2019t re-price that change just now. Your earlier estimate still stands — or call ${CONTACT.mainPhoneDisplay} and the team will quote the change exactly.`,
          sources: [], mode: 'followup-estimate', state
        }
      };
    }
    const lead = describeChanges(changes, (key) => (SERVICE_TYPES[key] && SERVICE_TYPES[key].label) || key);
    const newState = { lastEstimate: { inputs, result: result.body.estimate } };
    return {
      status: 200,
      body: {
        answer: lead + '\n\n' + result.body.answer,
        sources: [], mode: 'followup-estimate', estimate: result.body.estimate, state: newState
      }
    };
  }

  async function ask(question, ip, context = {}) {
    if (rateLimited(ip)) {
      return { status: 429, body: { error: 'Too many questions in a short time. Please wait a moment, or call us at ' + CONTACT.mainPhoneDisplay + '.' } };
    }
    const clean = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!clean) return { status: 400, body: { error: 'Please type a question.' } };

    const state = sanitizeState(context && context.state);
    const history = sanitizeHistory(context && context.history);

    const lowered = ' ' + normalize(clean) + ' ';
    if (EMERGENCY_SIGNALS.some(s => lowered.includes(' ' + s) || lowered.includes(s + ' ') || lowered.includes(s + '?'))) {
      return { status: 200, body: { answer: EMERGENCY_ANSWER, sources: ['emergency'], mode: 'safety', state } };
    }

    // Layer 1 — deterministic follow-ups over the stored trip.
    const followUp = detectFollowUp(clean, state, now());
    if (followUp) {
      try {
        return await followUpAnswer(followUp, state, ip);
      } catch { /* fall through to the composed answer */ }
    }

    const composed = composeAnswer(clean);
    let answer = composed.answer;
    let mode = composed.mode;
    let estimateBody = null;
    let modelInputs = null;
    // Only phrase confident retrieval hits (or any question with a
    // trip in context) with the model; fallbacks and safety answers
    // always stay in our own words when there is nothing to ground on.
    if ((mode === 'composed' && composed.sources.length) || state.lastEstimate) {
      try {
        const out = await converseWithModel({
          fetchImpl, env, question: clean, history, state, composed,
          runEstimate: async (args) => {
            const changes = {};
            const svc = SERVICE_TYPES[args && args.service] ? args.service : null;
            if (svc) changes.service = svc;
            if (args && (args.tripType === 'ONE_WAY' || args.tripType === 'ROUND_TRIP')) changes.tripType = args.tripType;
            if (args && typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date)) changes.date = args.date;
            if (args && typeof args.time === 'string' && /^\d{2}:\d{2}$/.test(args.time)) changes.time = args.time;
            if (!Object.keys(changes).length) return { status: 400, body: { mode: 'needs_input' } };
            const { result, inputs } = await runEstimateOnStored(state, changes, ip);
            return { ...result, newInputs: inputs };
          }
        });
        if (out && out.answer) {
          answer = out.answer;
          mode = out.estimateBody ? 'model-estimate' : 'model';
          if (out.estimateBody) { estimateBody = out.estimateBody; modelInputs = out.newInputs; }
        }
      } catch { /* provider failure -> composed answer stands */ }
    }
    const asksForDetails = /(my name|i am|i'm|my phone|my address|book me|pick me up)/i.test(clean);
    if (asksForDetails) answer += '\n\n' + PRIVACY_NOTE;
    const body = { answer, sources: composed.sources, mode, state };
    if (estimateBody) {
      body.estimate = estimateBody.estimate;
      body.state = { lastEstimate: { inputs: modelInputs, result: estimateBody.estimate } };
    }
    return { status: 200, body };
  }

  return { ask, aiConnected: Boolean(aiConfig(env).key && aiConfig(env).model) };
}

module.exports = { createAssistant, composeAnswer, retrieve, guardrailOk, EMERGENCY_ANSWER, FALLBACK_ANSWER };
