-- Backfill phone numbers for existing admin user management accounts.
UPDATE users
SET phone = CASE lower(email)
  WHEN 'patient@example.com' THEN '8886395766'
  WHEN 'executive@nexusmt.com' THEN '8886395766'
  WHEN 'qa@nexusmt.com' THEN '8886395766'
  WHEN 'billing@nexusmt.com' THEN '8886395766'
  WHEN 'facility@nexusmt.com' THEN '8886395766'
  WHEN 'dispatcher@nexusmt.com' THEN '8886395766'
  WHEN 'driver@nexusmt.com' THEN '8886395766'
  WHEN 'admin@nexusmt.com' THEN '8886395766'
  WHEN 'fletcher@nexusmt.com' THEN '2022702174'
  WHEN 'keames@adventisthealthcare.com' THEN '2406201940'
  ELSE phone
END,
updated_at = now()
WHERE lower(email) IN (
  'patient@example.com',
  'executive@nexusmt.com',
  'qa@nexusmt.com',
  'billing@nexusmt.com',
  'facility@nexusmt.com',
  'dispatcher@nexusmt.com',
  'driver@nexusmt.com',
  'admin@nexusmt.com',
  'fletcher@nexusmt.com',
  'keames@adventisthealthcare.com'
);
