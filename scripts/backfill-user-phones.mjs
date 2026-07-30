import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;

if (!connectionString) {
  console.log('[BACKFILL-PHONES] Missing DATABASE_URL or NETLIFY_DB_URL. Skipping.');
  process.exit(0);
}

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

const MD_AREA_CODES = ['240', '301', '410', '443', '667'];

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhone(area, exchange, subscriber) {
  return `(${area}) ${exchange}-${subscriber}`;
}

function randomFromDigest(digestHex, offset, modulo, min) {
  const chunk = digestHex.slice(offset, offset + 8) || digestHex.slice(0, 8);
  const parsed = Number.parseInt(chunk, 16);
  const base = Number.isFinite(parsed) ? parsed : crypto.randomInt(1, 1_000_000);
  return String((base % modulo) + min);
}

function generatePhone(seed, inUseDigits) {
  const digest = crypto.createHash('sha256').update(`${seed}:${Date.now()}:${crypto.randomUUID()}`).digest('hex');

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const area = MD_AREA_CODES[(Number.parseInt(digest.slice((attempt % 4) * 2, (attempt % 4) * 2 + 2), 16) || 0) % MD_AREA_CODES.length];
    const exchange = randomFromDigest(digest, 8 + (attempt % 6), 800, 200).padStart(3, '0');
    const subscriber = randomFromDigest(digest, 18 + (attempt % 6), 9000, 1000).padStart(4, '0');
    const formatted = formatPhone(area, exchange, subscriber);
    const digits = normalizeDigits(formatted);
    if (!inUseDigits.has(digits)) {
      inUseDigits.add(digits);
      return formatted;
    }
  }

  while (true) {
    const area = MD_AREA_CODES[crypto.randomInt(0, MD_AREA_CODES.length)];
    const exchange = String(crypto.randomInt(200, 1000));
    const subscriber = String(crypto.randomInt(1000, 10000));
    const formatted = formatPhone(area, exchange, subscriber);
    const digits = normalizeDigits(formatted);
    if (!inUseDigits.has(digits)) {
      inUseDigits.add(digits);
      return formatted;
    }
  }
}

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const table = await client.query("SELECT to_regclass('public.users') AS name");
  if (!table.rows[0]?.name) {
    console.log('[BACKFILL-PHONES] users table not found. Skipping.');
    await client.query('ROLLBACK');
    process.exit(0);
  }

  await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text');

  const users = await client.query('SELECT id, email, phone FROM users ORDER BY created_at ASC NULLS LAST, email ASC');
  const inUseDigits = new Set(
    users.rows
      .map((row) => normalizeDigits(row.phone))
      .filter((digits) => digits.length === 10)
  );

  let updated = 0;
  for (const row of users.rows) {
    const currentDigits = normalizeDigits(row.phone);
    const hasPhone = currentDigits.length >= 10;
    if (hasPhone) continue;

    const generated = generatePhone(`${row.id}:${row.email}`, inUseDigits);
    await client.query('UPDATE users SET phone=$2, updated_at=now() WHERE id=$1', [row.id, generated]);
    updated += 1;
    console.log(`[BACKFILL-PHONES] ${row.email}: ${generated}`);
  }

  await client.query('COMMIT');
  console.log(`[BACKFILL-PHONES] Completed. Updated ${updated} account(s).`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('[BACKFILL-PHONES] Error:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
