BEGIN;
LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE;

-- Deliberately omit source, service and contact details: different intake
-- channels often supply different values for the same passenger's ride.
CREATE OR REPLACE FUNCTION booking_trip_key(passenger text, pickup_address text,
 destination_address text, ride_date date, ride_time time, ride_status text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN upper(coalesce(ride_status,'')) = 'CANCELLED'
 OR ride_date IS NULL OR ride_time IS NULL
 OR nullif(trim(passenger),'') IS NULL
 OR nullif(trim(pickup_address),'') IS NULL
 OR nullif(trim(destination_address),'') IS NULL THEN NULL ELSE
 md5(jsonb_build_array(
 regexp_replace(lower(trim(passenger)), '[^[:alnum:]]', '', 'g'),
 regexp_replace(lower(trim(pickup_address)), '[^[:alnum:]]', '', 'g'),
 regexp_replace(lower(trim(destination_address)), '[^[:alnum:]]', '', 'g'),
 ride_date - DATE '2000-01-01', extract(hour from ride_time), extract(minute from ride_time)
 )::text) END
$$;

ALTER TABLE bookings ADD COLUMN duplicate_trip_key text;
ALTER TABLE bookings ADD COLUMN duplicate_trip_guard boolean NOT NULL DEFAULT true;
UPDATE bookings SET duplicate_trip_key = booking_trip_key(name,pickup,destination,trip_date,trip_time,status);
-- Preserve historical duplicates without letting them prevent deployment.
WITH ranked AS (
 SELECT reference, row_number() OVER (PARTITION BY duplicate_trip_key ORDER BY created_at,reference) AS n
 FROM bookings WHERE duplicate_trip_key IS NOT NULL
)
UPDATE bookings b SET duplicate_trip_guard=false FROM ranked r WHERE b.reference=r.reference AND r.n>1;
CREATE INDEX bookings_duplicate_trip_lookup ON bookings(duplicate_trip_key);
CREATE UNIQUE INDEX bookings_duplicate_trip_unique ON bookings(duplicate_trip_key) WHERE duplicate_trip_guard;

CREATE OR REPLACE FUNCTION guard_booking_duplicate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 NEW.duplicate_trip_key := booking_trip_key(NEW.name,NEW.pickup,NEW.destination,NEW.trip_date,NEW.trip_time,NEW.status);
 IF TG_OP='UPDATE' THEN
  IF NEW.duplicate_trip_key IS NOT DISTINCT FROM OLD.duplicate_trip_key THEN
   NEW.duplicate_trip_guard := OLD.duplicate_trip_guard;
   RETURN NEW;
  END IF;
 END IF;
 NEW.duplicate_trip_guard := true;
 -- Includes preserved historical duplicates, even if the original is removed.
 IF NEW.duplicate_trip_key IS NOT NULL AND EXISTS (
  SELECT 1 FROM bookings b WHERE b.duplicate_trip_key=NEW.duplicate_trip_key AND b.reference<>NEW.reference
 ) THEN
  RAISE EXCEPTION 'This trip already exists. Review the existing booking before submitting again.'
   USING ERRCODE='23505', CONSTRAINT='bookings_duplicate_trip_unique';
 END IF;
 -- The unique index also rejects concurrent inserts that this snapshot cannot see.
 RETURN NEW;
END $$;
CREATE TRIGGER bookings_guard_duplicate BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION guard_booking_duplicate();
INSERT INTO schema_migrations(version,description) VALUES('079.001','Prevent duplicate trips across all booking intake channels') ON CONFLICT DO NOTHING;
COMMIT;
