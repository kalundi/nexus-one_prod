BEGIN;
CREATE TABLE IF NOT EXISTS booking_calendar_sync (
 booking_reference text PRIMARY KEY REFERENCES bookings(reference) ON DELETE CASCADE,
 graph_event_id text,
 sync_status text NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING','SYNCED','CANCELLED','FAILED')),
 last_error text,
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 synced_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE booking_calendar_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_calendar_sync FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON booking_calendar_sync FROM anon;
 END IF;
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON booking_calendar_sync FROM authenticated;
 END IF;
END $$;
INSERT INTO schema_migrations(version,description) VALUES('081.001','Private Microsoft 365 calendar event mapping for bookings') ON CONFLICT DO NOTHING;
COMMIT;
