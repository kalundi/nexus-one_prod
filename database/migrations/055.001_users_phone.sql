BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;

UPDATE users
SET phone = '301-500-7946',
    updated_at = now()
WHERE lower(email) = lower('fletcher@nexusmt.com')
   OR lower(display_name) = lower('Fletcher Kalundi');

COMMIT;