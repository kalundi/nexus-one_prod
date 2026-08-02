-- Add Nexus Fleet: 4 Vehicle Types Across Service Tiers
-- Based on industry standards: AMR, Guardian EMS, American Ambulance
-- All vehicles available 24/7 for dispatch

INSERT INTO vehicles(unit_number, vehicle_type, status, metadata)
VALUES
-- Tier 1: Personal Transport (2-passenger Sedan)
(
  '254-01',
  'SEDAN',
  'AVAILABLE',
  jsonb_build_object(
    'source', 'fleet_seed_053',
    'vehicle_class', 'personal_transport',
    'service_tier', 'basic',
    'make_model', '2024 Toyota Camry',
    'year', 2024,
    'vin', 'JTDGH4NU0L0123451',
    'registration_plate', 'NMT-SEC-01',
    'passenger_capacity', 2,
    'wheelchair_capacity', 0,
    'accessibility_features', jsonb_build_array('wheelchair_ramp'),
    'vehicle_equipment', jsonb_build_array(
      'first_aid_kit',
      'emergency_flashers',
      'climate_control',
      'premium_audio'
    ),
    'fuel_type', 'hybrid',
    'mpg_rating', 52,
    'maintenance_interval_miles', 10000,
    'last_maintenance', now(),
    'inspection_expiry', '2027-08-02',
    'insurance_expiry', '2027-02-01',
    'licensing_tier', 'standard_passenger',
    'operator_certification', jsonb_build_array('standard_driver'),
    'gps_equipped', true,
    'telematics_enabled', true,
    'backup_camera', true,
    'traction_control', true,
    'availability_24_7', true,
    'primary_service', 'ambulatory_transport',
    'compatible_services', jsonb_build_array('ambulatory'),
    'notes', 'Sedan for ambulatory passengers - fuel efficient, comfortable'
  )
),

-- Tier 2: Premium Passenger Transport (3-passenger SUV)
(
  '254-02',
  'SUV',
  'AVAILABLE',
  jsonb_build_object(
    'source', 'fleet_seed_053',
    'vehicle_class', 'premium_transport',
    'service_tier', 'standard',
    'make_model', '2024 Ford Expedition',
    'year', 2024,
    'vin', 'JTDGH4NU0L0123452',
    'registration_plate', 'NMT-SUV-02',
    'passenger_capacity', 3,
    'wheelchair_capacity', 0,
    'accessibility_features', jsonb_build_array(
      'wheelchair_ramp',
      'fold_down_seating',
      'grab_handles'
    ),
    'vehicle_equipment', jsonb_build_array(
      'first_aid_kit',
      'emergency_flashers',
      'climate_control',
      'premium_suspension',
      'wheel_chair_securements',
      'patient_communication_system'
    ),
    'fuel_type', 'gasoline',
    'mpg_rating', 23,
    'passenger_comfort_features', jsonb_build_array(
      'heated_seats',
      'ventilated_seats',
      'memory_seat_position'
    ),
    'maintenance_interval_miles', 7500,
    'last_maintenance', now(),
    'inspection_expiry', '2027-08-02',
    'insurance_expiry', '2027-02-01',
    'licensing_tier', 'commercial_passenger',
    'operator_certification', jsonb_build_array('standard_driver', 'commercial_endorsement'),
    'gps_equipped', true,
    'telematics_enabled', true,
    'backup_camera', true,
    'blind_spot_monitoring', true,
    'adaptive_cruise_control', true,
    'traction_control', true,
    'availability_24_7', true,
    'primary_service', 'ambulatory_transport',
    'compatible_services', jsonb_build_array('ambulatory', 'wheelchair'),
    'notes', 'Premium SUV for comfortable multi-passenger transport - excellent suspension'
  )
),

-- Tier 3: Wheelchair Accessible Van (12-passenger + 3 wheelchair)
(
  '254-03',
  'WHEELCHAIR_VAN',
  'AVAILABLE',
  jsonb_build_object(
    'source', 'fleet_seed_053',
    'vehicle_class', 'wheelchair_accessible',
    'service_tier', 'advanced',
    'make_model', '2024 Ford Transit 350 HD',
    'year', 2024,
    'vin', 'JTDGH4NU0L0123453',
    'registration_plate', 'NMT-WCV-03',
    'passenger_capacity', 12,
    'wheelchair_capacity', 3,
    'wheelchair_slots', jsonb_build_array(
      jsonb_build_object('position', 1, 'accessible_from', 'side_door', 'securing_system', 'auto_lock'),
      jsonb_build_object('position', 2, 'accessible_from', 'side_door', 'securing_system', 'auto_lock'),
      jsonb_build_object('position', 3, 'accessible_from', 'rear_ramp', 'securing_system', 'auto_lock')
    ),
    'accessibility_features', jsonb_build_array(
      'hydraulic_side_door_ramp',
      'rear_wheelchair_lift',
      'full_height_interior',
      'grab_handles_throughout',
      'wider_aisles',
      'wheelchair_securements_3x',
      'patient_seat_belts_12x',
      'emergency_exit_hatch'
    ),
    'vehicle_equipment', jsonb_build_array(
      'first_aid_kit_advanced',
      'emergency_oxygen_system',
      'emergency_suction',
      'stretcher_mounts',
      'climate_control_zones',
      'onboard_monitoring_capability',
      'wheelchair_battery_charging',
      'passenger_communication_system',
      'emergency_intercom'
    ),
    'fuel_type', 'diesel',
    'mpg_rating', 18,
    'engine_specs', jsonb_build_object(
      'displacement', '6.7L',
      'horsepower', 470,
      'torque', 860,
      'transmission', 'TorqShift 10-speed'
    ),
    'maintenance_interval_miles', 5000,
    'last_maintenance', now(),
    'inspection_expiry', '2027-08-02',
    'insurance_expiry', '2027-02-01',
    'licensing_tier', 'commercial_passenger_wheelchair',
    'operator_certification', jsonb_build_array(
      'CDL_B',
      'passenger_endorsement',
      'wheelchair_transport_certified',
      'ada_compliance_trained'
    ),
    'ada_compliant', true,
    'aoa_certified', true,
    'gps_equipped', true,
    'telematics_enabled', true,
    'backup_camera', true,
    '360_degree_camera', true,
    'blind_spot_monitoring', true,
    'lane_departure_warning', true,
    'traction_control', true,
    'stability_control', true,
    'availability_24_7', true,
    'primary_service', 'wheelchair_transport',
    'compatible_services', jsonb_build_array('wheelchair', 'ambulatory', 'facility_transfer'),
    'max_wheelchair_weight_per_slot', 350,
    'notes', 'Premium wheelchair accessible van - ADA compliant, accommodates mixed mobility passengers'
  )
),

