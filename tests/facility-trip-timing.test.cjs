const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const Trips=require('../netlify/functions/_shared/trip-timing.cjs');const Identity=require('../netlify/functions/_shared/facility-identification.cjs');const Availability=require('../netlify/functions/_shared/timing-availability.cjs');const Timing=require('../nexus-trip-timing.js');const Fare=require('../nexus-fare.js');
const settings={fareRules:{smartTiming:{enabled:true},servicePolicies:{wheelchair:{speedReductionMph:0}}},pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:12}}};
const booking={reference:'NEW-1',service:'wheelchair',date:'2026-10-14',time:'08:30',appointmentTime:'10:00',pickup:'100 Rehab Road, Rockville MD 20850',destination:'200 Hospital Road, Bethesda MD 20814',tripType:'ONE_WAY',distanceMiles:5,fareInputs:{miles:5,durationMinutes:20,trafficDurationMinutes:20,stopWaitMinutes:0,discountPct:0,deadheadSegments:[0,0],scheduleBasis:'PICKUP'}};
test('facility identification classifies selected Places and only accepts an NPI organization at the exact street and ZIP',async()=>{
 assert.equal(Identity.classify({name:'Riverside Rehab',types:['health']}).facilityType,'REHAB');
 assert.equal(Identity.classify({name:'General Hospital',types:['hospital']}).facilityType,'HOSPITAL');
 const record={number:1234567890,enumeration_type:'NPI-2',taxonomies:[{desc:'Rehabilitation Hospital'}],addresses:[{address_purpose:'LOCATION',address_1:'100 Rehab Rd',postal_code:'208500001'}]};
 assert.equal(Identity.matchNpi(booking.pickup,[record]),record);assert.equal(Identity.matchNpi('110 Rehab Road, Rockville MD 20850',[record]),null);
 let requested;
 const result=await Identity.identify(booking.pickup,{name:'Urban Rehab',types:['health']},async url=>{requested=url;return {ok:true,json:async()=>({results:[record]})};});
 assert.equal(result.identificationSource,'NPPES_NPI_REGISTRY');assert.equal(result.facilityType,'REHAB');assert(requested.includes('enumeration_type=NPI-2'));assert(!requested.includes('patient'));
 assert.equal((await Identity.identify('10 Unknown Lane',{},()=>{throw Error('No remote search for residences');})).identificationSource,'UNCLASSIFIED');
});
test('profile validation rejects invalid allowances and malformed receiving windows',()=>{
 assert.throws(()=>Trips.validateProfile({address:booking.pickup,pickupExtraMinutes:-1}),/allowances/);
 assert.throws(()=>Trips.validateProfile({address:booking.pickup,receivingHours:[{start:'29:00',end:'31:00'}]}),/windows/);
 assert.equal(Trips.validateProfile({address:booking.pickup,facilityType:'REHAB',pickupExtraMinutes:5}).pickup,5);
});
test('resource conflicts follow the permanent account key when a driver name changes',()=>{
 const plan=Timing.plan(booking,booking.fareInputs,settings),trip={driver:'Former Name',driverUserId:'user-1',timingPlan:plan};
 assert.equal(Trips.conflicts(plan,[trip],{user_id:'user-1',display_name:'New Name'},null).length,1);
 assert.equal(Trips.conflicts(plan,[trip],{user_id:'user-2',display_name:'Former Name'},null).length,0);
});
test('historical automatic arrival-based delivery does not become a measured handoff',()=>{
 const at='2026-10-10T12:00:00Z';const rows=[{reference:'REAL-CARE',service:'wheelchair',pickup:booking.pickup,destination:booking.destination,history:[{status:'ARRIVED_DESTINATION',createdAt:at},{status:'DELIVERED',createdAt:'2026-10-10T12:05:00Z',note:'Auto-confirmed destination stop'},{status:'COMPLETED',createdAt:'2026-10-10T12:06:00Z'}]}];
 assert.deepEqual(Trips.collectObservations(rows),{});
});
test('CMS exact-address recognition handles broker address formatting and rejects ambiguous facility types',async()=>{
 const hospital={facilityType:'HOSPITAL',address:'8600 Old Georgetown Road',city:'Bethesda',zip:'20814'};
 assert.equal(Identity.matchCms('8600 Old Georgetown Road Bethesda Maryland 20814',[hospital]),hospital);
 assert.equal(Identity.matchCms('8601 Old Georgetown Road, Bethesda MD 20814',[hospital]),null);
 assert.equal(Identity.matchCms('8600 Old Georgetown Road, Bethesda MD 20814',[hospital,{...hospital,facilityType:'REHAB'}]),null);
 const result=await Identity.identify('8600 Old Georgetown Road, Bethesda MD 20814',{},async url=>({ok:true,json:async()=>({results:url.includes('xubh-q36u')?[{facility_name:'Suburban Hospital',address:hospital.address,citytown:'Bethesda',zip_code:'20814',facility_id:'123456'}]:[]})}));
 assert.equal(result.identificationSource,'CMS_CARE_COMPARE');assert.equal(result.facilityType,'HOSPITAL');assert.equal(result.ccn,'123456');
});
test('driver shift must cover handoff and buffer; adjacent shifts merge across midnight and DST',()=>{
 const plan=Timing.plan(booking,booking.fareInputs,settings);
 const shift=(day,start,end,date='2026-01-01')=>({weekday_iso:day,start_time:start,end_time:end,effective_start_date:date});
 assert(!Availability.coversWindow([shift(3,'06:00','09:30')],plan));assert(Availability.coversWindow([shift(3,'06:00','15:00')],plan));
 assert(!Availability.coversWindow([shift(3,'06:00','15:00','2026-10-15')],plan));
 const overnight={crewArrivalAt:Fare.scheduledEpoch('2026-11-01','23:30'),vehicleAvailableAt:Fare.scheduledEpoch('2026-11-02','01:30')};
 assert(Availability.coversWindow([shift(7,'22:00','23:59'),shift(1,'00:00','03:00')],{...overnight,crewArrivalAt:Fare.scheduledEpoch('2026-11-02','00:00')}));
});
test('Postgres migration, real facility learning, and resource occupancy work together without GPS or mock contamination',async t=>{
 t.mock.method(Date,'now',()=>Fare.scheduledEpoch('2026-10-12','09:00'));
 const db=new PGlite();const query=(sql,args)=>db.query(sql,args);
 try{
 await db.exec(`CREATE TABLE schema_migrations(version text primary key,description text);CREATE TABLE system_settings(key text primary key,value jsonb);INSERT INTO system_settings VALUES('platform','{"fareRules":{}}');
  CREATE TABLE bookings(reference text primary key,service text,pickup text,destination text,trip_date date,trip_time time,trip_type text,return_trip_date date,return_trip_time time,status text,booking_source text,notes text,driver_user_id text,driver_name text,driver_scope_id text,vehicle_unit text,distance_miles numeric,estimated_duration text,route_fare_inputs jsonb,created_at timestamptz default now());
  CREATE TABLE trip_status_history(booking_reference text,status text,created_at timestamptz,note text);
  CREATE TABLE users(id text primary key,active boolean,role text,scope_id text);CREATE TABLE employees(id text primary key,user_id text,role text,active boolean,display_name text,email text,phone text);
  CREATE TABLE user_role_requests(user_id text,role text,status text,scope_id text);CREATE TABLE employee_shifts(employee_id text,weekday_iso integer,start_time time,end_time time,effective_start_date date,effective_end_date date,active boolean,assignment_role text);
  CREATE TABLE vehicles(unit_number text primary key,status text);INSERT INTO vehicles VALUES('EXISTING','AVAILABLE');`);
 await db.exec(fs.readFileSync('database/migrations/087.001_smart_trip_timing.sql','utf8'));
 await db.exec(fs.readFileSync('database/migrations/088.001_vehicle_availability_active.sql','utf8'));
 assert.equal((await query("SELECT active FROM vehicles WHERE unit_number='EXISTING'")).rows[0].active,true);
 await query("UPDATE vehicles SET active=false WHERE unit_number='EXISTING'");
 await db.exec(fs.readFileSync('database/migrations/088.001_vehicle_availability_active.sql','utf8'));
 assert.equal((await query("SELECT active FROM vehicles WHERE unit_number='EXISTING'")).rows[0].active,false,'rerunning migration preserves deactivated vehicles');
 assert.equal((await query("SELECT value->'fareRules'->'smartTiming'->>'enabled' AS enabled FROM system_settings")).rows[0].enabled,'true');
 for(let i=0;i<11;i++){
  const ref=i===10?'MOCK-TEST':'REAL-'+i,source=i===10?'MOCK':'CUSTOMER',mins=i===10?170:20+i;
  await query("INSERT INTO bookings(reference,service,pickup,destination,trip_date,status,booking_source) VALUES($1,'wheelchair',$2,$3,CURRENT_DATE,'COMPLETED',$4)",[ref,booking.pickup,booking.destination,source]);
  await query("INSERT INTO trip_status_history(booking_reference,status,created_at) VALUES($1,'ARRIVED_PICKUP',now()-interval '2 hours'),($1,'DEPARTED',now()-interval '2 hours'+$2*interval '1 minute'),($1,'ARRIVED_DESTINATION',now()-interval '1 hour'),($1,'DELIVERED',now()-interval '40 minutes')",[ref,mins]);
 }
 const ctx=await Trips.contextFor([booking.pickup,booking.destination],query,[],{lookupExternal:false});
 assert.equal(ctx.locations[Timing.addressKey(booking.pickup)].observations.length,10);
 const publicContext=Trips.publicContext(ctx);
 assert.equal(publicContext.locations[Timing.addressKey(booking.pickup)].observations,undefined);
 assert.equal(Timing.plan(booking,{...booking.fareInputs,scheduleBasis:'PICKUP'},settings,publicContext).legs[0].pickupMinutes,28);
 const hydrated=(await Trips.hydrate([booking],settings,query))[0];const plan=Trips.planFor(hydrated,settings);
 assert.equal(plan.legs[0].pickupMinutes,28);assert.equal(plan.legs[0].handoffMinutes,20);assert.equal(plan.confidence,'MEDIUM');
 assert(!JSON.stringify(ctx).includes('REAL-'));assert(!JSON.stringify(ctx).includes('MOCK-'));
 await db.exec(`INSERT INTO users VALUES('u1',true,'DRIVER','D1'),('u2',true,'DRIVER','D2');INSERT INTO employees VALUES('e1','u1','DRIVER',true,'Occupied Driver',null,null),('e2','u2','DRIVER',true,'Free Driver',null,null);
  INSERT INTO employee_shifts VALUES('e1',3,'06:00','15:00','2026-01-01',null,true,'DRIVER'),('e2',3,'06:00','15:00','2026-01-01',null,true,'DRIVER');INSERT INTO vehicles(unit_number,active,status) VALUES('WC-1',true,'AVAILABLE'),('WC-2',true,'AVAILABLE'),('WC-3',false,'AVAILABLE');`);
 await query("INSERT INTO bookings(reference,service,pickup,destination,trip_date,trip_time,status,booking_source,driver_name,vehicle_unit,distance_miles,estimated_duration) VALUES('ACTIVE','wheelchair',$1,$2,'2026-10-14','09:00','ARRIVED_DESTINATION','CUSTOMER','Occupied Driver','WC-1',5,'20 min')",[booking.pickup,booking.destination]);
 const available=await Availability.resources(booking,settings,query,['WC-1','WC-2','WC-3']);
 assert.deepEqual(available.drivers.map(d=>d.display_name),['Free Driver']);assert.deepEqual(available.vehicles.map(v=>v.unit_number),['WC-2']);
 }finally{await db.close();}
});
