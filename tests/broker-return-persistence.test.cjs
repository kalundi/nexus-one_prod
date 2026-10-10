const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const NexusFare=require('../nexus-fare.js');
const {buildBrokerBookingPayload,resolveBrokerRequestStatus}=require('../netlify/functions/_shared/broker-auto-book.cjs');
test('Postgres saves broker scheduled and pending returns with current fares and independent quoted rates',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE bookings(reference text PRIMARY KEY,name text,phone text,email text,service text,pickup text,destination text,trip_date date,trip_time time,status text,notes text,pickup_lat numeric,pickup_lng numeric,destination_lat numeric,destination_lng numeric,distance_miles numeric,estimated_duration text,estimated_fare numeric,booking_source text,submitter_entity text,broker_company_name text,broker_accepted_rate numeric,created_at timestamptz,updated_at timestamptz,trip_type text,return_trip_date date,return_trip_time time,pickup_time timestamptz,notification_status jsonb);
   CREATE TABLE broker_requests(id integer PRIMARY KEY,booking_reference text,broker_quoted_rate numeric,request_status text,updated_at timestamptz);
   CREATE TABLE trip_status_history(booking_reference text,status text,status_label text,note text,actor text);
   INSERT INTO broker_requests(id,broker_quoted_rate) VALUES(1,180),(2,180);`);
  const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
  const source=fs.readFileSync('netlify/functions/api.cjs','utf8');
  const context=vm.createContext({Date,NexusFare,buildBrokerBookingPayload,resolveBrokerRequestStatus,clean:v=>String(v??'').trim(),reference:()=>{throw Error('Reference already supplied');},isDemoReference:()=>false,normalizeBookingSource:v=>v,upsertAppointmentNote:(notes,time)=>notes+' | Appointment: '+time,readPlatformSettings:async()=>settings,query:(sql,params)=>db.query(sql,params),sendBookingTeamsAlert:async()=>({status:'skipped'}),autoAssign:async()=>({assigned:false}),syncCalendarLifecycle:async()=>({status:'skipped'})});
  vm.runInContext(source.slice(source.indexOf('async function createBookingFromBrokerRequest('),source.indexOf('const DEFAULT_PRICING=')),context);
  for(const [id,time,expected] of [[1,'12:00',444.39],[2,null,347.83]]){
   const request={id,booking_reference:'RETURN-'+id,service:'wheelchair',trip_date:new Date('2030-08-15T00:00:00Z'),trip_time:'10:45',created_at:'2030-08-12T14:00:00Z',parsed_payload:{patient_name:'Test Rider',pickup_time:'10:00',distance_miles:25.28,trip_type:'ROUND_TRIP',return_trip_date:'2030-08-15',return_trip_time:time}};
   await context.createBookingFromBrokerRequest({},request);
   const {rows:[saved]}=await db.query('SELECT * FROM bookings WHERE reference=$1',[request.booking_reference]);
   assert.equal(saved.name,'Test Rider');
   assert.equal(saved.trip_type,'ROUND_TRIP');
   assert.equal(saved.return_trip_time,time?time+':00':null);
   assert.equal(Number(saved.estimated_fare),expected);
   assert.equal(saved.broker_accepted_rate,null,'an estimate is not driver confirmation');
   assert.equal(saved.booking_source,'BROKER');
   assert.match(saved.notes,/Appointment: 10:45/);
   assert.match(saved.notes,/Fare inputs:/);
   const {rows:[intake]}=await db.query('SELECT * FROM broker_requests WHERE id=$1',[id]);
   assert.equal(Number(intake.broker_quoted_rate),180);
   assert.equal(intake.booking_reference,saved.reference);
  }
 }finally{await db.close();}
});
