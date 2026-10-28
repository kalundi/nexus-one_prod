const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {requireActiveFacility}=require('../netlify/functions/_shared/facility-access.cjs');
const source=fs.readFileSync('netlify/functions/api.cjs','utf8');
test('actual account creation route assigns the facility in every insert path before granting access',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE facilities(facility_code text,name text,address text,active boolean);INSERT INTO facilities VALUES('FC-A','Care A','100 Facility Lane',true),('FC-X','Closed','200 Facility Lane',false);
 CREATE TABLE organizations(id uuid DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now());INSERT INTO organizations DEFAULT VALUES;
 CREATE TABLE users(id uuid PRIMARY KEY,email text,display_name text,role text,password_hash text,phone text,must_change_password boolean,password_reset_expires timestamptz,active boolean,organization_id uuid,identity_subject uuid,scope_id text,user_code text DEFAULT 'N1001',created_at timestamptz,updated_at timestamptz);`);
 const start=source.indexOf("  if(p[0]==='admin'&&p[1]==='users'&&!p[2]&&method==='POST'){");const end=source.indexOf("    if(p[0]==='admin'&&p[1]==='users'&&p[2]&&p[3]==='resend-credentials'",start);assert.ok(start>0&&end>start);
 let fallback=0;
 const call=body=>vm.runInNewContext(`(async()=>{${source.slice(start,end)}})()`,{p:['admin','users'],method:'POST',event:{body:JSON.stringify(body)},parseBody:e=>JSON.parse(e.body),query:async(sql,args)=>{if(sql.startsWith('INSERT INTO users')&&fallback>0){fallback--;throw Error(sql.includes('must_change_password')?'optional policy column unavailable':'identity_subject unavailable');}return db.query(sql,args);},requireActiveFacility,requireUser:async()=>({id:'admin',role:'ADMIN'}),bearer:()=>'',required:(b,keys)=>{if(keys.some(k=>!b[k]))throw Error('Required fields');},clean:v=>String(v??'').trim(),normalizeE164:v=>v,generateTempPassword:()=> 'Local-fixture-only',hashPassword:()=> 'fixture-hash',crypto,process:{env:{}},sendEmail:async()=>({status:'skipped'}),audit:async()=>{},json:(statusCode,body)=>({statusCode,body})});
 const account={email:'manager@example.test',name:'Manager',phone:'+12405550100',role:'FACILITY'};
 for(const scopeId of ['', 'FC-X','OTHER']){const r=await call({...account,scopeId});assert.equal(r.statusCode,400);}
 assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,0);
 for(const count of [0,1,2]){fallback=count;const email='manager'+count+'@example.test';const result=await call({...account,email,scopeId:'FC-A'});assert.equal(result.statusCode,201,JSON.stringify(result));assert.equal(result.body.user.scopeId,'FC-A');assert.equal((await db.query('SELECT scope_id FROM users WHERE email=$1',[email])).rows[0].scope_id,'FC-A');}
 }finally{await db.close();}
});
test('role approvals persist facility association atomically and reject inactive facilities',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE facilities(facility_code text,name text,address text,active boolean);INSERT INTO facilities VALUES('FC-A','Care A','Address',true),('FC-X','Closed','Address',false);
   CREATE TABLE users(id text PRIMARY KEY,email text,role text,scope_id text,updated_at timestamptz);INSERT INTO users VALUES('manager','manager@example.test','FACILITY',NULL,now());
   CREATE TABLE user_role_requests(id text PRIMARY KEY,user_id text,role text,status text,scope_id text,reviewed_at timestamptz,reviewed_by text,notes text);INSERT INTO user_role_requests VALUES('request','manager','FACILITY','PENDING',NULL,NULL,NULL,NULL);`);
  const start=source.indexOf("  if(p[0]==='admin'&&p[1]==='role-requests'&&p[2]&&method==='POST'){");const end=source.indexOf('  // Admin: emergency password reset',start);assert.ok(start>0&&end>start);
  let fail=false;const query=async(sql,args)=>{if(fail&&sql.startsWith('UPDATE users SET scope_id='))throw Error('Simulated assignment failure');return db.query(sql,args);};
  const call=body=>vm.runInNewContext(`(async()=>{${source.slice(start,end)}})()`,{p:['admin','role-requests','request'],method:'POST',event:{body:JSON.stringify(body)},parseBody:e=>JSON.parse(e.body),ensureMultiRoleSchema:async()=>{},requireUser:async()=>({id:'admin',email:'admin@example.test'}),bearer:()=>'',clean:v=>String(v??'').trim(),requireActiveFacility,getPool:()=>({connect:async()=>({query,release(){}})}),audit:async()=>{},json:(statusCode,body)=>({statusCode,body})});
  for(const scopeId of ['', 'FC-X','UNKNOWN'])await assert.rejects(call({decision:'APPROVED',scopeId}),/Select/);
  assert.equal((await db.query('SELECT status FROM user_role_requests')).rows[0].status,'PENDING');
  fail=true;await assert.rejects(call({decision:'APPROVED',scopeId:'FC-A'}),/Simulated/);assert.equal((await db.query('SELECT status FROM user_role_requests')).rows[0].status,'PENDING');
  fail=false;assert.equal((await call({decision:'APPROVED',scopeId:'FC-A'})).statusCode,200);assert.equal((await db.query('SELECT scope_id FROM users')).rows[0].scope_id,'FC-A');assert.equal((await db.query('SELECT scope_id FROM user_role_requests')).rows[0].scope_id,'FC-A');
 }finally{await db.close();}
});
