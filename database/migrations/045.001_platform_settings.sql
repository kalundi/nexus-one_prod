BEGIN;

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings(key, value)
VALUES (
  'platform',
  jsonb_build_object(
    'pricing', '{}'::jsonb,
    'fareRules', jsonb_build_object(
      'minimumFare', 0,
      'fuelSurchargePerMile', 0,
      'fuelPricingMode', 'MANUAL',
      'fuelIndexSource', 'EIA',
      'fuelIndexSeriesId', 'PET.EMM_EPM0_PTE_SUS_DPG.W',
      'fuelIndexPricePerGallon', 0,
      'fuelBaselinePricePerGallon', 3.25,
      'fuelEfficiencyMpg', 10,
      'fuelOperationalBufferPct', 20,
      'fuelLastUpdatedAt', null,
      'afterHoursSurchargePct', 0,
      'weekendSurchargePct', 0,
      'holidaySurchargePct', 10,
      'cancellationFee', 30,
      'cancellationWindowHours', 24,
      'cancellationLeadHours', 72,
      'noShowFee', 50,
      'freeWaitMinutes', 15,
      'mileageRoundingRule', 'TENTH_MILE',
      'telemetryRefreshSeconds', 20,
      'maxBookingDistanceMiles', 125,
      'returnMilesThreshold', 10,
      'returnMilesInclusionPct', 100,
      'trafficOverageFeePerHour', 0,
      'trafficOverageGraceMinutes', 0,
      'servicePolicies', jsonb_build_object(
        'wheelchair', jsonb_build_object('cancellationFee', 40, 'noShowFee', 60, 'trafficOverageFeePerHour', 25, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10),
        'ambulatory', jsonb_build_object('cancellationFee', 35, 'noShowFee', 50, 'trafficOverageFeePerHour', 20, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10),
        'broda', jsonb_build_object('cancellationFee', 75, 'noShowFee', 95, 'trafficOverageFeePerHour', 35, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10),
        'stretcher', jsonb_build_object('cancellationFee', 120, 'noShowFee', 150, 'trafficOverageFeePerHour', 50, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10),
        'bariatric', jsonb_build_object('cancellationFee', 160, 'noShowFee', 200, 'trafficOverageFeePerHour', 65, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10),
        'bls', jsonb_build_object('cancellationFee', 200, 'noShowFee', 260, 'trafficOverageFeePerHour', 85, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10),
        'als1', jsonb_build_object('cancellationFee', 250, 'noShowFee', 325, 'trafficOverageFeePerHour', 95, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10),
        'als2', jsonb_build_object('cancellationFee', 300, 'noShowFee', 390, 'trafficOverageFeePerHour', 110, 'returnMilesInclusionPct', 100, 'afterHoursSurchargePct', 0, 'weekendSurchargePct', 0, 'holidaySurchargePct', 10)
      )
    ),
    'organization', jsonb_build_object(
      'name', 'Nexus Medical Transit',
      'phone', '(888) 760-4990',
      'email', 'contact@nexusmt.com',
      'website', 'https://nexusmt.com'
    ),
    'activeServices', jsonb_build_array('AMBULANCE','WHEELCHAIR','STRETCHER','HOSPITAL_DISCHARGE')
  )
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations(version,description)
VALUES('045.001','Add database-backed platform settings for pricing and fare rules')
ON CONFLICT(version) DO NOTHING;

COMMIT;
