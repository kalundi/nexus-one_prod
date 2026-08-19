const crypto = require('crypto');

const clean = value => String(value ?? '').trim();

function normalizeJwk(jwk, fallbackKid) {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) throw new Error('KeyMark JWKS contains an invalid key');
  const isRsa = jwk.kty === 'RSA' && jwk.n && jwk.e;
  const isEc = jwk.kty === 'EC' && jwk.crv === 'P-384' && jwk.x && jwk.y;
  if (!isRsa && !isEc) throw new Error('KeyMark JWKS keys must be RSA or P-384 EC public keys');
  const kid = clean(jwk.kid || fallbackKid);
  if (!kid) throw new Error('KEYMARK_JWT_KEY_ID is required for every published key');
  const { d, p, q, dp, dq, qi, ...publicJwk } = jwk;
  return { ...publicJwk, kid, use: 'sig', alg: clean(jwk.alg) || (isEc ? 'ES384' : 'RS384'), key_ops: ['verify'] };
}

function jwksFromEnvironment(env = process.env) {
  const configuredSet = clean(env.KEYMARK_JWKS_JSON);
  if (configuredSet) {
    let parsed;
    try { parsed = JSON.parse(configuredSet); } catch { throw new Error('KEYMARK_JWKS_JSON must be valid JSON'); }
    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) throw new Error('KEYMARK_JWKS_JSON must contain at least one public key');
    const keys = parsed.keys.map(key => normalizeJwk(key, env.KEYMARK_JWT_KEY_ID));
    if (new Set(keys.map(key => key.kid)).size !== keys.length) throw new Error('KeyMark JWKS key IDs must be unique');
    return { keys };
  }

  const publicKey = clean(env.KEYMARK_JWT_PUBLIC_KEY || env.KEYMARK_JWT_PRIVATE_KEY).replace(/\\n/g, '\n');
  if (!publicKey) throw new Error('KEYMARK_JWT_PRIVATE_KEY, KEYMARK_JWT_PUBLIC_KEY, or KEYMARK_JWKS_JSON is required');
  let jwk;
  try { jwk = crypto.createPublicKey(publicKey).export({ format: 'jwk' }); } catch { throw new Error('KeyMark JWT key must be a valid PEM key'); }
  return { keys: [normalizeJwk(jwk, env.KEYMARK_JWT_KEY_ID)] };
}

module.exports = { jwksFromEnvironment };
