const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('patient feedback is validated and stored server-side', () => {
  const api = fs.readFileSync('netlify/functions/api.cjs', 'utf8');
  const migration = fs.readFileSync('database/migrations/073.001_patient_feedback.sql', 'utf8');
  assert.match(api, /p\[0\]==='patient-feedback'/);
  assert.match(api, /rating<1\|\|rating>5/);
  assert.match(api, /suggestion\.length<10\|\|suggestion\.length>2000/);
  assert.match(api, /INSERT INTO patient_feedback/);
  assert.match(migration, /CHECK \(rating BETWEEN 1 AND 5\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});
