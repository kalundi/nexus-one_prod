const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('settings preserve zero, custom, and inherited service waiting allowances', () => {
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
  assert.equal(policies.ambulatory.freeWaitMinutes, 30);
  assert.equal(policies.stretcher.freeWaitMinutes, null);
});

test('admin matrix distinguishes a blank shared allowance from an explicit zero', () => {
  const admin = read('admin-app.js');
  const code = admin.slice(admin.indexOf('function readServicePoliciesFromTable('), admin.indexOf('function readSettingsForm('));
  const row = (service, value) => ({
    getAttribute: () => service,
    querySelectorAll: () => [{ getAttribute: () => 'freeWaitMinutes', value }]
  });
  const context = vm.createContext({ document: { querySelectorAll: () => [row('wheelchair', '0'), row('ambulatory', '30'), row('stretcher', '')] } });
  vm.runInContext(code, context);
  const policies = context.readServicePoliciesFromTable();
  assert.equal(policies.wheelchair.freeWaitMinutes, 0);
  assert.equal(policies.ambulatory.freeWaitMinutes, 30);
  assert.equal(policies.stretcher.freeWaitMinutes, null);
});
