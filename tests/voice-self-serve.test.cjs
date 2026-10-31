const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'netlify/functions/api.cjs'), 'utf8');

const helpersStart = api.indexOf('const SELF_SERVE_BOOKING_URL');
const helpersEnd = api.indexOf('function getCallerAreaCode');
const helpers = api.slice(helpersStart, helpersEnd);

test('self-serve routes and helpers exist', () => {
  assert.notEqual(helpersStart, -1, 'self-serve constants exist');
  assert.ok(api.includes("p[1]==='self-serve'"), 'self-serve menu route exists');
  assert.ok(api.includes("p[1]==='self-serve-handle'"), 'self-serve handler route exists');
  assert.ok(api.includes('function voiceSelfServeTwiml'), 'self-serve menu TwiML helper exists');
  assert.ok(api.includes('function voiceSelfServeFollowupTwiml'), 'self-serve follow-up TwiML helper exists');
});

test('self-serve is offered at both reached-no-one points', () => {
  assert.ok(api.includes("voiceRouteUrl('self-serve','source=dispatch-fallback')"), 'dispatch fallback routes to self-serve');
  assert.ok(api.includes("voiceRouteUrl('self-serve','source=after-hours')"), 'after-hours branch routes to self-serve');
});

test('self-serve menu offers text link, spoken info, and voicemail in one gather', () => {
  assert.ok(helpers.includes('<Gather input="dtmf" numDigits="1"'), 'menu is a single-digit DTMF gather');
  assert.ok(helpers.includes("voiceRouteUrl('self-serve-handle'"), 'gather posts to the self-serve handler');
  assert.ok(helpers.includes('Press 1, and I will text the booking link to this phone'), 'press 1 offers the texted booking link');
  assert.ok(helpers.includes('Press 2 to hear how booking works'), 'press 2 offers the spoken booking info');
  assert.ok(helpers.includes('press 3 to leave a voicemail'), 'press 3 offers voicemail');
});

test('self-serve speech all goes through sayTag with the configured voice', () => {
  assert.ok(helpers.includes('sayTag(SELF_SERVE_MENU_PROMPT,config)'), 'menu prompt uses sayTag');
  assert.ok(helpers.includes('sayTag(line,config)'), 'follow-up lines use sayTag');
  assert.ok(helpers.includes('sayTag(optionsPrompt,config)'), 'follow-up options use sayTag');
  assert.doesNotMatch(helpers, /<Say /, 'no raw Say elements in the self-serve helpers');
});

test('no keypress in the self-serve menu defaults to voicemail', () => {
  const gatherEndAt = helpers.indexOf('</Gather>');
  const redirectAt = helpers.indexOf('<Redirect', gatherEndAt);
  assert.ok(gatherEndAt !== -1 && redirectAt > gatherEndAt, 'a redirect follows the gather so nobody is stranded');
  assert.ok(helpers.includes("voiceRouteUrl('voicemail'"), 'that redirect targets the voicemail route');
  assert.ok(helpers.includes('${voicemailUrl}</Redirect>'), 'the post-gather redirect uses the voicemail URL');
});

test('booking link is the canonical booking page everywhere', () => {
  assert.ok(helpers.includes("const SELF_SERVE_BOOKING_URL='https://nexusmt.com/booking-app.html'"), 'booking URL is the canonical booking-app page');
});

test('text-link branch validates the caller number and sends the branded SMS', () => {
  const handleStart = api.indexOf("p[1]==='self-serve-handle'");
  const handle = api.slice(handleStart, handleStart + 3200);
  assert.ok(handle.includes("digits==='1'"), 'handler has a text-link branch');
  assert.ok(handle.includes('toE164(callerFrom)'), 'handler normalizes the inbound From number');
  assert.ok(handle.includes('/^\\+1\\d{10}$/.test(target)'), 'handler only texts valid US numbers');
  assert.ok(handle.includes('sendSms(target,SELF_SERVE_BOOKING_SMS)'), 'handler sends via the shared sendSms path');
  assert.ok(handle.includes('I have sent the booking link to this phone by text message.'), 'handler confirms the text by voice');
  assert.ok(handle.includes('I could not text a link to this number.'), 'handler degrades gracefully when texting is impossible');
});

test('self-serve SMS is branded, short, and carries STOP wording', () => {
  assert.ok(helpers.includes('Nexus Medical Transit: Sorry we missed your call.'), 'SMS is branded with a missed-call opener');
  assert.ok(helpers.includes('${SELF_SERVE_BOOKING_URL}'), 'SMS contains the booking URL');
  assert.ok(helpers.includes('Call (888) 639-5766'), 'SMS carries the main Nexus number');
  assert.ok(helpers.includes('Reply HELP for help. Reply STOP to opt out.'), 'SMS carries HELP/STOP wording like other Nexus SMS');
});

test('spoken info covers booking steps, confirmation, email, and 911', () => {
  assert.ok(helpers.includes('n-e-x-u-s-m-t dot com'), 'info spells out the domain');
  assert.ok(helpers.includes('the pickup address, where you are going, the date and time'), 'info lists what the caller needs ready');
  assert.ok(helpers.includes('ambulatory, wheelchair, stretcher, or bariatric'), 'info lists the service types');
  assert.ok(helpers.includes('you will get a confirmation by text and email'), 'info promises the text/email confirmation');
  assert.ok(helpers.includes('not confirmed until a Nexus representative confirms'), 'info keeps the representative-confirmation disclaimer');
  assert.ok(helpers.includes('contact at nexusmt dot com'), 'info gives the contact email');
  assert.ok(helpers.includes('hang up and dial 9 1 1'), 'info gives the emergency line');
});

test('info branch re-offers the text link and voicemail, then closes politely', () => {
  const handleStart = api.indexOf("p[1]==='self-serve-handle'");
  const handle = api.slice(handleStart, handleStart + 3200);
  assert.ok(handle.includes("digits==='2'"), 'handler has a spoken-info branch');
  assert.ok(handle.includes('SELF_SERVE_INFO_LINES'), 'info branch speaks the shared info lines');
  assert.ok(handle.includes('Press 1, and I will text the booking link to this phone. Or press 3 to leave a voicemail.'), 'info branch re-offers text link and voicemail');
  assert.ok(helpers.includes('Thank you for calling Nexus Medical Transit. Goodbye.'), 'follow-up ends with a polite closing');
  assert.ok(helpers.includes('<Hangup />'), 'follow-up hangs up after the closing');
});

test('voicemail branch goes to the existing voicemail flow unchanged', () => {
  const handleStart = api.indexOf("p[1]==='self-serve-handle'");
  const handle = api.slice(handleStart, handleStart + 3200);
  assert.ok(handle.includes("digits==='3'"), 'handler has a voicemail branch');
  assert.ok(handle.includes("voiceRouteUrl('voicemail'"), 'voicemail branch redirects to the existing voicemail route with its source');
});

test('an unrecognized keypress re-offers the menu once, then defaults to voicemail', () => {
  const handleStart = api.indexOf("p[1]==='self-serve-handle'");
  const handle = api.slice(handleStart, handleStart + 3200);
  assert.ok(handle.includes('Sorry, I did not catch that.'), 'handler acknowledges the missed keypress');
  assert.ok(handle.includes("voiceRouteUrl('self-serve'"), 'handler re-offers the self-serve menu');
  assert.ok(handle.includes('retry>=1'), 'a second miss falls through to voicemail instead of looping');
});
