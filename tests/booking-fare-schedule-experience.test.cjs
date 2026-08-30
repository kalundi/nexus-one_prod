const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'booking-app.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'booking-app.js'), 'utf8');

test('fare review communicates reliability compassion and equity', () => {
  assert.match(html, /Clear, compassionate pricing/);
  assert.match(html, /Reliable route planning/);
  assert.match(html, /Care-centered service/);
  assert.match(html, /Fair, transparent estimate/);
});

test('schedule control is labeled and edits date and time inside its dialog', () => {
  assert.match(html, />Adjust schedule<\/span>/);
  assert.match(html, /id="reviewScheduleDate"/);
  assert.match(html, /id="reviewScheduleTime"/);
  assert.match(html, /id="saveReviewScheduleBtn">Save &amp; recalculate/);
  assert.match(client, /\$\('tripDate'\)\.value=dateInput\.value/);
  assert.match(client, /appointmentTimeInput\.value=timeInput\.value/);
  assert.match(client, /await estimateRouteAndFare\(\{promptConfirmation:false\}\)/);
  assert.doesNotMatch(html, /id="editReviewScheduleBtn"/);
});

test('suite fields align and the three schedule values share one responsive row', () => {
  assert.match(html, /class="suiteRow"/);
  assert.match(html, /\.suiteRow\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.ok(html.includes('.scheduleRow{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.08fr)'));
  assert.match(html, /System calculated/);
  assert.match(html, /No entry needed—we calculate this from the route and appointment/);
  assert.match(html, /class="systemGeneratedField" id="tripTime"[^>]+readonly/);
});
