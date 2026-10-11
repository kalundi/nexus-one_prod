BEGIN;

-- Human-readable alternate key. Existing UUID foreign keys remain intact.
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS functions text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_code ON users(user_code);
CREATE TABLE IF NOT EXISTS user_identifiers(user_code text PRIMARY KEY,user_id uuid UNIQUE,issued_at timestamptz NOT NULL DEFAULT now());
INSERT INTO user_identifiers(user_code,user_id) SELECT user_code,id FROM users WHERE user_code IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE user_identifiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE user_identifiers FROM PUBLIC;

CREATE OR REPLACE FUNCTION allocate_nexus_user_code() RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE candidate text; digits integer := 4; attempt integer := 0;
BEGIN
  -- Serialize allocation only for this short transaction, including concurrent registrations.
  PERFORM pg_advisory_xact_lock(861001);
  LOOP
    candidate := 'N' || (floor(random() * (9 * power(10,digits-1))) + power(10,digits-1))::bigint::text;
    IF NOT EXISTS (SELECT 1 FROM user_identifiers WHERE user_code=candidate) THEN
      INSERT INTO user_identifiers(user_code) VALUES(candidate);
      RETURN candidate;
    END IF;
    attempt := attempt + 1;
    IF attempt >= 50 THEN digits := digits + 1; attempt := 0; END IF;
  END LOOP;
END;
$$;
UPDATE users SET user_code=allocate_nexus_user_code() WHERE user_code IS NULL;
UPDATE user_identifiers issued SET user_id=u.id FROM users u WHERE issued.user_code=u.user_code AND issued.user_id IS NULL;
ALTER TABLE users ALTER COLUMN user_code SET DEFAULT allocate_nexus_user_code();
ALTER TABLE users ALTER COLUMN user_code SET NOT NULL;

CREATE OR REPLACE FUNCTION protect_user_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_code IS DISTINCT FROM OLD.user_code THEN
    RAISE EXCEPTION 'A Nexus user ID cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_immutable_code ON users;
CREATE TRIGGER users_immutable_code BEFORE UPDATE OF user_code ON users
FOR EACH ROW EXECUTE FUNCTION protect_user_code();
CREATE OR REPLACE FUNCTION register_user_identifier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_identifiers(user_code,user_id) VALUES(NEW.user_code,NEW.id)
  ON CONFLICT(user_code) DO UPDATE SET user_id=COALESCE(user_identifiers.user_id,EXCLUDED.user_id)
  WHERE user_identifiers.user_id IS NULL OR user_identifiers.user_id=EXCLUDED.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This Nexus ID was already issued to another account'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_register_identifier ON users;
