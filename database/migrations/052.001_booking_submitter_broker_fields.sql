BEGIN;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS submitter_entity text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS broker_company_name text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS broker_accepted_rate numeric(12,2);

INSERT INTO schema_migrations(version,description)
VALUES('052.001','Add booking submitter and broker payment fields')
ON CONFLICT(version) DO NOTHING;

COMMIT;
