const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recommendRideType } = require('../booking-service-guidance.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'booking-app.html'), 'utf8');

test('ride guidance recommends customer ride types deterministically', () => {
  assert.equal(recommendRideType({ lyingDown:'yes' }).service, 'stretcher');
  assert.equal(recommendRideType({ remainsInWheelchair:'yes' }).service, 'wheelchair');
  assert.equal(recommendRideType({ extraSpace:'yes' }).service, 'bariatric');
  assert.equal(recommendRideType({}).service, 'ambulatory');
});

test('booking page exposes persisted accessibility controls and rich service cards', () => {
  for (const id of ['largeTextToggle','highContrastToggle','reduceMotionToggle','readNextStepBtn','helpChooseRideBtn','rideGuidanceDialog']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /aria-pressed="false">Larger text/);
  assert.match(html, /class="chip serviceCard"[^>]+data-service="wheelchair"/);
  assert.match(html, /Why it may fit|rideGuidanceReason/);
  assert.doesNotMatch(html, /HIPAA compliant|ADA compliant/i);
});
