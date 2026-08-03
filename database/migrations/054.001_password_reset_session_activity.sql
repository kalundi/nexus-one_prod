-- Migration 054.001: Password reset + session inactivity tracking
-- Adds must_change_password flag, password reset token fields,
-- and last_activity_at for session timeout enforcement.

-- ── Users: password reset fields ──────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_used boolean DEFAULT false;

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;

-- ── Sessions: inactivity tracking ─────────────────────────────
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity_at)
  WHERE last_activity_at IS NOT NULL;

-- ── Fletcher Kalundi: set temporary password + must_change ─────
-- Temp password: NexusDriver1! (hashed with SHA-256)
-- Driver should change this on first login.
UPDATE users
SET
  password_hash = encode(sha256('NexusDriver1!'::bytea), 'hex'),
  must_change_password = true,
  updated_at = now()
WHERE lower(email) = 'fletcher@nexusmt.com';

-- ── Schema version ─────────────────────────────────────────────
INSERT INTO schema_migrations(version, description)
VALUES('054.001', 'Password reset fields, session activity tracking, Fletcher temp password')
ON CONFLICT(version) DO NOTHING;
