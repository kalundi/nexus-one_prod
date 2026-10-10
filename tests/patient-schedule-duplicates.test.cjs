const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {isDuplicateTrip}=require('../netlify/functions/_shared/booking-duplicate.cjs');
test('patient schedule guard merges legacy re-imports and rejects all new duplicate channels',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
   CREATE TABLE bookings(reference text PRIMARY KEY,name text,pickup text,destination text,trip_date date,trip_time time,status text,booking_source text,trip_type text,return_trip_time time,notes text,created_at timestamptz DEFAULT now(),paid_in_full_at timestamptz,deposit_paid_at timestamptz,driver_name text);`);
  const insert=(reference,changes={})=>db.query(`INSERT INTO bookings(reference,name,pickup,destination,trip_date,trip_time,status,booking_source,trip_type,notes,driver_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[reference,changes.name||'Christine Webster',changes.pickup||'10 Home Street',changes.destination||'20 Clinic Road',changes.date||'2026-09-25',changes.time||'09:05',changes.status||'SUBMITTED',changes.source||'CUSTOMER',changes.type||'ONE_WAY',changes.notes??'Appointment time: 9:45 AM | Referral ID: 4474-79201-9',changes.driver||null]);
  await insert('original',{source:'BROKER',status:'COMPLETED',type:'ROUND_TRIP',driver:'Assigned driver'});
  await insert('reimport',{source:'BROKER',time:'09:45'});
  await db.exec(fs.readFileSync('database/migrations/079.001_booking_duplicate_guard.sql','utf8'));
  await db.exec(fs.readFileSync('database/migrations/084.001_patient_schedule_duplicates.sql','utf8'));
  assert.equal((await db.query("SELECT duplicate_of FROM bookings WHERE reference='reimport'")).rows[0].duplicate_of,'original');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE duplicate_of IS NULL')).rows[0].n,1);
  await assert.rejects(insert('different-address',{name:' CHRISTINE WEBSTER ',pickup:'Formatted new address',destination:'Different destination',source:'FACILITY',notes:''}),isDuplicateTrip);
  await assert.rejects(insert('same-appointment',{time:'09:10',notes:'Appointment time: 09:45'}),isDuplicateTrip);
  await assert.rejects(insert('same-referral',{time:'10:00',notes:'Appointment time: 10:45 AM | Referral ID: 4474-79201-9'}),isDuplicateTrip);
  await assert.rejects(insert('reversed-route',{pickup:'20 Clinic Road',destination:'10 Home Street',notes:''}),isDuplicateTrip);
  await insert('later',{time:'12:00',notes:'Appointment time: 12:45 PM'});
  await insert('different-day',{date:'2026-09-26'});
  await insert('different-patient',{name:'Another Patient'});
  await assert.rejects(db.query("UPDATE bookings SET trip_time='09:05' WHERE reference='later'"),isDuplicateTrip);
  await db.query("UPDATE bookings SET status='CANCELLED' WHERE reference='later'");
  await insert('replacement',{time:'12:00',notes:'Appointment time: 12:45 PM'});
  await assert.rejects(db.query("UPDATE bookings SET status='SUBMITTED' WHERE reference='later'"),isDuplicateTrip);
  await assert.rejects(db.query("UPDATE bookings SET duplicate_of=NULL WHERE reference='reimport'"),isDuplicateTrip);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n,6,'Legacy duplicate remains available for history/documents');
 }finally{await db.close();}
});
test('appointment normalization keeps midnight, noon, AM/PM and invalid values distinct',async()=>{
 const db=new PGlite();
 try{
  const migration=fs.readFileSync('database/migrations/084.001_patient_schedule_duplicates.sql','utf8');
  const start=migration.indexOf('CREATE OR REPLACE FUNCTION booking_appointment_time'),end=migration.indexOf('CREATE OR REPLACE FUNCTION booking_referral_key',start);
  await db.exec(migration.slice(start,end));
  const result=await db.query("SELECT booking_appointment_time('Appointment time: 12:00 AM')::text AS midnight,booking_appointment_time('Appointment time: 12:00 PM')::text AS noon,booking_appointment_time('Appointment time: 1:30 PM')::text AS afternoon,booking_appointment_time('Appointment time: 25:90') AS invalid");
  assert.deepEqual(result.rows[0],{midnight:'00:00:00',noon:'12:00:00',afternoon:'13:30:00',invalid:null});
 }finally{await db.close();}
});
