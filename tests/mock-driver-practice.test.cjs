const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite'),Practice=require('../netlify/functions/_shared/mock-driver-practice.cjs');
test('assigned administrator driver can repeat a complete mock workflow without changing live transport or payment fields',async()=>{
 const db=new PGlite(),audits=[],id='11111111-1111-4111-8111-111111111111';
 let user={id,user_code:'N5289',role:'DRIVER',available_roles:['DRIVER','ADMIN'],active:true};
 try{
  await db.exec(`CREATE TABLE bookings(reference text PRIMARY KEY,driver_user_id uuid,status text,booking_source text,payment_status text,estimated_fare numeric,trip_date date,reminder_sent boolean,timing_plan jsonb,updated_at timestamptz);
   INSERT INTO bookings VALUES('MOCK-ONE','${id}','MOCK','MOCK','MOCK',123.45,'2026-12-08',true,'{"unrelated":"preserve"}',now()),('REAL-ONE','${id}','ASSIGNED','CUSTOMER','DUE',200,'2026-10-26',false,'{}',now()),('MOCK-OTHER','22222222-2222-4222-8222-222222222222','MOCK','MOCK','MOCK',100,'2026-10-26',true,'{}',now());`);
  const handler=Practice.createHandler({getPool:()=>({connect:async()=>({query:(...args)=>db.query(...args),release(){}})}),requireUser:async(token,roles)=>{assert.deepEqual(roles,['DRIVER','ADMIN']);return user;},audit:async(...args)=>audits.push(args),json:(statusCode,body)=>({statusCode,body}),parseBody:e=>JSON.parse(e.body),bearer:()=>''});
  const request=(status,expectedStatus='MOCK',ref='MOCK-ONE')=>handler({body:JSON.stringify({status,expectedStatus})},['driver','mock-trips',ref,'workflow'],'POST');
  assert.equal((await request('EN_ROUTE')).statusCode,409,'must accept before starting');
  assert.equal((await request('ACCEPTED','MOCK','REAL-ONE')).statusCode,403);
  assert.equal((await request('ACCEPTED','MOCK','MOCK-OTHER')).statusCode,403);
  let previous='MOCK';
  for(const status of Practice.STEPS.slice(1)){const result=await request(status,previous);assert.equal(result.statusCode,200);assert.equal(result.body.workflow.status,status);assert.equal(result.body.mockOnly,true);previous=status;}
  let row=(await db.query("SELECT * FROM bookings WHERE reference='MOCK-ONE'")).rows[0];
  assert.equal(row.status,'MOCK');assert.equal(row.booking_source,'MOCK');assert.equal(row.payment_status,'MOCK');assert.equal(row.reminder_sent,true);assert.equal(Number(row.estimated_fare),123.45);assert.equal(row.trip_date.toISOString().slice(0,10),'2026-12-08');assert.equal(row.timing_plan.unrelated,'preserve');assert.ok(row.timing_plan.mockDriverWorkflow.patientReadyAt);
  assert.equal((await request('ARRIVED_PICKUP','MOCK')).statusCode,409,'stale browser cannot overwrite progress');
  const count=audits.length;assert.equal((await request('COMPLETED','DELIVERED')).statusCode,200);assert.equal(audits.length,count,'duplicate response is idempotent');
  const reset=await request('RESET','COMPLETED');assert.equal(reset.body.workflow.status,'MOCK');assert.equal(reset.body.workflow.patientReadyAt,undefined);
  assert.equal((await request('ACCEPTED')).statusCode,200);
  for(const [status,expected]of [['EN_ROUTE','ACCEPTED'],['ARRIVED_PICKUP','EN_ROUTE'],['NO_SHOW','ARRIVED_PICKUP']])assert.equal((await request(status,expected)).statusCode,200);
  assert.equal((await request('RESET','NO_SHOW')).statusCode,200);
  user={...user,user_code:'N9000'};assert.equal((await request('ACCEPTED')).statusCode,403);
  user={...user,user_code:'N5289',available_roles:['DRIVER']};assert.equal((await request('ACCEPTED')).statusCode,403);
 }finally{await db.close();}
});
