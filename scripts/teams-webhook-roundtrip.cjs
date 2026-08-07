const http = require('http');
const assert = require('node:assert/strict');

const PORT = 5099;
const HOST = '127.0.0.1';

async function run() {
  let captured = null;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(raw || '{}');
      } catch {
        parsed = { parseError: true, raw };
      }
      captured = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsed
      };
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  process.env.TEAMS_WEBHOOK_URL = `http://${HOST}:${PORT}/incoming-webhook/admin_nmt`;

  const api = require('../netlify/functions/api.cjs');
  const result = await api.sendBookingTeamsAlert(
    {
      reference: 'NMT-ROUNDTRIP-0001',
      name: 'Roundtrip Patient',
      pickup: '100 Test Pickup Ave',
      destination: '200 Test Destination Blvd',
      date: '2026-08-07',
      pickupTime: '15:30',
      status: 'SUBMITTED',
      bookingSource: 'CUSTOMER'
    },
    'Roundtrip Test - Admin_NMT',
    'New Trip Booked'
  );

  await new Promise((resolve) => setTimeout(resolve, 150));
  server.close();

  assert.equal(result.status, 'sent');
  assert.ok(captured, 'No webhook request was captured');
  assert.equal(captured.method, 'POST');
  assert.equal(captured.url, '/incoming-webhook/admin_nmt');
  assert.equal(captured.body.title, 'Roundtrip Test - Admin_NMT');
  assert.match(String(captured.body.text || ''), /NMT-ROUNDTRIP-0001/);

  console.log('Roundtrip result:', result.status);
  console.log('Captured webhook method:', captured.method);
  console.log('Captured webhook path:', captured.url);
  console.log('Captured webhook title:', captured.body.title);
  console.log('Captured webhook text preview:', String(captured.body.text || '').slice(0, 200));
}

run().catch((error) => {
  console.error('Roundtrip failed:', error.message);
  process.exitCode = 1;
});