-- Tier 4: Ambulance/Stretcher Vehicle (Advanced Life Support)
(
  '254-04',
  'AMBULANCE',
  'AVAILABLE',
  jsonb_build_object(
    'source', 'fleet_seed_053',
    'vehicle_class', 'ambulance',
    'service_tier', 'critical_care',
    'make_model', '2024 Braun Chief XL Ambulance',
    'year', 2024,
    'vin', 'JTDGH4NU0L0123454',
    'registration_plate', 'NMT-AMB-04',
    'passenger_capacity', 2,
    'stretcher_capacity', 1,
    'patient_compartments', 1,
    'attendant_seating', 2,
    'accessibility_features', jsonb_build_array(
      'automated_stretcher_loading',
      'hydraulic_lift_gate',
      'interior_lighting_adjustable',
      'patient_privacy_curtains',
      'climate_control_patient_zone',
      'shock_absorption_suspension'
    ),
    'medical_equipment', jsonb_build_array(
      'defibrillator_aed',
      'cardiac_monitor',
      'iv_pump_system',
      'oxygen_delivery_high_flow',
      'suction_equipment',
      'airway_management_kit',
      'trauma_supplies',
      'stretcher_securing_system',
      'spinal_immobilization_board',
      'cervical_collar_assortment',
      'portable_ventilator',
      'blood_pressure_monitor_automatic',
      'pulse_oximeter',
      'temperature_monitoring',
      'patient_communication_headset'
    ),
    'vehicle_equipment', jsonb_build_array(
      'emergency_lights_led',
      'siren_multi_tone',
      'warning_striping_reflective',
      'emergency_communication_radio',
      'mobile_data_terminal',
      'gps_navigation_advanced',
      'onboard_diagnostic_system'
    ),
    'fuel_type', 'gasoline',
    'mpg_rating', 14,
    'engine_specs', jsonb_build_object(
      'displacement', '6.8L',
      'horsepower', 362,
      'torque', 468,
      'transmission', 'TorqShift auto'
    ),
    'maintenance_interval_miles', 3000,
    'last_maintenance', now(),
    'inspection_expiry', '2027-08-02',
    'medical_equipment_inspection_expiry', '2027-04-01',
    'insurance_expiry', '2027-02-01',
    'licensing_tier', 'commercial_ambulance',
    'operator_certification', jsonb_build_array(
      'CDL_B',
      'passenger_endorsement',
      'als_2_transport_certified',
      'patient_transport_safety',
      'medical_equipment_operation',
      'emergency_response_trained',
      'hipaa_certified'
    ),
    'certification_level', 'ALS_2',
    'gps_equipped', true,
    'telematics_enabled', true,
    'backup_camera', true,
    '360_degree_camera', true,
    'blind_spot_monitoring', true,
    'collision_avoidance', true,
    'traction_control', true,
    'stability_control', true,
    'automatic_braking', true,
    'availability_24_7', true,
    'emergency_response_capable', true,
    'ict_capable', true,
    'telemedicine_capable', true,
    'primary_service', 'stretcher_transport',
    'compatible_services', jsonb_build_array(
      'stretcher',
      'ambulatory',
      'bariatric',
      'als_2_transport',
      'facility_transfer',
      'emergency_response'
    ),
    'patient_weight_limit', 350,
    'equipment_certification_body', 'NFPA_1917',
    'notes', 'Advanced Life Support ambulance - full medical equipment, emergency-response capable, telemedicine ready'
  )
)
ON CONFLICT (unit_number) DO UPDATE SET
  vehicle_type = EXCLUDED.vehicle_type,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO schema_migrations(version, description)
VALUES('053.001', 'Add comprehensive fleet: 4 vehicles (sedan, SUV, wheelchair van, ambulance) with industry-standard specifications - all 24/7 available')
ON CONFLICT(version) DO NOTHING;
