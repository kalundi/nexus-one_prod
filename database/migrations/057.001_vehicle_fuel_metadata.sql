ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_efficiency_mpg numeric(6,2);

UPDATE vehicles
SET fuel_efficiency_mpg = NULLIF(metadata->>'mpg_rating','')::numeric
WHERE fuel_efficiency_mpg IS NULL
  AND metadata ? 'mpg_rating';

CREATE INDEX IF NOT EXISTS idx_vehicles_unit_fuel_mpg ON vehicles(unit_number, fuel_efficiency_mpg);
