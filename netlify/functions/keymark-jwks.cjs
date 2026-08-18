const { jwksFromEnvironment } = require('./_shared/keymark-jwks.cjs');

exports.handler = async event => {
  const method = String(event?.httpMethod || 'GET').toUpperCase();
  const headers = {
    'content-type': 'application/jwk-set+json; charset=utf-8',
    'cache-control': 'public, max-age=300, must-revalidate',
    'x-content-type-options': 'nosniff'
  };
  if (method !== 'GET' && method !== 'HEAD') return { statusCode: 405, headers: { ...headers, allow: 'GET, HEAD' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  try {
    const body = JSON.stringify(jwksFromEnvironment());
    return { statusCode: 200, headers, body: method === 'HEAD' ? '' : body };
  } catch (error) {
    console.error('[KEYMARK_JWKS]', error.message);
    return { statusCode: 503, headers: { ...headers, 'cache-control': 'no-store' }, body: method === 'HEAD' ? '' : JSON.stringify({ error: 'KeyMark public keys are not configured' }) };
  }
};
