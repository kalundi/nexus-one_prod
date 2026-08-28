const { Client } = require('pg');
const api = require('../netlify/functions/api.cjs');

async function main() {
  const since = process.argv[2];
  if (!since) throw new Error('Usage: node scripts/resend-internal-broker-confirmations.cjs <ISO since timestamp>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(
    `SELECT id, booking_reference, request_status, broker_name, pickup, destination,
            trip_date, trip_time, submitted_by
       FROM broker_requests
      WHERE source_received_at >= $1::timestamptz
        AND booking_reference IS NOT NULL
      ORDER BY source_received_at ASC`,
    [since]
  );
  await client.end();

  let sent = 0;
  let failed = 0;
  for (const request of result.rows) {
    try {
      const response = await api.sendBrokerRequestConfirmation(
        request,
        request.submitted_by,
        request.broker_name || 'Broker request'
      );
      if (response?.email?.status === 'sent') sent += 1;
      else failed += 1;
    } catch (_error) {
      failed += 1;
    }
  }
  console.log(JSON.stringify({ matched: result.rows.length, sent, failed }));
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
