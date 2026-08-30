const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'booking-app.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'booking-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'netlify/functions/api.cjs'), 'utf8');

test('multi-stop booking renders a required appointment time for each additional stop', () => {
  assert.match(html, /id="legAppointmentTimes"/);
  assert.match(html, /Multi-stop schedule check/);
  assert.match(client, /Stop \$\{index\} Appointment Time/);
  assert.match(client, /data-leg-appointment-time="true" required/);
  assert.match(client, /areLegAppointmentTimesComplete\(\)/);
});

test('booking payload and API preserve the complete per-stop appointment schedule', () => {
  assert.match(client, /appointmentTimes: getLegAppointments\(\)/);
  assert.match(api, /An appointment time is required for every destination stop\./);
  assert.match(api, /Stop appointments:/);
  assert.match(api, /appointmentTime:appointmentTime\|\|null,appointmentTimes,pickupTimeEstimate/);
});
