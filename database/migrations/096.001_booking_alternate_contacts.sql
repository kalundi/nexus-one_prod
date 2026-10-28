BEGIN;
-- Both booking creation and editing persist these optional contact fields.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS alternate_phone text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS alternate_email text;
INSERT INTO schema_migrations(version,description)
VALUES('096.001','Persist optional alternate booking phone and email contacts')
ON CONFLICT(version) DO NOTHING;
COMMIT;
