ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payer_type text NOT NULL DEFAULT 'SELF_PAY';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS requires_deposit boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_confirmed_by text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS facility_invoice_sent_at timestamptz;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recipient_email text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at timestamptz;

INSERT INTO schema_migrations(version,description)
VALUES('064.001','Enforce guest deposits, self-pay boarding payment, and post-trip facility invoices')
ON CONFLICT(version) DO NOTHING;
