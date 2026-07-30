BEGIN;

-- Ensure all required users columns exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_subject text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'USER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS scope_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure all required bookings columns exist
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_code text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_id bigint;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDING';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_time timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_time timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_location text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_location text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure all required sessions columns exist
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_digest text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Ensure all required audit_log columns exist
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changes jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Ensure all required trip_status_history columns exist
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS booking_reference text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS status_label text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE trip_status_history ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Populate identity_subject for any existing users who don't have one
UPDATE users SET identity_subject = gen_random_uuid()::text WHERE identity_subject IS NULL OR identity_subject = '';

INSERT INTO schema_migrations(version,description) VALUES('003.001','Add missing columns to existing tables for schema completeness') ON CONFLICT(version) DO NOTHING;

COMMIT;
