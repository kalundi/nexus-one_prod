BEGIN;

CREATE TABLE IF NOT EXISTS sms_consent_registry (
  phone_number text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('OPTED_OUT', 'OPTED_IN')),
  source text NOT NULL DEFAULT 'TWILIO_WEBHOOK',
  provider_message_id text,
  last_keyword text,
  opted_out_at timestamptz,
  opted_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_registry_status ON sms_consent_registry(status, updated_at DESC);

INSERT INTO schema_migrations(version, description)
VALUES('069.001', 'Add centralized SMS consent and suppression registry')
ON CONFLICT(version) DO NOTHING;

COMMIT;
