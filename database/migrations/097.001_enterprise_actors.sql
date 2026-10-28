BEGIN;
CREATE TABLE IF NOT EXISTS actors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('PERSON','ENTITY')),
 display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 250),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS actors_name_idx ON actors(lower(display_name),id);
CREATE TABLE IF NOT EXISTS actor_types (
 category text NOT NULL CHECK(category IN ('EMPLOYEE','PATIENT','FACILITY','ORGANIZATION','CONTACT')),
 subtype text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('PERSON','ENTITY')),
 PRIMARY KEY(category,subtype)
);
INSERT INTO actor_types(category,subtype,kind)
SELECT 'EMPLOYEE',title,'PERSON' FROM unnest(ARRAY['GENERAL','EMT','ADVANCED_EMT','PARAMEDIC','DRIVER','DISPATCHER','BILLING','STAFF','ADMIN','QA','EXECUTIVE','FIELD_TRAINING_OFFICER','CLINICAL_COORDINATOR','OPERATIONS_MANAGER','QUALITY_IMPROVEMENT_MANAGER','COMPLIANCE_OFFICER','BILLING_CREDENTIALING_SPECIALIST','SAFETY_OFFICER','CHIEF_OF_EMS','MEDICAL_DIRECTOR']) title
UNION ALL SELECT 'PATIENT','GENERAL','PERSON'
UNION ALL SELECT 'FACILITY',title,'ENTITY' FROM unnest(ARRAY['GENERAL','HOSPITAL','DIALYSIS','SNF','ALF','CLINIC']) title
UNION ALL SELECT 'ORGANIZATION',title,'ENTITY' FROM unnest(ARRAY['GENERAL','PROVIDER','PAYER','VENDOR','GOVERNMENT']) title
UNION ALL SELECT 'CONTACT',title,'PERSON' FROM unnest(ARRAY['GENERAL','NURSE','CASE_MANAGER','SOCIAL_WORKER','PHYSICIAN','SCHEDULER','ADMINISTRATOR']) title
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS actor_classifications (
 actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
 category text NOT NULL,
 subtype text NOT NULL,
 source text NOT NULL DEFAULT 'MANUAL',
 source_key text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,category,subtype,source,source_key),
 FOREIGN KEY(category,subtype) REFERENCES actor_types(category,subtype)
);
CREATE INDEX IF NOT EXISTS actor_classifications_type_idx ON actor_classifications(category,subtype,actor_id);
CREATE TABLE IF NOT EXISTS actor_relationships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subject_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
 relationship text NOT NULL CHECK(relationship IN ('OPERATES','WORKS_FOR','SERVES','CONTACT_FOR','RECEIVES_CARE_AT')),
 object_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
 source text NOT NULL DEFAULT 'MANUAL',
 source_key text NOT NULL DEFAULT '',
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(subject_id<>object_id),
 UNIQUE(subject_id,relationship,object_id,source,source_key)
);
CREATE INDEX IF NOT EXISTS actor_relationships_subject_idx ON actor_relationships(subject_id,relationship);
CREATE INDEX IF NOT EXISTS actor_relationships_object_idx ON actor_relationships(object_id,relationship);
CREATE INDEX IF NOT EXISTS actor_relationships_creator_idx ON actor_relationships(created_by);
CREATE TABLE IF NOT EXISTS actor_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES actors(id),
 performed_by uuid NOT NULL REFERENCES users(id),
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS actor_events_actor_idx ON actor_events(actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS actor_events_user_idx ON actor_events(performed_by);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES actors(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES actors(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES actors(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES actors(id);
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES actors(id);
CREATE INDEX IF NOT EXISTS organizations_actor_idx ON organizations(actor_id);
CREATE INDEX IF NOT EXISTS users_actor_idx ON users(actor_id);
CREATE INDEX IF NOT EXISTS employees_actor_idx ON employees(actor_id);
CREATE INDEX IF NOT EXISTS patients_actor_idx ON patients(actor_id);
CREATE INDEX IF NOT EXISTS facilities_actor_idx ON facilities(actor_id);

CREATE OR REPLACE FUNCTION nexus_actor_classification_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM actors a JOIN actor_types t ON t.kind=a.kind WHERE a.id=NEW.actor_id AND t.category=NEW.category AND t.subtype=NEW.subtype) THEN
  RAISE EXCEPTION 'Classification does not match actor kind' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS actor_classification_kind ON actor_classifications;
CREATE TRIGGER actor_classification_kind BEFORE INSERT OR UPDATE ON actor_classifications FOR EACH ROW EXECUTE FUNCTION nexus_actor_classification_kind();

CREATE OR REPLACE FUNCTION nexus_sync_actor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payload jsonb; identity_id uuid; identity_kind text; label text; category_name text; subtype_name text;
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM actor_classifications WHERE source=TG_TABLE_NAME AND source_key=OLD.id::text;
  DELETE FROM actor_relationships WHERE source=TG_TABLE_NAME AND source_key=OLD.id::text;
  RETURN OLD;
 END IF;
 payload=to_jsonb(NEW);
 identity_kind=CASE WHEN TG_TABLE_NAME IN ('organizations','facilities') THEN 'ENTITY' ELSE 'PERSON' END;
 label=left(COALESCE(NULLIF(trim(payload->>'display_name'),''),NULLIF(trim(payload->>'name'),''),NULLIF(trim(concat_ws(' ',payload->>'first_name',payload->>'last_name')),''),'Unnamed record'),250);
 identity_id=NEW.actor_id;
 -- Only the explicit employee-to-user foreign key shares a person identity.
 IF TG_TABLE_NAME='employees' AND payload->>'user_id' IS NOT NULL THEN
  SELECT actor_id INTO identity_id FROM users WHERE id=(payload->>'user_id')::uuid;
 END IF;
 IF identity_id IS NULL THEN
  INSERT INTO actors(kind,display_name) VALUES(identity_kind,label) RETURNING id INTO identity_id;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM actors WHERE id=identity_id AND kind=identity_kind) THEN RAISE EXCEPTION 'Invalid source actor kind' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME<>'employees' OR payload->>'user_id' IS NULL THEN
   UPDATE actors SET display_name=label,updated_at=now() WHERE id=identity_id AND display_name IS DISTINCT FROM label;
  END IF;
 END IF;
 NEW.actor_id=identity_id;
 category_name=CASE TG_TABLE_NAME WHEN 'organizations' THEN 'ORGANIZATION' WHEN 'facilities' THEN 'FACILITY' WHEN 'patients' THEN 'PATIENT' WHEN 'employees' THEN 'EMPLOYEE' ELSE CASE WHEN payload->>'role' IN ('PATIENT','RIDER') THEN 'PATIENT' WHEN payload->>'role' IN ('DRIVER','DISPATCHER','BILLING','STAFF','ADMIN','QA','EXECUTIVE') THEN 'EMPLOYEE' ELSE 'CONTACT' END END;
 subtype_name=CASE WHEN category_name='EMPLOYEE' THEN COALESCE(NULLIF(payload->>'access_title',''),payload->>'role','GENERAL') WHEN TG_TABLE_NAME='users' AND payload->>'role'='FACILITY' THEN 'ADMINISTRATOR' ELSE 'GENERAL' END;
 IF TG_TABLE_NAME='employees' AND payload->>'user_id' IS NOT NULL THEN
  SELECT COALESCE(access_title,role) INTO subtype_name FROM users WHERE id=(payload->>'user_id')::uuid;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM actor_types WHERE category=category_name AND subtype=subtype_name) THEN subtype_name='GENERAL'; END IF;
 DELETE FROM actor_classifications WHERE source=TG_TABLE_NAME AND source_key=NEW.id::text;
 INSERT INTO actor_classifications(actor_id,category,subtype,source,source_key) VALUES(identity_id,category_name,subtype_name,TG_TABLE_NAME,NEW.id::text);
 RETURN NEW;
END $$;

DO $$ DECLARE source_table text; columns_list text; BEGIN
 FOREACH source_table IN ARRAY ARRAY['organizations','users','employees','facilities','patients'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS sync_enterprise_actor ON %I',source_table);
  columns_list=CASE source_table WHEN 'organizations' THEN 'name,display_name,actor_id' WHEN 'users' THEN 'display_name,role,access_title,actor_id' WHEN 'employees' THEN 'display_name,role,user_id,actor_id' WHEN 'facilities' THEN 'name,actor_id' ELSE 'display_name,name,first_name,last_name,actor_id' END;
  SELECT string_agg(quote_ident(c.column_name),',') INTO columns_list FROM information_schema.columns c
   WHERE c.table_schema=current_schema() AND c.table_name=source_table AND c.column_name=ANY(string_to_array(columns_list,','));
  EXECUTE format('CREATE TRIGGER sync_enterprise_actor BEFORE INSERT OR UPDATE OF %s OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nexus_sync_actor()',columns_list,source_table);
  EXECUTE format('UPDATE %I SET actor_id=actor_id WHERE actor_id IS NULL',source_table);
 END LOOP;
END $$;

-- Authoritative existing foreign keys supply initial business relationships.
INSERT INTO actor_relationships(subject_id,relationship,object_id,source,source_key)
SELECT u.actor_id,'WORKS_FOR',o.actor_id,'users',u.id::text FROM users u JOIN organizations o ON o.id=u.organization_id
WHERE EXISTS(SELECT 1 FROM actor_classifications c WHERE c.actor_id=u.actor_id AND c.category='EMPLOYEE')
UNION ALL
SELECT p.actor_id,'RECEIVES_CARE_AT',f.actor_id,'patients',p.id::text FROM patients p JOIN facilities f ON f.facility_code=p.facility_code
UNION ALL
SELECT u.actor_id,'CONTACT_FOR',f.actor_id,'users',u.id::text FROM users u JOIN facilities f ON f.facility_code=u.scope_id WHERE u.role='FACILITY'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION nexus_sync_actor_relationships() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM actor_relationships WHERE source=TG_TABLE_NAME AND source_key=NEW.id::text;
 IF TG_TABLE_NAME='users' THEN
  IF NEW.role='FACILITY' THEN
   INSERT INTO actor_relationships(subject_id,relationship,object_id,source,source_key)
   SELECT NEW.actor_id,'CONTACT_FOR',f.actor_id,'users',NEW.id::text FROM facilities f WHERE f.facility_code=NEW.scope_id;
  ELSIF EXISTS(SELECT 1 FROM actor_classifications WHERE actor_id=NEW.actor_id AND category='EMPLOYEE') THEN
   INSERT INTO actor_relationships(subject_id,relationship,object_id,source,source_key)
   SELECT NEW.actor_id,'WORKS_FOR',o.actor_id,'users',NEW.id::text FROM organizations o WHERE o.id=NEW.organization_id;
  END IF;
  UPDATE employees SET actor_id=NEW.actor_id WHERE user_id=NEW.id;
 ELSE
  INSERT INTO actor_relationships(subject_id,relationship,object_id,source,source_key)
  SELECT NEW.actor_id,'RECEIVES_CARE_AT',f.actor_id,'patients',NEW.id::text FROM facilities f WHERE f.facility_code=NEW.facility_code;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_actor_user_relationships ON users;
CREATE TRIGGER sync_actor_user_relationships AFTER INSERT OR UPDATE OF role,access_title,scope_id,organization_id,actor_id ON users FOR EACH ROW EXECUTE FUNCTION nexus_sync_actor_relationships();
DROP TRIGGER IF EXISTS sync_actor_patient_relationships ON patients;
CREATE TRIGGER sync_actor_patient_relationships AFTER INSERT OR UPDATE OF facility_code,actor_id ON patients FOR EACH ROW EXECUTE FUNCTION nexus_sync_actor_relationships();

ALTER TABLE actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON actors,actor_types,actor_classifications,actor_relationships,actor_events FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON actors,actor_types,actor_classifications,actor_relationships,actor_events FROM %I',role_name); END IF;
 END LOOP;
END $$;
INSERT INTO schema_migrations(version,description) VALUES('097.001','Enterprise Actor identities, classifications and business relationships') ON CONFLICT DO NOTHING;
COMMIT;
