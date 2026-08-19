CREATE TABLE IF NOT EXISTS secure_documents (
  document_key text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  original_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg')),
  file_size integer NOT NULL CHECK (file_size > 0),
  file_data bytea NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_secure_documents_active_created
  ON secure_documents(active,created_at DESC);
INSERT INTO schema_migrations(version,description)
VALUES('068.001','Admin-managed secure document repository')
ON CONFLICT(version) DO NOTHING;
