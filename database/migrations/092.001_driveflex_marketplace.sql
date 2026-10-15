BEGIN;
-- Career submissions existed before migrations managed their schema.
CREATE TABLE IF NOT EXISTS career_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),first_name text NOT NULL,last_name text NOT NULL,email text NOT NULL,phone text NOT NULL,
 city text NOT NULL,state text NOT NULL,position text NOT NULL,employment_preference text NOT NULL,available_start_date date,preferred_shift text,
 authorized_to_work boolean NOT NULL DEFAULT false,reliable_transportation boolean NOT NULL DEFAULT false,experience_years text NOT NULL,
 license_state text,certifications text,interest text NOT NULL,additional_information text,resume_name text,resume_mime_type text,resume_data bytea,
 status text NOT NULL DEFAULT 'NEW',internal_notes text,applicant_response text,notification_status jsonb NOT NULL DEFAULT '{}'::jsonb,
 reviewed_by uuid REFERENCES users(id),reviewed_at timestamptz,responded_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS driveflex_details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE driveflex_applicant_access (
 token_hash text PRIMARY KEY,application_id uuid NOT NULL REFERENCES career_applications(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driveflex_access_application ON driveflex_applicant_access(application_id,created_at);
CREATE TABLE driveflex_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL REFERENCES career_applications(id) ON DELETE CASCADE,
 requirement_key text NOT NULL,status text NOT NULL CHECK(status IN ('PENDING','APPROVED','CHANGES_NEEDED','TRAINING_REQUESTED','EXEMPT')),
 file_name text,mime_type text,file_size integer,encrypted_data bytea,file_iv bytea,file_tag bytea,
 expires_on date,review_note text,reviewed_by uuid REFERENCES users(id),reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(application_id,requirement_key)
);
CREATE TABLE driveflex_onboarding (
 application_id uuid PRIMARY KEY REFERENCES career_applications(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','READY_FOR_REVIEW','APPROVED')),
 driver_id uuid REFERENCES users(id),reviewed_by uuid REFERENCES users(id),reviewed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE driveflex_trips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_reference text NOT NULL UNIQUE REFERENCES bookings(reference),
 pickup_area text NOT NULL,destination_area text NOT NULL,service_level text NOT NULL CHECK(service_level IN ('AMBULATORY','WHEELCHAIR','EMT')),
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,payout_cents integer NOT NULL CHECK(payout_cents>0 AND payout_cents<=1000000),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SELECTED','CLOSED')),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(end_at>start_at)
);
CREATE INDEX driveflex_trips_open ON driveflex_trips(start_at) WHERE status='OPEN';
CREATE TABLE driveflex_trip_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid NOT NULL REFERENCES driveflex_trips(id),driver_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','SELECTED','REJECTED','WITHDRAWN')),
 payout_cents integer NOT NULL CHECK(payout_cents>0),reviewed_by uuid REFERENCES users(id),reviewed_at timestamptz,
 paid_at timestamptz,payment_reference text,paid_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(trip_id,driver_id)
);
CREATE UNIQUE INDEX driveflex_trip_single_selection ON driveflex_trip_requests(trip_id) WHERE status='SELECTED';
CREATE INDEX driveflex_request_driver ON driveflex_trip_requests(driver_id,created_at DESC);
CREATE TABLE driveflex_access_rate (key text PRIMARY KEY,window_start timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 1);
ALTER TABLE driveflex_applicant_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE driveflex_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE driveflex_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE driveflex_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE driveflex_trip_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE driveflex_access_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON driveflex_applicant_access,driveflex_credentials,driveflex_onboarding,driveflex_trips,driveflex_trip_requests,driveflex_access_rate FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON driveflex_applicant_access,driveflex_credentials,driveflex_onboarding,driveflex_trips,driveflex_trip_requests,driveflex_access_rate FROM anon'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON driveflex_applicant_access,driveflex_credentials,driveflex_onboarding,driveflex_trips,driveflex_trip_requests,driveflex_access_rate FROM authenticated'; END IF;
END $$;
INSERT INTO schema_migrations(version,description) VALUES('092.001','DriveFlex recruiting, private credentials and fixed-payout trip requests') ON CONFLICT DO NOTHING;
COMMIT;
