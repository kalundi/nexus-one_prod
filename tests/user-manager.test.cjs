const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {createUserManager,parseSchedule,operatingClock}=require('../netlify/functions/_shared/user-manager.cjs');
const {buildDriverAvailabilitySql}=require('../netlify/functions/_shared/employee-driver-lookup.cjs');
const ADMIN='11111111-1111-4111-8111-111111111111',DRIVER='22222222-2222-4222-8222-222222222222';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,role text,access_title text,scope_id text,phone text,active boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE user_role_requests(user_id uuid REFERENCES users(id),role text,status text,scope_id text,reviewed_at timestamptz);
 CREATE TABLE sessions(user_id uuid,revoked_at timestamptz);
 CREATE TABLE facilities(facility_code text PRIMARY KEY,name text,address text,active boolean);
 INSERT INTO facilities VALUES('FC-A','Care Facility A','100 Facility Lane',true),('FC-B','Care Facility B','200 Facility Lane',true),('FC-X','Closed facility','300 Facility Lane',false);
 CREATE TABLE bookings(reference text PRIMARY KEY,driver_name text,driver_scope_id text,trip_date date,email text,phone text,name text);
 ${fs.readFileSync('database/migrations/048.001_workforce_employee_tables.sql','utf8').split('CREATE TABLE IF NOT EXISTS trip_work_assignments')[0]}`);
 await db.query("INSERT INTO users(id,email,display_name,role,scope_id,phone) VALUES($1,'admin@test.test','Test Admin','ADMIN',NULL,'+12405550101'),($2,'driver@test.test','Test Driver','DRIVER','legacy-driver','+12405550102')",[ADMIN,DRIVER]);
 await db.query("INSERT INTO employees(user_id,employee_code,role,display_name,email,phone) VALUES($1,'LEGACY-001','DRIVER','Test Driver','driver@test.test','+12405550102')",[DRIVER]);
 await db.query('UPDATE employees SET user_id=NULL');
 await db.query("INSERT INTO bookings(reference,driver_name,driver_scope_id,trip_date) VALUES('LEGACY-TRIP','Test Driver','legacy-driver','2026-10-14')");
 await db.exec(fs.readFileSync('database/migrations/086.001_user_identifiers.sql','utf8'));
 const audits=[],actor=(await db.query('SELECT * FROM users WHERE id=$1',[ADMIN])).rows[0];
 const handle=createUserManager({query:db.query.bind(db),getPool:()=>({connect:async()=>({query:db.query.bind(db),release(){}})}),requireUser:async(_token,roles)=>{if(roles?.length&&!roles.includes(actor.role))throw Object.assign(new Error('Forbidden'),{statusCode:403});return actor;},audit:async(...args)=>audits.push(args)});
 const call=async(path,method='GET',body,queryStringParameters)=>{const result=await handle({headers:{authorization:'Bearer test'},body:JSON.stringify(body||{}),queryStringParameters},path.split('/'),method);return result?{status:result.statusCode,...JSON.parse(result.body)}:null;};
 return {db,call,audits,actor,close:()=>db.close()};
}
test('facility manager grants require an active assigned facility and edits synchronize approved scopes',async()=>{
 const f=await fixture();try{
  for(const scopeId of ['', 'UNKNOWN','FC-X'])await assert.rejects(f.call(`admin/users/${DRIVER}`,'PATCH',{role:'FACILITY',scopeId}),/Select.*facility/);
  assert.equal((await f.db.query('SELECT role FROM users WHERE id=$1',[DRIVER])).rows[0].role,'DRIVER');
  const granted=await f.call(`admin/users/${DRIVER}`,'PATCH',{role:'FACILITY',scopeId:'FC-A'});assert.equal(granted.user.scopeId,'FC-A');
  await f.db.query("INSERT INTO user_role_requests(user_id,role,status,scope_id) VALUES($1,'FACILITY','APPROVED','FC-A')",[DRIVER]);
  await f.call(`admin/users/${DRIVER}`,'PATCH',{scopeId:'FC-B'});assert.equal((await f.db.query("SELECT scope_id FROM user_role_requests WHERE user_id=$1 AND role='FACILITY'",[DRIVER])).rows[0].scope_id,'FC-B');
  await f.call(`admin/users/${DRIVER}`,'PATCH',{active:false});assert.equal((await f.db.query('SELECT active FROM users WHERE id=$1',[DRIVER])).rows[0].active,false);
 }finally{await f.close();}
});
test('random memorable IDs backfill accounts, stay unique and survive role/status/profile edits',async()=>{
 const f=await fixture();try{
  const before=(await f.call('admin/users')).users;assert.equal(before.length,2);before.forEach(u=>assert.match(u.userCode,/^N\d{4}$/));
  for(let i=0;i<100;i++)await f.db.query("INSERT INTO users(email,display_name,role) VALUES($1,$2,'PATIENT')",[`test${i}@test.test`,`Test ${i}`]);
  const ids=(await f.call('admin/users')).users.map(u=>u.userCode);assert.equal(new Set(ids).size,ids.length);
  const disposable=ids.find(id=>!before.some(u=>u.userCode===id));await f.db.query('DELETE FROM users WHERE user_code=$1',[disposable]);assert.equal((await f.db.query('SELECT user_code FROM user_identifiers WHERE user_code=$1',[disposable])).rows[0].user_code,disposable,'An issued ID remains reserved after deletion');
  await assert.rejects(f.db.query("INSERT INTO users(user_code,email,display_name,role) VALUES($1,'reused@test.test','Another person','PATIENT')",[disposable]),/already issued/);
  const driver=before.find(u=>u.id===DRIVER);
  await f.call(`admin/users/${driver.userCode}`,'PATCH',{name:'Renamed Driver',functions:['DRIVING','PATIENT_CARE']});
  await f.call(`admin/users/${driver.userCode}`,'PATCH',{active:false});
  await f.call(`admin/users/${driver.userCode}`,'PATCH',{active:true});
  const updated=(await f.call('admin/users')).users.find(u=>u.id===DRIVER);assert.equal(updated.userCode,driver.userCode);assert.equal(updated.name,'Renamed Driver');assert.deepEqual(updated.functions,['DRIVING','PATIENT_CARE']);
  const booking=(await f.db.query("SELECT driver_user_id FROM bookings WHERE reference='LEGACY-TRIP'")).rows[0];assert.equal(booking.driver_user_id,DRIVER,'Existing assignments retain the canonical account key after a rename');
  await assert.rejects(f.db.query("UPDATE users SET user_code='N99999' WHERE id=$1",[DRIVER]),/cannot be changed/);
  assert.ok(f.audits.some(a=>a[3].userCode===driver.userCode));
 }finally{await f.close();}
});
test('EMS account edits retain the title while applying the matching existing permission role',async()=>{
 const f=await fixture();try{const catalog=require('../nexus-ems-roles.js');
  for(const title of Object.keys(catalog)){
   const result=await f.call(`admin/users/${DRIVER}`,'PATCH',{role:title});assert.equal(result.user.role,title);assert.equal(result.user.accessRole,catalog.access[title].role);
   const row=(await f.db.query('SELECT role,access_title FROM users WHERE id=$1',[DRIVER])).rows[0];assert.equal(row.access_title,title);assert.equal(row.role,catalog.access[title].role);
  }
 }finally{await f.close();}
});
test('future schedule revisions retain current coverage, replace removed weekdays and take effect on the correct date',async()=>{
 const f=await fixture();try{
  const original={driverEmail:'driver@test.test',startTime:'06:00',endTime:'15:00',effectiveStartDate:'2026-10-01',weekdays:[1,2,3,4,5]};
  const saved=await f.call('admin/driver-schedule','POST',original);assert.equal(saved.status,200);
  await f.call('admin/driver-schedule','POST',{...original,startTime:'10:00',endTime:'16:00',weekdays:[6,7]});
  assert.equal((await f.call('admin/driver-schedule','POST',{...original,shiftIds:saved.schedule.created.map(s=>s.id),startTime:'08:00',endTime:'18:00',effectiveStartDate:'2026-10-19',weekdays:[1,2]})).status,200);
  const available=async(date,time,weekday)=>Number((await f.db.query(buildDriverAvailabilitySql(),[weekday,time,date])).rows[0].driver_count);
  assert.equal(await available('2026-10-12','07:00',1),1,'Old schedule still covers the week before the change');
  assert.equal(await available('2026-10-14','10:00',3),1);
  assert.equal(await available('2026-10-19','07:00',1),0);
  assert.equal(await available('2026-10-19','09:00',1),1);
  assert.equal(await available('2026-10-21','10:00',3),0,'Removed Wednesday no longer covers the new week');
  assert.equal(await available('2026-10-19','18:00',1),0,'End boundary is exclusive');
  assert.equal(await available('2026-10-24','11:00',6),1,'Editing weekdays preserves the separate weekend schedule');
 }finally{await f.close();}
});
test('weekday, weekend and split shifts coexist with independent availability and overlap protection',async()=>{
 const f=await fixture();try{
  const base={driverId:DRIVER,effectiveStartDate:'2026-10-01'};
  const weekday=await f.call('admin/driver-schedule','POST',{...base,startTime:'06:00',endTime:'15:00',weekdays:[1,2,3,4,5]});
  const weekend=await f.call('admin/driver-schedule','POST',{...base,startTime:'10:00',endTime:'16:00',weekdays:[6,7]});
  assert.equal(weekday.status,200);assert.equal(weekend.status,200);
  const rows=(await f.call('admin/driver-schedule','GET',undefined,{driverId:DRIVER})).schedules;
  assert.equal(rows.length,7);assert.ok(rows.every(s=>s.active));
  const available=async(date,time,day)=>Number((await f.db.query(buildDriverAvailabilitySql(),[day,time,date])).rows[0].driver_count);
  assert.equal(await available('2026-10-12','06:00',1),1);assert.equal(await available('2026-10-16','14:59',5),1);assert.equal(await available('2026-10-16','15:00',5),0);
  assert.equal(await available('2026-10-17','09:59',6),0);assert.equal(await available('2026-10-17','10:00',6),1);assert.equal(await available('2026-10-18','15:59',7),1);assert.equal(await available('2026-10-18','16:00',7),0);
  const shiftIds=weekend.schedule.created.map(s=>s.id);
  await f.call('admin/driver-schedule','PATCH',{shiftIds,active:false});
  assert.equal(await available('2026-10-17','11:00',6),0);assert.equal(await available('2026-10-12','11:00',1),1,'Weekend deactivation retains weekday availability');
  await f.call('admin/driver-schedule','PATCH',{shiftIds,active:true});assert.equal(await available('2026-10-17','11:00',6),1);
  await assert.rejects(f.call('admin/driver-schedule','POST',{...base,startTime:'14:00',endTime:'18:00',weekdays:[5,6]}),/overlaps/);
  await assert.rejects(f.call('admin/driver-schedule','POST',{...base,startTime:'10:00',endTime:'16:00',weekdays:[6,7]}),/overlaps/);
  assert.equal((await f.call('admin/driver-schedule')).schedules.length,7,'Rejected additions leave both schedules intact');
  const split=await f.call('admin/driver-schedule','POST',{...base,startTime:'15:00',endTime:'18:00',weekdays:[1]});assert.equal(split.status,200);
  assert.equal(await available('2026-10-12','15:00',1),1,'Adjacent shifts are allowed without double-counting the driver');
  assert.equal(await available('2026-10-12','18:00',1),0);
 }finally{await f.close();}
});
test('patient booking ownership survives account edits and links trips when access is created later',async()=>{
 const f=await fixture();try{
  await f.db.query("INSERT INTO bookings(reference,email,phone,name,trip_date) VALUES('PATIENT-TRIP','later@test.test','+12405550103','Test Patient','2026-10-14')");
  assert.equal((await f.db.query("SELECT patient_user_id FROM bookings WHERE reference='PATIENT-TRIP'")).rows[0].patient_user_id,null);
  const patient=(await f.db.query("INSERT INTO users(email,phone,display_name,role) VALUES('later@test.test','+12405550103','Test Patient','PATIENT') RETURNING *")).rows[0];
  assert.equal((await f.db.query("SELECT patient_user_id FROM bookings WHERE reference='PATIENT-TRIP'")).rows[0].patient_user_id,patient.id);
  await f.call(`admin/users/${patient.user_code}`,'PATCH',{name:'Updated Patient',phone:'+12405550104'});
  assert.equal((await f.db.query("SELECT patient_user_id FROM bookings WHERE reference='PATIENT-TRIP'")).rows[0].patient_user_id,patient.id);
  await f.db.query("INSERT INTO bookings(reference,email,phone,name,trip_date) VALUES('PATIENT-NEW','later@test.test','+12405550104','Updated Patient','2026-10-15')");
  assert.equal((await f.db.query("SELECT patient_user_id FROM bookings WHERE reference='PATIENT-NEW'")).rows[0].patient_user_id,patient.id);
 }finally{await f.close();}
});
test('deactivation/reactivation controls coverage and account deactivation revokes sessions without erasing shifts',async()=>{
 const f=await fixture();try{
  const date=operatingClock().date,weekday=operatingClock().weekday;
  const saved=await f.call('admin/driver-schedule','POST',{driverId:DRIVER,startTime:'00:00',endTime:'23:59',effectiveStartDate:date,weekdays:[weekday]});
  const shiftIds=saved.schedule.created.map(r=>r.id),available=async()=>Number((await f.db.query(buildDriverAvailabilitySql(),[weekday,'12:00',date])).rows[0].driver_count);
  assert.equal(await available(),1);
  await f.call('admin/driver-schedule','PATCH',{shiftIds,active:false});assert.equal(await available(),0);
  await f.call('admin/driver-schedule','PATCH',{shiftIds,active:true});assert.equal(await available(),1);
  await f.db.query('INSERT INTO sessions(user_id) VALUES($1)',[DRIVER]);
  await f.call(`admin/users/${DRIVER}`,'PATCH',{active:false});assert.equal(await available(),0);assert.ok((await f.db.query('SELECT revoked_at FROM sessions WHERE user_id=$1',[DRIVER])).rows[0].revoked_at);
  await f.call(`admin/users/${DRIVER}`,'PATCH',{active:true});assert.equal(await available(),1);
  await f.db.query('UPDATE employees SET active=false WHERE user_id=$1',[DRIVER]);assert.equal(await available(),0);
  await f.call(`admin/users/${DRIVER}`,'PATCH',{active:true});assert.equal(await available(),1,'Account activation also restores the workforce profile');
 }finally{await f.close();}
});
test('schedule edits are atomic and reject overlap, invalid dates, unknown shifts and self-deactivation',async()=>{
 const f=await fixture();try{
  const original={driverId:DRIVER,startTime:'06:00',endTime:'12:00',effectiveStartDate:'2026-10-12',weekdays:[1,2]};
  const saved=await f.call('admin/driver-schedule','POST',original),ids=saved.schedule.created.map(s=>s.id);
  // Edit just Monday; another overlapping Tuesday must cause the entire edit to roll back.
  await assert.rejects(f.call('admin/driver-schedule','POST',{...original,startTime:'10:00',endTime:'14:00',weekdays:[1,2],shiftIds:[ids[0]]}),/overlaps/);
  assert.equal(Number((await f.db.query('SELECT count(*) AS n FROM employee_shifts WHERE active=true')).rows[0].n),2);
  await assert.rejects(f.call('admin/driver-schedule','POST',{...original,shiftIds:['99999999-9999-4999-8999-999999999999']}),/changed/);
  await assert.rejects(f.call(`admin/users/${ADMIN}`,'PATCH',{active:false}),/another administrator/);
  assert.equal((await f.call(`admin/users/${DRIVER}`,'PATCH',{functions:['MADE_UP']})).status,400);
  await f.db.query("INSERT INTO user_role_requests(user_id,role,status,scope_id) VALUES($1,'DRIVER','APPROVED','legacy-driver')",[DRIVER]);
  await f.call(`admin/users/${DRIVER}`,'PATCH',{role:'PATIENT'});
  assert.equal(Number((await f.db.query(buildDriverAvailabilitySql(),[1,'10:00','2026-10-12'])).rows[0].driver_count),0,'A removed driver role stops availability');
 }finally{await f.close();}
});
test('driver app coverage agrees with shared availability and rejects non-driver access',async()=>{
 const f=await fixture();try{
  const clock=operatingClock(),saved=await f.call('admin/driver-schedule','POST',{driverId:DRIVER,startTime:'00:00',endTime:'23:59',effectiveStartDate:clock.date,weekdays:[clock.weekday]});
  Object.assign(f.actor,(await f.db.query('SELECT * FROM users WHERE id=$1',[DRIVER])).rows[0]);
  const response=await f.call('driver/schedule');assert.equal(response.available,clock.time<'23:59');assert.equal(response.userCode,f.actor.user_code);
  Object.assign(f.actor,{role:'ADMIN',id:ADMIN});await f.call('admin/driver-schedule','PATCH',{shiftIds:saved.schedule.created.map(r=>r.id),active:false});
  Object.assign(f.actor,{role:'DRIVER',id:DRIVER});assert.equal((await f.call('driver/schedule')).available,false);
  f.actor.role='PATIENT';await assert.rejects(f.call('driver/schedule'),/Forbidden/);
 }finally{await f.close();}
});
test('validation and Eastern operating clock handle midnight and daylight saving independently of server timezone',()=>{
 assert.deepEqual(operatingClock(new Date('2026-10-12T03:30:00Z')),{date:'2026-10-11',time:'23:30',weekday:7});
 assert.deepEqual(operatingClock(new Date('2026-12-01T05:00:00Z')),{date:'2026-12-01',time:'00:00',weekday:2});
 for(const overrides of [{startTime:'25:00'},{endTime:'05:00'},{effectiveStartDate:'2026-02-30'},{effectiveEndDate:'2026-09-01'},{weekdays:[9]},{weekdays:[]}])assert.throws(()=>parseSchedule({startTime:'06:00',endTime:'15:00',effectiveStartDate:'2026-10-12',weekdays:[1],...overrides}));
});
