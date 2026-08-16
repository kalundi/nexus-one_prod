const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'booking-app.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'booking-app.js'), 'utf8');

test('booking app has three persistent customer tabs', () => {
  assert.match(html, /data-app-tab="book"[\s\S]*Book a Ride/);
  assert.match(html, /data-app-tab="manifest"[\s\S]*Trip Manifest/);
  assert.match(html, /data-app-tab="contact"[\s\S]*Contact/);
  assert.match(html, /class="appTabBar"/);
  assert.match(client, /function switchAppTab/);
});

test('trip manifest supports secure lookup, history ranges, and route reuse', () => {
  for (const range of ['today','week','month','year']) assert.match(html, new RegExp(`data-manifest-range="${range}"`));
  assert.match(client, /fetch\('\/api\/portal\/trips'/);
  assert.match(client, /\/api\/bookings\/\$\{encodeURIComponent\(reference\)\}\?phone=/);
  assert.match(client, /function reuseTripRoute/);
  assert.match(client, /revealSectionForAction\('pickupDropoffSection','confirmPickupDropoffBtn'\)/);
});

test('contact tab exposes Nexus support and social channels', () => {
  assert.match(html, /tel:\+18886395766/);
  assert.match(html, /tel:\+18887604990/);
  assert.match(html, /mailto:contact@nexusmt\.com/);
  for (const social of ['Facebook','Instagram','YouTube','TikTok']) assert.match(html, new RegExp(`>${social}<`));
});
