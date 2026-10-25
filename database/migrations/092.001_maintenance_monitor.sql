BEGIN;
CREATE TABLE IF NOT EXISTS maintenance_monitor (
 id integer PRIMARY KEY CHECK(id=1),
 report jsonb NOT NULL DEFAULT '{}',
 acknowledgements jsonb NOT NULL DEFAULT '{}',
 investigation jsonb,
 lease_token text,
 lease_until timestamptz,
 last_started timestamptz,
 last_ai_started timestamptz
);
ALTER TABLE maintenance_monitor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON maintenance_monitor FROM PUBLIC;
INSERT INTO maintenance_monitor(id) VALUES(1) ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(version,description) VALUES('092.001','Read-only background maintenance monitor') ON CONFLICT DO NOTHING;
COMMIT;
