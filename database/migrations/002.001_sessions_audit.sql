BEGIN;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_digest text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all required sessions columns exist (idempotent for pre-existing tables)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_digest text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sessions_token_digest ON sessions(token_digest);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all required audit_log columns exist (idempotent for pre-existing tables)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changes jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trip_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text NOT NULL REFERENCES bookings(reference) ON DELETE CASCADE,
  status text NOT NULL,
  status_label text,
  note text,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all required trip_status_history columns exist (idempotent for pre-existing tables)
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS booking_reference text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS status_label text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_trip_status_history_booking ON trip_status_history(booking_reference, created_at DESC);

INSERT INTO schema_migrations(version,description) VALUES('002.001','Sessions, audit logs and trip history tables for authentication and compliance') ON CONFLICT(version) DO NOTHING;

COMMIT;
