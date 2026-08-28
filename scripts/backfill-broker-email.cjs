const graphMailSync = require('../netlify/functions/graph-mail-sync.cjs');

async function main() {
  const since = process.argv[2];
  if (!since) throw new Error('Usage: node scripts/backfill-broker-email.cjs <ISO since timestamp>');

  const response = await graphMailSync.handler({
    httpMethod: 'GET',
    queryStringParameters: { since, top: '50' },
  });
  const body = JSON.parse(response.body || '{}');
  const summarize = (field) => {
    const counts = new Map();
    for (const result of body.results || []) {
      const value = result?.body?.[field] || (result?.status === 'failed' ? 'failed' : null);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Object.fromEntries(counts);
  };

  console.log(JSON.stringify({
    statusCode: response.statusCode,
    processed: body.processed || 0,
    totalMessages: body.totalMessages || 0,
    failed: body.failed || 0,
    savedSince: body.savedSince || null,
    emailNotifications: summarize('email_notification_status'),
    teamsNotifications: summarize('teams_notification_status'),
    error: body.error || null,
  }));
  if (response.statusCode >= 400 || body.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
