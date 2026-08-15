import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'keymark.html',
  'keymark.css',
  'keymark.js',
  'database/migrations/062.001_keymark_appointment_infrastructure.sql',
  'database/migrations/063.001_keymark_connector_gateway.sql',
  'netlify/functions/_shared/keymark-connectors.cjs',
  'netlify/functions/_shared/keymark-fhir-client.cjs',
  'netlify/functions/_shared/keymark-outreach.cjs',
  'netlify/functions/keymark-fhir-sync.cjs',
  'netlify/functions/keymark-outreach.cjs'
];

const failures = [];
for (const file of requiredFiles) {
  try { await access(file); } catch { failures.push(`Missing required file: ${file}`); }
}

const netlify = await readFile('netlify.toml', 'utf8');
const authGuard = await readFile('auth-guard.js', 'utf8');
const api = await readFile('netlify/functions/api.cjs', 'utf8');
const build = await readFile('scripts/build-static.mjs', 'utf8');

if (!netlify.includes('from = "/keymark"') || !netlify.includes('to = "/keymark.html"')) failures.push('Missing /keymark redirect.');
if (!netlify.includes('[functions.keymark-outreach]')) failures.push('Missing KeyMark outreach schedule.');
if (!netlify.includes('[functions.keymark-fhir-sync]')) failures.push('Missing KeyMark FHIR schedule.');
if (!authGuard.includes("'/keymark.html'")) failures.push('KeyMark is not protected by auth-guard.');
if (!api.includes("if(p[0]==='keymark')")) failures.push('KeyMark API routes are not registered.');
if (!build.includes("'netlify'")) failures.push('Build script deployment exclusions changed unexpectedly.');
if (/NEXUS_ADMIN_PASSWORD\s*=/.test(netlify)) failures.push('A plaintext admin password is present in netlify.toml.');

const productionEnv = ['DATABASE_URL', 'KEYMARK_INTEGRATION_API_KEY'];
const deferredConnectorEnv = [
  'FHIR base URL and OAuth token URL in the KeyMark connection record',
  'private key or client secret in a protected environment variable',
  'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER for outreach'
];

if (failures.length) {
  failures.forEach(failure => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

console.log('KeyMark staging structure: ready');
console.log(`Required deployment environment: ${productionEnv.join(', ')}`);
console.log('Deferred until connector details arrive:');
deferredConnectorEnv.forEach(item => console.log(`- ${item}`));
