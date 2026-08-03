const test = require('node:test');
const assert = require('node:assert/strict');
const {buildDriverAvailabilitySql} = require('../netlify/functions/_shared/employee-driver-lookup.cjs');

test('driver availability SQL uses the users scope id and employee role column', () => {
  const sql = buildDriverAvailabilitySql('e', 'u');
  assert.match(sql, /e\.role='DRIVER'/);
  assert.match(sql, /u\.scope_id/);
  assert.match(sql, /LEFT JOIN users u ON e\.user_id = u\.id/);
});
