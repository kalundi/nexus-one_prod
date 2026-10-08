const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('settings remove legacy service waiting allowances', () => {
  const api = read('netlify/functions/api.cjs');
  const code = api.slice(api.indexOf('function mergeServicePolicies('), api.indexOf('function resolveServicePolicyKey('));
  const context = vm.createContext({
    DEFAULT_SERVICE_POLICIES: { wheelchair: {}, ambulatory: {}, stretcher: {} },
    n: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value))
  });
  vm.runInContext(code, context);
  const policies = context.mergeServicePolicies({ wheelchair: { freeWaitMinutes: 0 }, ambulatory: { freeWaitMinutes: 30 } });
  assert.equal(policies.wheelchair.freeWaitMinutes, 0);
  assert.equal(policies.ambulatory.freeWaitMinutes, 0);
  assert.equal(policies.stretcher.freeWaitMinutes, 0);
});

test('pricing matrix displays service waiting rates and immediate billing', () => {
  const admin = read('admin-app.js');
  const code = admin.slice(admin.indexOf('function renderPricing('), admin.indexOf('function getEditedPricing('));
  const rows = { innerHTML: '' };
  const context = vm.createContext({
    currentSettings: { pricing: { wheelchair: { label: 'Wheelchair', base: 98, includedMiles: 8, perMile: 4.1, waitPer15: 12 } } },
    document: { getElementById: id => id === 'pricingRows' ? rows : {} },
    updateDashboardSignals: () => {}
  });
  vm.runInContext(code, context);
  context.renderPricing();
  assert.match(rows.innerHTML, /data-field="waitPer15" value="12"/);
  assert.match(rows.innerHTML, /<td>Immediately<\/td>/);
  assert.doesNotMatch(rows.innerHTML, /data-wait-allowance/);
});

test('admin matrix preserves service rates when reading settings', () => {
  const admin = read('admin-app.js');
  const code = admin.slice(admin.indexOf('function readServicePoliciesFromTable('), admin.indexOf('function readSettingsForm('));
  const row = (service, value) => ({
    getAttribute: () => service,
    querySelectorAll: () => [{ getAttribute: () => 'trafficOverageFeePerHour', value }]
  });
  const context = vm.createContext({ document: { querySelectorAll: () => [row('wheelchair', '0'), row('ambulatory', '30'), row('stretcher', '')] } });
  vm.runInContext(code, context);
  const policies = context.readServicePoliciesFromTable();
  assert.equal(policies.wheelchair.trafficOverageFeePerHour, 0);
  assert.equal(policies.ambulatory.trafficOverageFeePerHour, 30);
  assert.equal(policies.stretcher.trafficOverageFeePerHour, 0);
});
