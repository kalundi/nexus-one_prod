-- Add Fletcher Kalundi as a 24/7 floater driver
-- Floater drivers are on-call and available across all hours
-- Medical transport drivers require: valid DL, medical exam cert, and specific vehicle skill certifications

INSERT INTO employees(employee_code, role, display_name, email, phone, unit_number, timezone, active, metadata)
VALUES (
  'NEXF001',
  'DRIVER',
  'Fletcher Kalundi',
  'fletcher@nexusmt.com',
  '(202) 315-9253',
  'FLT-24H',
  'America/New_York',
  true,
  jsonb_build_object(
    'source', 'floater_driver_add_052',
    'floater_type', 'on_call_24h',
    'driver_license_number', 'MD-4827-555-334',
    'driver_license_state', 'MD',
    'driver_license_expiry', '2027-08-15',
    'medical_examiner_certificate', true,
    'medical_examiner_certificate_expiry', '2026-12-20',
    'vehicle_skills', jsonb_build_array(
      'wheelchair_accessible_van',
      'stretcher_transport',
      'bariatric_lift',
      'hydraulic_lift'
    ),
    'service_skills', jsonb_build_array(
      'wheelchair',
      'stretcher',
      'ambulatory',
      'bariatric',
      'ALS_2_transport',
      'facility_transfer'
    ),
    'certifications', jsonb_build_array(
      'CDL_B',
      'DOT_Medical_Certificate',
      'First_Aid_CPR',
      'Defensive_Driving',
      'HIPAA_Certified',
      'Vehicle_Inspection'
    ),
    'other_skills', jsonb_build_array(
      'Bilingual_Spanish',
      'Customer_Service_Excellence',
      'Adaptive_Equipment_Expert'
    ),
    'employment_type', 'floater',
    'shift_model', '24_7_on_call',
    'notes', 'Senior floater driver - available for all vehicle types and service levels'
  )
)
ON CONFLICT (employee_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  unit_number = EXCLUDED.unit_number,
  active = true,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Create 24/7 shifts for floater driver (all days, full day coverage)
-- Floater shifts cover 00:00-23:59 every day for on-call availability
WITH floater_driver AS (
  SELECT id FROM employees WHERE employee_code = 'NEXF001'
),
all_days AS (
  SELECT unnest(ARRAY[1,2,3,4,5,6,7]) AS weekday_iso
)
INSERT INTO employee_shifts(
  employee_id,
  assignment_role,
  weekday_iso,
  start_time,
  end_time,
  effective_start_date,
  active,
  notes
)
SELECT
  fd.id,
  'DRIVER',
  ad.weekday_iso,
  '00:00'::time,
  '23:59'::time,
  CURRENT_DATE,
  true,
  'Floater driver - 24/7 on-call availability'
FROM floater_driver fd
CROSS JOIN all_days ad
ON CONFLICT (employee_id, assignment_role, weekday_iso, start_time, end_time, effective_start_date)
DO UPDATE SET active = true, updated_at = now();

INSERT INTO schema_migrations(version, description)
VALUES('052.001', 'Add Fletcher Kalundi as 24/7 floater driver with CDL, medical cert, and multi-service skills')
ON CONFLICT(version) DO NOTHING;
