'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate, loadApproved } = require('../netlify/functions/_shared/nex-reviewed-knowledge.cjs');
const baseline = require('../netlify/functions/_shared/visitor-knowledge.cjs');
const good = {
  id:'web-1234567890abcdef', topic:'Website FAQ', review_status:'approved',
  questions:['Do you provide wheelchair transportation?'], keywords:[],
  answer:'Yes, Nexus offers planned wheelchair transportation. Contact the Nexus team to confirm individual trip arrangements.',
  source:'wheelchair-transportation.html', approved_by:'Nexus reviewer',
  approved_at:'2026-11-03T15:00:00Z'
};
test('reviewed knowledge is opt-in and existing answers remain available', () => {
  assert.equal(Array.isArray(loadApproved()), true);
  assert.ok(baseline.ENTRIES.some(e => e.id === 'wheelchair'));
  assert.equal(validate({...good,review_status:'pending'}),false);
  assert.equal(validate(good),true);
});
test('reject unreviewed pages, prices, outside domains, and private phone numbers', () => {
  assert.equal(validate({...good,source:'admin.html'}),false);
  assert.equal(validate({...good,answer:'A trip is $100 dollars.'}),false);
  assert.equal(validate({...good,answer:'Go to https://external.example.com for your transportation information.'}),false);
  assert.equal(validate({...good,answer:'Please call 301-555-0199 to arrange transportation.'}),false);
});
test('the Ask Nex page uses public assistant and includes user transparency', () => {
  const page=fs.readFileSync(path.join(__dirname,'../ask-nex.html'),'utf8');
  assert.match(page,/\.netlify\/functions\/visitor-assistant/);
  assert.match(page,/URLSearchParams\(location.search\)\.get\('message'\)/);
  assert.match(page,/How Nex answers/);
  assert.match(page,/Do not enter patient names/);
  assert.match(page,/textContent=typeof data.answer/);
});

test('Nex responds naturally to greetings without inventing website facts', async () => {
  const { createAssistant } = require('../netlify/functions/_shared/visitor-assistant-core.cjs');
  const assistant = createAssistant({ env: {} });
  for (const greeting of ['Hi', 'Hello!', 'Hey Nex', 'Good morning', 'Hi there']) {
    const result = await assistant.ask(greeting, 'greeting-test-' + greeting);
    assert.equal(result.status, 200);
    assert.equal(result.body.mode, 'greeting', greeting);
    assert.match(result.body.answer, /Hi!.*Nex/);
    assert.doesNotMatch(result.body.answer, /don't have that/i);
  }
  const thanks = await assistant.ask('Thank you', 'courtesy-test');
  assert.equal(thanks.body.mode, 'courtesy');
  const service = await assistant.ask('Hi, do you offer wheelchair transportation?', 'service-test');
  assert.notEqual(service.body.mode, 'greeting', 'greetings must not intercept service questions');
});
