BEGIN;

-- The original fleet schema used status alone. Availability queries also
-- distinguish deactivated vehicles; preserve existing fleet records as active.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

INSERT INTO schema_migrations(version,description)
VALUES ('088.001','Add vehicle active flag required by trip save and availability checks')
ON CONFLICT(version) DO NOTHING;

COMMIT;
