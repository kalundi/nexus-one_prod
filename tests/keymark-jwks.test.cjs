const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { jwksFromEnvironment } = require('../netlify/functions/_shared/keymark-jwks.cjs');
const { handler } = require('../netlify/functions/keymark-jwks.cjs');

test('builds a public verification-only JWKS from a PEM public key', () => {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const jwks = jwksFromEnvironment({ KEYMARK_JWT_PUBLIC_KEY: pem, KEYMARK_JWT_KEY_ID: 'keymark-2026-01' });
  assert.equal(jwks.keys.length, 1);
  assert.deepEqual(jwks.keys[0].key_ops, ['verify']);
  assert.equal(jwks.keys[0].kid, 'keymark-2026-01');
  assert.equal(jwks.keys[0].alg, 'RS384');
  assert.equal(jwks.keys[0].kty, 'RSA');
  assert.equal('d' in jwks.keys[0], false);
});

test('supports multiple public keys for rotation and rejects duplicate key IDs', () => {
  const key = kid => ({ kty: 'RSA', n: Buffer.from(`modulus-${kid}`).toString('base64url'), e: 'AQAB', kid });
  assert.equal(jwksFromEnvironment({ KEYMARK_JWKS_JSON: JSON.stringify({ keys: [key('current'), key('next')] }) }).keys.length, 2);
  assert.throws(() => jwksFromEnvironment({ KEYMARK_JWKS_JSON: JSON.stringify({ keys: [key('same'), key('same')] }) }), /unique/);
});

test('public endpoint fails closed without configuration and disallows writes', async () => {
  const originalPublicKey = process.env.KEYMARK_JWT_PUBLIC_KEY;
  const originalJwks = process.env.KEYMARK_JWKS_JSON;
  delete process.env.KEYMARK_JWT_PUBLIC_KEY;
  delete process.env.KEYMARK_JWKS_JSON;
  try {
    const unavailable = await handler({ httpMethod: 'GET' });
    assert.equal(unavailable.statusCode, 503);
    assert.doesNotMatch(unavailable.body, /private|PEM/i);
    assert.equal((await handler({ httpMethod: 'POST' })).statusCode, 405);
  } finally {
    if (originalPublicKey === undefined) delete process.env.KEYMARK_JWT_PUBLIC_KEY; else process.env.KEYMARK_JWT_PUBLIC_KEY = originalPublicKey;
    if (originalJwks === undefined) delete process.env.KEYMARK_JWKS_JSON; else process.env.KEYMARK_JWKS_JSON = originalJwks;
  }
});
