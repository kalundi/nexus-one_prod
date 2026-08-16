ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_type text NOT NULL DEFAULT 'ONE_WAY';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_trip_date date;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_trip_time time;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurrence_days jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurrence_end_date date;

CREATE INDEX IF NOT EXISTS idx_bookings_trip_schedule
 ON bookings(trip_type, recurrence_end_date)
 WHERE trip_type <> 'ONE_WAY';

INSERT INTO schema_migrations(version,description)
VALUES('067.001','Add round-trip and recurring booking schedules')
ON CONFLICT(version) DO NOTHING;
