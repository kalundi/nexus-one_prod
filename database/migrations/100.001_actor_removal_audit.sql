BEGIN;
-- Removing an actor must not erase its audit history. Classifications and
-- relationships already cascade from actors, but actor_events.actor_id was a
-- plain NOT NULL reference, which made every actor that had ever been created,
-- classified, deactivated or removed through the directory impossible to
-- delete and would have destroyed the removal record itself. The event rows
-- keep the actor's display name and kind in their details snapshot; the link
-- to the actor becomes NULL when the actor is removed.
ALTER TABLE actor_events ALTER COLUMN actor_id DROP NOT NULL;
DO $$ DECLARE cname text; BEGIN
 SELECT conname INTO cname FROM pg_constraint
 WHERE conrelid='actor_events'::regclass AND contype='f'
 AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (actor_id) REFERENCES actors%';
 IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE actor_events DROP CONSTRAINT %I',cname); END IF;
END $$;
ALTER TABLE actor_events ADD CONSTRAINT actor_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES actors(id) ON DELETE SET NULL;
INSERT INTO schema_migrations(version,description) VALUES('100.001','Actor removal keeps its audit history (actor_events survive with a null actor link)') ON CONFLICT DO NOTHING;
COMMIT;
