'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'booking-app.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'booking-app.js'), 'utf8');

test('fare confirmation can always be reopened from the estimate', () => {
  assert.match(html, /id="reviewFareBtn"/);
  assert.match(js, /reviewFareBtn\?\.addEventListener\('click',reopenFareConfirmation\)/);
  assert.match(js, /promptFareConfirmation\(true\)/);
});

test('booking provides an accessible next-step guide', () => {
  assert.match(html, /id="nextStepGuide"[^>]*aria-live="polite"/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(js, /function updateNextStepGuide\(\)/);
});

test('header shows current and next stages across five booking steps', () => {
  assert.match(html, /id="journeyHeader"[^>]*role="progressbar"/);
  assert.match(html, /aria-valuemax="5"/);
  assert.match(js, /const labels=\['Rider','Route','Ride needs','Review','Payment & confirmation'\]/);
});

test('type of ride remains visible instead of progressive-hidden', () => {
  assert.match(html, /<section class="section" id="rideTypeSection">/);
  assert.doesNotMatch(html, /<section class="section sectionProgressive" id="rideTypeSection">/);
  assert.doesNotMatch(js, /AUTO_COLLAPSIBLE_SECTION_IDS\s*=\s*\[[^\]]*'rideTypeSection'/);
  assert.match(js, /sectionId !== 'rideTypeSection'/);
});

test('sticky journey header uses hysteresis instead of scroll direction', () => {
  assert.match(js, /const next=journeyCompact\?currentY>48:currentY>88/);
  assert.doesNotMatch(js, /currentY>=lastJourneyScrollY/);
});

test('customer page does not expose internal API wording', () => {
  assert.doesNotMatch(html, /submits directly to/i);
  assert.doesNotMatch(html, /\/api\/bookings/i);
  assert.doesNotMatch(html, /dispatch buffer/i);
});
