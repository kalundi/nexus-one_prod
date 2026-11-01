'use strict';
/*
 * Nexus Medical Transit — visitor assistant core.
 *
 * Answers visitor questions ONLY from the website knowledge base
 * (visitor-knowledge.cjs). Two modes:
 *  - Default (no credentials): retrieval + composed answers. Fully
 *    functional; nothing here pretends to be an AI model.
 *  - Optional upgrade: when an OpenAI-compatible key/model are present in
 *    the environment (VISITOR_ASSISTANT_API_KEY / VISITOR_ASSISTANT_MODEL,
 *    falling back to the platform's OPENAI_API_KEY / OPENAI_MODEL, the same
 *    pattern as _shared/maintenance.cjs), the retrieved entries are handed
 *    to the model to phrase the reply. The model output is discarded if it
 *    states a price or a phone number that is not in the knowledge base,
 *    and any provider failure falls back to the composed answer.
 *
 * Safety rules enforced here, before any retrieval or phrasing:
 *  - Emergency signals -> "call 911" immediately.
 *  - Price questions -> the pricing entry only; never an invented figure.
 *  - The assistant never asks for or stores personal/medical details.
 *  - Per-IP rate limiting (in-memory, per function instance).
 */

const { CONTACT, ENTRIES } = require('./visitor-knowledge.cjs');

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

// US states outside the Maryland / Washington, DC / Northern Virginia
// coverage. A "do you serve X?" question naming one gets an explicit,
// honest no (built from the areas-overview entry) instead of a vague reply.
const NON_COVERAGE_STATES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri',
  'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
  'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'west virginia', 'wisconsin',
  'wyoming'
];

const SERVICE_ENTRY_IDS = [
  'wheelchair', 'stretcher', 'bariatric', 'ambulance', 'dialysis',
  'hospital-discharge', 'medical-shuttle', 'ambulatory'
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2019]/g, "'")
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

function detectNonCoverageState(question) {
  const text = ' ' + normalize(question) + ' ';
  for (const state of NON_COVERAGE_STATES) {
    if (text.includes(' ' + state + ' ') || text.includes(' ' + state + '?')) return state;
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

  // Place outside coverage: an explicit, honest no.
  const outsideState = detectNonCoverageState(question);
  if (outsideState && /(serve|cover|go to|travel to|operate)/.test(text)) {
    const name = outsideState.replace(/\b\w/g, c => c.toUpperCase());
    const answer =
      `No — Nexus doesn\u2019t serve ${name}. Our coverage is Maryland, Washington, DC, and Northern Virginia. ` +
      entryById('areas-overview').answer.split('. ').slice(1).join('. ') + ' ' + BOOKING_CTA;
    return { answer, sources: ['areas-overview'], mode: 'composed' };
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
function guardrailOk(text) {
  if (!text) return false;
  // Reject any dollar figure or percentage discount — the site publishes none.
  if (/\$\s?\d|\d\s?%/.test(text)) return false;
  // Reject any phone-shaped digit sequence that is not a public number.
  const phoneLike = text.match(/(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}|\d{7,}/g) || [];
  for (const candidate of phoneLike) {
    const digits = candidate.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!ALLOWED_NUMBERS.includes(digits)) return false;
  }
  return true;
}

async function phraseWithModel({ fetchImpl, env, question, composed }) {
  const config = aiConfig(env);
  if (!config.key || !config.model) return null;
  const context = composed.sources.map(id => entryById(id)).filter(Boolean)
    .map(e => `## ${e.topic} — ${e.id}\n${e.answer}`).join('\n\n');
  if (!context) return null;
  const instructions =
    'You are the Nexus Medical Transit Virtual Assistant on the company website. Answer the visitor\u2019s question using ONLY the website information provided below. ' +
    'Rules: never state or estimate a price, fare, rate, or discount; never give a phone number other than (888) 639-5766, (888) 760-4990, or 911; ' +
    'never ask for or repeat personal or medical details; if the provided information does not answer the question, say so and direct the visitor to call (888) 639-5766 or book at https://mynexusride.com; ' +
    'for any medical emergency, tell them to call 911. Keep the reply under 120 words, plain and helpful.';
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal: AbortSignal.timeout(12000),
    headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.model, store: false, max_output_tokens: 400,
      instructions,
      input: `Website information:\n${context}\n\nVisitor question: ${question}`
    })
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = (data.output || []).filter(i => i.type === 'message')
    .flatMap(i => i.content || []).filter(c => c.type === 'output_text')
    .map(c => c.text).join('\n').trim().slice(0, 1600);
  return guardrailOk(text) ? text : null;
}

function createAssistant({ fetchImpl = fetch, env = process.env, now = Date.now } = {}) {
  const buckets = new Map(); // ip -> array of timestamps (ms)
  const WINDOW_MS = 10 * 60 * 1000;
  const MAX_PER_WINDOW = 20;

  function rateLimited(ip) {
    const key = String(ip || 'unknown');
    const cutoff = now() - WINDOW_MS;
    const hits = (buckets.get(key) || []).filter(t => t > cutoff);
    if (hits.length >= MAX_PER_WINDOW) { buckets.set(key, hits); return true; }
    hits.push(now());
    buckets.set(key, hits);
    return false;
  }

  async function ask(question, ip) {
    if (rateLimited(ip)) {
      return { status: 429, body: { error: 'Too many questions in a short time. Please wait a moment, or call us at ' + CONTACT.mainPhoneDisplay + '.' } };
    }
    const clean = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!clean) return { status: 400, body: { error: 'Please type a question.' } };

    const lowered = ' ' + normalize(clean) + ' ';
    if (EMERGENCY_SIGNALS.some(s => lowered.includes(' ' + s) || lowered.includes(s + ' ') || lowered.includes(s + '?'))) {
      return { status: 200, body: { answer: EMERGENCY_ANSWER, sources: ['emergency'], mode: 'safety' } };
    }

    const composed = composeAnswer(clean);
    let answer = composed.answer;
    let mode = composed.mode;
    // Only phrase confident retrieval hits with the model; fallbacks and
    // safety answers always stay in our own words.
    if (mode === 'composed' && composed.sources.length) {
      try {
        const phrased = await phraseWithModel({ fetchImpl, env, question: clean, composed });
        if (phrased) { answer = phrased; mode = 'model'; }
      } catch { /* provider failure -> composed answer stands */ }
    }
    const asksForDetails = /(my name|i am|i'm|my phone|my address|book me|pick me up)/i.test(clean);
    if (asksForDetails) answer += '\n\n' + PRIVACY_NOTE;
    return { status: 200, body: { answer, sources: composed.sources, mode } };
  }

  return { ask, aiConnected: Boolean(aiConfig(env).key && aiConfig(env).model) };
}

module.exports = { createAssistant, composeAnswer, retrieve, guardrailOk, EMERGENCY_ANSWER, FALLBACK_ANSWER };
