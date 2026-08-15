BEGIN;
CREATE TABLE IF NOT EXISTS keymark_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
 facility_id text, name text NOT NULL, vendor text NOT NULL, protocol text NOT NULL,
 base_url text, auth_type text NOT NULL DEFAULT 'OAUTH2', status text NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
 configuration jsonb NOT NULL DEFAULT '{}'::jsonb, last_success_at timestamptz, last_error_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,name)
);
CREATE TABLE IF NOT EXISTS keymark_integration_messages (
 id bigserial PRIMARY KEY, connection_id uuid REFERENCES keymark_connections(id) ON DELETE SET NULL,
 direction text NOT NULL, protocol text NOT NULL, source_system text NOT NULL, external_message_id text,
 payload_digest text NOT NULL, status text NOT NULL, appointment_id uuid REFERENCES keymark_appointments(id) ON DELETE SET NULL,
 error_code text, error_message text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(source_system,payload_digest)
);
CREATE TABLE IF NOT EXISTS keymark_communications (
 id bigserial PRIMARY KEY, appointment_id uuid NOT NULL REFERENCES keymark_appointments(id) ON DELETE CASCADE,
 channel text NOT NULL, template_key text NOT NULL, destination text, consent_verified boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'QUEUED', scheduled_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 provider_message_id text, attempt_count integer NOT NULL DEFAULT 0, last_error text,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS keymark_payer_requests (
 id bigserial PRIMARY KEY, appointment_id uuid NOT NULL REFERENCES keymark_appointments(id) ON DELETE CASCADE,
 payer_name text NOT NULL, request_type text NOT NULL DEFAULT 'ELIGIBILITY', external_request_id text,
 status text NOT NULL DEFAULT 'QUEUED', benefit_status text, transportation_benefit jsonb NOT NULL DEFAULT '{}'::jsonb,
 requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, last_error text,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_keymark_messages_status ON keymark_integration_messages(status,received_at);
CREATE INDEX IF NOT EXISTS idx_keymark_communications_queue ON keymark_communications(status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_keymark_payer_queue ON keymark_payer_requests(status,requested_at);
INSERT INTO schema_migrations(version,description) VALUES('063.001','Add KeyMark vendor connector, communications, and payer gateway') ON CONFLICT(version) DO NOTHING;
COMMIT;
