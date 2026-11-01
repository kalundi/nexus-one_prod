'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAssistant, guardrailOk } = require('../netlify/functions/_shared/visitor-assistant-core.cjs');

const noFetch = async () => { throw new Error('network disabled in tests'); };

test('answers a service + area question from the knowledge base', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { status, body } = await assistant.ask('Do you offer wheelchair transport in Annapolis?', '10.0.0.1');
  assert.equal(status, 200);
  assert.match(body.answer, /wheelchair/i);
  assert.match(body.answer, /Anne Arundel|Annapolis/i);
  assert.ok(body.sources.includes('wheelchair'));
});

test('answers hours from the site footer copy', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('What are your hours?', '10.0.0.1');
  assert.match(body.answer, /7 AM/);
  assert.match(body.answer, /7 PM/);
});

test('price questions never produce a figure and route to booking/call', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('How much does a ride cost?', '10.0.0.1');
  assert.ok(!/\$\s?\d/.test(body.answer), 'must not contain a dollar figure');
  assert.match(body.answer, /mynexusride\.com/);
  assert.match(body.answer, /\(888\) 639-5766/);
});

test('emergency language short-circuits to 911', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('I need an ambulance right now, someone is hurt', '10.0.0.1');
  assert.match(body.answer, /call 911/i);
  assert.equal(body.mode, 'safety');
});

test('out-of-area Alaska gets an honest no, never an invented yes', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Do you serve Alaska?', '10.0.0.1');
  assert.match(body.answer, /Alaska is outside the area Nexus covers/);
  assert.match(body.answer, /48 contiguous states/);
  assert.ok(!/^yes/i.test(body.answer.trim()));
  assert.ok(!/mynexusride\.com/.test(body.answer), 'a no must not imply the trip is bookable online');
  assert.ok(body.sources.includes('area-outside'));
});

test('Hawaii gets the same honest no', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Do you go to Hawaii?', '10.0.0.1');
  assert.match(body.answer, /Hawaii is outside the area Nexus covers/);
  assert.ok(body.sources.includes('area-outside'));
});

test('"can I book a ride to Kansas" gets a yes — inter-state coverage, answered in chat', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('can I book a ride to Kansas', '10.0.0.5');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('long-distance'));
  assert.match(body.answer, /^Yes — Kansas is within Nexus\u2019s coverage\./);
  assert.match(body.answer, /inter-state/i);
  assert.match(body.answer, /48 contiguous states/);
  assert.match(body.answer, /scheduled in advance/);
  // The booking step is the closing actualization, not the answer itself.
  assert.ok(body.answer.trimEnd().endsWith('You can book online at https://mynexusride.com or call (888) 639-5766.'));
  assert.ok(!/\$\s?\d/.test(body.answer), 'must not contain a dollar figure');
});

test('a Maryland to Florida ride gets the inter-state yes', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Can I get a ride from Maryland to Florida?', '10.0.0.5');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('long-distance'));
  assert.match(body.answer, /^Yes — Florida is within Nexus\u2019s coverage\./);
  assert.match(body.answer, /inter-state/i);
});

test('coverage answer is two-tier: local region first, then the other 46 states', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('What areas do you serve?', '10.0.0.5');
  assert.ok(body.sources.includes('areas-overview'));
  const localAt = body.answer.indexOf('Maryland, Washington, DC, and Northern Virginia');
  const restAt = body.answer.indexOf('rest of the 48 contiguous states');
  assert.ok(localAt >= 0, 'local region is named');
  assert.ok(restAt > localAt, 'the rest of the 48 states is stated after the local region');
  assert.match(body.answer, /inter-state/);
  assert.match(body.answer, /Alaska, Hawaii/);
});

test('early-morning procedure pickup gets a yes with advance booking', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('my surgery check-in is at 5:30 AM, can you pick me up early?', '10.0.0.6');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('early-morning'));
  assert.match(body.answer, /^Yes/);
  assert.match(body.answer, /scheduled in advance/);
  assert.match(body.answer, /7 AM\u20137 PM/);
  assert.ok(!/\$\s?\d/.test(body.answer), 'must not contain a dollar figure');
});

test('only public phone numbers ever appear in composed answers', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  for (const q of ['What services do you offer?', 'How do I contact you?', 'Do you serve Fairfax?', 'Can a facility book recurring transfers?']) {
    const { body } = await assistant.ask(q, '10.0.0.2');
    assert.ok(!/240[-.\s]?394|202[-.\s]?(315|270)/.test(body.answer), q);
  }
});

