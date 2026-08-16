const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'booking-app.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'booking-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'netlify/functions/api.cjs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database/migrations/067.001_booking_trip_schedules.sql'), 'utf8');

test('booking form offers one-way, round-trip, and recurring schedules', () => {
  assert.match(html, /id="tripType"/);
  assert.match(html, /value="ROUND_TRIP">Round trip/);
  assert.match(html, /value="RECURRING">Recurring rides/);
  assert.match(html, /id="returnTripDate"/);
  assert.match(html, /id="recurrenceDays"/);
  assert.match(html, /id="recurrenceEndDate"/);
  assert.match(client, /Recurring schedules can|84\*86400000|invalidRecurring/);
});

test('server stores and returns structured trip schedules', () => {
  assert.match(api, /trip_type,return_trip_date,return_trip_time,recurrence_days,recurrence_end_date/);
  assert.match(api, /Recurring ride schedules must end within 12 weeks/);
  assert.match(api, /tripType:b\.trip_type/);
  assert.match(migration, /ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_type/);
  assert.match(migration, /067\.001/);
});
