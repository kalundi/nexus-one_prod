CREATE TABLE IF NOT EXISTS broker_notification_log (
  id bigserial PRIMARY KEY,
  broker_request_id bigint NOT NULL REFERENCES broker_requests(id) ON DELETE CASCADE,
  source_message_id text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker_request_id, source_message_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_broker_notification_log_message
  ON broker_notification_log(source_message_id, channel, status);

-- Existing replayed messages were already notified before this ledger existed.
-- Seed them so the scheduled poller cannot resend them after deployment.
INSERT INTO broker_notification_log(broker_request_id,source_message_id,channel,status)
SELECT id,source_message_id,channel,'sent'
FROM broker_requests
CROSS JOIN (VALUES ('BROKER_CONFIRMATION_EMAIL'),('TEAMS_REVIEW')) AS channels(channel)
WHERE source_message_id IS NOT NULL
ON CONFLICT(broker_request_id,source_message_id,channel) DO NOTHING;

INSERT INTO schema_migrations(version,description)
VALUES('074.001','Add durable broker notification deduplication ledger')
ON CONFLICT(version) DO NOTHING;
