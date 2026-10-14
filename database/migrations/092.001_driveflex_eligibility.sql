-- Explicit eligibility decisions for DriveFlex. No default approval.
-- Only credentialing staff may populate approvals through controlled back-office processes.
CREATE TABLE IF NOT EXISTS driveflex_driver_eligibility (
 driver_id uuid NOT NULL REFERENCES users(id),
 service_level text NOT NULL CHECK(service_level IN ('AMBULATORY','WHEELCHAIR','EMT')),
 approved_until timestamptz NOT NULL,
 verified_by uuid NOT NULL REFERENCES users(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 evidence_reference text NOT NULL CHECK(length(trim(evidence_reference))>0),
 revoked_at timestamptz,
 PRIMARY KEY(driver_id,service_level)
);
CREATE TABLE IF NOT EXISTS driveflex_vehicle_eligibility (
 vehicle_unit text PRIMARY KEY,
 approved_until timestamptz NOT NULL,
 verified_by uuid NOT NULL REFERENCES users(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 evidence_reference text NOT NULL CHECK(length(trim(evidence_reference))>0),
 revoked_at timestamptz
);
REVOKE ALL ON driveflex_driver_eligibility,driveflex_vehicle_eligibility FROM PUBLIC;
