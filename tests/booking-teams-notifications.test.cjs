const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.TEAMS_WEBHOOK_URL = 'https://example.invalid/webhook';

const api = require('../netlify/functions/api.cjs');

test('sendBookingTeamsAlert posts a customer booking payload to Teams webhook', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({})
    };
  };

  const result = await api.sendBookingTeamsAlert(
    {
      reference: 'NMT-20260807-1234',
      name: 'Jane Rider',
      pickup: '100 First St',
      destination: '200 Second St',
      date: '2026-08-08',
      pickupTime: '10:30',
      status: 'SUBMITTED',
      bookingSource: 'CUSTOMER'
    },
    'New Trip Booked - Admin_NMT',
    'New Trip Booked'
  );

  assert.equal(result.status, 'sent');
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.title, 'New Trip Booked - Admin_NMT');
  assert.match(body.text, /Ref: NMT-20260807-1234/);
  assert.match(body.text, /Patient:\*\* Jane Rider/);
  assert.match(body.text, /Source:\*\* CUSTOMER/);
});

test('buildBookingTeamsMessage supports broker and voice booking variants', () => {
  const brokerMessage = api.buildBookingTeamsMessage(
    {
      reference: 'NMT-20260807-5555',
      name: 'Broker Patient',
      pickup: '111 Pickup Rd',
      destination: '222 Destination Ave',
      trip_date: '2026-08-09',
      trip_time: '14:00',
      booking_source: 'BROKER',
      status: 'SUBMITTED'
    },
    'New Broker Trip Booked'
  );

  const voiceMessage = api.buildBookingTeamsMessage(
    {
      reference: 'NMT-20260807-9999',
      passenger_name: 'Voice Patient',
      pickup_address: '333 Voice Start',
      destination: '444 Voice End',
      requested_date: '2026-08-10',
      requested_time: '09:15',
      booking_source: 'VOICE_PENDING',
      status: 'REQUESTED'
    },
    'New Voice Booking Request'
  );

  assert.match(brokerMessage, /New Broker Trip Booked/);
  assert.match(brokerMessage, /Source:\*\* BROKER/);
  assert.match(voiceMessage, /New Voice Booking Request/);
  assert.match(voiceMessage, /Source:\*\* VOICE_PENDING/);
});

test('api booking flows still invoke sendBookingTeamsAlert', () => {
  const apiPath = path.join(__dirname, '..', 'netlify', 'functions', 'api.cjs');
  const source = fs.readFileSync(apiPath, 'utf8');

  assert.match(source, /async function notifyBooking\([\s\S]*sendBookingTeamsAlert\(/);
  assert.match(source, /async function createBookingFromBrokerRequest\([\s\S]*sendBookingTeamsAlert\(/);
  assert.match(source, /if\(isFacilityInvoice\)\{[\s\S]*sendBookingTeamsAlert\(/);
  assert.match(source, /p\[0\]==='voice'&&p\[1\]==='ride-request'[\s\S]*sendBookingTeamsAlert\(/);
});
