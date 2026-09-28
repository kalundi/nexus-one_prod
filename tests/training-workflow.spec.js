const {test,expect}=require('@playwright/test');
const {PGlite}=require('@electric-sql/pglite');
const http=require('node:http');
const fs=require('node:fs');
const {createTrainingHandler}=require('../netlify/functions/_shared/training.cjs');
let db,server,base;
const users={admin:{id:'11111111-1111-4111-8111-111111111111',role:'ADMIN',displayName:'Administrator'},staff:{id:'22222222-2222-4222-8222-222222222222',role:'STAFF',displayName:'Attendant'}};
test.beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,display_name text,email text,role text,active boolean DEFAULT true);CREATE TABLE user_role_requests(user_id uuid,role text,status text);CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);`);
 for(const [key,u] of Object.entries(users))await db.query('INSERT INTO users(id,display_name,email,role) VALUES($1,$2,$3,$4)',[u.id,u.displayName,key+'@example.test',u.role]);
 for(const file of ['080.001_staff_training.sql','080.002_contract_evidence.sql','080.003_training_staff_role.sql','080.004_training_review.sql'])await db.exec(fs.readFileSync('database/migrations/'+file,'utf8'));
 const {seedTraining}=await import('../scripts/import-training-materials.mjs');await seedTraining(db);await seedTraining(db);
 expect(Number((await db.query('SELECT count(*) FROM training_materials')).rows[0].count)).toBe(17);
 expect(Number((await db.query('SELECT count(*) FROM training_contract_subjects')).rows[0].count)).toBe(3);
 const handler=createTrainingHandler({sendEmail:async()=>({status:"sent"}),query:async(sql,params)=>{const r=await db.query(sql,params);for(const row of r.rows)if(row.file_data)row.file_data=Buffer.from(row.file_data);return r},requireUser:async(token,roles)=>{const u=users[token];if(!u||!roles.includes(u.role))throw Object.assign(Error('Forbidden'),{statusCode:403});return u}});
 const allowed=new Set(['training.html','training.js','training.css','training-contract.js','training-review.js','auth-guard.js','nexus-logo.png']);
 server=http.createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/auth/me'){const user=users[String(req.headers.authorization||'').replace('Bearer ','')];res.setHeader('content-type','application/json');res.end(JSON.stringify({user}));return}
  if(path.startsWith('/api/training')){
   let body='';for await(const chunk of req)body+=chunk;
   const result=await handler({headers:req.headers,body},path.slice(5).split('/'),req.method);
   if(result.statusCode>=400)console.error(req.method,path,result.body);
   res.writeHead(result.statusCode,result.headers);res.end(result.isBase64Encoded?Buffer.from(result.body,'base64'):result.body);return;
  }
  const name=path.slice(1);if(!allowed.has(name)){res.writeHead(404);res.end();return}
  const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html';res.setHeader('content-type',type);res.end(fs.readFileSync(name));
 }catch(error){res.writeHead(error.statusCode||500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}))}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await db?.close()});
test('seeded policy assignment, staff PDF acknowledgment and administrator verification persist end to end',async({browser})=>{
 const admin=await browser.newContext(),staff=await browser.newContext({viewport:{width:390,height:844}});
 await admin.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','admin'));await staff.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','staff'));
 const a=await admin.newPage(),s=await staff.newPage();await a.goto(base+'/training.html');
 await expect(a.locator('#contractSummary')).toContainText('Profiles');
 const material=(await db.query("SELECT id FROM training_materials WHERE policy_key='exposure-control'")).rows[0];
 await a.locator('#assignForm [name=materialId]').selectOption(material.id);await a.locator('#assignForm [name=userIds]').selectOption(users.staff.id);
 await a.locator('#assignForm [name=cycle]').fill('Initial orientation');await a.locator('#assignForm [name=dueAt]').fill('2026-10-01');await a.locator('#assignForm [name=requiresVerification]').check();await a.getByRole('button',{name:'Assign to selected staff'}).click();
 await expect(a.locator('#assignForm .formStatus')).toContainText('1 assignments created');
 await s.goto(base+'/training.html');await expect(s.locator('#administration')).toBeHidden();await s.getByRole('button',{name:'Open assignment'}).click();
 await expect(s.getByTitle('Assigned policy PDF')).toBeVisible();
 await s.locator('#evidenceUpload [name=file]').setInputFiles({name:'competency.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nEvidence test')});
 await s.getByRole('button',{name:'Upload document',exact:true}).click();await expect(s.locator('#evidenceFiles')).toContainText('competency.pdf');
 await s.locator('#ackForm [name=name]').fill('Attendant');await s.locator('#ackForm [name=accepted]').check();await s.getByRole('button',{name:'Record acknowledgment'}).click();await expect(s.locator('#recorded')).toContainText('recorded');await s.getByRole('button',{name:'Close material'}).click();
 await expect(s.locator('#assignmentList')).toContainText('awaiting verification');
 await a.getByRole('button',{name:'Refresh',exact:true}).click();await expect(a.locator('#approvalQueue')).toContainText('Attendant');await expect(a.locator('#centralDocuments')).toContainText('competency.pdf');
 await a.locator('#approvalQueue').getByRole('button',{name:'competency.pdf',exact:true}).click();await expect(a.getByTitle('Review document')).toBeVisible();await a.getByRole('button',{name:'Close document',exact:true}).click();
 await a.getByRole('button',{name:'Review approval',exact:true}).click();await a.locator('#verifyForm [name=notes]').fill('Reviewed practical competency and signed observation record TEST-1');await a.getByRole('button',{name:'Record verification'}).click();
 await expect(a.locator('#reportRows')).toContainText('complete');await s.reload();await expect(s.locator('#assignmentList')).toContainText('complete');
 const row=(await db.query('SELECT * FROM training_assignments')).rows[0];expect(row.acknowledged_name).toBe('Attendant');expect(row.verified_by).toBe(users.admin.id);expect(row.acknowledgment_text).toContain('I acknowledge');
 await s.screenshot({path:'output/training-workflow-staff.png',fullPage:true});
 await a.locator('#contractSubject').selectOption((await db.query("SELECT id FROM training_contract_subjects WHERE market='DC'")).rows[0].id);
 await a.screenshot({path:'output/training-workflow-admin.png',fullPage:false});
 await admin.close();await staff.close();
});
test('administrator creates a wheelchair vehicle profile and records traceable evidence through the browser',async({browser})=>{
 const context=await browser.newContext();await context.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','admin'));const page=await context.newPage();await page.goto(base+'/training.html');
 await page.getByText('Add a company, driver, attendant or vehicle profile',{exact:true}).click();
 await page.locator('#subjectForm [name=name]').fill('Test wheelchair van');await page.locator('#subjectForm [name=scope]').selectOption('VEHICLE');await page.locator('#subjectForm [name=market]').selectOption('DC');await page.locator('#subjectForm [name=levels][value=WHEELCHAIR]').check();await page.getByRole('button',{name:'Create requirement profile'}).click();
 await expect(page.locator('#subjectForm .formStatus')).toContainText('created');
 const id=(await db.query("SELECT id FROM training_contract_subjects WHERE name='Test wheelchair van'")).rows[0].id;await page.locator('#contractSubject').selectOption(id);
 await page.locator('[data-requirement=registration]').click();await page.locator('#evidenceForm [name=decision]').selectOption('VERIFIED');await page.locator('#evidenceForm [name=completedOn]').fill('2026-09-01');await page.locator('#evidenceForm [name=expiresOn]').fill('2027-09-01');await page.locator('#evidenceForm [name=evidenceReference]').fill('Restricted test registration record');await page.locator('#evidenceForm [name=notes]').fill('Matched vehicle identity and current registration dates');await page.getByRole('button',{name:'Save evidence review'}).click();
 await expect(page.locator('#evidenceDialog')).not.toBeVisible();await expect(page.locator('article').filter({has:page.locator('[data-requirement=registration]')})).toContainText('verified');
 await page.reload();await page.locator('#contractSubject').selectOption(id);await page.locator('[data-requirement=registration]').click();await page.getByText('Previous reviews',{exact:true}).click();await expect(page.locator('#evidenceHistory')).toContainText('Restricted test registration record');
 const record=(await db.query('SELECT * FROM training_contract_evidence WHERE subject_id=$1',[id])).rows[0];expect(record.reviewed_by).toBe(users.admin.id);expect(record.source_version).toHaveLength(64);
 await context.close();
});
