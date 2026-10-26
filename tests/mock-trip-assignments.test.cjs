const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),Mock=require('../netlify/functions/_shared/mock-trip-assignments.cjs');
test('bulk mock assignment binds the verified account, preserves mock data and rejects mixed live trips atomically',async()=>{
 const db=new PGlite(),audits=[];
 try{
  await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_code text,display_name text,email text,role text,active boolean,scope_id text);
   CREATE TABLE user_role_requests(user_id uuid,role text,status text);
   CREATE TABLE bookings(reference text PRIMARY KEY,booking_source text,status text,driver_name text,driver_scope_id text,driver_user_id uuid,duplicate_of text,estimated_fare numeric,trip_date date,reminder_sent boolean,payment_status text,updated_at timestamptz DEFAULT now());
   INSERT INTO users(user_code,display_name,email,role,active) VALUES('N5289','Administrator','admin@fixture.test','ADMIN',true),('N9000','Administrator','other@fixture.test','DRIVER',true),('N9999','Patient','patient@fixture.test','PATIENT',true);
   INSERT INTO bookings(reference,booking_source,status,estimated_fare,trip_date,reminder_sent,payment_status) VALUES('MOCK-ONE','MOCK','MOCK',100,'2026-10-26',true,'MOCK'),('MOCK-TWO','MOCK','mock',200,'2026-12-08',true,'MOCK'),('REAL-ONE','CUSTOMER','SCHEDULED',300,'2026-10-26',false,'DUE');`);
  const handler=Mock.createHandler({getPool:()=>({connect:async()=>({query:(...args)=>db.query(...args),release(){}})}),requireUser:async(token,roles)=>{assert.deepEqual(roles,['ADMIN','DISPATCHER']);assert.equal(token,'admin-token');return {id:'actor',role:'ADMIN'};},audit:async(...args)=>audits.push(args),json:(statusCode,body)=>({statusCode,body}),parseBody:e=>JSON.parse(e.body),bearer:e=>e.headers.authorization});
  const request=body=>handler({headers:{authorization:'admin-token'},body:JSON.stringify(body)},['admin','mock-trip-assignments'],'POST');
  const driver=(await db.query("SELECT * FROM users WHERE user_code='N5289'")).rows[0];
  const result=await request({driverUserCode:'N5289',references:['MOCK-ONE','MOCK-TWO']});assert.equal(result.statusCode,200);assert.equal(result.body.assigned,2);assert.equal(result.body.driver.id,driver.id);assert.equal(audits.length,1);
  const rows=(await db.query("SELECT * FROM bookings WHERE reference LIKE 'MOCK-%' ORDER BY reference")).rows;
  assert.ok(rows.every(row=>row.driver_user_id===driver.id&&row.driver_name==='Administrator'&&row.reminder_sent&&row.payment_status==='MOCK'));
  assert.deepEqual(rows.map(row=>[row.status,Number(row.estimated_fare),row.trip_date.toISOString().slice(0,10)]),[['MOCK',100,'2026-10-26'],['mock',200,'2026-12-08']]);
  const sql=fs.readFileSync('netlify/functions/api.cjs','utf8').match(/const sql=`(SELECT \* FROM bookings WHERE \(driver_user_id=\$3::uuid[^`]+ORDER BY trip_date,trip_time,created_at)`/)[1];
  await db.exec('ALTER TABLE bookings ADD COLUMN trip_time text; ALTER TABLE bookings ADD COLUMN created_at timestamptz;');
  assert.equal((await db.query(sql,['Administrator','',driver.id])).rows.length,2);
  const other=(await db.query("SELECT * FROM users WHERE user_code='N9000'")).rows[0];
  assert.equal((await db.query(sql,['Administrator','',other.id])).rows.length,0,'same-name other driver cannot see assigned mocks');
  const conflict=await request({driverUserCode:'N9000',references:['MOCK-ONE','REAL-ONE']});assert.equal(conflict.statusCode,409);
  assert.equal((await db.query("SELECT driver_user_id FROM bookings WHERE reference='MOCK-ONE'")).rows[0].driver_user_id,driver.id);
  assert.equal((await request({driverUserCode:'N9999',references:['MOCK-ONE']})).statusCode,404);
  await db.query("UPDATE users SET active=false WHERE user_code='N9000'");assert.equal((await request({driverUserCode:'N9000',references:['MOCK-ONE']})).statusCode,404);
  assert.equal((await request({driverUserCode:'N5289',references:['MOCK-ONE','MOCK-ONE']})).statusCode,400);
 }finally{await db.close();}
});
