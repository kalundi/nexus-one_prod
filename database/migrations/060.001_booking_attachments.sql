BEGIN;

CREATE TABLE IF NOT EXISTS booking_attachments (
  id bigserial PRIMARY KEY,
  booking_reference text NOT NULL REFERENCES bookings(reference) ON DELETE CASCADE,
  broker_request_id bigint REFERENCES broker_requests(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  mime_type text,
  content_base64 text NOT NULL,
  source text NOT NULL DEFAULT 'BROKER_EMAIL',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking
ON booking_attachments(booking_reference, created_at DESC);

INSERT INTO schema_migrations(version, description)
VALUES('060.001', 'Add booking attachments table for broker intake source files')
ON CONFLICT(version) DO NOTHING;

COMMIT;
