const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const {resolveBookingFacility}=require('../netlify/functions/_shared/booking-facility.cjs');
const paid=require('../netlify/functions/_shared/facility-paid-bookings.cjs');
test('FutureCare registration preserves a preexisting code and is repeatable',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec("CREATE TABLE facilities(facility_code text PRIMARY KEY,name text,address text,billing_type text,active boolean);CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);INSERT INTO facilities VALUES('EXISTING-FC','FutureCare Annapolis','2700 Southaven Rd, Annapolis, MD 21401','legacy',true)");
 const migration=require('node:fs').readFileSync(require.resolve('../database/migrations/093.001_futurecare_booking_facility.sql'),'utf8');await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query('SELECT facility_code FROM facilities')).rows,[{facility_code:'EXISTING-FC'}]);
});
test('facility association is validated and facility managers cannot link another facility',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec("CREATE TABLE facilities(facility_code text PRIMARY KEY,name text,address text,active boolean);INSERT INTO facilities VALUES('A','Facility A','100 Main St',true),('B','Facility B','200 Main St',true),('OFF','Inactive','300 Main St',false)");
 const query=(...args)=>db.query(...args);
 assert.equal(await resolveBookingFacility(query,null,''),null);
 assert.equal((await resolveBookingFacility(query,null,'B')).facility_code,'B');
 assert.equal((await resolveBookingFacility(query,{role:'FACILITY',scope_id:'A'},'')).facility_code,'A');
 await assert.rejects(resolveBookingFacility(query,{role:'FACILITY',scope_id:'A'},'B'),e=>e.statusCode===403);
 await assert.rejects(resolveBookingFacility(query,null,'OFF'),e=>e.statusCode===400);
 await assert.rejects(resolveBookingFacility(query,null,'invented'),e=>e.statusCode===400);
});
test('FutureCare paid view includes only its paid real trips and rejects other facility users',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(`CREATE TABLE facilities(facility_code text PRIMARY KEY,name text,address text,active boolean);
 INSERT INTO facilities VALUES('FC','FutureCare Annapolis','2700 Southaven Road, Annapolis, MD 21401',true);
 CREATE TABLE bookings(reference text,name text,service text,pickup text,destination text,trip_date date,trip_time time,status text,payment_status text,estimated_fare numeric,balance_due numeric,facility_id text,booking_source text,deposit_paid_at timestamptz,paid_in_full_at timestamptz);
 INSERT INTO bookings(reference,facility_id,booking_source,payment_status) VALUES('PAID','FC','CUSTOMER','PAID_IN_FULL'),('DEPOSIT','FC','FACILITY','DEPOSIT_PAID'),('OTHER','OTHER','CUSTOMER','PAID_IN_FULL'),('UNPAID','FC','CUSTOMER','PENDING'),('MOCK','FC','MOCK','PAID_IN_FULL');`);
 const query=(...args)=>db.query(...args),data=await paid.view(query,{role:'ADMIN'});
 assert.deepEqual(data.trips.map(t=>t.reference).sort(),['DEPOSIT','PAID']);assert.equal(data.bookingUrl,'/booking-app.html?facility=FC');
 await assert.rejects(paid.view(query,{role:'FACILITY',scope_id:'OTHER'}),e=>e.statusCode===403);
 assert.equal((await paid.view(query,{role:'FACILITY',scope_id:'FC'})).trips.length,2);
});
