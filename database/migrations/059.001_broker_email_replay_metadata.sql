BEGIN;

ALTER TABLE broker_requests
ADD COLUMN IF NOT EXISTS source_message_id text;

ALTER TABLE broker_requests
ADD COLUMN IF NOT EXISTS source_received_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_requests_source_message_id
ON broker_requests(source_message_id)
WHERE source_message_id IS NOT NULL;

INSERT INTO schema_migrations(version, description)
VALUES('059.001', 'Add broker email replay metadata and dedupe index')
ON CONFLICT(version) DO NOTHING;

COMMIT;
