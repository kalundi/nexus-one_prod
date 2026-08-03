const test = require('node:test');
const assert = require('node:assert/strict');
const {hashPassword, verifyPassword} = require('../netlify/functions/_shared/password.cjs');

test('verifies a SHA-256 password hash', () => {
  const password = 'Dispatch2026!';
  const stored = hashPassword(password);

  assert.equal(verifyPassword(password, stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});

test('verifies a legacy plain-text password', () => {
  const stored = 'Dispatch2026!';

  assert.equal(verifyPassword('Dispatch2026!', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});
