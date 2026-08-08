const { Client } = require('pg');
const { sendBrokerRequestConfirmation, sendBookingTeamsAlert } = require('../netlify/functions/api.cjs');

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve({ status: 'failed', error: `${label} timeout after ${ms}ms` }), ms);
    }),
  ]);
}

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const result = await client.query(
    `SELECT DISTINCT ON (br.booking_reference)
       br.id,
       br.booking_reference,
       br.broker_name,
       br.submitted_by,
       b.reference,
       b.name,
       b.service,
       b.pickup,
       b.destination,
       b.trip_date,
       b.trip_time,
       b.status,
       b.booking_source,
       b.driver_name
     FROM broker_requests br
     JOIN bookings b ON b.reference = br.booking_reference
     WHERE br.booking_reference IS NOT NULL
       AND br.created_at >= now() - interval '2 days'
     ORDER BY br.booking_reference, br.created_at DESC`
  );

  const rows = result.rows || [];
  const outcomes = [];

  for (const row of rows) {
    const toEmail = String(row.submitted_by || '').trim() || 'dispatch@nexusmt.com';
    let emailResult = { status: 'skipped' };
    let teamsResult = { status: 'skipped' };
    let error = null;

    try {
      emailResult = await withTimeout(sendBrokerRequestConfirmation(
        {
          id: row.id,
          booking_reference: row.booking_reference,
          request_status: row.status,
          broker_name: row.broker_name,
          pickup: row.pickup,
          destination: row.destination,
          trip_date: row.trip_date,
          trip_time: row.trip_time,
          submitted_by: row.submitted_by,
        },
        toEmail,
        row.broker_name || 'Broker request'
      ), 15000, `Email ${row.booking_reference}`);

      teamsResult = await withTimeout(sendBookingTeamsAlert(
        {
          reference: row.reference,
          name: row.name || row.broker_name || 'Broker Request',
          pickup: row.pickup,
          destination: row.destination,
          date: row.trip_date,
          time: String(row.trip_time || '').slice(0, 5),
          status: row.status,
          booking_source: row.booking_source,
          driver_name: row.driver_name,
        },
        'Broker Confirmation Review Required - Admin_NMT',
        'Broker Confirmation Intake'
      ), 15000, `Teams ${row.booking_reference}`);
    } catch (e) {
      error = e?.message || String(e);
    }

    outcomes.push({
      booking_reference: row.booking_reference,
      request_id: String(row.id),
      recipient: toEmail,
      emailResult,
      teamsResult,
      error,
    });
  }

  const sentEmail = outcomes.filter((o) => o.emailResult && o.emailResult.status === 'sent').length;
  const sentTeams = outcomes.filter((o) => o.teamsResult && o.teamsResult.status === 'sent').length;
  const failed = outcomes.filter((o) => o.error || (o.emailResult && o.emailResult.status === 'failed') || (o.teamsResult && o.teamsResult.status === 'failed')).length;

  console.log(JSON.stringify({
    total: outcomes.length,
    sentEmail,
    sentTeams,
    failed,
    outcomes,
  }, null, 2));

  await client.end();
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
