const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'netlify/functions/api.cjs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database/migrations/098.001_dispatch_voicemail_fields.sql'), 'utf8');

test('voicemail route records the call with transcription', () => {
  assert.ok(api.includes("p[1]==='voicemail'"), 'voicemail route exists');
  assert.ok(api.includes('function voiceVoicemailTwiml'), 'voicemail TwiML helper exists');
  assert.ok(api.includes('<Record action='), 'voicemail route returns a Record verb');
  assert.ok(api.includes('maxLength="120"'), 'recording is capped at 120 seconds');
  assert.ok(api.includes('playBeep="true"'), 'recording plays a beep');
  assert.ok(api.includes('transcribe="true"'), 'recording requests transcription');
  assert.ok(api.includes("voiceRouteUrl('voicemail-complete'"), 'Record action points at the completion handler');
  assert.ok(api.includes("voiceRouteUrl('voicemail-transcription'"), 'transcription callback is wired');
  assert.ok(api.includes('recordingStatusCallback'), 'recording completion is reported even when transcription is empty');
});

test('voicemail prompt asks for callback details and discourages medical details', () => {
  assert.ok(api.includes('Please leave your name, your callback number, and a brief message after the tone.'), 'prompt asks for name, callback number, message');
  assert.ok(api.includes('share medical details in your message'), 'prompt discourages medical details');
  assert.ok(api.includes('We will return your call as soon as possible.'), 'prompt promises a callback');
});

test('dispatch fallback failure redirects to the self-serve route instead of a dead end', () => {
  assert.ok(api.includes("source=dispatch-fallback"), 'dispatch fallback carries its source through the self-serve flow');
  assert.ok(api.includes("voiceRouteUrl('self-serve','source=dispatch-fallback')"), 'dispatch fallback redirects to self-serve, which still defaults to voicemail');
  assert.doesNotMatch(api, /We were unable to connect to dispatch\. Please call us back at/, 'dead-end call-back ending is gone from dispatch fallback');
  assert.ok(api.includes('We were unable to reach dispatch. Please leave a voicemail and we will return your call.'), 'unavailable wording is kept before the redirect');
});

test('after-hours branch redirects to the self-serve route instead of dialing the transfer number', () => {
  const start = api.indexOf('if(!openNow&&config.afterHoursVoicemail){');
  assert.notEqual(start, -1, 'after-hours branch exists');
  const block = api.slice(start, start + 700);
  assert.ok(block.includes('Redirect'), 'after-hours branch redirects');
  assert.ok(block.includes("voiceRouteUrl('self-serve','source=after-hours')"), 'after-hours branch goes to self-serve, which still defaults to voicemail');
  assert.ok(!block.includes('<Dial'), 'after-hours branch no longer dials the transfer number');
  assert.ok(block.includes('reached Tony, the Nexus Medical Transit Virtual Assistant'), 'Tony after-hours message is kept');
});

test('voicemail completion thanks the caller and falls back to the old behavior when nothing was recorded', () => {
  assert.ok(api.includes("p[1]==='voicemail-complete'"), 'completion route exists');
  assert.ok(api.includes('Thank you. Your message has been recorded.'), 'completion thanks the caller');
  assert.ok(api.includes("source==='after-hours'&&config.afterHoursVoicemail"), 'completion falls back to the transfer number for after-hours calls');
  assert.ok(api.includes('We were unable to record your message.'), 'completion explains a failed recording');
});

test('transcription callback persists the voicemail and notifies once', () => {
  assert.ok(api.includes("p[1]==='voicemail-transcription'"), 'transcription route exists');
  assert.ok(api.includes('ON CONFLICT(twilio_call_sid) DO UPDATE'), 'transcription upserts by call SID');
  assert.ok(api.includes('voicemail_notified_at'), 'notification is guarded so each voicemail notifies once');
  assert.ok(api.includes('TranscriptionText'), 'transcription text is read from the callback');
  assert.ok(api.includes('RecordingUrl'), 'recording URL is read from the callback');
  assert.ok(api.includes('buildSmsRecipients([])'), 'notification reuses the default SMS recipients');
  assert.ok(api.includes('buildEmailRecipients()'), 'notification reuses the default email recipients');
  assert.ok(api.includes('New voicemail from'), 'notification identifies the voicemail');
});

test('voicemail migration adds recording fields without patient or medical columns', () => {
  assert.match(migration, /ALTER TABLE dispatch_voice_calls/);
  assert.ok(migration.includes('recording_url'), 'migration adds recording_url');
  assert.ok(migration.includes('transcription_text'), 'migration adds transcription_text');
  assert.ok(migration.includes('voicemail_notified_at'), 'migration adds voicemail_notified_at');
  assert.doesNotMatch(migration, /patient_name|medical|diagnosis|notes/i);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
});

test('voicemail change leaves greeting, voice, menu, and dispatch routing untouched', () => {
  assert.ok(api.includes("You've reached Tony, the Nexus Medical Transit Virtual Assistant"), 'Tony greeting intact');
  assert.ok(api.includes('Polly.Matthew-Neural'), 'Matthew voice default intact');
  assert.doesNotMatch(api, /Joanna/, 'no female voice fallback remains');
  assert.doesNotMatch(api, /Virtual Receptionist/, 'no old receptionist name remains');
  assert.ok(api.includes('VOICE_MENU_INITIAL_PROMPT'), 'menu prompt env overrides intact');
  assert.ok(api.includes('DISPATCH_PRIMARY_NUMBER'), 'dispatch number config intact');
});
