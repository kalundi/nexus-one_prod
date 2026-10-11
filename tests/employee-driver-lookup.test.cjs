const test = require('node:test');
const assert = require('node:assert/strict');
const {buildDriverAvailabilitySql} = require('../netlify/functions/_shared/employee-driver-lookup.cjs');

test('driver availability requires an active account, driver access and an active driver shift', () => {
  const sql = buildDriverAvailabilitySql('e', 'u');
  assert.match(sql, /e\.role='DRIVER'/);
  assert.match(sql, /u\.active=true/);
  assert.match(sql, /es\.assignment_role='DRIVER'/);
  assert.match(sql, /rr\.status='APPROVED'/);
  assert.match(sql, /LEFT JOIN users u ON e\.user_id = u\.id/);
});
