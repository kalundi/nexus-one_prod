const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('one-driver multi-stop schedules account for wait, assistance, traffic, and travel', () => {
  const html = read('booking-app.html');
  const client = read('booking-app.js');

  assert.match(html, /id="scheduleFeasibility"/);
  assert.match(client, /function evaluateMultiStopFeasibility\(\)/);
  assert.match(client, /current \+ wait \+ assistanceBuffer \+ travel/);
  assert.match(client, /duration_in_traffic/);
  assert.match(client, /Expected time at Stop \$\{index\}/);
  assert.match(client, /Schedule conflict:/);
  assert.match(client, /minimum \$\{Math\.max\(0, Math\.floor\(tightest\)\)\}-minute cushion/);
});

test('infeasible schedules are blocked and operational assumptions reach dispatch', () => {
  const client = read('booking-app.js');
  const api = read('netlify/functions/api.cjs');

  assert.match(client, /if\(infeasibleMultiStop\)/);
  assert.match(client, /stopWaitMinutes: getStopWaitMinutes\(\)/);
  assert.match(client, /scheduleFeasibility: evaluateMultiStopFeasibility\(\)/);
  assert.match(api, /The multi-stop schedule is not feasible for one driver\./);
  assert.match(api, /Expected stop times:/);
  assert.match(api, /One-driver schedule check:/);
});
