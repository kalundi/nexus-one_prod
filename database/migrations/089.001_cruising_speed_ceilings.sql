BEGIN;

-- Apply service reductions to cruising speeds, preserving Google city and
-- traffic durations. Keep the configured reductions and care allowances.
UPDATE system_settings
SET value=jsonb_set(value,'{fareRules}',COALESCE(value->'fareRules','{}'::jsonb)||
 jsonb_build_object('serviceTravelPolicyVersion',4,'serviceSpeedModel','CRUISING_CEILING','cruisingReferenceSpeedMph',COALESCE(value->'fareRules'->'cruisingReferenceSpeedMph','65'::jsonb)),true)
WHERE key='platform';

INSERT INTO schema_migrations(version,description)
VALUES ('089.001','Use cruising speed ceilings without subtracting from city route averages')
ON CONFLICT(version) DO NOTHING;

COMMIT;
