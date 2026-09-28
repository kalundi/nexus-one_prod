BEGIN;
ALTER TABLE training_assignments ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz;
ALTER TABLE training_assignments ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
ALTER TABLE training_assignments ADD COLUMN IF NOT EXISTS notification_claimed_at timestamptz;
CREATE TABLE IF NOT EXISTS training_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES training_assignments(id),
 uploaded_by uuid NOT NULL REFERENCES users(id), filename text NOT NULL, file_data bytea NOT NULL,
 content_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_documents_assignment ON training_documents(assignment_id);
ALTER TABLE training_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON training_documents FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON training_documents FROM anon; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON training_documents FROM authenticated; END IF;
END $$;
INSERT INTO schema_migrations(version,description) VALUES('080.004','Central training evidence and administrator approval notifications') ON CONFLICT DO NOTHING;
COMMIT;
