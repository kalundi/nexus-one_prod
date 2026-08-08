const { Client } = require('pg');

function parseDetails(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const recent = await client.query(
    `SELECT id::text AS id, booking_reference, broker_name, submitted_by, created_at
     FROM broker_requests
     WHERE booking_reference IS NOT NULL
       AND created_at >= now() - interval '2 days'
     ORDER BY created_at DESC
     LIMIT 300`
  );

  const ids = recent.rows.map((row) => row.id);
  let logs = [];
  if (ids.length) {
    const columns = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='audit_log'"
    );
    const availableColumns = columns.rows.map((row) => String(row.column_name));
    const payloadCandidates = ['details', 'metadata', 'payload', 'data'];
    const payloadColumn = payloadCandidates.find((name) => availableColumns.includes(name));
    if (payloadColumn) {
      const notificationLogs = await client.query(
        `SELECT entity_id::text AS request_id, ${payloadColumn} AS payload
         FROM audit_log
         WHERE entity_type = 'BROKER_REQUEST'
           AND action = 'NOTIFICATION_SENT'
           AND entity_id = ANY($1::text[])`,
        [ids]
      );
      logs = notificationLogs.rows || [];
    } else {
      console.log(JSON.stringify({
        warning: 'No supported payload column found on audit_log; treating all recent records as needing resend',
        auditColumns: availableColumns,
      }, null, 2));
      logs = [];
    }
  }

  const sentByRequest = new Map();
  for (const row of logs) {
    const details = parseDetails(row.payload);
    if (!details) continue;
    const key = String(row.request_id);
    if (!sentByRequest.has(key)) {
      sentByRequest.set(key, { teams: false, email: false });
    }
    const sent = sentByRequest.get(key);
    if (details.channel === 'TEAMS_REVIEW' && details.status === 'sent') sent.teams = true;
    if (details.channel === 'BROKER_CONFIRMATION_EMAIL' && details.status === 'sent') sent.email = true;
  }

  const candidates = recent.rows
    .map((row) => {
      const sent = sentByRequest.get(String(row.id)) || { teams: false, email: false };
      return {
        id: row.id,
        booking_reference: row.booking_reference,
        broker_name: row.broker_name,
        submitted_by: row.submitted_by,
        created_at: row.created_at,
        teams_sent: sent.teams,
        email_sent: sent.email,
      };
    })
    .filter((row) => !row.teams_sent || !row.email_sent);

  console.log(JSON.stringify({
    total_recent_booked: recent.rows.length,
    needs_resend: candidates.length,
    candidates,
  }, null, 2));

  await client.end();
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
