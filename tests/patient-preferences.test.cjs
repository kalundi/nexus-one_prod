const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('patient preferences are stored behind authenticated patient endpoints',()=>{
 const api=read('netlify/functions/api.cjs'),migration=read('database/migrations/072.001_patient_transport_preferences.sql');
 assert.match(api,/p\[0\]===\'patient\'&&p\[1\]===\'preferences\'/);
 assert.match(api,/requireUser\(bearer\(event\),\['PATIENT'\]\)/);
 assert.match(api,/mobility_type=EXCLUDED\.mobility_type/);
 assert.match(migration,/user_id uuid PRIMARY KEY REFERENCES users\(id\)/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
});

test('patient profile captures mobility, assistance, oxygen, language and communication needs',()=>{
 const html=read('patient.html'),patient=read('build6-patient.js');
 assert.match(html,/name="remainsInWheelchair"/);
 assert.match(html,/name="transferAssistance"/);
 assert.match(html,/name="oxygenRequired"/);
 assert.match(html,/name="communication"/);
 assert.match(patient,/\/api\/patient\/preferences/);
});

test('booking applies patient defaults while allowing per-ride changes',()=>{
 const booking=read('booking-app.js'),html=read('booking-app.html'),platform=read('platform.js');
 assert.match(booking,/function applyPatientTransportationPreferences/);
 assert.match(booking,/selectService\(service\)/);
 assert.match(booking,/defaultPickup/);
 assert.match(booking,/Rider remains in wheelchair during transport/);
 assert.match(booking,/You can change them for this ride/);
 assert.match(booking,/renderPatientDefaultsBanner/);
 assert.match(html,/id="patientDefaultsBanner"/);
 assert.match(html,/Manage saved preferences/);
 assert.match(platform,/document\.getElementById\('bookingForm'\)/);
});
