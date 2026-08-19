CREATE TABLE IF NOT EXISTS secure_document_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_scope_id text,
  document_key text NOT NULL,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_secure_document_grants_active
  ON secure_document_grants(user_id,document_key,expires_at) WHERE revoked_at IS NULL;
UPDATE system_settings SET value=jsonb_set(value,'{pricing}',
  '{"wheelchair":{"label":"Wheelchair Transportation","base":98,"includedMiles":8,"perMile":4.1,"waitPer15":18.75},"ambulatory":{"label":"Ambulatory Transportation","base":75,"includedMiles":5,"perMile":3.55,"waitPer15":12.5},"facility_transfer":{"label":"Facility-to-Facility Transfer (Routine IFT)","base":165,"includedMiles":8,"perMile":5.25,"waitPer15":30},"facility_transfer_critical":{"label":"Facility-to-Facility Transfer (High-Acuity IFT)","base":340,"includedMiles":8,"perMile":8.75,"waitPer15":45},"broda":{"label":"Broda Chair Transportation","base":165,"includedMiles":8,"perMile":5.5,"waitPer15":25},"stretcher":{"label":"Stretcher Transportation","base":455,"includedMiles":8,"perMile":7.95,"waitPer15":36.25},"bariatric":{"label":"Bariatric Transportation","base":430,"includedMiles":8,"perMile":9.95,"waitPer15":45},"bls":{"label":"BLS Ambulance","base":1125,"includedMiles":0,"perMile":18.5,"waitPer15":50},"als1":{"label":"ALS I Ambulance","base":1395,"includedMiles":0,"perMile":21.5,"waitPer15":62.5},"als2":{"label":"ALS II Ambulance","base":1450,"includedMiles":0,"perMile":24.5,"waitPer15":75}}'::jsonb,true)
WHERE key='platform';
INSERT INTO schema_migrations(version,description) VALUES('064.001','Time-limited facility document grants') ON CONFLICT(version) DO NOTHING;
