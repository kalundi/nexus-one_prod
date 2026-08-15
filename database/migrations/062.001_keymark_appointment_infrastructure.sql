BEGIN;

CREATE TABLE IF NOT EXISTS keymark_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  facility_id text,
  external_appointment_id text NOT NULL,
  source_system text NOT NULL DEFAULT 'MANUAL',
  patient_external_id text,
  patient_name text NOT NULL,
  patient_phone text,
  patient_email text,
  appointment_at timestamptz NOT NULL,
  department text,
  appointment_type text,
  eligibility_status text NOT NULL DEFAULT 'PENDING',
  consent_status text NOT NULL DEFAULT 'UNKNOWN',
  barrier_codes text[] NOT NULL DEFAULT '{}',
  outreach_status text NOT NULL DEFAULT 'NOT_STARTED',
  next_outreach_at timestamptz,
  transportation_required boolean,
  transportation_mode text,
  transportation_status text NOT NULL DEFAULT 'NOT_ASSESSED',
  booking_reference text REFERENCES bookings(reference) ON DELETE SET NULL,
  arrival_risk_score integer NOT NULL DEFAULT 0 CHECK (arrival_risk_score BETWEEN 0 AND 100),
  arrival_status text NOT NULL DEFAULT 'PENDING',
  outcome_reason_code text,
  notes text,
  integration_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system, external_appointment_id)
);

CREATE TABLE IF NOT EXISTS keymark_events (
  id bigserial PRIMARY KEY,
  appointment_id uuid NOT NULL REFERENCES keymark_appointments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_status text,
  channel text,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keymark_appointments_schedule ON keymark_appointments(appointment_at);
CREATE INDEX IF NOT EXISTS idx_keymark_appointments_risk ON keymark_appointments(arrival_risk_score DESC, appointment_at);
CREATE INDEX IF NOT EXISTS idx_keymark_appointments_facility ON keymark_appointments(facility_id, appointment_at);
CREATE INDEX IF NOT EXISTS idx_keymark_events_appointment ON keymark_events(appointment_id, occurred_at DESC);

INSERT INTO schema_migrations(version, description)
VALUES('062.001', 'Add Nexus KeyMark appointment-to-arrival infrastructure')
ON CONFLICT(version) DO NOTHING;

COMMIT;
