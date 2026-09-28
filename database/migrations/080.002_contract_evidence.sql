BEGIN;
CREATE TABLE IF NOT EXISTS training_contract_subjects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('ORGANIZATION','DRIVER','ATTENDANT','VEHICLE')),
 market text NOT NULL CHECK(market IN ('DC','MD','VA')),
 levels text[] NOT NULL CHECK(cardinality(levels)>0 AND levels <@ ARRAY['AMBULATORY','WHEELCHAIR','STRETCHER','AMBULANCE']::text[]),
 user_id uuid REFERENCES users(id), credentialed_on date,
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS training_contract_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_id uuid NOT NULL REFERENCES training_contract_subjects(id), requirement_key text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('VERIFIED','MISSING','NOT_APPLICABLE')),
 completed_on date, expires_on date, evidence_reference text NOT NULL, notes text NOT NULL,
 reviewed_by uuid NOT NULL REFERENCES users(id), reviewed_at timestamptz NOT NULL DEFAULT now(),
 confirmation_reference text NOT NULL DEFAULT '', source_version text NOT NULL,
 CHECK (expires_on IS NULL OR completed_on IS NULL OR expires_on>=completed_on)
);
CREATE INDEX IF NOT EXISTS training_contract_evidence_latest ON training_contract_evidence(subject_id,requirement_key,reviewed_at DESC);
CREATE TABLE IF NOT EXISTS training_contract_date_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_id uuid NOT NULL REFERENCES training_contract_subjects(id),
 old_date date,new_date date NOT NULL,notes text NOT NULL,changed_by uuid NOT NULL REFERENCES users(id),changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE training_contract_date_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_contract_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_contract_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON training_contract_subjects,training_contract_evidence,training_contract_date_history FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON training_contract_subjects,training_contract_evidence,training_contract_date_history FROM anon;
 END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON training_contract_subjects,training_contract_evidence,training_contract_date_history FROM authenticated;
 END IF;
END $$;
INSERT INTO schema_migrations(version,description) VALUES('080.002','Access2Care contract evidence and credentialing dates') ON CONFLICT DO NOTHING;
COMMIT;
