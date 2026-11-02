const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {createHandler}=require('../netlify/functions/_shared/facility-portal.cjs');
test('production facility operations enforce scope, persist conversations and rank real completed visits',async()=>{
 const db=new PGlite(),manager='11111111-1111-4111-8111-111111111111',dispatcher='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
   CREATE TABLE users(id uuid PRIMARY KEY); INSERT INTO users VALUES('${manager}'),('${dispatcher}');
   CREATE TABLE facilities(facility_code text PRIMARY KEY,name text,address text,active boolean);
   INSERT INTO facilities VALUES('FC-A','Care A','100 Facility Lane',true),('FC-B','Care B','200 Facility Lane',true),('FC-X','Closed','300 Facility Lane',false);
   CREATE TABLE bookings(reference text PRIMARY KEY,facility_id text,booking_source text,name text,service text,pickup text,destination text,trip_date date,trip_time time,notes text,status text,payment_status text,driver_name text,vehicle_unit text,trip_type text,return_trip_date date,return_trip_time time,updated_at timestamptz);
   CREATE TABLE trip_status_history(id uuid DEFAULT gen_random_uuid(),booking_reference text,status text,status_label text,note text,created_at timestamptz DEFAULT now());
   INSERT INTO bookings(reference,facility_id,booking_source,name,pickup,destination,trip_date,trip_time,status,payment_status) VALUES
   ('A1','FC-A','CUSTOMER','Passenger One','100 Facility Lane','  Hospital   Road  ','2026-01-01','08:00','COMPLETED','PAID_IN_FULL'),
   ('A2','FC-A','CUSTOMER','Passenger Two','Hospital Road','100 Facility Lane','2026-01-02','09:00','DELIVERED','PAID_IN_FULL'),
   ('A3','FC-A',NULL,'Passenger Three','100 Facility Lane','Clinic Lane','2026-01-03','10:00','COMPLETED','PAID_IN_FULL'),
   ('B1','FC-B','CUSTOMER','Other Passenger','200 Facility Lane','Other Hospital','2026-01-01','08:00','COMPLETED','PAID_IN_FULL'),
   ('CANCEL','FC-A','CUSTOMER','Cancelled Passenger','100 Facility Lane','Cancelled Clinic','2026-01-01','09:00','CANCELLED','UNPAID'),
   ('MOCK','FC-A','MOCK','Fake Passenger','100 Facility Lane','Fake Clinic','2026-01-01','10:00','COMPLETED','PAID_IN_FULL'),
   ('DEMO','FC-A','demo','Demo Passenger','100 Facility Lane','Demo Clinic','2026-01-01','10:00','COMPLETED','PAID_IN_FULL'),
   ('PENDING','FC-A','CUSTOMER','Future Passenger','100 Facility Lane','Future Clinic','2026-01-01','11:00','REQUESTED','UNPAID');
   UPDATE bookings SET return_trip_date='2026-01-04',return_trip_time='12:00',trip_type='ROUND_TRIP' WHERE reference='A1';
   INSERT INTO trip_status_history(booking_reference,status,status_label,note) VALUES('A1','COMPLETED','completed','Internal confidential dispatch note'),('B1','COMPLETED','completed','Other facility');`);
  await db.exec(fs.readFileSync('database/migrations/084.001_patient_schedule_duplicates.sql','utf8').split('CREATE OR REPLACE FUNCTION booking_appointment_time')[1].split('CREATE OR REPLACE FUNCTION booking_referral_key')[0].replace(/^/, 'CREATE OR REPLACE FUNCTION booking_appointment_time'));
  await db.exec(fs.readFileSync('database/migrations/094.001_facility_portal.sql','utf8'));
  // Repeated deploys must be safe.
  await db.exec(fs.readFileSync('database/migrations/094.001_facility_portal.sql','utf8'));
  const users={manager:{id:manager,role:'FACILITY',scope_id:'FC-A',display_name:'Manager A'},dispatch:{id:dispatcher,role:'DISPATCHER',display_name:'Nexus Dispatch'},unassigned:{id:manager,role:'FACILITY',scope_id:null},patient:{id:manager,role:'PATIENT'},inactive:{id:manager,role:'FACILITY',scope_id:'FC-X'}};
  const handler=createHandler({query:(...args)=>db.query(...args),requireUser:async(token,roles)=>{if(!users[token])throw Object.assign(Error('Authentication required'),{statusCode:401});if(!roles.includes(users[token].role))throw Object.assign(Error('Forbidden'),{statusCode:403});return users[token];},bearer:e=>e.headers.authorization,json:(statusCode,body)=>({statusCode,body}),parseBody:e=>JSON.parse(e.body)});
  const call=async(path,token='manager',params={},body=null)=>{const [endpoint,reference]=path.split('/');try{return await handler({headers:{authorization:token},queryStringParameters:params,body:JSON.stringify(body||{})},['facility-portal',endpoint,...(reference?[reference]:[])],body?'POST':'GET');}catch(error){return {statusCode:error.statusCode||500,body:{error:error.message}};}};
  assert.equal((await call('context','')).statusCode,401);assert.equal((await call('context','patient')).statusCode,403);assert.equal((await call('trips','unassigned')).statusCode,409);assert.equal((await call('trips','inactive')).statusCode,409);
  assert.deepEqual((await call('context')).body.facilities.map(f=>f.id),['FC-A']);
  assert.deepEqual((await call('context','dispatch')).body.facilities.map(f=>f.id),['FC-A','FC-B']);
  assert.equal((await call('trips','manager',{facility:'FC-B',date:'2026-01-01'})).statusCode,403);
  for(const endpoint of ['context','locations','communications/B1','read/B1'])assert.equal((await call(endpoint,'manager',{facility:'FC-B'},endpoint==='read/B1'?{through:new Date().toISOString()}:null)).statusCode,403);
  assert.equal((await call('trips','dispatch',{date:'2026-01-01'})).statusCode,409);
  await db.exec("UPDATE bookings SET notes='Appointment time: 9:30 AM' WHERE reference='A1'");
  const board=await call('trips','manager',{date:'2026-01-01'});assert.equal(board.statusCode,200);assert.equal(board.body.trips[0].appointment_time,'09:30:00');assert.deepEqual(board.body.trips.map(t=>t.reference),['A1','CANCEL','PENDING']);
  assert.equal((await call('trips','manager',{date:'2026-02-30'})).statusCode,400);
  assert.equal((await call('trips','manager',{date:'2026-01-01',page:'-1'})).statusCode,400);
  assert.deepEqual((await call('trips','manager',{date:'2026-01-04'})).body.trips.map(t=>t.reference),['A1']);
  assert.deepEqual((await call('locations')).body.locations.map(l=>[l.address,l.visits]),[['Hospital   Road',2],['Clinic Lane',1]]);
  await db.exec("UPDATE bookings SET status='COMPLETED' WHERE reference='PENDING'");assert.equal((await call('locations')).body.locations.some(l=>l.address==='Future Clinic'),true);
  const message={message:'Please use the accessible entrance.',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  assert.equal((await call('communications/B1','manager',{},message)).statusCode,404);
  assert.equal((await call('communications/MOCK','manager',{},message)).statusCode,404);
  assert.equal((await call('communications/A1','manager',{},message)).statusCode,201);assert.equal((await call('communications/A1','manager',{},message)).statusCode,201);
  assert.equal((await call('communications/A1','manager',{}, {...message,message:'Changed body'})).statusCode,409);
  assert.equal((await call('communications/A1','manager',{}, {message:' ',requestId:message.requestId})).statusCode,400);
  assert.equal((await call('communications/A1','manager',{}, {message:'a'.repeat(2001),requestId:message.requestId})).statusCode,400);
  assert.equal((await call('communications/A1','manager',{}, {message:'Okay',requestId:'------------------------------------'})).statusCode,400);
  const conversation=await call('communications/A1','dispatch',{facility:'FC-A'});assert.equal(conversation.body.messages.length,1);assert.equal(conversation.body.activity[0].note,undefined);assert.equal(JSON.stringify(conversation).includes('Internal confidential'),false);
  assert.equal((await call('communications/A1','dispatch',{facility:'FC-B'})).statusCode,404);
  await call('communications/A1','dispatch',{facility:'FC-A'},{message:'Confirmed, entrance noted.',requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
  assert.equal((await call('trips','manager',{date:'2026-01-01'})).body.trips[0].unread,1);
  const inbox=await call('communications/A1');await call('read/A1','manager',{}, {through:inbox.body.through});assert.equal((await call('trips','manager',{date:'2026-01-01'})).body.trips[0].unread,0);
  assert.equal((await call('read/A1','manager',{}, {through:'2999-01-01'})).statusCode,400);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM facility_portal_messages')).rows[0].count,2);
 }finally{await db.close();}
});

test('trips endpoint serves date ranges with range-wide summary counts and unchanged facility scope',async()=>{
 const db=new PGlite(),manager='11111111-1111-4111-8111-111111111111';
 try{
  await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
   CREATE TABLE users(id uuid PRIMARY KEY); INSERT INTO users VALUES('${manager}');
   CREATE TABLE facilities(facility_code text PRIMARY KEY,name text,address text,active boolean);
   INSERT INTO facilities VALUES('FC-A','Care A','100 Facility Lane',true),('FC-B','Care B','200 Facility Lane',true);
   CREATE TABLE bookings(reference text PRIMARY KEY,facility_id text,booking_source text,name text,service text,pickup text,destination text,trip_date date,trip_time time,notes text,status text,payment_status text,driver_name text,vehicle_unit text,trip_type text,return_trip_date date,return_trip_time time,updated_at timestamptz);`);
  await db.exec(fs.readFileSync('database/migrations/084.001_patient_schedule_duplicates.sql','utf8').split('CREATE OR REPLACE FUNCTION booking_appointment_time')[1].split('CREATE OR REPLACE FUNCTION booking_referral_key')[0].replace(/^/, 'CREATE OR REPLACE FUNCTION booking_appointment_time'));
  await db.exec(fs.readFileSync('database/migrations/094.001_facility_portal.sql','utf8'));
  const bulk=Array.from({length:105},(_,i)=>`('R${String(i).padStart(3,'0')}','FC-A','CUSTOMER','Bulk Passenger','Facility Lane','Clinic Lane','2026-03-10','08:00','REQUESTED','UNPAID')`).join(',');
  await db.exec(`INSERT INTO bookings(reference,facility_id,booking_source,name,pickup,destination,trip_date,trip_time,status,payment_status) VALUES ${bulk},
   ('DONE1','FC-A','CUSTOMER','Done Passenger','Facility Lane','Clinic Lane','2026-03-05','09:00','COMPLETED','PAID_IN_FULL'),
   ('ACT1','FC-A','CUSTOMER','Active Passenger','Facility Lane','Clinic Lane','2026-03-20','09:00','EN_ROUTE','UNPAID'),
   ('CAN1','FC-A','CUSTOMER','Cancelled Passenger','Facility Lane','Clinic Lane','2026-03-31','09:00','CANCELLED','UNPAID'),
   ('RET1','FC-A','CUSTOMER','Return Passenger','Facility Lane','Clinic Lane','2026-02-27','09:00','COMPLETED','PAID_IN_FULL'),
   ('OUT1','FC-A','CUSTOMER','Outside Passenger','Facility Lane','Clinic Lane','2026-04-01','09:00','COMPLETED','PAID_IN_FULL'),
   ('OTHER','FC-B','CUSTOMER','Other Facility Passenger','Other Lane','Clinic Lane','2026-03-10','09:00','COMPLETED','PAID_IN_FULL');
   UPDATE bookings SET return_trip_date='2026-03-01',return_trip_time='12:00',trip_type='ROUND_TRIP' WHERE reference='RET1';`);
  const users={manager:{id:manager,role:'FACILITY',scope_id:'FC-A',display_name:'Manager A'}};
  const handler=createHandler({query:(...args)=>db.query(...args),requireUser:async token=>{if(!users[token])throw Object.assign(Error('Authentication required'),{statusCode:401});return users[token];},bearer:e=>e.headers.authorization,json:(statusCode,body)=>({statusCode,body}),parseBody:e=>JSON.parse(e.body)});
  const call=async(params={})=>{try{return await handler({headers:{authorization:'manager'},queryStringParameters:params,body:'{}'},['facility-portal','trips'],'GET');}catch(error){return {statusCode:error.statusCode||500,body:{error:error.message}};}};
  // March 2026 range: 105 bulk + DONE1 + ACT1 + CAN1 + RET1 (return leg lands Mar 1). OUT1 (Apr 1) and FC-B's OTHER stay out.
  const page0=await call({from:'2026-03-01',to:'2026-03-31',page:'0'});
  assert.equal(page0.statusCode,200);assert.equal(page0.body.from,'2026-03-01');assert.equal(page0.body.to,'2026-03-31');
  assert.equal(page0.body.trips.length,100);assert.equal(page0.body.hasMore,true);
  assert.deepEqual(page0.body.summary,{total:109,pending:105,active:1,complete:2});
  const dates=page0.body.trips.map(t=>String(t.trip_date).slice(0,10));
  assert.deepEqual(dates,[...dates].sort(),'page 0 must arrive in date order across the range');
  const page1=await call({from:'2026-03-01',to:'2026-03-31',page:'1'});
  assert.equal(page1.body.trips.length,9);assert.equal(page1.body.hasMore,false);
  const allRefs=new Set([...page0.body.trips,...page1.body.trips].map(t=>t.reference));
  assert.equal(allRefs.size,109);assert.ok(allRefs.has('RET1'));assert.ok(!allRefs.has('OUT1'));assert.ok(!allRefs.has('OTHER'));
  // Summary counts describe the whole range even when only one page is loaded.
  assert.equal(page1.body.summary.total,109);
  // Legacy single-day requests still work and scope identically.
  const legacy=await call({date:'2026-03-10'});
  assert.equal(legacy.statusCode,200);assert.equal(legacy.body.trips.length,100);assert.equal(legacy.body.summary.total,105);
  // Invalid ranges are rejected.
  assert.equal((await call({from:'2026-03-31',to:'2026-03-01'})).statusCode,400);
  assert.equal((await call({from:'2026-02-30',to:'2026-03-01'})).statusCode,400);
  assert.equal((await call({from:'2026-03-01'})).statusCode,400);
  assert.equal((await call({from:'2026-01-01',to:'2027-12-31'})).statusCode,400);
  // Facility scoping is unchanged: naming another facility is forbidden.
  assert.equal((await call({from:'2026-03-01',to:'2026-03-31',facility:'FC-B'})).statusCode,403);
 }finally{await db.close();}
});
