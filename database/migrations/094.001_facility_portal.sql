BEGIN;
CREATE TABLE IF NOT EXISTS facility_portal_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 facility_id text NOT NULL REFERENCES facilities(facility_code),
 booking_reference text NOT NULL REFERENCES bookings(reference) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES users(id),
 author_name text NOT NULL,
 author_role text NOT NULL CHECK(author_role IN ('FACILITY','ADMIN','DISPATCHER')),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(author_id,request_id)
);
CREATE INDEX IF NOT EXISTS facility_messages_trip_idx ON facility_portal_messages(facility_id,booking_reference,created_at DESC);
CREATE TABLE IF NOT EXISTS facility_portal_reads (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 booking_reference text NOT NULL REFERENCES bookings(reference) ON DELETE CASCADE,
 read_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,booking_reference)
);
ALTER TABLE facility_portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_portal_reads ENABLE ROW LEVEL SECURITY;
-- Only the trusted server database connection accesses these tables.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON facility_portal_messages,facility_portal_reads FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON facility_portal_messages,facility_portal_reads FROM authenticated;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS bookings_facility_service_day_idx ON bookings(facility_id,trip_date,trip_time);
CREATE INDEX IF NOT EXISTS bookings_facility_return_day_idx ON bookings(facility_id,return_trip_date);
INSERT INTO schema_migrations(version,description) VALUES('094.001','Production facility manager operations and shared dispatch communications') ON CONFLICT(version) DO NOTHING;
COMMIT;
