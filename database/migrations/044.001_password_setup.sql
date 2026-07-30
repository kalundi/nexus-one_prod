BEGIN;

CREATE TABLE IF NOT EXISTS password_setup_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_digest text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_user_id ON password_setup_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_expires_at ON password_setup_tokens(expires_at);

INSERT INTO schema_migrations(version,description)
VALUES('044.001','Add password setup tokens for emailed password invitations')
ON CONFLICT(version) DO NOTHING;

COMMIT;