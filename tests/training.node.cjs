const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {createTrainingHandler,materialInput}=require('../netlify/functions/_shared/training.cjs');
const {evidenceStatus,dueDate,addMonths}=require('../netlify/functions/_shared/contract-evidence.cjs');
const catalog=require('../netlify/functions/_shared/mtm-requirements.cjs');
const ids={admin:'11111111-1111-4111-8111-111111111111',driver:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333',patient:'44444444-4444-4444-8444-444444444444',facility:'55555555-5555-4555-8555-555555555555'};
let db,handler,material,assignment,profile;
before(async()=>{
 db=new PGlite();await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,display_name text,email text,role text,active boolean DEFAULT true);
 CREATE TABLE user_role_requests(user_id uuid,role text,status text);CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
 CREATE ROLE anon;CREATE ROLE authenticated;`);
 for(const [name,id] of Object.entries(ids))await db.query('INSERT INTO users(id,display_name,email,role) VALUES($1,$2,$3,$4)',[id,name,name+'@example.test',name==='other'?'DRIVER':name.toUpperCase()]);
 for(const file of ['080.001_staff_training.sql','080.002_contract_evidence.sql','080.003_training_staff_role.sql','080.004_training_review.sql'])await db.exec(fs.readFileSync('database/migrations/'+file,'utf8'));
 handler=createTrainingHandler({sendEmail:async()=>({status:"sent"}),query:async(sql,params)=>{const r=await db.query(sql,params);for(const row of r.rows)if(row.file_data)row.file_data=Buffer.from(row.file_data);return r},requireUser:async(token,roles)=>{const name=token;if(!ids[name])throw Object.assign(Error('Authentication required'),{statusCode:401});const role=name==='other'?'DRIVER':name.toUpperCase();if(!roles.includes(role))throw Object.assign(Error('Forbidden'),{statusCode:403});return {id:ids[name],role}}});
});
after(async()=>{await db?.close()});
async function call(user,path='',body){const r=await handler({headers:{authorization:'Bearer '+user},body:body===undefined?undefined:JSON.stringify(body)},['training',...path.split('/').filter(Boolean)],body===undefined?'GET':'POST');return {...r,data:r.headers['content-type'].includes('json')?JSON.parse(r.body):null}}
const rejected=(fn,status)=>assert.rejects(fn,error=>error.statusCode===status);
test('staff boundaries: unauthenticated, patient, facility and driver admin requests denied',async()=>{
 for(const [user,status] of [['',401],['patient',403],['facility',403]])await rejected(()=>call(user),status);
 await rejected(()=>call('driver','admin/report'),403);await rejected(()=>call('driver','admin/contract'),403);
});
test('material input rejects unsafe URLs and invalid PDFs',()=>{
 const fields={title:'Policy',policyKey:'policy',version:'1',kind:'POLICY'};
 for(const resourceUrl of ['javascript:alert(1)','http://example.com','https://user:password@example.com'])assert.throws(()=>materialInput({...fields,resourceUrl}));
 assert.throws(()=>materialInput({...fields,dataBase64:Buffer.from('not a PDF').toString('base64')}));
});
test('material versions are immutable and duplicate versions rejected',async()=>{
 const body={title:'Safe transport',policyKey:'transport',version:'1',kind:'POLICY',dataBase64:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')};
 const response=await call('admin','admin/materials',body);assert.equal(response.statusCode,201);material=response.data.material.id;
 await rejected(()=>call('admin','admin/materials',body),409);
});
test('assignment only enrolls active staff and duplicate cycle preserves records',async()=>{
 const body={materialId:material,userIds:[ids.driver,ids.patient],cycle:'2026',dueAt:'2026-01-01T00:00:00Z',requiresVerification:true};
 assert.equal((await call('admin','admin/assignments',body)).data.assigned,1);
 assert.equal((await call('admin','admin/assignments',body)).data.assigned,0);
 const data=(await call('driver')).data;assert.equal(data.assignments.length,1);assignment=data.assignments[0].id;assert.equal(data.assignments[0].status,'OVERDUE');
});
test('ownership enforced for listing, file access, opening and acknowledgment',async()=>{
 const own=(await call('other')).data.assignments;assert.equal(own.length,1);assert.equal(own[0].user_id,ids.other);assert.notEqual(own[0].id,assignment);
 await rejected(()=>call('other',`assignments/${assignment}/file`),404);
 await rejected(()=>call('other',`assignments/${assignment}/open`,{}),404);
 await rejected(()=>call('other',`assignments/${assignment}/acknowledge`,{name:'Other',accepted:true}),409);
});
test('acknowledgment requires opening and explicit consent; timestamps and identity cannot be overridden',async()=>{
 await rejected(()=>call('driver',`assignments/${assignment}/acknowledge`,{name:'Driver',accepted:true}),409);
 await call('driver',`assignments/${assignment}/open`,{});
 assert.equal((await call('driver',`assignments/${assignment}/file`)).headers['cache-control'],'private, no-store');
 await rejected(()=>call('driver',`assignments/${assignment}/acknowledge`,{name:'Driver',accepted:false}),400);
 await call('driver',`assignments/${assignment}/acknowledge`,{name:'Driver Name',accepted:true,userId:ids.other,acknowledgedAt:'2000-01-01'});
 const row=(await call('driver')).data.assignments[0];assert.equal(row.user_id,ids.driver);assert.notEqual(String(row.acknowledged_at).slice(0,4),'2000');assert.equal(row.status,'AWAITING_VERIFICATION');
 await rejected(()=>call('driver',`assignments/${assignment}/acknowledge`,{name:'Changed',accepted:true}),409);
});
test('practical completion requires administrator evidence; renewal cycle retains earlier acknowledgment',async()=>{
 await rejected(()=>call('driver',`admin/verify/${assignment}`,{notes:'observed'}),403);
 await rejected(()=>call('admin',`admin/verify/${assignment}`,{notes:''}),400);
 await call('admin',`admin/verify/${assignment}`,{notes:'Observed securement competency against checklist 123'});
 assert.equal((await call('driver')).data.assignments[0].status,'COMPLETE');
 await call('admin','admin/assignments',{materialId:material,userIds:[ids.driver],cycle:'2027',dueAt:'2027-01-01',requiresVerification:false});
 assert.equal((await call('driver')).data.assignments.length,2);
});
test('contract profiles apply market, service and role filters',async()=>{
 const response=await call('admin','admin/contract-subjects',{name:'Wheelchair vehicle DC',scope:'VEHICLE',market:'DC',levels:['WHEELCHAIR']});profile=response.data.subject.id;
 const checks=(await call('admin','admin/contract')).data.checks;
 assert(checks.some(c=>c.requirement.key==='wheelchair-vehicle'));assert(!checks.some(c=>c.requirement.key==='license'));assert(!checks.some(c=>c.requirement.key==='stretcher-vehicle'));assert(!checks.some(c=>c.requirement.key.startsWith('ems-')));
 assert(checks.every(c=>c.status==='MISSING'));
});
test('evidence cannot waive mandatory requirements or fabricate future verification',async()=>{
 const b={subjectId:profile,requirementKey:'registration',decision:'VERIFIED',completedOn:'2026-09-01',expiresOn:'2027-09-01',evidenceReference:'Restricted vehicle record #1',notes:'Checked'};
 await rejected(()=>call('admin','admin/contract-evidence',{...b,decision:'NOT_APPLICABLE'}),400);
 await rejected(()=>call('admin','admin/contract-evidence',{...b,completedOn:'2099-01-01'}),400);
 await rejected(()=>call('admin','admin/contract-evidence',{...b,requirementKey:'cpr'}),400);
 await call('admin','admin/contract-evidence',b);
 await call('admin','admin/contract-evidence',{...b,decision:'MISSING',notes:'Replacement proof required'});
 const result=(await call('admin','admin/contract')).data;assert.equal(result.history.length,2);assert.equal(result.checks.find(c=>c.requirement.key==='registration').status,'MISSING');
});
test('renewal dates, daily expiry, initial freshness and confirmation gates',()=>{
 assert.equal(addMonths('2024-02-29',12),'2025-02-28');
 assert.equal(evidenceStatus({renewMonths:12},{decision:'VERIFIED',completed_on:'2025-09-27'},null,'2026-09-27'),'EXPIRED');
 assert.equal(evidenceStatus({daily:true},{decision:'VERIFIED',completed_on:'2026-09-26'},null,'2026-09-27'),'EXPIRED');
 assert.equal(evidenceStatus({initialMaxAgeDays:90},{decision:'VERIFIED',completed_on:'2026-01-01'},'2026-06-01','2026-09-27'),'NEEDS_REVIEW');
 assert.equal(evidenceStatus({confirmation:true},{decision:'VERIFIED',completed_on:'2026-09-01'},null,'2026-09-27'),'NEEDS_CONFIRMATION');
 assert.equal(dueDate({initialDueDays:30},null,'2026-09-24'),'2026-10-24');
 assert.equal(dueDate({renewMonths:24},{completed_on:'2026-01-01',expires_on:'2027-01-01'}),'2027-01-01');
});
test('RLS and grants deny direct public reads of staff and evidence records',async()=>{
 for(const table of ['training_materials','training_assignments','training_contract_subjects','training_contract_evidence','training_documents']){
  const result=await db.query('SELECT relrowsecurity FROM pg_class WHERE relname=$1',[table]);assert.equal(result.rows[0].relrowsecurity,true);
  await db.exec('SET ROLE anon');try{await assert.rejects(()=>db.query('SELECT * FROM '+table),/permission denied/)}finally{await db.exec('RESET ROLE')}
 }
});
test('all catalogue rules have traceable sources and ambulance requirements remain separate',()=>{
 assert.equal(new Set(catalog.requirements.map(r=>r.key)).size,catalog.requirements.length);
 for(const r of catalog.requirements)assert(catalog.sources[r.source],r.key);
 const matches=catalog.requirements.filter(r=>catalog.applies(r,{scope:'ATTENDANT',market:'VA',levels:['AMBULANCE']}));
 assert(matches.some(r=>r.key==='ems-personnel-va'));assert(!matches.some(r=>r.key==='license'));assert(!matches.some(r=>r.key==='dds'));
});
test('external courses always require evidence, even when assignment verification is unchecked',async()=>{
 const result=await call('admin','admin/materials',{title:'External certification',policyKey:'external-test',version:'1',kind:'TRAINING',resourceUrl:'https://example.test/course',requiresExternalEvidence:true});
 await call('admin','admin/assignments',{materialId:result.data.material.id,userIds:[ids.driver],cycle:'external',dueAt:'2027-01-01',requiresVerification:false});
 const row=(await call('driver')).data.assignments.find(a=>a.cycle==='external');assert.equal(row.requires_verification,true);
 await call('driver',`assignments/${row.id}/open`,{});await call('driver',`assignments/${row.id}/acknowledge`,{accepted:true,name:'Driver'});
 assert.equal((await call('driver')).data.assignments.find(a=>a.id===row.id).status,'AWAITING_VERIFICATION');
});
test('credentialing corrections retain old and new dates with reviewer identity',async()=>{
 await call('admin','admin/contract-date',{subjectId:profile,credentialedOn:'2026-09-01',notes:'Initial credentialing record'});
 await call('admin','admin/contract-date',{subjectId:profile,credentialedOn:'2026-09-02',notes:'Corrected against MTM receipt'});
 const rows=(await db.query('SELECT * FROM training_contract_date_history WHERE subject_id=$1 ORDER BY changed_at',[profile])).rows;
 assert.equal(rows.length,2);assert.equal(new Date(rows[1].old_date).toISOString().slice(0,10),'2026-09-01');assert.equal(new Date(rows[1].new_date).toISOString().slice(0,10),'2026-09-02');assert.equal(rows[1].changed_by,ids.admin);
});
test('changed source versions invalidate previous verified evidence',async()=>{
 await call('admin','admin/contract-evidence',{subjectId:profile,requirementKey:'registration',decision:'VERIFIED',completedOn:'2026-09-01',expiresOn:'2027-09-01',evidenceReference:'Vehicle file',notes:'Checked certificate'});
 await db.query("UPDATE training_contract_evidence SET source_version='obsolete' WHERE subject_id=$1",[profile]);
 assert.equal((await call('admin','admin/contract')).data.checks.find(c=>c.requirement.key==='registration').status,'SOURCE_CHANGED');
});
test('training-only staff can be assigned without receiving an operational role',async()=>{
 const {STAFF}=require('../netlify/functions/_shared/training.cjs');assert(STAFF.includes('STAFF'));
 await db.query("UPDATE users SET role='STAFF' WHERE id=$1",[ids.other]);
 const result=await call('admin','admin/assignments',{materialId:material,userIds:[ids.other],cycle:'staff-access',dueAt:'2027-01-01',requiresVerification:false});assert.equal(result.data.assigned,1);
 await db.query("INSERT INTO user_role_requests(user_id,role,status) VALUES($1,'STAFF','APPROVED')",[ids.other]);
});

test('drivers receive every material once and submissions remain pending administrator approval',async()=>{
 const created=await call('admin','admin/materials',{title:'New driver policy',policyKey:'auto-driver',version:'1',kind:'POLICY',resourceUrl:'https://example.test/policy'});
 const first=(await call('driver')).data.assignments;
 const row=first.find(a=>a.material_id===created.data.material.id);
 assert(row);assert.equal(row.requires_verification,true);assert.equal(row.status,'ASSIGNED');
 assert.equal((await call('driver')).data.assignments.length,first.length);
 await call('driver',`assignments/${row.id}/open`,{});
 await call('driver',`assignments/${row.id}/acknowledge`,{name:'Driver',accepted:true});
 assert.equal((await call('driver')).data.assignments.find(a=>a.id===row.id).status,'AWAITING_VERIFICATION');
 await call('admin',`admin/verify/${row.id}`,{notes:'Reviewed submitted policy acknowledgment'});
 const approved=(await call('driver')).data.assignments.find(a=>a.id===row.id);
 assert.equal(approved.status,'COMPLETE');assert.equal(approved.verified_by,ids.admin);
});

test('approved driver roles enroll automatically and legacy unverified acknowledgments require approval',async()=>{
 await db.query("INSERT INTO user_role_requests(user_id,role,status) VALUES($1,'DRIVER','APPROVED')",[ids.other]);
 await db.query('UPDATE training_assignments SET requires_verification=false WHERE user_id=$1',[ids.other]);
 const rows=(await call('other')).data.assignments;
 const count=await db.query('SELECT count(*)::int AS total FROM training_materials');
 assert.equal(new Set(rows.map(a=>a.material_id)).size,count.rows[0].total);
 assert(rows.every(a=>a.requires_verification));
 assert.equal((await call('admin')).data.assignments.length,0);
});

test('central documents enforce ownership, preserve uploaded bytes and lock after submission',async()=>{
 const row=(await call('driver')).data.assignments.find(a=>!a.acknowledged_at);
 const body={filename:'certificate.pdf',dataBase64:Buffer.from('%PDF-1.4\nEvidence test').toString('base64')};
 await rejected(()=>call('other',`assignments/${row.id}/documents`,body),409);
 const doc=(await call('driver',`assignments/${row.id}/documents`,body)).data.document;
 assert.equal((await call('driver',`assignments/${row.id}/documents`)).data.documents.length,1);
 await rejected(()=>call('other',`documents/${doc.id}/file`),404);
 const file=await call('admin',`documents/${doc.id}/file`);assert.equal(file.body,body.dataBase64);assert.equal(file.headers['cache-control'],'private, no-store');
 assert((await call('admin','admin/documents')).data.documents.some(d=>d.id===doc.id));
 await rejected(()=>call('driver','admin/documents'),403);
 assert.equal((await call('admin',`admin/materials/${material}/file`)).statusCode,200);
 await call('driver',`assignments/${row.id}/open`,{});await call('driver',`assignments/${row.id}/acknowledge`,{name:'Driver',accepted:true});
 await rejected(()=>call('driver',`assignments/${row.id}/documents`,body),409);
 const stored=(await db.query('SELECT notification_sent_at FROM training_assignments WHERE id=$1',[row.id])).rows[0];assert(stored.notification_sent_at);
});

test('submission alerts retry failures, deduplicate delivery and stop after approval',async()=>{
 const {notifyTrainingAdmins}=require('../netlify/functions/_shared/training-notifications.cjs');
 const row=(await call('driver')).data.assignments.find(a=>a.status==='AWAITING_VERIFICATION');
 await db.query("UPDATE training_assignments SET notification_sent_at=NULL,reminder_sent_at=NULL,due_at=now()+interval '2 days' WHERE id=$1",[row.id]);
 const options={query:(sql,args)=>db.query(sql,args),assignmentId:row.id};let sent=0;
 await notifyTrainingAdmins({...options,sendEmail:async()=>({status:'skipped'})});
 assert.equal((await db.query('SELECT notification_sent_at FROM training_assignments WHERE id=$1',[row.id])).rows[0].notification_sent_at,null);
 const sendEmail=async(to,subject,html)=>{sent++;assert.deepEqual(to,['admin@example.test']);assert.match(html,/Approval deadline/);return {status:'sent'}};
 await notifyTrainingAdmins({...options,sendEmail});await notifyTrainingAdmins({...options,sendEmail});assert.equal(sent,1);
 await db.query("UPDATE training_assignments SET reminder_sent_at=now()-interval '2 days' WHERE id=$1",[row.id]);
 await notifyTrainingAdmins({...options,sendEmail});assert.equal(sent,2);
 await call('admin',`admin/verify/${row.id}`,{notes:'Reviewed supporting document'});
 await db.query("UPDATE training_assignments SET reminder_sent_at=now()-interval '2 days' WHERE id=$1",[row.id]);
 await notifyTrainingAdmins({...options,sendEmail});assert.equal(sent,2);
});

test('coupon migration can rerun with existing constraint and records its version',async()=>{
 await db.exec(`CREATE TABLE booking_promotions(code_hash text UNIQUE,display_code text,description text,service text NOT NULL,trip_date date NOT NULL,fixed_total numeric NOT NULL)`);
 const sql=fs.readFileSync('database/migrations/076.001_percentage_coupon_pool.sql','utf8');await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='booking_promotions_value_check' AND conrelid='booking_promotions'::regclass")).rows[0].n,1);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE version='076.001'")).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_promotions')).rows[0].n,50);
});
