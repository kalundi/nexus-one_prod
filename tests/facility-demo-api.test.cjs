const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const Demo=require('../netlify/functions/_shared/facility-demo.cjs');
const factory=Demo.createHandler;
Demo.createHandler=options=>factory({...options,readPlatformSettings:async()=>({pricing:{ambulatory:{base:40,perMile:3},wheelchair:{base:65,perMile:4},stretcher:{base:100,perMile:5}},fareRules:{shortNoticeSurchargePct:0}})});
test('demo login and shared manager controls work through isolated PostgreSQL without exposing secrets',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE system_settings(key text PRIMARY KEY,value jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz DEFAULT now())");
  const handler=Demo.createHandler({query:(...args)=>db.query(...args),getPool:()=>({connect:async()=>({query:(...args)=>db.query(...args),release(){}})}),requireUser:async(token,roles)=>{assert.deepEqual(roles,['ADMIN']);if(token!=='test-admin')throw Error('Forbidden');return {role:'ADMIN'};},bearer:event=>(event.headers.authorization||'').replace(/^Bearer /,''),json:(statusCode,body)=>({statusCode,body}),parseBody:event=>JSON.parse(event.body||'{}')});
  const request=(endpoint,method='GET',body={},token='')=>handler({headers:{authorization:token?`Bearer ${token}`:'','x-nf-client-connection-ip':'127.0.0.1'},body:JSON.stringify(body)},['facility-demo',endpoint],method);
  const setup=await request('setup','POST',{},'test-admin');assert.equal(setup.statusCode,201);assert.ok(setup.body.password);
  const stored=(await db.query('SELECT value FROM system_settings WHERE key=$1',[Demo.KEY])).rows[0].value;assert.equal(JSON.stringify(stored).includes(setup.body.password),false);
  assert.equal((await request('login','POST',{email:Demo.USERNAME,password:'incorrect'})).statusCode,401);
  const login=await request('login','POST',{email:Demo.USERNAME,password:setup.body.password});assert.equal(login.statusCode,200);const token=login.body.token;
  assert.equal((await request('state')).statusCode,401);
  const initial=await request('state','GET',{},token);assert.equal(initial.body.dashboard.patients.length,5);assert.equal(initial.body.passwordHash,undefined);assert.equal(initial.body.secret,undefined);
  await request('control','POST',{action:'seek',minute:505},token);const changed=await request('state','GET',{},token);assert.equal(changed.body.dashboard.severity,'delay');
  await request('control','POST',{action:'ack'},token);assert.equal((await request('state','GET',{},token)).body.dashboard.metrics.unread,0);
  await assert.rejects(request('control','POST',{action:'seek',minute:-1},token));assert.equal((await request('state','GET',{},token)).body.dashboard.minute,505);
  const secondLogin=await request('login','POST',{email:Demo.USERNAME,password:setup.body.password});assert.equal((await request('state','GET',{},secondLogin.body.token)).body.dashboard.minute,505);
  assert.equal((await request('billing')).statusCode,401);
  const draft=await request('billing','GET',{},token);assert.equal(draft.body.invoices[0].status,'draft');assert.equal(draft.body.invoices[0].rows.length,10);
  await request('control','POST',{action:'seek',minute:930},token);
  const closed=await request('state','GET',{},token);assert.equal(closed.body.dashboard.messages.filter(m=>m.patientId==='billing').length,1);
  const final=await request('billing','GET',{},token);assert.equal(final.body.invoices[0].status,'issued');
  await request('control','POST',{action:'restart'},token);assert.deepEqual((await request('billing','GET',{},token)).body.invoices[0],final.body.invoices[0]);
  const repeated=await request('setup','POST',{},'test-admin');assert.equal(repeated.statusCode,200);assert.equal(repeated.body.password,undefined);
  let rateLimited=false;for(let i=0;i<21;i++){const attempt=await request('login','POST',{email:Demo.USERNAME,password:'wrong'});if(attempt.statusCode===429){rateLimited=true;break;}}assert.equal(rateLimited,true);
 }finally{await db.close();}
});
