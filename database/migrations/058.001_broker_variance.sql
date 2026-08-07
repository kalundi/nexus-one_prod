BEGIN;

ALTER TABLE broker_requests
ADD COLUMN IF NOT EXISTS variance numeric(10,2);

UPDATE broker_requests
SET variance = COALESCE(variance, rate_delta)
WHERE variance IS NULL;

INSERT INTO schema_migrations(version, description)
VALUES('058.001', 'Add broker request variance field and backfill from rate_delta')
ON CONFLICT(version) DO NOTHING;

COMMIT;
