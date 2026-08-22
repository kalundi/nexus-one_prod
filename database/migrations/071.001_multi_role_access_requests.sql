BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_role text;

CREATE TABLE IF NOT EXISTS user_role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('PATIENT','DRIVER','FACILITY','DISPATCHER','BILLING','QA','EXECUTIVE','ADMIN')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  scope_id text,
  notes text,
  UNIQUE(user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_role_requests_status ON user_role_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_role_requests_user ON user_role_requests(user_id, status);
ALTER TABLE user_role_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE user_role_requests FROM anon, authenticated;

INSERT INTO user_role_requests(user_id,role,status,reviewed_at,scope_id)
SELECT id,role,'APPROVED',now(),scope_id FROM users
WHERE role IN ('PATIENT','DRIVER','FACILITY','DISPATCHER','BILLING','QA','EXECUTIVE','ADMIN')
ON CONFLICT(user_id,role) DO UPDATE SET status='APPROVED',reviewed_at=COALESCE(user_role_requests.reviewed_at,now()),scope_id=COALESCE(user_role_requests.scope_id,EXCLUDED.scope_id);

INSERT INTO schema_migrations(version,description) VALUES('071.001','Multi-role access requests, admin approval, and session role switching') ON CONFLICT(version) DO NOTHING;

COMMIT;
