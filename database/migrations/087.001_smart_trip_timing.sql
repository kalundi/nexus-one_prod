BEGIN;
CREATE TABLE IF NOT EXISTS facility_timing_profiles (
 address_key text PRIMARY KEY,
 address text NOT NULL,
 name text NOT NULL DEFAULT '',
 facility_type text NOT NULL DEFAULT 'UNKNOWN' CHECK (facility_type IN ('UNKNOWN','RESIDENCE','REHAB','HOSPITAL','DIALYSIS','NURSING','CLINIC')),
 pickup_extra_minutes numeric NOT NULL DEFAULT 0 CHECK (pickup_extra_minutes BETWEEN 0 AND 120),
 handoff_extra_minutes numeric NOT NULL DEFAULT 0 CHECK (handoff_extra_minutes BETWEEN 0 AND 120),
 service_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
 peak_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
 access_instructions text NOT NULL DEFAULT '',
 receiving_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE facility_timing_profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS facility_identity_cache(address_key text PRIMARY KEY,identity jsonb NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE facility_identity_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS appointment_date date;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS timing_plan jsonb;
CREATE INDEX IF NOT EXISTS idx_bookings_timing_history ON bookings(trip_date DESC) WHERE status='COMPLETED';
CREATE INDEX IF NOT EXISTS idx_bookings_pickup_handling ON bookings((trim(regexp_replace(lower(pickup),'[^a-z0-9]+',' ','g'))),trip_date DESC) WHERE status='COMPLETED';
CREATE INDEX IF NOT EXISTS idx_bookings_destination_handling ON bookings((trim(regexp_replace(lower(destination),'[^a-z0-9]+',' ','g'))),trip_date DESC) WHERE status='COMPLETED';
CREATE INDEX IF NOT EXISTS idx_bookings_driver_schedule ON bookings(driver_name,trip_date) WHERE status NOT IN ('CANCELLED','COMPLETED','NO_SHOW','MISSED','DUPLICATE');
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_schedule ON bookings(vehicle_unit,trip_date) WHERE status NOT IN ('CANCELLED','COMPLETED','NO_SHOW','MISSED','DUPLICATE');
UPDATE system_settings SET value=jsonb_set(value,'{fareRules}',COALESCE(value->'fareRules','{}'::jsonb)||jsonb_build_object('smartTiming',jsonb_build_object('enabled',true,'checkInLeadMinutes',15,'reliabilityBufferMinutes',5,'minimumHistorySamples',10,'historyPercentile',85)),true) WHERE key='platform';
INSERT INTO schema_migrations(version,description) VALUES ('087.001','Shared service preparation, facility handling history and smart trip timing') ON CONFLICT(version) DO NOTHING;
COMMIT;
