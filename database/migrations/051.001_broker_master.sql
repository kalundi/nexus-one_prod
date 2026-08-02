BEGIN;

-- Broker master table
CREATE TABLE IF NOT EXISTS brokers (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  contact_email text NOT NULL,
  contact_person text,
  contact_phone text,
  net_terms_days integer DEFAULT 30,
  status text NOT NULL DEFAULT 'ACTIVE',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(contact_email);
CREATE INDEX IF NOT EXISTS idx_brokers_status ON brokers(status);

-- Broker service rates
CREATE TABLE IF NOT EXISTS broker_rates (
  id bigserial PRIMARY KEY,
  broker_id bigint NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  service text NOT NULL,
  base_rate numeric(10,2) NOT NULL,
  per_mile_rate numeric(10,2) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broker_id, service, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_broker_rates_broker ON broker_rates(broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_rates_effective ON broker_rates(broker_id, effective_from, effective_to);

-- Broker ride requests
CREATE TABLE IF NOT EXISTS broker_requests (
  id bigserial PRIMARY KEY,
  broker_id bigint REFERENCES brokers(id) ON DELETE SET NULL,
  booking_reference text,
  broker_name text,
  service text NOT NULL,
  pickup text NOT NULL,
  destination text NOT NULL,
  pickup_lat numeric(10,6),
  pickup_lng numeric(10,6),
  destination_lat numeric(10,6),
  destination_lng numeric(10,6),
  trip_date date NOT NULL,
  trip_time time NOT NULL,
  broker_quoted_rate numeric(10,2),
  platform_calculated_rate numeric(10,2),
  rate_delta numeric(10,2),
  submission_method text NOT NULL,
  submitted_by text,
  request_status text NOT NULL DEFAULT 'AUTO_CONFIRMED',
  dispatch_reviewed boolean DEFAULT false,
  dispatch_reviewed_at timestamptz,
  dispatch_reviewed_by text,
  dispatch_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_requests_broker ON broker_requests(broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_requests_booking ON broker_requests(booking_reference);
CREATE INDEX IF NOT EXISTS idx_broker_requests_status ON broker_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_broker_requests_date ON broker_requests(trip_date);

-- Broker invoices & settlement
CREATE TABLE IF NOT EXISTS broker_invoices (
  id bigserial PRIMARY KEY,
  broker_id bigint NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_rides integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  invoice_amount numeric(12,2) NOT NULL,
  settlement_terms text,
  status text NOT NULL DEFAULT 'DRAFT',
  due_date date,
  paid_at timestamptz,
  paid_amount numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broker_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_broker_invoices_broker ON broker_invoices(broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_invoices_status ON broker_invoices(status);
CREATE INDEX IF NOT EXISTS idx_broker_invoices_due ON broker_invoices(due_date);

INSERT INTO schema_migrations(version, description)
VALUES('051.001', 'Add broker master, rates, requests, and invoices tables')
ON CONFLICT(version) DO NOTHING;

COMMIT;
