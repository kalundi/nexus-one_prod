-- Apply the requested 30% weekend and holiday settings once. Future Pricing
-- Manager edits remain editable; no unrelated fare settings or bookings change.
BEGIN;

WITH previous AS MATERIALIZED (
  SELECT key,value
  FROM system_settings
  WHERE key='platform'
    AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='085.001')
  FOR UPDATE
), revised AS (
  SELECT key,value || jsonb_build_object(
    'fareRules',COALESCE(value->'fareRules','{}'::jsonb) || jsonb_build_object(
      'weekendSurchargePct',30,
      'holidaySurchargePct',30,
      'servicePolicies',COALESCE((
        SELECT jsonb_object_agg(service,policy || jsonb_build_object('weekendSurchargePct',30,'holidaySurchargePct',30))
        FROM jsonb_each(COALESCE(value#>'{fareRules,servicePolicies}','{}'::jsonb)) AS policies(service,policy)
      ),'{}'::jsonb)
    )
  ) AS value
  FROM previous
), updated AS (
  UPDATE system_settings AS settings
  SET value=revised.value,updated_at=now()
  FROM revised
  WHERE settings.key=revised.key AND settings.value IS DISTINCT FROM revised.value
  RETURNING settings.key
)
INSERT INTO audit_log(entity_type,entity_id,action,changes)
SELECT 'SETTINGS',previous.key,'WEEKEND_HOLIDAY_PREMIUMS_UPDATED',jsonb_build_object(
  'migration','085.001',
  'before',jsonb_build_object(
    'weekendSurchargePct',previous.value#>'{fareRules,weekendSurchargePct}',
    'holidaySurchargePct',previous.value#>'{fareRules,holidaySurchargePct}',
    'servicePolicies',COALESCE((
      SELECT jsonb_object_agg(service,jsonb_build_object(
        'weekendSurchargePct',policy->'weekendSurchargePct',
        'holidaySurchargePct',policy->'holidaySurchargePct'
      ))
      FROM jsonb_each(COALESCE(previous.value#>'{fareRules,servicePolicies}','{}'::jsonb)) AS policies(service,policy)
    ),'{}'::jsonb)
  ),
  'after',jsonb_build_object('weekendSurchargePct',30,'holidaySurchargePct',30,'appliesTo','all services')
)
FROM updated JOIN previous USING(key);

INSERT INTO schema_migrations(version,description)
VALUES('085.001','Set global and service weekend and holiday fare premiums to 30 percent')
ON CONFLICT(version) DO NOTHING;

COMMIT;
