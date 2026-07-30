BEGIN;

-- Add all missing columns to bookings table to match API expectations
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_date date;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_time time;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lat numeric(10,7);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lng numeric(10,7);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS destination_lat numeric(10,7);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS destination_lng numeric(10,7);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS distance_miles numeric(8,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_duration text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_fare numeric(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS facility_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_scope_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_unit text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notification_status jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'UNPAID';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bookings_facility ON bookings(facility_id) WHERE facility_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_driver ON bookings(driver_scope_id) WHERE driver_scope_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_trip_date ON bookings(trip_date DESC) WHERE trip_date IS NOT NULL;

INSERT INTO schema_migrations(version,description) VALUES('005.001','Bookings table schema expansion: add all API-required columns') ON CONFLICT(version) DO NOTHING;

COMMIT;
