const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs');
const {createHandler}=require('../netlify/functions/_shared/enterprise-actors.cjs');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
 CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,display_name text);
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),display_name text,role text,access_title text,scope_id text,organization_id uuid REFERENCES organizations(id));
 CREATE TABLE employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),display_name text,role text,user_id uuid REFERENCES users(id));
 CREATE TABLE facilities(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,facility_code text UNIQUE,name text);
 CREATE TABLE patients(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,display_name text,facility_code text REFERENCES facilities(facility_code));
 INSERT INTO organizations(name) VALUES('Nexus');
 INSERT INTO facilities(facility_code,name) VALUES('A','Facility A'),('B','Facility B');
 INSERT INTO users(display_name,role,access_title,organization_id) SELECT 'Crew Member','DRIVER','EMT',id FROM organizations;
 INSERT INTO employees(display_name,role,user_id) SELECT display_name,role,id FROM users;
 INSERT INTO users(display_name,role,scope_id) VALUES('Facility Manager','FACILITY','A');
 INSERT INTO patients(display_name,facility_code) VALUES('Crew Member','A');`);
 await db.exec(fs.readFileSync('database/migrations/097.001_enterprise_actors.sql','utf8'));
 return db;
}
test('backfill preserves explicit identities and keeps permissions separate from classifications',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const user=(await db.query("SELECT * FROM users WHERE role='DRIVER'")).rows[0],employee=(await db.query('SELECT * FROM employees')).rows[0],patient=(await db.query('SELECT * FROM patients')).rows[0];
 assert.equal(user.actor_id,employee.actor_id);assert.notEqual(patient.actor_id,user.actor_id);
 assert.equal(user.role,'DRIVER');assert.equal(user.access_title,'EMT');
 assert.equal((await db.query("SELECT count(*)::int n FROM actor_classifications WHERE actor_id=$1 AND category='EMPLOYEE' AND subtype='EMT'",[user.actor_id])).rows[0].n,2);
 const types=(await db.query('SELECT category,subtype FROM actor_types')).rows;
 for(const subtype of ['EMT','PARAMEDIC','DISPATCHER','BILLING'])assert.ok(types.some(t=>t.category==='EMPLOYEE'&&t.subtype===subtype));
 for(const subtype of ['HOSPITAL','DIALYSIS','SNF','ALF','CLINIC'])assert.ok(types.some(t=>t.category==='FACILITY'&&t.subtype===subtype));
 for(const subtype of ['NURSE','CASE_MANAGER','SOCIAL_WORKER','PHYSICIAN','SCHEDULER','ADMINISTRATOR'])assert.ok(types.some(t=>t.category==='CONTACT'&&t.subtype===subtype));
});
test('future inserts, title changes and authoritative facility assignments stay synchronized',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.query("UPDATE users SET access_title='PARAMEDIC' WHERE role='DRIVER'");
 assert.equal((await db.query("SELECT count(*)::int n FROM actor_classifications WHERE subtype='EMT'")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM actor_classifications WHERE subtype='PARAMEDIC'")).rows[0].n,2);
 await db.query("UPDATE users SET scope_id='B' WHERE role='FACILITY'");
 const links=(await db.query("SELECT f.facility_code FROM actor_relationships r JOIN facilities f ON f.actor_id=r.object_id WHERE r.relationship='CONTACT_FOR'")).rows;
 assert.deepEqual(links,[{facility_code:'B'}]);
 const added=(await db.query("INSERT INTO patients(display_name,facility_code) VALUES('New Patient','B') RETURNING actor_id")).rows[0];
 assert.ok(added.actor_id);assert.equal((await db.query("SELECT count(*)::int n FROM actor_relationships WHERE subject_id=$1 AND relationship='RECEIVES_CARE_AT'",[added.actor_id])).rows[0].n,1);
});
test('multi-classification is supported and entity records cannot become people',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const entity=(await db.query('SELECT actor_id FROM facilities LIMIT 1')).rows[0].actor_id;
 await db.query("INSERT INTO actor_classifications(actor_id,category,subtype) VALUES($1,'ORGANIZATION','PROVIDER')",[entity]);
 await assert.rejects(db.query("INSERT INTO actor_classifications(actor_id,category,subtype) VALUES($1,'EMPLOYEE','EMT')",[entity]),/kind/);
 await assert.rejects(db.query("INSERT INTO actor_classifications(actor_id,category,subtype) VALUES($1,'FACILITY','INVENTED')",[entity]));
 await db.exec(fs.readFileSync('database/migrations/097.001_enterprise_actors.sql','utf8'));
 assert.equal((await db.query('SELECT count(*)::int n FROM actors')).rows[0].n,6);
});
test('admin directory creates and relates identities atomically without granting login access',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const me=(await db.query("SELECT * FROM users WHERE role='FACILITY'")).rows[0];me.role='ADMIN';
 const handler=createHandler({query:(...a)=>db.query(...a),getPool:()=>({connect:async()=>({query:(...a)=>db.query(...a),release(){}})}),requireUser:async(_token,roles)=>{if(!roles.includes(me.role))throw Object.assign(Error('Forbidden'),{statusCode:403});return me;},bearer:()=>'',json:(status,body)=>({status,...body}),parseBody:e=>e.body});
 const call=(suffix='',method='GET',body,params)=>handler({body,queryStringParameters:params},['admin','actors',...suffix.split('/').filter(Boolean)],method);
 const before=(await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
 const created=await call('','POST',{name:'Test Nurse',kind:'PERSON',category:'CONTACT',subtype:'NURSE'});assert.equal(created.status,201);
 const facility=(await db.query("SELECT actor_id FROM facilities WHERE facility_code='A'")).rows[0].actor_id;
 assert.equal((await call(created.actor.id+'/relationships','POST',{relationship:'CONTACT_FOR',objectId:facility})).status,200);
 await assert.rejects(call(created.actor.id+'/relationships','POST',{relationship:'OPERATES',objectId:facility}),/classifications/);
 await assert.rejects(call('','POST',{name:'Invalid Person',kind:'PERSON',category:'FACILITY',subtype:'HOSPITAL'}),/classification/);
 assert.equal((await db.query("SELECT count(*)::int n FROM actors WHERE display_name='Invalid Person'")).rows[0].n,0,'Invalid classification rolls back the identity');
 assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,before);
 const details=await call(created.actor.id);assert.equal(details.relationships.length,1);assert.deepEqual(details.records,[]);
 const search=await call('','GET',undefined,{q:'Test Nurse',category:'CONTACT'});assert.equal(search.actors.length,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM actor_events')).rows[0].n,2);
 for(const role of ['FACILITY','PATIENT','DRIVER','DISPATCHER']){me.role=role;await assert.rejects(call(),e=>e.statusCode===403);await assert.rejects(call('','POST',{name:'Denied'}),e=>e.statusCode===403);}
});
test('actor tables reject untrusted direct database reads',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.exec('CREATE ROLE actor_client;SET ROLE actor_client;');
 for(const table of ['actors','actor_types','actor_classifications','actor_relationships','actor_events'])await assert.rejects(db.query('SELECT * FROM '+table),/permission denied/);
 await db.exec('RESET ROLE;');
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_class WHERE relname IN ('actors','actor_types','actor_classifications','actor_relationships','actor_events') AND relrowsecurity")).rows[0].n,5);
});
