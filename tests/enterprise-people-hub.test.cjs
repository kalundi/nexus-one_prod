const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {createUserManager}=require('../netlify/functions/_shared/user-manager.cjs');
const {createHandler}=require('../netlify/functions/_shared/enterprise-actors.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const ADMIN='11111111-1111-4111-8111-111111111111';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
 CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,display_name text);
 CREATE TABLE facilities(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,facility_code text UNIQUE,name text,address text,active boolean);
 CREATE TABLE patients(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,display_name text,facility_code text REFERENCES facilities(facility_code));
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,role text,access_title text,scope_id text,organization_id uuid REFERENCES organizations(id),phone text,active boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE user_role_requests(user_id uuid REFERENCES users(id),role text,status text,scope_id text,reviewed_at timestamptz);
 CREATE TABLE sessions(user_id uuid,revoked_at timestamptz);
 CREATE TABLE bookings(reference text PRIMARY KEY,driver_name text,driver_scope_id text,trip_date date,email text,phone text,name text);
 INSERT INTO organizations(name) VALUES('Nexus Medical Transit');
 INSERT INTO facilities(facility_code,name,address,active) VALUES('FC-A','Care Facility A','100 Facility Lane',true),('FC-B','Care Facility B','200 Facility Lane',true);
 ${fs.readFileSync('database/migrations/048.001_workforce_employee_tables.sql','utf8').split('CREATE TABLE IF NOT EXISTS trip_work_assignments')[0]}`);
 await db.query("INSERT INTO users(id,email,display_name,role,phone) VALUES($1,'admin@test.test','Hub Admin','ADMIN','+12405550101')",[ADMIN]);
 await db.exec(fs.readFileSync('database/migrations/086.001_user_identifiers.sql','utf8'));
 await db.exec(fs.readFileSync('database/migrations/097.001_enterprise_actors.sql','utf8'));
 await db.exec(fs.readFileSync('database/migrations/100.001_actor_removal_audit.sql','utf8'));
 const actor=(await db.query('SELECT * FROM users WHERE id=$1',[ADMIN])).rows[0];
 const requireUser=async(_token,roles)=>{if(roles?.length&&!roles.includes(actor.role))throw Object.assign(new Error('Forbidden'),{statusCode:403});return actor;};
 const pool=()=>({connect:async()=>({query:db.query.bind(db),release(){}})});
 const users=createUserManager({query:db.query.bind(db),getPool:pool,requireUser,audit:async()=>{}});
 const callUsers=async(p,method='GET',body)=>{const result=await users({headers:{authorization:'Bearer fixture'},body:JSON.stringify(body||{}),queryStringParameters:{}},p.split('/'),method);return result?{status:result.statusCode,...JSON.parse(result.body)}:null;};
 const actors=createHandler({query:(...a)=>db.query(...a),getPool:pool,requireUser:async(_token,roles)=>{if(!roles.includes(actor.role))throw Object.assign(Error('Forbidden'),{statusCode:403});return actor;},bearer:()=>'',json:(status,body)=>({status,...body}),parseBody:e=>e.body});
 const callActors=(suffix='',method='GET',body,params)=>actors({body,queryStringParameters:params},['admin','actors',...suffix.split('/').filter(Boolean)],method);
 return {db,callUsers,callActors,close:()=>db.close()};
}
async function addDriver(f){
 await f.db.query("INSERT INTO users(email,display_name,role,phone) VALUES('crew@test.test','Crew Member','DRIVER','+12405550178')");
 const user=(await f.db.query("SELECT * FROM users WHERE email='crew@test.test'")).rows[0];
 await f.db.query("INSERT INTO employees(user_id,employee_code,role,display_name,email,phone) VALUES($1,'HUB-100','DRIVER','Crew Member','crew@test.test','+12405550178')",[user.id]);
 return user;
}

test('an account links to its directory actor through the USER source record the account section resolves',async()=>{
 const f=await fixture();try{
  const user=await addDriver(f);
  assert.ok(user.actor_id,'the actor sync keeps the account linked to an actor');
  const detail=await f.callActors(user.actor_id);
  assert.ok(detail.records.some(r=>r.source==='USER'&&r.record_id===user.id),'actor detail exposes the linked user id');
  const listed=(await f.callUsers('admin/users')).users.find(u=>u.id===user.id);
  assert.ok(listed);assert.equal(listed.email,'crew@test.test');assert.equal(listed.role,'DRIVER');
  assert.match(listed.userCode,/^N\d{4}$/);
  assert.equal('tempPassword' in listed,false,'the user list never exposes a password');
  assert.equal('password' in listed,false);
  assert.equal('password_hash' in listed,false);
 }finally{await f.close();}
});

test('role change and account-access activate/deactivate round-trip against the test database',async()=>{
 const f=await fixture();try{
  const user=await addDriver(f);
  await f.db.query('INSERT INTO sessions(user_id) VALUES($1)',[user.id]);
  const changed=await f.callUsers(`admin/users/${user.id}`,'PATCH',{role:'BILLING'});
  assert.equal(changed.user.role,'BILLING');assert.equal(changed.user.accessRole,'BILLING');
  const off=await f.callUsers(`admin/users/${user.id}`,'PATCH',{active:false});
  assert.equal(off.user.active,false);
  assert.equal((await f.db.query('SELECT revoked_at IS NOT NULL AS revoked FROM sessions WHERE user_id=$1',[user.id])).rows[0].revoked,true,'deactivating account access revokes live sessions');
  assert.equal((await f.db.query('SELECT active FROM employees WHERE user_id=$1',[user.id])).rows[0].active,false,'the linked employee record follows account access');
  const on=await f.callUsers(`admin/users/${user.id}`,'PATCH',{active:true});
  assert.equal(on.user.active,true);
  const actorRow=(await f.db.query('SELECT active FROM actors WHERE id=$1',[user.actor_id])).rows[0];
  assert.equal(actorRow.active,true,'account-access changes never deactivate the directory actor');
 }finally{await f.close();}
});

test('facility role changes still require an active assigned facility through the shared API',async()=>{
 const f=await fixture();try{
  const user=await addDriver(f);
  await assert.rejects(f.callUsers(`admin/users/${user.id}`,'PATCH',{role:'FACILITY'}),/Select.*facility/);
  const granted=await f.callUsers(`admin/users/${user.id}`,'PATCH',{role:'FACILITY',scopeId:'FC-A'});
  assert.equal(granted.user.role,'FACILITY');assert.equal(granted.user.scopeId,'FC-A');
 }finally{await f.close();}
});

test('non-administrators cannot use the account APIs the hub calls',async()=>{
 const f=await fixture();try{
  const facilityMe={id:'99999999-9999-4999-8999-999999999999',email:'mgr@test.test',role:'FACILITY',user_code:'N9000'};
  const asFacility=createUserManager({query:f.db.query.bind(f.db),getPool:()=>({connect:async()=>({query:f.db.query.bind(f.db),release(){}})}),requireUser:async(_token,roles)=>{if(roles?.length&&!roles.includes(facilityMe.role))throw Object.assign(new Error('Forbidden'),{statusCode:403});return facilityMe;},audit:async()=>{}});
  const call=async(p,method='GET',body)=>asFacility({headers:{authorization:'Bearer fixture'},body:JSON.stringify(body||{}),queryStringParameters:{}},p.split('/'),method);
  await assert.rejects(call('admin/users'),e=>e.statusCode===403);
  await assert.rejects(call(`admin/users/${ADMIN}`,'PATCH',{active:false}),e=>e.statusCode===403);
 }finally{await f.close();}
});

test('the create endpoint keeps the two-hour temporary-password policy',()=>{
 const api=read('netlify/functions/api.cjs');
 assert.ok(api.includes("p[1]==='users'&&!p[2]&&method==='POST'"),'the existing create route is unchanged');
 assert.match(api,/tempPasswordExpiresAt=new Date\(Date\.now\(\)\+2\*60\*60\*1000\)/,'temporary passwords expire two hours after issue');
 assert.ok(api.includes("p[3]==='resend-credentials'&&method==='POST'"),'the resend-credentials route the hub calls exists');
 assert.ok(api.includes("p[1]==='role-requests'"),'the role-request review routes the hub calls exist');
});

test('enterprise page wires the people hub to the existing admin user APIs',()=>{
 const html=read('enterprise.html'),js=read('enterprise.js');
 for(const id of ['hubDirectory','hubRequests','requestCount','addUserBtn','requestsView','requestRows','requestsMsg','userDialog','userForm','userFacilityField','hubResult'])assert.ok(html.includes(`id="${id}"`),`enterprise.html has #${id}`);
 assert.ok(html.includes('do not grant account access'),'the standing note stays on the page');
 for(const route of ["/api/admin/users","/api/admin/role-requests/","/resend-credentials","/demo-password","/api/facilities"])assert.ok(js.includes(route),`enterprise.js calls ${route}`);
 assert.ok(js.includes('Account & access'),'the account section is explicitly separate in the pane');
 assert.ok(js.includes('Deactivate account access')&&js.includes('Deactivate actor'),'account-access and actor deactivation are labeled distinctly');
 assert.ok(js.includes('closes only the sign-in account'),'the access confirmation separates account access from the actor');
 assert.match(js,/Temporary password: \$\{data\.tempPassword\}\. Expires:/,'the one-time temp-password message mirrors the admin create flow');
 assert.ok(js.includes('User must change it on first sign-in.'),'the change-on-first-sign-in policy copy is preserved');
 assert.ok(!html.includes('tempPassword'),'no password is ever rendered into the static page');
});

test('admin user administration is retired to a pointer while schedules and documents stay put',()=>{
 const html=read('admin.html'),app=read('admin-app.js'),users=read('admin-users.js');
 assert.ok(html.includes('People and accounts are managed in the Enterprise Directory'),'pointer copy is present at the section');
 assert.ok(html.includes('enterprise.html">Open the Enterprise Directory'),'pointer button links to Enterprise');
 for(const gone of ['id="createUserModule"','id="roleRequestsModule"','id="userDirectoryModule"','id="userAccountDialog"','id="newEmail"','id="roleRequestRows"','id="userTableBody"','id="refreshUsers"'])assert.ok(!html.includes(gone),`admin.html no longer carries ${gone}`);
 for(const kept of ['id="userSection"','id="driverSchedulePanel"','id="documentAccessModule"'])assert.ok(html.includes(kept),`admin.html keeps ${kept}`);
 assert.ok(!app.includes('loadRoleRequests')&&!app.includes('createUserBtn'),'admin-app.js no longer wires the retired people surface');
 assert.ok(users.includes('loadDriverSchedule'),'the driver schedule module keeps working from admin');
});
