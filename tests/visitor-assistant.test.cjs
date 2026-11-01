'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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

test('unknown area gets an honest no, never an invented yes', async () => {
  const assistant = createAssistant({ fetchImpl: noFetch, env: {} });
  const { body } = await assistant.ask('Do you serve Wyoming?', '10.0.0.1');
  assert.match(body.answer, /doesn\u2019t serve Wyoming/i);
  assert.match(body.answer, /Maryland, Washington, DC, and Northern Virginia/);
  assert.ok(!/^yes/i.test(body.answer.trim()));
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
