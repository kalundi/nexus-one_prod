// Run against a disposable local PostgreSQL database only.
// DUPLICATE_TEST_DATABASE_URL=postgres://... node --test tests/booking-duplicate.integration.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {Pool}=require('pg');
const {isDuplicateTrip}=require('../netlify/functions/_shared/booking-duplicate.cjs');

test('all intake sources share an atomic duplicate guard',{skip:!process.env.DUPLICATE_TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DUPLICATE_TEST_DATABASE_URL});
 const schema=`duplicate_test_${Date.now()}`;
 const client=await pool.connect();
 const other=await pool.connect();
 try{
  await client.query(`CREATE SCHEMA ${schema}`);
  for(const c of [client,other])await c.query(`SET search_path TO ${schema},public`);
  await client.query(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
   CREATE TABLE bookings(reference text PRIMARY KEY,name text,pickup text,destination text,trip_date date,trip_time time,status text,booking_source text,notes text,trip_type text,return_trip_time time,driver_name text,paid_in_full_at timestamptz,deposit_paid_at timestamptz,created_at timestamptz DEFAULT now());`);
  const insert=(c,ref,opts={})=>c.query(`INSERT INTO bookings(reference,name,pickup,destination,trip_date,trip_time,status,booking_source)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[ref,opts.name||'Jane Doe',opts.pickup||'10 Main St.',opts.destination||'20 Hospital Rd.',opts.date||'2026-10-01',opts.time||'09:00',opts.status||'SUBMITTED',opts.source||'CUSTOMER']);
  await insert(client,'legacy1');await insert(client,'legacy2');
  await client.query(readFileSync('database/migrations/079.001_booking_duplicate_guard.sql','utf8'));
  await client.query(readFileSync('database/migrations/084.001_patient_schedule_duplicates.sql','utf8'));
  await assert.rejects(insert(client,'email',{source:'BROKER',name:' JANE DOE ',pickup:'10 main st',destination:'20 hospital rd'}),isDuplicateTrip);
  await client.query("UPDATE bookings SET status='COMPLETED' WHERE reference='legacy2'");
  await client.query("DELETE FROM bookings WHERE reference='legacy1'");
  await assert.rejects(insert(client,'after-delete'),isDuplicateTrip);
  await assert.rejects(insert(client,'return',{pickup:'20 Hospital Rd.',destination:'10 Main St.'}),isDuplicateTrip);
  await insert(client,'tomorrow',{date:'2026-10-02'});
  await insert(client,'later',{time:'10:00'});
  await insert(client,'different-patient',{name:'John Doe'});
  await client.query("UPDATE bookings SET status='CANCELLED' WHERE reference='later'");
  await insert(client,'replacement',{time:'10:00'});
  await assert.rejects(client.query("UPDATE bookings SET status='SUBMITTED' WHERE reference='later'"),isDuplicateTrip);
  await assert.rejects(client.query("UPDATE bookings SET trip_date='2026-10-01' WHERE reference='tomorrow'"),isDuplicateTrip);
  await client.query('BEGIN');
  await insert(client,'race1',{date:'2026-10-03'});
  const second=insert(other,'race2',{date:'2026-10-03',source:'FACILITY'});
  const rejected=assert.rejects(second,isDuplicateTrip);
  await client.query('COMMIT');
  await rejected;
  assert.equal((await client.query("SELECT count(*)::int AS n FROM bookings WHERE trip_date='2026-10-03'")).rows[0].n,1);
 }finally{
  await client.query('ROLLBACK');
  await client.query(`DROP SCHEMA ${schema} CASCADE`);
  client.release();other.release();await pool.end();
 }
});

test('only the trip constraint becomes a duplicate-trip response',()=>{
 assert.equal(isDuplicateTrip({code:'23505',constraint:'bookings_duplicate_trip_unique'}),true);
 assert.equal(isDuplicateTrip({code:'23505',constraint:'bookings_pkey'}),false);
 assert.equal(isDuplicateTrip(new Error('connection failed')),false);
});