test('estimate + availability question answers both halves, with no figure', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Can I get an estimate and check availability?', '10.0.0.4');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('pricing'));
  assert.ok(body.sources.includes('availability'));
  assert.match(body.answer, /depends on the trip/);
  assert.match(body.answer, /estimate for your specific trip/);
  assert.match(body.answer, /confirmed for your specific trip/);
  assert.ok(!/\$\s?\d/.test(body.answer), 'must not contain a dollar figure');
});

test('"are you available" gets the substantive availability answer, never a live claim', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('are you available', '10.0.0.4');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('availability'));
  assert.match(body.answer, /can\u2019t check live availability/);
  assert.match(body.answer, /Monday\u2013Friday, 7 AM\u20137 PM/);
  assert.match(body.answer, /mynexusride\.com/);
  assert.match(body.answer, /\(888\) 639-5766/);
});

test('combined cost + availability question answers both parts', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('How much does a ride cost and are you available this Friday?', '10.0.0.4');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('pricing'));
  assert.ok(body.sources.includes('availability'));
  assert.match(body.answer, /price of a trip depends on the trip itself/);
  assert.match(body.answer, /confirmed for your specific trip/);
  assert.ok(!/\$\s?\d/.test(body.answer), 'must not contain a dollar figure');
});

test('openings question routes to availability', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Do you have any openings this weekend?', '10.0.0.4');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('availability'));
});

test("Anthony's cost prompt chip is treated as pricing intent and closes with the booking CTA", async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Do you want to know what your ride would cost?', '10.0.0.4');
  assert.notEqual(body.mode, 'fallback');
  assert.ok(body.sources.includes('pricing'));
  assert.match(body.answer, /depends on the trip itself/);
  assert.ok(body.answer.trimEnd().endsWith('You can book online at https://mynexusride.com or call (888) 639-5766.'));
  assert.ok(!/\$\s?\d/.test(body.answer), 'must not contain a dollar figure');
});

test('opening hours stays an hours answer, not availability', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('What are your opening hours?', '10.0.0.4');
  assert.ok(body.sources.includes('hours'));
  assert.ok(!body.sources.includes('availability'));
  assert.match(body.answer, /7 AM/);
});

test('Annapolis coverage answer is unchanged', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Do you serve Annapolis?', '10.0.0.4');
  assert.ok(body.sources.includes('area-annapolis'));
  assert.match(body.answer, /serves Annapolis and Anne Arundel County/);
});

test('rate limit trips after 20 questions per IP per window', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {}, now: () => 1000000 });
  let last;
  for (let i = 0; i < 21; i++) last = await assistant.ask('What are your hours?', '10.9.9.9');
  assert.equal(last.status, 429);
});

test('guardrail rejects prices and foreign phone numbers from model output', () => {
  assert.equal(guardrailOk('A ride costs $85 flat.'), false);
  assert.equal(guardrailOk('Call us at 301-555-0134 for details.'), false);
  assert.equal(guardrailOk('Call us at (888) 639-5766 for details.'), true);
  assert.equal(guardrailOk('Yes, we serve Montgomery County.'), true);
});

