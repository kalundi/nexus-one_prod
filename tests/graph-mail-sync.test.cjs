const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFilter, syncConfig } = require('../netlify/functions/graph-mail-sync.cjs');
const { buildPickupTimestamp } = require('../netlify/functions/broker-email-webhook.cjs');

test('syncConfig honors configured mailbox filters', () => {
  process.env.GRAPH_MAIL_SYNC_SENDER = 'driverdeveloper@gotandt.com';
  process.env.GRAPH_MAIL_SYNC_SUBJECT_CONTAINS = 'trip confirmation';
  process.env.GRAPH_MAIL_SYNC_FOLDER = 'Broker Confirmations';

  assert.deepEqual(syncConfig(), {
    sender: 'driverdeveloper@gotandt.com',
    subjectContains: 'trip confirmation',
    folder: 'Broker Confirmations'
  });
});

test('syncConfig query parameters override environment defaults', () => {
  assert.equal(syncConfig({ sender: 'override@example.com' }).sender, 'override@example.com');
});

test('buildFilter uses the real broker sender by default', () => {
  const filter = buildFilter({ since: '2026-08-01T00:00:00.000Z' });
  assert.match(filter, /driverdeveloper@gotandt\.com/);
  assert.doesNotMatch(filter, /xxxx@gotandt\.com/);
  assert.match(filter, /hasAttachments eq true/);
});

test('broker pickup time is combined with its trip date for timestamptz columns', () => {
  assert.equal(buildPickupTimestamp('2026-08-26', '10:35 AM'), '2026-08-26 10:35:00');
  assert.equal(buildPickupTimestamp('2026-08-26', '10:35:00'), '2026-08-26 10:35:00');
  assert.equal(buildPickupTimestamp('', '10:35:00'), null);
});
