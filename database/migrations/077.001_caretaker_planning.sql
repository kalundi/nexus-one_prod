BEGIN;
CREATE TABLE IF NOT EXISTS caretaker_patients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL, phone text NOT NULL, relationship text NOT NULL,
 pickup text NOT NULL, service text NOT NULL CHECK(service IN ('AMBULATORY','WHEELCHAIR','STRETCHER')),
 notes text NOT NULL DEFAULT '', consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id)
);
CREATE INDEX IF NOT EXISTS caretaker_patients_owner ON caretaker_patients(owner_id);
CREATE TABLE IF NOT EXISTS caretaker_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 patient_id uuid NOT NULL, pickup text NOT NULL, destination text NOT NULL,
 trip_date date NOT NULL, trip_time time NOT NULL, appointment_time time NOT NULL,
 service text NOT NULL CHECK(service IN ('AMBULATORY','WHEELCHAIR','STRETCHER')),
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(patient_id,owner_id) REFERENCES caretaker_patients(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS caretaker_plans_owner_date ON caretaker_plans(owner_id,trip_date);
CREATE INDEX IF NOT EXISTS caretaker_plans_patient_owner ON caretaker_plans(patient_id,owner_id);
ALTER TABLE caretaker_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE caretaker_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON caretaker_patients,caretaker_plans FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON caretaker_patients,caretaker_plans FROM anon;
 END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON caretaker_patients,caretaker_plans FROM authenticated;
 END IF;
END $$;
INSERT INTO schema_migrations(version,description) VALUES('077.001','Caretaker patient profiles and transportation plans') ON CONFLICT DO NOTHING;
COMMIT;
