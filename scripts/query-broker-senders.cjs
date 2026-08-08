const { Client } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const columns = await client.query(
    "SELECT column_name,data_type FROM information_schema.columns WHERE table_name='audit_log' ORDER BY ordinal_position"
  );
  console.log('COLUMNS', JSON.stringify(columns.rows));
  const detailCol = columns.rows.find((row) => row.column_name === 'details')
    ? 'details'
    : columns.rows.find((row) => row.column_name === 'metadata')
      ? 'metadata'
      : null;
  if (detailCol) {
    const result = await client.query(
      `SELECT ${detailCol}->>'from' AS sender, count(*)::int AS count FROM audit_log WHERE entity_type='BROKER_REQUEST' AND action='EMAIL_RECEIVED' GROUP BY ${detailCol}->>'from' ORDER BY count DESC`
    );
    console.log('SENDERS', JSON.stringify(result.rows));
  }
  const submitters = await client.query(
    "SELECT submitted_by, count(*)::int AS count FROM broker_requests WHERE submission_method='EMAIL_ATTACHMENT' GROUP BY submitted_by ORDER BY count DESC"
  );
  console.log('SUBMITTERS', JSON.stringify(submitters.rows));
  await client.end();
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
