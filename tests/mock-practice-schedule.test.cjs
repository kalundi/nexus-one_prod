const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {createUserManager,operatingClock}=require('../netlify/functions/_shared/user-manager.cjs');

const TEST_ADMIN='11111111-1111-4111-8111-111111111111';
const OTHER_DRIVER='22222222-2222-4222-8222-222222222222';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE employees(id uuid PRIMARY KEY,user_id uuid,role text,active boolean);
  CREATE TABLE employee_shifts(employee_id uuid,assignment_role text,active boolean,weekday_iso int,start_time time,end_time time,effective_start_date date,effective_end_date date);
  CREATE TABLE bookings(reference text PRIMARY KEY,driver_user_id uuid,driver_name text,driver_scope_id text,booking_source text,status text);`);
 const actor={id:TEST_ADMIN,user_code:'N5289',role:'ADMIN',active:true,available_roles:['ADMIN','DRIVER']};
 const queries=[];
 const handle=createUserManager({query:async(sql,args)=>{queries.push(sql);return db.query(sql,args);},getPool(){throw Error('Schedule lookup must not mutate data.');},requireUser:async(_token,roles)=>{
  if(!roles.includes(actor.role))throw Object.assign(Error('Forbidden'),{statusCode:403});
  return actor;
 },audit(){throw Error('Schedule lookup must not audit a write.');}});
 const schedule=async()=>{
  const response=await handle({headers:{authorization:'Bearer fixture'}},['driver','schedule'],'GET');
  assert.equal(response.statusCode,200);return JSON.parse(response.body);
 };
 return {db,actor,queries,schedule,close:()=>db.close()};
}

test('N5289 gets mock troubleshooting availability only with an assigned mock, without changing real coverage',async()=>{
 const f=await fixture();try{
  let response=await f.schedule();assert.equal(response.available,false);assert.equal(response.mockPracticeAvailable,false);assert.equal(response.shift,null);
  await f.db.query("INSERT INTO bookings VALUES('OTHER-MOCK',$1,'Test Administrator','N5289','MOCK','MOCK'),('REAL-ASSIGNED',$2,NULL,NULL,'FACILITY','ASSIGNED')",[OTHER_DRIVER,TEST_ADMIN]);
  response=await f.schedule();assert.equal(response.mockPracticeAvailable,false,'Names and scopes do not grant access to another driver’s mock.');
  await f.db.query("INSERT INTO bookings VALUES('ASSIGNED-MOCK',$1,NULL,NULL,'mock','ASSIGNED')",[TEST_ADMIN]);
  response=await f.schedule();assert.equal(response.mockPracticeAvailable,true);assert.equal(response.mockPracticeLabel,'Mock troubleshooting available anytime');assert.equal(response.available,false);assert.equal(response.shift,null);
  await f.db.query("UPDATE bookings SET booking_source='DISPATCH',status='mock' WHERE reference='ASSIGNED-MOCK'");
  assert.equal((await f.schedule()).mockPracticeAvailable,true,'A MOCK status also identifies an assigned test trip.');
  const clock=operatingClock();
  await f.db.query("INSERT INTO employees VALUES($1,$1,'DRIVER',true)",[TEST_ADMIN]);
  await f.db.query("INSERT INTO employee_shifts VALUES($1,'DRIVER',true,$2,'00:00','24:00',$3,NULL)",[TEST_ADMIN,clock.weekday,clock.date]);
  response=await f.schedule();assert.equal(response.available,true);assert.equal(response.mockPracticeAvailable,true);
  await f.db.query('UPDATE employees SET active=false');
  response=await f.schedule();assert.equal(response.available,false,'Mock eligibility does not reactivate the workforce profile.');assert.equal(response.mockPracticeAvailable,true);
  assert.ok(f.queries.every(sql=>/^SELECT\b/.test(sql.trim())),'The endpoint only reads coverage and assignment eligibility.');
 }finally{await f.close();}
});

test('mock troubleshooting remains limited to N5289 with server-verified administrator access',async()=>{
 const f=await fixture();try{
  await f.db.query("INSERT INTO bookings VALUES('ASSIGNED-MOCK',$1,NULL,NULL,'MOCK','MOCK')",[TEST_ADMIN]);
  Object.assign(f.actor,{role:'DRIVER',available_roles:['ADMIN','DRIVER']});
  assert.equal((await f.schedule()).mockPracticeAvailable,true,'The administrator can use its approved Driver experience.');
  f.actor.available_roles=['DRIVER'];
  assert.equal((await f.schedule()).mockPracticeAvailable,false,'The permanent user code alone does not grant administrator authority.');
  Object.assign(f.actor,{role:'ADMIN',available_roles:['ADMIN','DRIVER'],user_code:'N9999'});
  assert.equal((await f.schedule()).mockPracticeAvailable,false,'Other administrators do not inherit this test-account exception.');
  Object.assign(f.actor,{user_code:'N5289',active:false});
  assert.equal((await f.schedule()).mockPracticeAvailable,false,'An inactive test account is ineligible.');
 }finally{await f.close();}
});
