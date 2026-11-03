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
 INSERT INTO organizations(name) VALUES('Nexus Medical Transit');
 INSERT INTO facilities(facility_code,name) VALUES('A','Facility A'),('B','Facility B'),('C','Facility C');
 INSERT INTO users(display_name,role,access_title,organization_id) SELECT 'Crew Member','DRIVER','EMT',id FROM organizations;
 INSERT INTO employees(display_name,role,user_id) SELECT display_name,role,id FROM users;
 INSERT INTO users(display_name,role,scope_id) VALUES('Facility Manager','FACILITY','A');
 INSERT INTO users(display_name,role) VALUES('Anthony Muthoka','PATIENT'),('Anthony Muthoka','PATIENT');
 INSERT INTO patients(display_name,facility_code) VALUES('Crew Member','A');`);
 await db.exec(fs.readFileSync('database/migrations/097.001_enterprise_actors.sql','utf8'));
 await db.exec(fs.readFileSync('database/migrations/100.001_actor_removal_audit.sql','utf8'));
 await db.exec(fs.readFileSync('database/migrations/100.001_actor_removal_audit.sql','utf8'));
 return db;
}
function handlerFor(db,me){
 return createHandler({query:(...a)=>db.query(...a),getPool:()=>({connect:async()=>({query:(...a)=>db.query(...a),release(){}})}),requireUser:async(_token,roles)=>{if(!roles.includes(me.role))throw Object.assign(Error('Forbidden'),{statusCode:403});return me;},bearer:()=>'',json:(status,body)=>({status,...body}),parseBody:e=>e.body});
}
const callFor=handler=>(suffix='',method='GET',body,params)=>handler({body,queryStringParameters:params},['admin','actors',...suffix.split('/').filter(Boolean)],method);
async function adminMe(db){const me=(await db.query("SELECT * FROM users WHERE display_name='Facility Manager'")).rows[0];me.role='ADMIN';return me;}

test('non-administrators are refused deactivate, reactivate and remove',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const me=(await db.query("SELECT * FROM users WHERE display_name='Facility Manager'")).rows[0];
 const call=callFor(handlerFor(db,me));
 const id=(await db.query('SELECT id FROM actors LIMIT 1')).rows[0].id;
 for(const action of ['deactivate','reactivate','remove'])await assert.rejects(call(id+'/'+action,'POST',{}),e=>e.statusCode===403);
});

test('deactivate hides the actor from the default list, reactivate restores it, and source sync never undoes it',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const call=callFor(handlerFor(db,await adminMe(db)));
 const dupIds=(await db.query("SELECT actor_id FROM users WHERE display_name='Anthony Muthoka' ORDER BY actor_id")).rows.map(r=>r.actor_id);
 assert.equal(new Set(dupIds).size,2);
 const [first,second]=dupIds;
 const off=await call(first+'/deactivate','POST',{});assert.equal(off.status,200);assert.equal(off.changed,true);assert.equal(off.actor.active,false);
 assert.equal((await db.query("SELECT count(*)::int n FROM actor_events WHERE actor_id=$1 AND action='DEACTIVATED'",[first])).rows[0].n,1);
 const ids=async params=>(await call('','GET',undefined,params)).actors.map(a=>a.id);
 assert.deepEqual(await ids({q:'Anthony Muthoka'}),[second]);
 assert.deepEqual(await ids({q:'Anthony Muthoka',status:'inactive'}),[first]);
 assert.deepEqual((await ids({q:'Anthony Muthoka',status:'all'})).sort(),[...dupIds].sort());
 const detail=await call(first);assert.equal(detail.actor.active,false);
 const userId=(await db.query('SELECT id FROM users WHERE actor_id=$1',[first])).rows[0].id;
 await db.query('UPDATE users SET display_name=$1 WHERE id=$2',['Anthony Muthoka Sr',userId]);
 const after=(await db.query('SELECT display_name,active FROM actors WHERE id=$1',[first])).rows[0];
 assert.equal(after.display_name,'Anthony Muthoka Sr');assert.equal(after.active,false,'source synchronization must not reactivate a deactivated actor');
 const on=await call(first+'/reactivate','POST',{});assert.equal(on.changed,true);assert.equal(on.actor.active,true);
 const again=await call(first+'/reactivate','POST',{});assert.equal(again.changed,false);
 assert.equal((await db.query("SELECT count(*)::int n FROM actor_events WHERE actor_id=$1 AND action='REACTIVATED'",[first])).rows[0].n,1);
 assert.deepEqual((await ids({q:'Anthony Muthoka',status:'all'})).sort(),[...dupIds].sort());
});

test('relationships in either direction block removal, while deactivate still works',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const call=callFor(handlerFor(db,await adminMe(db)));
 const clinic=(await call('','POST',{name:'Manual Clinic',kind:'ENTITY',category:'FACILITY',subtype:'CLINIC'})).actor;
 const contact=(await call('','POST',{name:'Case Contact',kind:'PERSON',category:'CONTACT',subtype:'NURSE'})).actor;
 assert.equal((await call(contact.id+'/relationships','POST',{relationship:'CONTACT_FOR',objectId:clinic.id})).status,200);
 const detail=await call(clinic.id);
 assert.equal(detail.management.relationshipCount,1);assert.equal(detail.management.canRemove,false);
 assert.ok(detail.management.blockers.some(b=>/relationship/.test(b)));
 await assert.rejects(call(clinic.id+'/remove','POST',{}),/relationship/);
 await assert.rejects(call(contact.id+'/remove','POST',{}),/relationship/);
 assert.equal((await db.query('SELECT count(*)::int n FROM actors WHERE id=ANY($1::uuid[])',[[clinic.id,contact.id]])).rows[0].n,2);
 assert.equal((await call(clinic.id+'/deactivate','POST',{})).changed,true);
 assert.equal((await call(clinic.id+'/reactivate','POST',{})).changed,true);
});

test('source-maintained actors cannot be removed because the source record would recreate them',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const call=callFor(handlerFor(db,await adminMe(db)));
 const facilityC=(await db.query("SELECT actor_id FROM facilities WHERE facility_code='C'")).rows[0].actor_id;
 const detail=await call(facilityC);
 assert.equal(detail.management.relationshipCount,0);assert.equal(detail.management.canRemove,false);
 assert.ok(detail.management.blockers.some(b=>/kept in step with a live facility record/.test(b)));
 await assert.rejects(call(facilityC+'/remove','POST',{}),/kept in step with a live facility record/);
 const dup=(await db.query("SELECT actor_id FROM users WHERE display_name='Anthony Muthoka' LIMIT 1")).rows[0].actor_id;
 const dupDetail=await call(dup);
 assert.equal(dupDetail.management.relationshipCount,0);
 assert.ok(dupDetail.management.blockers.some(b=>/kept in step with a live user account/.test(b)));
 await assert.rejects(call(dup+'/remove','POST',{}),/kept in step with a live user account/);
});

test('the organization actor and the signed-in administrator own actor are protected',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const me=await adminMe(db);const call=callFor(handlerFor(db,me));
 const org=(await db.query('SELECT actor_id FROM organizations')).rows[0].actor_id;
 const orgDetail=await call(org);
 assert.ok(orgDetail.management.blockers.some(b=>/organization record for Nexus Medical Transit/.test(b)));
 await assert.rejects(call(org+'/remove','POST',{}),/organization record/);
 const own=(await call(me.actor_id)).management;
 assert.equal(own.blockers[0],'This is your own directory identity, so you cannot remove it.');
 await assert.rejects(call(me.actor_id+'/remove','POST',{}),/your own directory identity/);
});

test('removing a true orphan deletes it with its classifications and keeps the audit history',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const call=callFor(handlerFor(db,await adminMe(db)));
 const created=(await call('','POST',{name:'Orphan Fixture',kind:'PERSON',category:'CONTACT',subtype:'GENERAL'})).actor;
 assert.equal((await call(created.id+'/classifications','POST',{category:'CONTACT',subtype:'SCHEDULER'})).status,200);
 const detail=await call(created.id);
 assert.equal(detail.management.canRemove,true);assert.deepEqual(detail.management.blockers,[]);assert.equal(detail.management.relationshipCount,0);assert.deepEqual(detail.management.sources,[]);
 const removed=await call(created.id+'/remove','POST',{});
 assert.equal(removed.status,200);assert.equal(removed.removed,true);assert.equal(removed.actor.display_name,'Orphan Fixture');
 assert.equal((await db.query('SELECT count(*)::int n FROM actors WHERE id=$1',[created.id])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM actor_classifications WHERE actor_id=$1',[created.id])).rows[0].n,0);
 await assert.rejects(call(created.id),e=>e.statusCode===404);
 const events=(await db.query('SELECT action,actor_id,details FROM actor_events ORDER BY id')).rows;
 assert.deepEqual(events.map(e=>e.action),['CREATED','CLASSIFIED','REMOVED']);
 assert.ok(events.every(e=>e.actor_id===null),'audit rows survive the removal with a null actor link');
 assert.equal(events[2].details.display_name,'Orphan Fixture');assert.equal(events[2].details.kind,'PERSON');
});
