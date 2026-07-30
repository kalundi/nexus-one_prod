BEGIN;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS alternate_phone text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS alternate_email text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_updated_by text DEFAULT 'passenger';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_updated_at timestamptz;
INSERT INTO schema_migrations(version,description) VALUES('043.001','Add alternate contact info and trip update tracking') ON CONFLICT(version) DO NOTHING;
COMMIT;
