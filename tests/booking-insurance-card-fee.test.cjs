const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'booking-app.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'booking-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'netlify/functions/api.cjs'), 'utf8');

test('private insurance reveals a required carrier selector', () => {
  assert.match(html, /id="insuranceCarrierField" hidden/);
  assert.match(html, /id="insuranceCarrier"/);
  assert.match(html, /CareFirst BlueCross BlueShield/);
  assert.match(client, /isPrivateInsurance[\s\S]*insuranceCarrier\.required=isPrivateInsurance/);
  assert.match(client, /payerType==='INSURANCE'&&!payload\.insuranceCarrier/);
  assert.match(api, /Private insurance provider is required/);
  assert.match(api, /Insurance carrier:/);
});

test('fare uses a three percent card processing fee instead of customer-facing tax', () => {
  assert.match(html, /Card Processing Fee \(3%\)/);
  assert.doesNotMatch(html, /<b>Tax<\/b>/);
  assert.match(client, /CARD_PROCESSING_FEE_PCT = 3/);
  assert.match(client, /normalizedSubtotal \* \(taxRatePct \/ 100\)/);
  assert.match(client, /card processing fee/);
});
