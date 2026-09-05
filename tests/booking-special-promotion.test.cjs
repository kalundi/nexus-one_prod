const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'booking-app.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'booking-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'netlify', 'functions', 'api.cjs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database', 'migrations', '075.001_single_use_promotions.sql'), 'utf8');

test('booking review exposes a special coupon control', () => {
  assert.match(html, /id="promotionCode"/);
  assert.match(html, /id="applyPromotionBtn"/);
  assert.match(client, /\/api\/promotions\/validate/);
  assert.match(client, /promotionCode: appliedPromotion\?\.code/);
});

test('negotiated coupon is single-use, stretcher-only, date-restricted, and totals 1995', () => {
  assert.match(migration, /SEP10-1995-NEXUS/);
  assert.match(migration, /'stretcher'/);
  assert.match(migration, /DATE '2026-09-10'/);
  assert.match(migration, /1995\.00/);
  assert.match(api, /redeemed_booking_reference IS NULL/);
  assert.match(api, /UPDATE booking_promotions SET redeemed_booking_reference/);
  assert.match(api, /ensureBookingPromotionsSchema/);
});

test('hosted checkout charges the booking amount from the database', () => {
  assert.doesNotMatch(api, /Number\(b\.amount\|\|r\.rows\[0\]\.estimated_fare/);
  assert.match(api, /const totalFare=Number\(r\.rows\[0\]\.estimated_fare\|\|0\)/);
});
