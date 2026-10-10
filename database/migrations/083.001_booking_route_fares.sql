BEGIN;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS route_fare_inputs jsonb;
CREATE TABLE IF NOT EXISTS fare_route_cache (
 route_key text PRIMARY KEY,
 inputs jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version,description) VALUES('083.001','Store measured passenger and empty route segments for current fare estimates') ON CONFLICT DO NOTHING;
COMMIT;
