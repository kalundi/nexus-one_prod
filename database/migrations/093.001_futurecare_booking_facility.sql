BEGIN;
INSERT INTO facilities(facility_code,name,address,billing_type,active)
SELECT 'FC-ANNAPOLIS','FutureCare Annapolis','2700 Southaven Road, Annapolis, MD 21401','PAY_AT_BOOKING',true
WHERE NOT EXISTS(SELECT 1 FROM facilities WHERE lower(name)='futurecare annapolis' AND address ILIKE '%2700%Southaven%')
ON CONFLICT(facility_code) DO NOTHING;
INSERT INTO schema_migrations(version,description) VALUES('093.001','Register FutureCare Annapolis for paid bookings and scoped portal trips') ON CONFLICT(version) DO NOTHING;
COMMIT;
