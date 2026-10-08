BEGIN;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS flight_info jsonb;

CREATE TABLE IF NOT EXISTS flight_lookup_rate_limits (
  ip_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0
);

ALTER TABLE flight_lookup_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE flight_lookup_rate_limits FROM anon, authenticated;

INSERT INTO schema_migrations(version, description)
VALUES('061.001', 'Store airport flight and terminal lookup details')
ON CONFLICT(version) DO NOTHING;

COMMIT;