test('no knowledge entry is a bare redirect — substance comes before any booking/call closing', () => {
  const { ENTRIES, CONTACT } = require('../netlify/functions/_shared/visitor-knowledge.cjs');
  for (const entry of ENTRIES) {
    const a = entry.answer;
    assert.ok(a.length >= 160, `${entry.id}: answer too short to be substantive (${a.length} chars)`);
    assert.ok(!/^(book online|call \(|you can book online)/i.test(a.trim()), `${entry.id}: opens with a redirect`);
    const sentences = a.split(/(?<=\.)\s+/);
    assert.ok(!sentences[0].includes(CONTACT.bookingUrl), `${entry.id}: first sentence is a booking redirect`);
    const urlAt = a.indexOf(CONTACT.bookingUrl);
    if (urlAt >= 0) {
      assert.ok(urlAt > a.length * 0.55, `${entry.id}: booking link arrives before the substance (${urlAt}/${a.length})`);
    }
    // Remove a trailing actualization sentence (booking link or call
    // invitation); what remains must still be a substantive answer.
    const body = [...sentences];
    while (body.length > 1) {
      const last = body[body.length - 1];
      if (last.includes(CONTACT.bookingUrl) || /call \(888\)/.test(last)) body.pop();
      else break;
    }
    assert.ok(body.join(' ').length >= 100, `${entry.id}: body too thin once the closing is removed`);
  }
});

test('widget shows a thinking state and hides suggestion chips once a question is asked', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  // Thinking beat: typing avatar + "Nex is thinking…", skipped for
  // reduced-motion visitors.
  assert.match(src, /Nex is thinking/);
  assert.match(src, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  // Chips hide after a question; a "What else can I ask?" affordance
  // brings them back.
  assert.match(src, /suggestionsHidden/);
  assert.match(src, /What else can I ask\?/);
});

test('model phrasing is used when configured, guardrail falls back when it misbehaves', async () => {
  const goodFetch = async () => ({
    ok: true,
    json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Yes — Nexus offers wheelchair transportation, including in Anne Arundel County.' }] }] })
  });
  const env = { VISITOR_ASSISTANT_API_KEY: 'test-key', VISITOR_ASSISTANT_MODEL: 'test-model' };
  const a1 = createAssistant({ fetchImpl: goodFetch, env });
  const r1 = await a1.ask('Do you offer wheelchair transport in Annapolis?', '10.0.0.3');
  assert.equal(r1.body.mode, 'model');

  const badFetch = async () => ({
    ok: true,
    json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'It costs $120 per trip.' }] }] })
  });
  const a2 = createAssistant({ fetchImpl: badFetch, env });
  const r2 = await a2.ask('Do you offer wheelchair transport in Annapolis?', '10.0.0.3');
  assert.equal(r2.body.mode, 'composed');
  assert.ok(!/\$\s?\d/.test(r2.body.answer));
});

