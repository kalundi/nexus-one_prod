BEGIN;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_fee_amount numeric(10,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_fee_applied boolean DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_rule_snapshot jsonb;

INSERT INTO schema_migrations(version,description)
VALUES('046.001','Add cancellation fee policy result fields to bookings')
ON CONFLICT(version) DO NOTHING;

COMMIT;
