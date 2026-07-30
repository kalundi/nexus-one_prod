BEGIN;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS idx_bookings_reminder ON bookings(trip_date, reminder_sent)
  WHERE status NOT IN ('CANCELLED','COMPLETED') AND reminder_sent IS NOT TRUE;

INSERT INTO schema_migrations(version,description)
  VALUES('006.001','Add reminder_sent, cancelled_at, cancel_reason to bookings')
  ON CONFLICT(version) DO NOTHING;

COMMIT;
