BEGIN;

-- Track whether a booking was created by an online customer or by staff
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_source text NOT NULL DEFAULT 'CUSTOMER';

-- Deposit tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount        numeric(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_due           numeric(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_paid_at       timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_in_full_at       timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_reminder_sent_at timestamptz;

-- payment_status values used by this feature:
--   UNPAID            - no payment started
--   PENDING           - checkout session opened but not yet confirmed
--   DEPOSIT_PAID      - 25% deposit confirmed by Stripe webhook
--   PAID_IN_FULL      - 100% payment confirmed by Stripe webhook
--   INVOICED          - non-customer booking: invoice sent
--   BALANCE_REMINDER_SENT - deposit booking: balance-due SMS/email sent

INSERT INTO schema_migrations(version, description)
VALUES('050.001', 'Add deposit payment and booking source columns')
ON CONFLICT(version) DO NOTHING;

COMMIT;