CREATE TRIGGER users_register_identifier BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION register_user_identifier();

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_patient_user ON bookings(patient_user_id,trip_date);
CREATE OR REPLACE FUNCTION nexus_booking_patient_id(contact_email text,contact_phone text,patient_name text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE matches uuid[];
BEGIN
  SELECT array_agg(id) INTO matches FROM users WHERE NULLIF(trim(contact_email),'') IS NOT NULL AND lower(email)=lower(trim(contact_email));
  IF cardinality(matches)=1 THEN RETURN matches[1]; END IF;
  SELECT array_agg(id) INTO matches FROM users
  WHERE length(regexp_replace(COALESCE(contact_phone,''),'\D','','g'))>=10
    AND right(regexp_replace(phone,'\D','','g'),10)=right(regexp_replace(contact_phone,'\D','','g'),10)
    AND lower(trim(display_name))=lower(trim(patient_name));
  IF cardinality(matches)=1 THEN RETURN matches[1]; END IF;
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION link_booking_patient_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN RETURN NEW; END IF;
  NEW.patient_user_id := nexus_booking_patient_id(NEW.email,NEW.phone,NEW.name);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_patient_user ON bookings;
CREATE TRIGGER bookings_patient_user BEFORE INSERT OR UPDATE OF email,phone ON bookings
FOR EACH ROW EXECUTE FUNCTION link_booking_patient_user();
UPDATE bookings SET patient_user_id=nexus_booking_patient_id(email,phone,name) WHERE patient_user_id IS NULL;
CREATE OR REPLACE FUNCTION link_new_user_bookings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bookings SET patient_user_id=NEW.id WHERE patient_user_id IS NULL AND lower(email)=lower(NEW.email);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_link_bookings ON users;
CREATE TRIGGER users_link_bookings AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION link_new_user_bookings();

-- Link legacy workforce records where there is an unambiguous account match.
UPDATE employees e SET user_id=u.id,updated_at=now()
FROM users u WHERE e.user_id IS NULL AND lower(e.email)=lower(u.email)
AND NOT EXISTS (SELECT 1 FROM employees linked WHERE linked.user_id=u.id)
AND (SELECT count(*) FROM employees candidate WHERE lower(candidate.email)=lower(u.email))=1;

-- Driver assignments use the immutable account key, surviving name and role changes.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_driver_user ON bookings(driver_user_id,trip_date);
CREATE OR REPLACE FUNCTION resolve_booking_driver_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches uuid[];
BEGIN
  IF TG_OP='UPDATE' AND NEW.driver_name IS NOT DISTINCT FROM OLD.driver_name
     AND NEW.driver_scope_id IS NOT DISTINCT FROM OLD.driver_scope_id THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT u.id) INTO matches FROM users u
  WHERE NULLIF(NEW.driver_scope_id,'') IS NOT NULL AND (u.scope_id=NEW.driver_scope_id OR EXISTS (
    SELECT 1 FROM user_role_requests rr WHERE rr.user_id=u.id AND rr.role='DRIVER' AND rr.scope_id=NEW.driver_scope_id AND rr.status='APPROVED'));
  IF cardinality(matches)>0 THEN
    NEW.driver_user_id := CASE WHEN cardinality(matches)=1 THEN matches[1] ELSE NULL END;
    RETURN NEW;
  END IF;
  SELECT array_agg(DISTINCT u.id) INTO matches FROM users u
  LEFT JOIN employees e ON e.user_id=u.id
  WHERE (NULLIF(NEW.driver_scope_id,'') IS NOT NULL AND (u.scope_id=NEW.driver_scope_id OR EXISTS (
    SELECT 1 FROM user_role_requests rr WHERE rr.user_id=u.id AND rr.role='DRIVER' AND rr.scope_id=NEW.driver_scope_id AND rr.status='APPROVED'
  ))) OR (NULLIF(NEW.driver_name,'') IS NOT NULL AND lower(trim(e.display_name))=lower(trim(NEW.driver_name)) AND e.role='DRIVER');
  NEW.driver_user_id := CASE WHEN cardinality(matches)=1 THEN matches[1] ELSE NULL END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_driver_user ON bookings;
CREATE TRIGGER bookings_driver_user BEFORE INSERT OR UPDATE OF driver_name,driver_scope_id ON bookings
FOR EACH ROW EXECUTE FUNCTION resolve_booking_driver_user();
-- Existing references are resolved only when the match is unambiguous.
UPDATE bookings b SET driver_user_id=matched.user_id FROM (
  SELECT b.reference,(array_agg(DISTINCT u.id))[1] AS user_id FROM bookings b JOIN users u
  ON NULLIF(b.driver_scope_id,'') IS NOT NULL AND (u.scope_id=b.driver_scope_id OR EXISTS (
    SELECT 1 FROM user_role_requests rr WHERE rr.user_id=u.id AND rr.role='DRIVER' AND rr.scope_id=b.driver_scope_id AND rr.status='APPROVED'))
  GROUP BY b.reference HAVING count(DISTINCT u.id)=1
) matched WHERE b.reference=matched.reference AND b.driver_user_id IS NULL;
UPDATE bookings b SET driver_user_id=matched.user_id FROM (
  SELECT b.reference,(array_agg(DISTINCT u.id))[1] AS user_id
  FROM bookings b JOIN employees e ON e.role='DRIVER' AND lower(trim(e.display_name))=lower(trim(b.driver_name))
  JOIN users u ON u.id=e.user_id GROUP BY b.reference HAVING count(DISTINCT u.id)=1
) matched WHERE b.reference=matched.reference AND b.driver_user_id IS NULL;



INSERT INTO schema_migrations(version,description)
VALUES('086.001','Permanent short user IDs and operational function labels')
ON CONFLICT(version) DO NOTHING;
COMMIT;
