ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coverage_status text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coverage_message text;

INSERT INTO schema_migrations(version,description)
VALUES('065.001','Apply payer and transportation-service coverage decisions to booking confirmation')
ON CONFLICT(version) DO NOTHING;
