-- Serialized conflict checking for DriveFlex approval.
-- These are provisional approvals, NOT driver roster activation.
CREATE OR REPLACE FUNCTION driveflex_guard_shift_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE conflicting uuid;
BEGIN
 IF NEW.status <> 'APPROVED' THEN RETURN NEW; END IF;
 -- Serialize competing approvals for the same driver (across different shift IDs).
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.driver_id::text, 2026));
 SELECT r.id INTO conflicting
 FROM driveflex_shift_requests r
 JOIN driveflex_open_shifts existing_shift ON existing_shift.id=r.shift_id
 JOIN driveflex_open_shifts requested_shift ON requested_shift.id=NEW.shift_id
 WHERE r.driver_id=NEW.driver_id
   AND r.status='APPROVED' AND r.id<>NEW.id
   AND existing_shift.start_at < requested_shift.end_at
   AND existing_shift.end_at > requested_shift.start_at
 LIMIT 1;
 IF conflicting IS NOT NULL THEN
  RAISE EXCEPTION 'Driver has an overlapping approved DriveFlex shift' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS driveflex_approval_guard ON driveflex_shift_requests;
CREATE TRIGGER driveflex_approval_guard BEFORE INSERT OR UPDATE OF status, shift_id, driver_id
ON driveflex_shift_requests FOR EACH ROW EXECUTE FUNCTION driveflex_guard_shift_approval();
-- A posted shift is initially single-driver capacity; reject competing approvals.
CREATE UNIQUE INDEX IF NOT EXISTS driveflex_single_approved_driver_per_shift
ON driveflex_shift_requests(shift_id) WHERE status='APPROVED';
