const { Client } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const summary = await client.query(
    "SELECT submission_method, count(*)::int AS count FROM broker_requests WHERE created_at >= now() - interval '30 minutes' GROUP BY submission_method ORDER BY count DESC"
  );
  const recent = await client.query(
    "SELECT id,booking_reference,broker_name,trip_date,trip_time,submission_method,submitted_by,source_message_id FROM broker_requests WHERE created_at >= now() - interval '30 minutes' ORDER BY id DESC LIMIT 25"
  );

  console.log('SUMMARY', JSON.stringify(summary.rows));
  console.log('RECENT', JSON.stringify(recent.rows));

  await client.end();
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
