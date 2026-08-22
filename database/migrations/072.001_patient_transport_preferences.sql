BEGIN;

CREATE TABLE IF NOT EXISTS patient_transport_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mobility_type text NOT NULL DEFAULT 'AMBULATORY' CHECK (mobility_type IN ('AMBULATORY','WHEELCHAIR','BRODA','STRETCHER','BARIATRIC')),
  remains_in_wheelchair boolean NOT NULL DEFAULT false,
  transfer_assistance boolean NOT NULL DEFAULT false,
  oxygen_required boolean NOT NULL DEFAULT false,
  preferred_language text,
  communication_preference text NOT NULL DEFAULT 'SMS' CHECK (communication_preference IN ('SMS','VOICE','EMAIL')),
  default_pickup text,
  accessibility_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patient_transport_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE patient_transport_preferences FROM anon, authenticated;
INSERT INTO schema_migrations(version,description) VALUES('072.001','Persistent patient transportation and accessibility preferences') ON CONFLICT(version) DO NOTHING;

COMMIT;
