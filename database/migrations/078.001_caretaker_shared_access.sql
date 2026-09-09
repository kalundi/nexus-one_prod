BEGIN;
ALTER TABLE user_role_requests DROP CONSTRAINT IF EXISTS user_role_requests_role_check;
ALTER TABLE user_role_requests ADD CONSTRAINT user_role_requests_role_check CHECK(role IN ('PATIENT','CARETAKER','DRIVER','FACILITY','DISPATCHER','BILLING','QA','EXECUTIVE','ADMIN'));
CREATE TABLE caretaker_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), caretaker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 patient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REVOKED')),
 alerts_enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(caretaker_id,patient_id), CHECK(caretaker_id<>patient_id)
);
CREATE INDEX caretaker_access_patient ON caretaker_access(patient_id,status);
ALTER TABLE caretaker_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON caretaker_access FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON caretaker_access FROM anon; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON caretaker_access FROM authenticated; END IF;
END $$;
ALTER TABLE bookings ADD COLUMN caretaker_owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN caretaker_patient_id uuid REFERENCES caretaker_patients(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN caretaker_subject_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE caretaker_patients ADD COLUMN alerts_enabled boolean NOT NULL DEFAULT false;
CREATE INDEX bookings_caretaker_owner ON bookings(caretaker_owner_id);
CREATE INDEX bookings_caretaker_subject ON bookings(caretaker_subject_id);
CREATE INDEX bookings_caretaker_patient ON bookings(caretaker_patient_id);
INSERT INTO schema_migrations(version,description) VALUES('078.001','Shared caretaker login, patient grants, booking ownership and alerts') ON CONFLICT DO NOTHING;
COMMIT;
