const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildFilter, syncConfig, senderMatches, brokerSenderApproved, MAX_MESSAGES_PER_RUN, MAX_MESSAGE_ATTEMPTS } = require('../netlify/functions/graph-mail-sync.cjs');
const { buildPickupTimestamp } = require('../netlify/functions/broker-email-webhook.cjs');

test('legacy Inbox and single GO T&T sender settings do not restrict scheduled sync', () => {
  const env = {
    GRAPH_MAIL_SYNC_SENDER: process.env.GRAPH_MAIL_SYNC_SENDER,
    GRAPH_MAIL_SYNC_SUBJECT_CONTAINS: process.env.GRAPH_MAIL_SYNC_SUBJECT_CONTAINS,
    GRAPH_MAIL_SYNC_FOLDER: process.env.GRAPH_MAIL_SYNC_FOLDER
  };
  try {
    process.env.GRAPH_MAIL_SYNC_SENDER = 'driverdeveloper@gotandt.com';
    process.env.GRAPH_MAIL_SYNC_SUBJECT_CONTAINS = 'confirmation';
    process.env.GRAPH_MAIL_SYNC_FOLDER = 'Inbox';
    assert.deepEqual(syncConfig(), { sender:'*', subjectContains:'confirmation', folder:'all' });
    assert.equal(syncConfig({folder:'Broker Confirmations'}).folder,'Broker Confirmations');
  } finally {
    for(const [key,value] of Object.entries(env)) {
      if(value===undefined) delete process.env[key];
      else process.env[key]=value;
    }
  }
});

test('confirmation filter includes broker emails without attachments and other senders', () => {
  const filter = buildFilter({since:'2026-11-12T00:00:00Z'});
  assert.match(filter, /receivedDateTime ge/);
  assert.match(filter, /contains\(subject,'confirmation'\)/);
  assert.doesNotMatch(filter, /from\/emailAddress\/address eq/);
  assert.doesNotMatch(filter, /hasAttachments eq true/);
  assert.equal(senderMatches({from:{emailAddress:{address:'confirmation@gotandt.com'}}},'*'),true);
});

test('broker sender authorization rejects unrelated confirmation emails', () => {
  const trusted = new Set(['gotandt.com','broker-example.com']);
  const message = email => ({from:{emailAddress:{address:email}}});
  assert.equal(brokerSenderApproved(message('confirmation@gotandt.com'),trusted),true);
  assert.equal(brokerSenderApproved(message('trips@broker-example.com'),trusted),true);
  assert.equal(brokerSenderApproved(message('orders@retailer.com'),trusted),false);
});

test('mailbox-wide Graph path supports custom and nested folders', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','netlify','functions','_shared','ms-graph.cjs'),'utf8');
  assert.ok(source.includes("targetFolder.toLowerCase()==='all'"));
  assert.ok(source.includes('/messages`'));
  assert.ok(source.includes('/mailFolders/'));
});

test('trip intake links repeat confirmation messages to existing referral', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','netlify','functions','broker-email-webhook.cjs'),'utf8');
  assert.ok(source.includes('findBookingByBrokerReferral'));
  assert.ok(source.includes('UPDATE broker_requests SET booking_reference=$2'));
  assert.ok(source.includes("String(booking.status||'').toUpperCase()==='PENDING_DISPATCH_CONFIRMATION'"));
});

test('failed-message retries and bounded polling remain enabled', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','netlify','functions','graph-mail-sync.cjs'),'utf8');
  assert.match(source,/failedMessages/);
  assert.match(source,/deadLetterMessageIds/);
  assert.ok(MAX_MESSAGES_PER_RUN > 0 && MAX_MESSAGES_PER_RUN <= 1000);
  assert.equal(MAX_MESSAGE_ATTEMPTS,3);
});

test('graph access tokens are cached instead of requested per call', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','netlify','functions','_shared','ms-graph.cjs'),'utf8');
  assert.match(source,/cachedGraphToken/);
  assert.match(source,/clearGraphTokenCache/);
});

test('broker pickup timestamp uses the trip date', () => {
  assert.equal(buildPickupTimestamp('2026-08-26','10:35 AM'),'2026-08-26 10:35:00');
  assert.equal(buildPickupTimestamp('2026-08-26','10:35:00'),'2026-08-26 10:35:00');
  assert.equal(buildPickupTimestamp('','10:35:00'),null);
});
