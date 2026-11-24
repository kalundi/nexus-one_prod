CREATE TABLE IF NOT EXISTS patient_return_pickups (
 booking_reference text PRIMARY KEY REFERENCES bookings(reference) ON DELETE CASCADE,
 requested_by uuid NOT NULL REFERENCES users(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_by uuid REFERENCES users(id),
 acknowledged_at timestamptz,
 CONSTRAINT return_pickup_ack_pair CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL))
);
CREATE INDEX IF NOT EXISTS patient_return_pickups_pending_idx ON patient_return_pickups(requested_at) WHERE acknowledged_at IS NULL;
ALTER TABLE patient_return_pickups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE patient_return_pickups FROM anon, authenticated;
