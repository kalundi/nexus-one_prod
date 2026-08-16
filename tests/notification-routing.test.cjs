const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEmailRecipients, buildSmsRecipients } = require('../netlify/functions/_shared/notification-routing.cjs');

test('buildEmailRecipients includes the default team emails plus the primary recipient', () => {
  const recipients = buildEmailRecipients('patient@example.com');
  assert.deepEqual(recipients, ['patient@example.com', 'fletcher@nexusmt.com', 'jubilee@nexusmt.com']);
});

test('buildSmsRecipients includes the default phone numbers plus the primary recipient', () => {
  const recipients = buildSmsRecipients('202-555-0100');
  assert.deepEqual(recipients, ['202-555-0100', '202-270-2174', '301-760-8981', '202-315-9253', '301-500-7946']);
});

test('notification routing accepts customer and operations recipient arrays', () => {
  const emails = buildEmailRecipients(['patient@example.com', 'dispatch@example.com']);
  assert.ok(emails.includes('patient@example.com'));
  assert.ok(emails.includes('dispatch@example.com'));
  const phones = buildSmsRecipients(['202-555-0100', '301-555-0100']);
  assert.ok(phones.includes('202-555-0100'));
  assert.ok(phones.includes('301-555-0100'));
});
