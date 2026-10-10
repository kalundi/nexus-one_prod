BEGIN;
LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duplicate_of text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duplicate_appointment_key text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duplicate_referral_key text;
DROP TRIGGER IF EXISTS bookings_guard_duplicate ON bookings;
DROP INDEX IF EXISTS bookings_duplicate_trip_unique;

-- A pickup and an appointment are different times. Compare each consistently;
-- broker referral identity also catches re-imports with changed pickup estimates.
CREATE OR REPLACE FUNCTION booking_patient_time_key(passenger text,ride_date date,ride_time time)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN ride_date IS NULL OR ride_time IS NULL OR nullif(trim(passenger),'') IS NULL THEN NULL ELSE
 md5(jsonb_build_array(regexp_replace(lower(trim(passenger)),'[^[:alnum:]]','','g'),ride_date-DATE '2000-01-01',extract(hour FROM ride_time),extract(minute FROM ride_time))::text) END
$$;
CREATE OR REPLACE FUNCTION booking_appointment_time(trip_notes text)
RETURNS time LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE parts text[]; hours integer; minutes integer;
BEGIN
 parts:=regexp_match(coalesce(trip_notes,''),'Appointment time:\s*([0-9]{1,2}):([0-9]{2})\s*(AM|PM)?','i');
 IF parts IS NULL THEN RETURN NULL; END IF;
 hours:=parts[1]::integer; minutes:=parts[2]::integer;
 IF minutes>59 OR hours>23 OR (parts[3] IS NOT NULL AND (hours<1 OR hours>12)) THEN RETURN NULL; END IF;
 IF parts[3] IS NOT NULL THEN hours:=hours%12+CASE WHEN upper(parts[3])='PM' THEN 12 ELSE 0 END; END IF;
 RETURN make_time(hours,minutes,0);
END $$;
CREATE OR REPLACE FUNCTION booking_referral_key(passenger text,ride_date date,trip_notes text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN ride_date IS NULL OR nullif(trim(passenger),'') IS NULL OR substring(coalesce(trip_notes,'') FROM 'Referral ID:\s*([^|\s]+)') IS NULL THEN NULL ELSE
 md5(jsonb_build_array(regexp_replace(lower(trim(passenger)),'[^[:alnum:]]','','g'),ride_date-DATE '2000-01-01',lower(substring(trip_notes FROM 'Referral ID:\s*([^|\s]+)')))::text) END
$$;
UPDATE bookings SET
 duplicate_trip_key=CASE WHEN upper(status)='CANCELLED' THEN NULL ELSE booking_patient_time_key(name,trip_date,trip_time) END,
 duplicate_appointment_key=CASE WHEN upper(status)='CANCELLED' THEN NULL ELSE booking_patient_time_key(name,trip_date,booking_appointment_time(notes)) END,
 duplicate_referral_key=CASE WHEN upper(status)='CANCELLED' THEN NULL ELSE booking_referral_key(name,trip_date,notes) END;

-- Retain every record, payment, document and history entry. Only one record in
-- each duplicate group remains operational. Prefer paid/completed, assigned,
-- complete round trips, then the oldest booking rather than its re-import.
WITH RECURSIVE edges AS (
 SELECT a.reference AS a,b.reference AS b FROM bookings a JOIN bookings b ON a.reference<>b.reference
 AND ((a.duplicate_trip_key IS NOT NULL AND a.duplicate_trip_key=b.duplicate_trip_key)
 OR (a.duplicate_appointment_key IS NOT NULL AND a.duplicate_appointment_key=b.duplicate_appointment_key)
 OR (a.duplicate_referral_key IS NOT NULL AND a.duplicate_referral_key=b.duplicate_referral_key))
 WHERE a.duplicate_of IS NULL AND b.duplicate_of IS NULL
), connected(start,member) AS (
 SELECT a,a FROM edges UNION SELECT c.start,e.b FROM connected c JOIN edges e ON e.a=c.member
), groups AS (SELECT member,min(start) AS group_id FROM connected GROUP BY member), ranked AS (
 SELECT b.reference,first_value(b.reference) OVER (PARTITION BY g.group_id ORDER BY
 CASE WHEN b.paid_in_full_at IS NOT NULL OR b.deposit_paid_at IS NOT NULL THEN 0 ELSE 1 END,
 CASE WHEN upper(b.status)='COMPLETED' THEN 0 WHEN b.driver_name IS NOT NULL THEN 1 ELSE 2 END,
 CASE WHEN b.return_trip_time IS NOT NULL THEN 0 ELSE 1 END,
 CASE WHEN b.trip_type='ROUND_TRIP' THEN 0 ELSE 1 END,b.created_at,b.reference) AS keeper
 FROM bookings b JOIN groups g ON g.member=b.reference
)
UPDATE bookings b SET duplicate_of=r.keeper FROM ranked r WHERE b.reference=r.reference AND r.reference<>r.keeper;
UPDATE bookings SET duplicate_trip_guard=(duplicate_of IS NULL);
CREATE UNIQUE INDEX bookings_duplicate_trip_unique ON bookings(duplicate_trip_key) WHERE duplicate_of IS NULL;
CREATE UNIQUE INDEX bookings_duplicate_appointment_unique ON bookings(duplicate_appointment_key) WHERE duplicate_of IS NULL;
CREATE UNIQUE INDEX bookings_duplicate_referral_unique ON bookings(duplicate_referral_key) WHERE duplicate_of IS NULL;
CREATE INDEX bookings_duplicate_of_lookup ON bookings(duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE OR REPLACE FUNCTION guard_booking_duplicate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.duplicate_trip_guard:=NEW.duplicate_of IS NULL;
 NEW.duplicate_trip_key:=NULL; NEW.duplicate_appointment_key:=NULL; NEW.duplicate_referral_key:=NULL;
 IF NEW.duplicate_of IS NULL AND upper(coalesce(NEW.status,''))<>'CANCELLED' THEN
  NEW.duplicate_trip_key:=booking_patient_time_key(NEW.name,NEW.trip_date,NEW.trip_time);
  NEW.duplicate_appointment_key:=booking_patient_time_key(NEW.name,NEW.trip_date,booking_appointment_time(NEW.notes));
  NEW.duplicate_referral_key:=booking_referral_key(NEW.name,NEW.trip_date,NEW.notes);
 END IF;
 -- Unique indexes enforce the same rule for inserts, edits and concurrent imports.
 RETURN NEW;
END $$;
CREATE TRIGGER bookings_guard_duplicate BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION guard_booking_duplicate();
INSERT INTO schema_migrations(version,description) VALUES('084.001','Prevent patient schedule duplicates and retain historical copies linked to one operational booking') ON CONFLICT DO NOTHING;
COMMIT;
