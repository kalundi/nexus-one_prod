ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS square_payment_link_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS square_order_id text;