BEGIN;
-- A facility manager's primary facility stays on users.scope_id; this link
-- table carries every additional facility the same manager may open in the
-- facility portal, so one login can cover several homes.
CREATE TABLE IF NOT EXISTS user_facilities (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 facility_code text NOT NULL REFERENCES facilities(facility_code) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, facility_code)
);
CREATE INDEX IF NOT EXISTS user_facilities_facility_idx ON user_facilities(facility_code);
ALTER TABLE user_facilities ENABLE ROW LEVEL SECURITY;
-- Only the trusted server database connection accesses this table.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON user_facilities FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON user_facilities FROM authenticated;
 END IF;
END $$;
-- Backfill each existing manager's primary facility as a link. The EXISTS
-- guard skips scopes that are not facilities rows (e.g. the presentation
-- demo scope 'futurecare-annapolis-demo').
INSERT INTO user_facilities(user_id, facility_code)
SELECT id, scope_id FROM users
WHERE role='FACILITY' AND scope_id IS NOT NULL
AND EXISTS(SELECT 1 FROM facilities f WHERE f.facility_code=users.scope_id)
ON CONFLICT DO NOTHING;
-- Bright Hands Assisted Living: Nimmi Perera manages all three homes.
INSERT INTO facilities(facility_code,name,address,contact_name,contact_email,contact_phone,billing_type,active)
VALUES
('bright-hands-assisted-living','Bright Hands Assisted Living','14109 Burning Bush Lane, Silver Spring, MD 20906','Nimmi Perera','brighthandsassistedliving@gmail.com','301-871-1021',NULL,true),
('bright-hands-assisted-living-ii','Bright Hands Assisted Living II','9720 Breckenridge Place, Montgomery Village, MD 20886','Nimmi Perera','brighthandsassistedliving@gmail.com','301-869-8202',NULL,true),
('bright-hands-assisted-living-iii','Bright Hands Assisted Living III','808 East Franklin Avenue, Silver Spring, MD 20901','Nimmi Perera','brighthandsassistedliving@gmail.com','301-608-8720',NULL,true)
ON CONFLICT(facility_code) DO NOTHING;
INSERT INTO schema_migrations(version,description) VALUES('101.001','Multi-facility manager links (user_facilities) and Bright Hands Assisted Living homes') ON CONFLICT(version) DO NOTHING;
COMMIT;