test('panel booking buttons share ONE sign style (bottom CTA and estimate action)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  // Both booking-app buttons carry the shared class.
  assert.match(src, /class="nvaBook nvaBookBtn"/, 'bottom CTA must use the shared .nvaBookBtn class');
  assert.match(src, /class="nvaEstBook nvaBookBtn"/, 'estimate action must use the shared .nvaBookBtn class');
  // The old divergent bright-red gradient is gone entirely.
  assert.ok(!src.includes('#db2839') && !src.includes('#b91c2c'), 'divergent bright gradient must not remain');
  // No per-button sign overrides remain that could drift apart again.
  assert.ok(!src.includes('.nvaCtas a.nvaBook.bookRideSign'), 'per-button CTA sign override must be gone');
  assert.ok(!src.includes('a.nvaEstBook.bookRideSign'), 'per-button estimate sign override must be gone');
  // Exactly one shared base rule and one shared sign-tagged override,
  // both carrying the identical compact sign values.
  const baseRules = src.match(/\.nvaPanel \.nvaBookBtn\{[^']*/g) || [];
  const signRules = src.match(/\.nvaPanel a\.nvaBookBtn\.bookRideSign\{[^']*/g) || [];
  assert.equal(baseRules.length, 1, 'exactly one shared .nvaBookBtn base rule');
  assert.equal(signRules.length, 1, 'exactly one shared .nvaBookBtn sign override');
  for (const rule of [baseRules[0], signRules[0]]) {
    assert.match(rule, /radial-gradient\(130% 95% at 50% 0,#9f0f0f 0,#7f0707 52%,#690505 100%\)/, 'sign radial gradient');
    assert.match(rule, /border:2px solid #cf1f1f/, 'sign border');
    assert.match(rule, /border-radius:20px/, 'sign radius');
    assert.match(rule, /min-height:42px/, 'compact height');
    assert.match(rule, /text-transform:uppercase/, 'uppercase');
    assert.match(rule, /font-weight:900/, 'Manrope 900 weight');
    assert.match(rule, /letter-spacing:\.02em/, 'sign letter spacing');
  }
});

test('estimate flow resolves place names with Places before measuring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  // The Maps loader pulls in the Places library on the same key.
  assert.match(src, /libraries=places/, 'maps loader must request the places library');
  // Resolution goes through a Places text search biased to the region.
  assert.match(src, /maps\.places\.PlacesService/, 'place resolution must use PlacesService');
  assert.match(src, /\.textSearch\(/, 'place resolution must use a Places text search');
  assert.match(src, /REGION_BIAS/, 'the search must be biased to the MD/DC/VA region');
  // The prompts invite place names, not only street addresses.
  assert.match(src, /Costco in Germantown/, 'pickup prompt must invite place names');
});

test('place resolution branches: single match echoes, several become chips, none re-asks', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  // Single confident match: accepted and echoed back by name.
  assert.match(src, /function acceptPlace\(/, 'a resolved place is accepted through one path');
  assert.match(src, /Got it \\u2014 /, 'the resolved place is echoed back to the visitor');
  assert.match(src, /placeDisplay/, 'the echo uses the place name + locality');
  // Several plausible matches: a choice step with tappable chips.
  assert.match(src, /placePickup/, 'pickup matches get a choice step');
  assert.match(src, /placeDropoff/, 'drop-off matches get a choice step');
  assert.match(src, /I found a few places matching/, 'the visitor is told why chips appeared');
  assert.match(src, /flow\.placeOptions/, 'choice chips render from the stored matches');
  // No match: re-ask for a street address or a more specific name.
  assert.match(src, /couldn\\u2019t find a place matching/, 'no match re-asks');
  assert.match(src, /more specific place name/, 'the re-ask suggests a more specific name');
});

test('street addresses skip Places and keep the raw-entry path', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  assert.match(src, /function looksLikeStreetAddress\(/, 'an address detector gates Places');
  assert.match(src, /function acceptRawAddress\(/, 'raw entries keep the original accept path');
  assert.match(src, /if \(looksLikeStreetAddress\(q\)\) \{ acceptRawAddress\(which, q\); return; \}/,
    'the pickup/drop-off steps route street addresses around Places');
});

test('a successful estimate renders a route map with the live traffic layer', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  // The route request asks for a leave-now drive time in traffic.
  assert.match(src, /drivingOptions/, 'directions must request traffic-aware timing');
  assert.match(src, /duration_in_traffic/, 'the traffic drive time is read from the route');
  // After the estimate, a map block renders route + traffic + label.
  assert.match(src, /renderRouteMap\(flow && flow\.route\)/, 'the estimate success path renders the map');
  assert.match(src, /new maps\.DirectionsRenderer\(/, 'the route is drawn with DirectionsRenderer');
  assert.match(src, /maps\.TrafficLayer/, 'the live traffic layer is enabled');
  assert.match(src, /in current traffic/, 'the drive-time line is labeled in plain language');
  assert.match(src, /\.nvaMap\{width:100%;height:210px/, 'the map block is compact and panel-wide');
  assert.match(src, /\.nvaMapWrap\{flex:none/, 'the map block must not be flex-shrunk inside the scrolling log');
  // Degradation is silent: a failed map leaves the text estimate.
  assert.match(src, /the text-only estimate stands/, 'map failure must not surface an error state');
});

test('the panel is a full-height drawer, not a floating card', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  const panelRule = (src.match(/\.nvaPanel\{[^']*/) || [''])[0];
  assert.match(panelRule, /top:0/, 'panel anchors to the top of the viewport');
  assert.match(panelRule, /height:100dvh/, 'panel spans the full viewable height');
  assert.ok(!src.includes('height:min(640px'), 'the old floating-card height cap is gone');
  assert.match(src, /\.nvaPanel\.open\{transform:translate\(0,0\)/, 'the open state no longer centers vertically');
});

// ---------------------------------------------------------------
// Behavioral place-resolution tests: the widget script runs in a
// vm against a fake DOM and a stubbed google.maps (loadMaps
// short-circuits when window.google.maps already exists), so the
// resolution branches execute end to end with no network/browser.
const vm = require('node:vm');

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function makeFakeElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [],
    parent: null,
    listeners: {},
    attributes: {},
    style: {},
    value: '',
    disabled: false,
    type: '',
    src: '',
    id: '',
    scrollTop: 0,
    scrollHeight: 0,
    _classes: new Set(),
    _html: '',
    _text: null,
    _bySelector: {},
  };
  Object.defineProperty(el, 'className', {
    get() { return Array.from(el._classes).join(' '); },
    set(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); el.children = []; el._bySelector = {}; },
  });
  Object.defineProperty(el, 'textContent', {
    get() { return el._text != null ? el._text : stripTags(el._html); },
    set(v) { el._text = String(v); },
  });
  el.classList = {
    add(...cs) { cs.forEach((c) => el._classes.add(c)); },
    remove(...cs) { cs.forEach((c) => el._classes.delete(c)); },
    toggle(c, force) {
      const on = force === undefined ? !el._classes.has(c) : Boolean(force);
      if (on) el._classes.add(c); else el._classes.delete(c);
      return on;
    },
    contains(c) { return el._classes.has(c); },
  };
  el.setAttribute = (k, v) => { el.attributes[k] = String(v); };
  el.getAttribute = (k) => (k in el.attributes ? el.attributes[k] : null);
  el.appendChild = (child) => { child.parent = el; el.children.push(child); return child; };
  el.remove = () => {
    if (el.parent) {
      const i = el.parent.children.indexOf(el);
      if (i !== -1) el.parent.children.splice(i, 1);
      el.parent = null;
    }
  };
  el.addEventListener = (type, fn) => { (el.listeners[type] = el.listeners[type] || []).push(fn); };
  el.dispatch = (type, ev) => { (el.listeners[type] || []).slice().forEach((fn) => fn(ev || { preventDefault() {} })); };
  el.click = () => el.dispatch('click', {});
  el.focus = () => {};
  el.querySelector = (sel) => {
    if (el._bySelector[sel]) return el._bySelector[sel];
    let found = null;
    if (sel[0] === '#') {
      if (el._html.includes('id="' + sel.slice(1) + '"')) found = makeFakeElement('div');
    } else if (sel[0] === '.') {
      if (new RegExp('class="[^"]*\\b' + sel.slice(1) + '\\b').test(el._html)) found = makeFakeElement('button');
    }
    if (found) el._bySelector[sel] = found;
    return found;
  };
  return el;
}

function makeMapsStub(placesHandler, placesCalls) {
  function PlacesService() {}
  PlacesService.prototype.textSearch = function (req, cb) {
    placesCalls.push(req.query);
    placesHandler(req.query, cb);
  };
  function Geocoder() {}
  Geocoder.prototype.geocode = function (req, cb) {
    cb([{
      formatted_address: req.address,
      address_components: [{ types: ['administrative_area_level_1'], short_name: 'MD' }],
      geometry: { location: { lat: () => 39.1, lng: () => -77.2 } },
    }], 'OK');
  };
  function DirectionsService() {}
  DirectionsService.prototype.route = function (req, cb) {
    cb({ routes: [{ legs: [{ distance: { value: 16093.44 }, duration: { value: 1500 }, duration_in_traffic: { value: 1800 } }] }] }, 'OK');
  };
  function LatLng(lat, lng) { this.lat = lat; this.lng = lng; }
  function MapCtor() {}
  function DirectionsRenderer() {}
  DirectionsRenderer.prototype.setDirections = function () {};
  function TrafficLayer() {}
  TrafficLayer.prototype.setMap = function () {};
  return {
    DirectionsService, Geocoder, LatLng,
    TravelMode: { DRIVING: 'DRIVING' },
    Map: MapCtor, DirectionsRenderer, TrafficLayer,
    places: { PlacesService, PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' } },
  };
}

function loadWidget(placesHandler) {
  const placesCalls = [];
  const maps = makeMapsStub(placesHandler, placesCalls);
  const documentStub = {
    head: makeFakeElement('head'),
    body: makeFakeElement('body'),
    createElement: (tag) => makeFakeElement(tag),
    addEventListener: () => {},
  };
  const windowStub = {
    google: { maps },
    matchMedia: () => ({ matches: true }), // reduced motion: no thinking-state delay
  };
  const estimateCalls = [];
  const fetchStub = (url, opts) => {
    if (String(url).includes('visitor-estimate')) {
      estimateCalls.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: async () => ({ mode: 'estimate', answer: 'Your rough estimate is about $120.' }) });
    }
    return Promise.reject(new Error('unexpected fetch ' + url));
  };
  const sandbox = { window: windowStub, document: documentStub, fetch: fetchStub, setTimeout, clearTimeout, console };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'visitor-assistant.js' });
  const tab = documentStub.body.children.find((c) => c.classList.contains('nvaTab'));
  const panel = documentStub.body.children.find((c) => c.classList.contains('nvaPanel'));
  const log = panel.querySelector('#nvaLog');
  const chips = panel.querySelector('#nvaChips');
  const form = panel.querySelector('#nvaForm');
  const input = panel.querySelector('#nvaInput');
  const widget = {
    placesCalls,
    estimateCalls,
    open() { tab.click(); },
    send(text) { input.value = text; form.dispatch('submit'); },
    logText() { return log.children.map((c) => stripTags(c.innerHTML)).join('\n'); },
    chipLabels() { return chips.children.map((c) => c.textContent); },
    clickChip(label) {
      const chip = chips.children.find((c) => c.textContent === label);
      assert.ok(chip, 'chip not found: ' + label + ' (have: ' + widget.chipLabels().join(' | ') + ')');
      chip.click();
    },
  };
  return widget;
}

async function flush(rounds = 16) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}

test('place fallback: "Costco in Germantown" offers the Gaithersburg store as an honest choice, and picking it proceeds to measuring', async () => {
  // The real-world case: the store locals call the Germantown
  // Costco is in Gaithersburg, so "germantown" appears in neither
  // its name nor its address and the strict every-token filter
  // matches nothing — while Places itself returns the store.
  const gaithersburg = {
    name: 'Costco Wholesale',
    formatted_address: '880 Russell Ave, Gaithersburg, MD 20879, USA',
    geometry: { location: { lat: () => 39.161, lng: () => -77.226 } },
  };
  const w = loadWidget((query, cb) => {
    if (/costco/i.test(query)) cb([gaithersburg], 'OK');
    else cb([], 'ZERO_RESULTS');
  });
  w.open();
  w.send('How much does a ride cost?');
  w.send('100 Main Street, Clarksburg, MD'); // street address: raw path
  w.send('Costco in Germantown');
  await flush();
  assert.ok(w.placesCalls.includes('Costco in Germantown'), 'the drop-off went through Places');
  assert.match(w.logText(), /couldn\u2019t find a place with that exact name nearby \u2014 did you mean one of these\?/,
    'the fallback line admits the exact name was not found');
  assert.ok(!/Got it \u2014 drop-off/.test(w.logText()), 'a locality mismatch is never auto-accepted');
  assert.ok(w.chipLabels().includes('Costco Wholesale, Gaithersburg, MD'),
    'the Gaithersburg store is offered as a tappable chip');
  w.clickChip('Costco Wholesale, Gaithersburg, MD');
  assert.match(w.logText(), /Got it \u2014 drop-off: Costco Wholesale, Gaithersburg, MD\./,
    'picking the chip accepts the place through the usual path');
  // Finish the flow: the picked place feeds measuring unchanged.
  w.clickChip('Ambulatory');
  w.clickChip('One way');
  w.send('tomorrow at 10 AM');
  await flush();
  assert.equal(w.estimateCalls.length, 1, 'the estimate endpoint is called once');
  assert.equal(w.estimateCalls[0].dropoff, '880 Russell Ave, Gaithersburg, MD 20879, USA');
  assert.equal(w.estimateCalls[0].pickup, '100 Main Street, Clarksburg, MD');
  assert.ok(Math.abs(w.estimateCalls[0].loadedMiles - 10) < 0.01, 'road miles are measured for the picked place');
  assert.match(w.logText(), /rough estimate is about \$120/, 'the estimate answer renders');
});

test('place resolution: zero Places results still re-asks for an address or a more specific name', async () => {
  const w = loadWidget((query, cb) => cb([], 'ZERO_RESULTS'));
  w.open();
  w.send('How much does a ride cost?');
  w.send('Zxqvville Community Hall');
  await flush();
  assert.match(w.logText(), /I couldn\u2019t find a place matching \u201cZxqvville Community Hall\u201d/);
  assert.match(w.logText(), /more specific place name/);
  assert.deepEqual(w.chipLabels(), ['Cancel estimate'], 'no place chips are offered when Places returns nothing');
  // Still on the pickup step: a street address is accepted next.
  w.send('100 Main Street, Clarksburg, MD');
  assert.match(w.logText(), /And where are you headed\?/);
});

test('place resolution: a single confident match is still accepted and echoed by name', async () => {
  const monument = {
    name: 'Washington Monument',
    formatted_address: '2 15th St NW, Washington, DC 20024, USA',
    geometry: { location: { lat: () => 38.889, lng: () => -77.035 } },
  };
  const w = loadWidget((query, cb) => cb([monument], 'OK'));
  w.open();
  w.send('How much does a ride cost?');
  w.send('the monument');
  await flush();
  assert.match(w.logText(), /Got it \u2014 pickup: Washington Monument, Washington, DC\./);
  assert.ok(!/exact name nearby/.test(w.logText()), 'a confident match never shows the mismatch line');
});

// ---------------------------------------------------------------
// Smart Nex: conversation memory + follow-ups, end to end in the
// widget. The fetch stub routes to the REAL assistant core and the
// REAL estimate service (platform default settings), so the whole
// loop — wizard, stored state, server-side re-price — executes.
// The maps stub measures 10.0 road miles / 25 minutes each way.
const { createAssistant: createAssistantCore } = require('../netlify/functions/_shared/visitor-assistant-core.cjs');
const { createEstimator: createEstimatorSvc, mergeSettings: mergeSettingsSvc } = require('../netlify/functions/_shared/visitor-estimate.cjs');

function loadSmartWidget() {
  const placesCalls = [];
  const maps = makeMapsStub((query, cb) => cb([], 'ZERO_RESULTS'), placesCalls);
  let routeCalls = 0;
  const BaseDS = maps.DirectionsService;
  maps.DirectionsService = function () {
    const inst = new BaseDS();
    const orig = inst.route.bind(inst);
    inst.route = (req, cb) => { routeCalls++; orig(req, cb); };
    return inst;
  };
  const documentStub = {
    head: makeFakeElement('head'),
    body: makeFakeElement('body'),
    createElement: (tag) => makeFakeElement(tag),
    addEventListener: () => {},
  };
  const windowStub = {
    google: { maps },
    matchMedia: () => ({ matches: true }), // reduced motion: no thinking-state delay
  };
  const widgetEstimator = createEstimatorSvc({ loadSettings: async () => mergeSettingsSvc(null) });
  const assistantCore = createAssistantCore({
    fetchImpl: noFetch, env: {},
    estimator: createEstimatorSvc({ loadSettings: async () => mergeSettingsSvc(null) })
  });
  const estimateCalls = [];
  const assistantCalls = [];
  const fetchStub = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (String(url).includes('visitor-estimate')) {
      estimateCalls.push(body);
      const res = await widgetEstimator.estimate(body, '10.7.0.1');
      return { ok: res.status === 200, json: async () => res.body };
    }
    if (String(url).includes('visitor-assistant')) {
      assistantCalls.push(body);
      const res = await assistantCore.ask(body.question, '10.7.0.2', { state: body.state, history: body.history });
      return { ok: res.status === 200, json: async () => res.body };
    }
    throw new Error('unexpected fetch ' + url);
  };
  const sandbox = { window: windowStub, document: documentStub, fetch: fetchStub, setTimeout, clearTimeout, console };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'visitor-assistant.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'visitor-assistant.js' });
  const tab = documentStub.body.children.find((c) => c.classList.contains('nvaTab'));
  const panel = documentStub.body.children.find((c) => c.classList.contains('nvaPanel'));
  const log = panel.querySelector('#nvaLog');
  const chips = panel.querySelector('#nvaChips');
  const form = panel.querySelector('#nvaForm');
  const input = panel.querySelector('#nvaInput');
  const widget = {
    estimateCalls,
    assistantCalls,
    routeCalls: () => routeCalls,
    open() { tab.click(); },
    send(text) { input.value = text; form.dispatch('submit'); },
    logText() { return log.children.map((c) => stripTags(c.innerHTML)).join('\n'); },
    chipLabels() { return chips.children.map((c) => c.textContent); },
    clickChip(label) {
      const chip = chips.children.find((c) => c.textContent === label);
      assert.ok(chip, 'chip not found: ' + label + ' (have: ' + widget.chipLabels().join(' | ') + ')');
      chip.click();
    },
  };
  return widget;
}

const SMART_TRIP = {
  pickup: '100 Main Street, Clarksburg, MD',
  dropoff: '200 Elm Street, Rockville, MD',
  date: '2027-01-06', // a Wednesday
  time: '10:00',
  loadedMiles: 10,
  durationMinutes: 25,
  pickupState: 'MD', dropoffState: 'MD',
  pickupLat: 39.1, pickupLng: -77.2, dropoffLat: 39.1, dropoffLng: -77.2
};

async function expectedTotal(overrides) {
  const est = createEstimatorSvc({ loadSettings: async () => mergeSettingsSvc(null) });
  const res = await est.estimate({ ...SMART_TRIP, service: 'ambulatory', tripType: 'ONE_WAY', ...overrides }, '10.7.0.9');
  assert.equal(res.status, 200);
  return res.body.estimate.displayTotal;
}

async function completeFirstEstimate(w) {
  w.open();
  w.send('How much does a ride cost?');
  w.send(SMART_TRIP.pickup);
  w.send(SMART_TRIP.dropoff);
  w.clickChip('Ambulatory');
  w.clickChip('One way');
  w.send('January 6, 2027 at 10 AM');
  await flush(24);
  assert.equal(w.estimateCalls.length, 1, 'the wizard priced the trip once');
}

test('smart Nex: follow-ups re-price the same trip without restarting the wizard or re-measuring', async () => {
  const w = loadSmartWidget();
  await completeFirstEstimate(w);
  const ambTotal = await expectedTotal({});
  assert.match(w.logText(), new RegExp('about \\$' + ambTotal + '\\b'), 'the first estimate renders');
  assert.equal(w.routeCalls(), 1, 'one Directions measurement for the one-way trip');

  // Anthony's scenario, verbatim: change only the ride type.
  w.send('for the same what would be the price for stretcher');
  await flush(24);
  const stretcherTotal = await expectedTotal({ service: 'stretcher' });
  assert.match(w.logText(), /Same trip as a stretcher ride \u2014 everything else unchanged\./);
  assert.match(w.logText(), new RegExp('about \\$' + stretcherTotal + '\\b'));
  assert.equal(w.estimateCalls.length, 1, 'the follow-up did NOT restart the wizard estimate path');
  assert.equal(w.routeCalls(), 1, 'the follow-up reuses the stored miles — no new Directions call');
  const swapCall = w.assistantCalls[w.assistantCalls.length - 1];
  assert.equal(swapCall.state.lastEstimate.inputs.service, 'ambulatory', 'the widget sent the stored trip with the question');
  assert.equal(swapCall.state.lastEstimate.inputs.loadedMiles, 10);

  // Flip to round trip.
  w.send('and round trip?');
  await flush(24);
  const rtTotal = await expectedTotal({ service: 'stretcher', tripType: 'ROUND_TRIP', returnMiles: 10 });
  assert.match(w.logText(), /Same trip as a round trip \u2014 everything else unchanged\./);
  assert.match(w.logText(), new RegExp('about \\$' + rtTotal + '\\b'));
  assert.equal(w.routeCalls(), 1, 'still no re-measuring');

  // A knowledge question mid-conversation answers normally.
  w.send('What are your hours?');
  await flush(24);
  assert.match(w.logText(), /7 AM/);
  assert.match(w.logText(), /7 PM/);

  // And back to one way — the stretcher price returns.
  w.send('OK back to one way');
  await flush(24);
  assert.match(w.logText(), /Same trip as a one-way trip \u2014 everything else unchanged\./);
  const totals = w.logText().match(new RegExp('about \\$' + stretcherTotal + '\\b', 'g')) || [];
  assert.ok(totals.length >= 2, 'the one-way stretcher figure is quoted again after flipping back');
  assert.equal(w.estimateCalls.length, 1, 'the wizard never restarted');
});

test('smart Nex: an address change re-enters the flow with every other detail kept', async () => {
  const w = loadSmartWidget();
  await completeFirstEstimate(w);
  w.send('change the pickup to 300 Pine Street, Bethesda, MD');
  await flush(30);
  assert.equal(w.estimateCalls.length, 2, 'the changed trip is re-measured and re-priced');
  assert.equal(w.estimateCalls[1].pickup, '300 Pine Street, Bethesda, MD');
  assert.equal(w.estimateCalls[1].dropoff, SMART_TRIP.dropoff, 'the untouched end carries over');
  assert.equal(w.estimateCalls[1].service, 'ambulatory', 'the ride type carries over');
  assert.equal(w.estimateCalls[1].date, SMART_TRIP.date, 'the date carries over');
  assert.equal(w.routeCalls(), 2, 'only the address change re-measures');
});

test('smart Nex: with no estimate yet, a follow-up-shaped message behaves as before', async () => {
  const w = loadSmartWidget();
  w.open();
  w.send('What are your hours?');
  await flush(24);
  assert.match(w.logText(), /7 AM/);
  assert.equal(w.assistantCalls.length, 1);
  assert.equal(w.assistantCalls[0].state, null, 'no state is sent before any estimate exists');
});


