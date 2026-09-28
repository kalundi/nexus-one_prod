BEGIN;
CREATE TABLE IF NOT EXISTS training_materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_key text NOT NULL, version text NOT NULL, title text NOT NULL,
 description text NOT NULL DEFAULT '', kind text NOT NULL CHECK(kind IN ('POLICY','TRAINING')),
 file_data bytea, resource_url text, content_hash text NOT NULL, requires_external_evidence boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(policy_key,version),
 CHECK ((file_data IS NOT NULL) <> (resource_url IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS training_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id), material_id uuid NOT NULL REFERENCES training_materials(id),
 cycle text NOT NULL, due_at timestamptz NOT NULL, assigned_by uuid NOT NULL REFERENCES users(id),
 assigned_at timestamptz NOT NULL DEFAULT now(), requires_verification boolean NOT NULL DEFAULT false,
 opened_at timestamptz, acknowledged_at timestamptz, acknowledged_name text, acknowledgment_text text,
 verified_at timestamptz, verified_by uuid REFERENCES users(id), verification_notes text,
 UNIQUE(user_id,material_id,cycle),
 CHECK (acknowledged_at IS NULL OR (opened_at IS NOT NULL AND acknowledged_name IS NOT NULL AND acknowledgment_text IS NOT NULL)),
 CHECK (verified_at IS NULL OR (acknowledged_at IS NOT NULL AND verified_by IS NOT NULL AND verification_notes IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS training_assignments_user ON training_assignments(user_id,due_at);
CREATE INDEX IF NOT EXISTS training_assignments_material ON training_assignments(material_id);
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON training_materials,training_assignments FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON training_materials,training_assignments FROM anon;
 END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON training_materials,training_assignments FROM authenticated;
 END IF;
END $$;
INSERT INTO schema_migrations(version,description) VALUES('080.001','Staff policy versions, assignments, acknowledgments and training verification') ON CONFLICT DO NOTHING;
COMMIT;
