const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SENDGRID_API_KEY = 'test-key';
process.env.SENDGRID_FROM_EMAIL = 'dispatch@nexusmt.com';

const api = require('../netlify/functions/api.cjs');

test('sendBrokerRequestConfirmation sends an email to the submitting address', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 202,
      json: async () => ({})
    };
  };

  const result = await api.sendBrokerRequestConfirmation(
    {
      id: 77,
      broker_name: 'Acme Broker',
      pickup: '123 Main St',
      destination: '456 Oak Ave',
      trip_date: '2026-08-02',
      trip_time: '10:30',
      request_status: 'AUTO_CONFIRMED'
    },
    'broker@example.com',
    'Acme Broker'
  );

  assert.equal(result.email.status, 'sent');
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.personalizations[0].to[0].email, 'broker@example.com');
  assert.match(payload.subject, /received/i);
});
