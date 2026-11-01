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
