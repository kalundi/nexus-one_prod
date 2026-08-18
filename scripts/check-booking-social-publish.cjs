const { Pool } = require('pg');

(async () => {
  const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!connectionString) throw new Error('Database connection is not configured.');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const result = await pool.query(`
    SELECT channel, status, response, error_message, created_at
    FROM social_publish_history
    WHERE post_id = 'shorts-hook-001'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
