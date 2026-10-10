const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('settings migrate legacy waiting allowances and preserve configured service allowances', () => {
  const api = read('netlify/functions/api.cjs');
  const code = api.slice(api.indexOf('function mergeServicePolicies('), api.indexOf('function resolveServicePolicyKey('));
  const context = vm.createContext({
    DEFAULT_SERVICE_POLICIES: { wheelchair: {}, ambulatory: {}, stretcher: {} },
    n: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value))
  });
  vm.runInContext(code, context);
  const old = context.mergeServicePolicies({ wheelchair: { freeWaitMinutes: 0 }, ambulatory: { freeWaitMinutes: 30 } },15,0);
  for(const service of ['wheelchair','ambulatory','stretcher'])assert.equal(old[service].freeWaitMinutes,15);
  const configured = context.mergeServicePolicies({ wheelchair: { freeWaitMinutes: 0 }, ambulatory: { freeWaitMinutes: 30 } },15,2);
  assert.equal(configured.wheelchair.freeWaitMinutes,0);
  assert.equal(configured.ambulatory.freeWaitMinutes,30);
  assert.equal(configured.stretcher.freeWaitMinutes,15);
});

test('pricing matrix displays service waiting rates and the free waiting period', () => {
  const admin = read('admin-app.js');
  const code = admin.slice(admin.indexOf('function renderPricing('), admin.indexOf('function getEditedPricing('));
  const rows = { innerHTML: '' };
  const context = vm.createContext({
    currentSettings: { pricing: { wheelchair: { label: 'Wheelchair', base: 98, includedMiles: 8, perMile: 4.1, waitPer15: 12 } } },
    document: { getElementById: id => id === 'pricingRows' ? rows : {},querySelectorAll:()=>[] },
    updateDashboardSignals: () => {}
  });
  vm.runInContext(code, context);
  context.renderPricing();
  assert.match(rows.innerHTML, /data-field="waitPer15" value="12"/);
  assert.match(rows.innerHTML, />After 15 min<\/td>/);
  assert.doesNotMatch(rows.innerHTML, /data-wait-allowance/);
});

test('admin matrix preserves service rates when reading settings', () => {
  const admin = read('admin-app.js');
  const code = admin.slice(admin.indexOf('function readServicePoliciesFromTable('), admin.indexOf('function readPricingRules('));
  const row = (service, value) => ({
    getAttribute: () => service,
    querySelectorAll: () => [{ getAttribute: () => 'trafficOverageFeePerHour', value }]
  });
  const context = vm.createContext({currentSettings:{fareRules:{servicePolicies:{wheelchair:{freeWaitMinutes:15}}}}, document: { querySelectorAll: () => [row('wheelchair', '0'), row('ambulatory', '30'), row('stretcher', '')] } });
  vm.runInContext(code, context);
  const policies = context.readServicePoliciesFromTable();
  assert.equal(policies.wheelchair.trafficOverageFeePerHour, 0);
  assert.equal(policies.ambulatory.trafficOverageFeePerHour, 30);
  assert.equal(policies.stretcher.trafficOverageFeePerHour, 0);
  assert.equal(policies.wheelchair.freeWaitMinutes,15);
});
