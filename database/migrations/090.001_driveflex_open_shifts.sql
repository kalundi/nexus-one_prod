-- DriveFlex open-shift requests (Phase 2)
-- A request is never an approved working shift or a dispatch authorization.
CREATE TABLE IF NOT EXISTS driveflex_open_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by uuid NOT NULL REFERENCES users(id),
 start_at timestamptz NOT NULL,
 end_at timestamptz NOT NULL,
 service_level text NOT NULL CHECK (service_level IN ('AMBULATORY','WHEELCHAIR','EMT')),
 operating_area text NOT NULL,
 vehicle_unit text,
 status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (end_at > start_at)
);
CREATE TABLE IF NOT EXISTS driveflex_shift_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 shift_id uuid NOT NULL REFERENCES driveflex_open_shifts(id),
 driver_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (shift_id, driver_id)
);
CREATE INDEX IF NOT EXISTS idx_driveflex_open_shifts_status_start ON driveflex_open_shifts(status,start_at);
CREATE INDEX IF NOT EXISTS idx_driveflex_shift_requests_driver ON driveflex_shift_requests(driver_id,created_at DESC);
REVOKE ALL ON driveflex_open_shifts,driveflex_shift_requests FROM PUBLIC;

INSERT INTO schema_migrations(version,description) VALUES('090.001','DriveFlex open shifts and request tables') ON CONFLICT(version) DO NOTHING;
