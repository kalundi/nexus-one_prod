CREATE TABLE IF NOT EXISTS booking_promotions (
  id bigserial PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  display_code text NOT NULL,
  description text,
  service text NOT NULL,
  trip_date date NOT NULL,
  fixed_total numeric(12,2) NOT NULL CHECK (fixed_total >= 0),
  active boolean NOT NULL DEFAULT true,
  redeemed_booking_reference text,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promotion_code text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fare_before_promotion numeric(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promotion_discount numeric(12,2) NOT NULL DEFAULT 0;

-- Single-use negotiated stretcher fare for September 10, 2026.
-- Customer-facing code: SEP10-1995-NEXUS
INSERT INTO booking_promotions(code_hash,display_code,description,service,trip_date,fixed_total)
VALUES(
  '1d5e197a020890a2c14d85416d95159ee5ec718a92f76b6ff254eaea75d4fc4a',
  'SEP10-1995-NEXUS',
  'Negotiated stretcher ride total',
  'stretcher',
  DATE '2026-09-10',
  1995.00
)
ON CONFLICT(code_hash) DO NOTHING;
