const test = require('node:test');
const assert = require('node:assert/strict');

process.env.POSTMARK_SERVER_TOKEN = 'test-key';
process.env.EMAIL_FROM = 'dispatch@nexusmt.com';

const api = require('../netlify/functions/api.cjs');

test('sendBrokerRequestConfirmation sends an email to the submitting address', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 202,
      json: async () => ({ErrorCode:0,MessageID:'fixture-message'})
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
      request_status: 'PENDING_DISPATCH_CONFIRMATION'
    },
    'broker@example.com',
    'Acme Broker'
  );

  assert.equal(result.email.status, 'sent');
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.To, 'broker@example.com');
  assert.match(payload.Subject, /received/i);
});

test('sendBrokerRequestDispatchNotifications sends the dispatch and customer confirmations', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 202,
      json: async () => ({ErrorCode:0,MessageID:'fixture-message'})
    };
  };

  process.env.COMPANY_EMAIL = 'dispatch@nexusmt.com';
  const result = await api.sendBrokerRequestDispatchNotifications(
    {
      id: 88,
      broker_name: 'Acme Broker',
      pickup: '123 Main St',
      destination: '456 Oak Ave',
      trip_date: '2026-08-02',
      trip_time: '10:30',
      request_status: 'APPROVED'
    },
    'broker@example.com',
    'Acme Broker'
  );

  assert.equal(result.customer.email.status, 'sent');
  assert.equal(result.dispatch.email.status, 'sent');
  assert.equal(calls.length, 2);
  const payloads = calls.map((call) => JSON.parse(call.options.body));
  assert.ok(payloads.some((payload) => payload.To === 'broker@example.com'));
  assert.ok(payloads.some((payload) => payload.To === 'dispatch@nexusmt.com'));
});
