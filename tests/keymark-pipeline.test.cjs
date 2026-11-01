const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const functionsDir=path.join(__dirname,'..','netlify','functions');
const dbPath=require.resolve(path.join(functionsDir,'_shared','db.cjs'));

// Minimal in-memory stand-in for the KeyMark tables, dispatched on the exact SQL
// shapes the sync and outreach handlers issue. It emulates the two Postgres
// behaviours the pipeline relies on: the (source_system, external_appointment_id)
// upsert with (xmax=0) insert detection, and the (source_system, payload_digest)
// ON CONFLICT DO NOTHING message dedupe.
function createFakeDb(){
 const state={connections:[],appointments:new Map(),messages:[],events:[],communications:[]};
 let apptSeq=0;
 async function query(sql,params=[]){
  const s=String(sql).replace(/\s+/g,' ');
  if(s.includes('FROM keymark_connections')){const rows=state.connections.filter(c=>['ACTIVE','ERROR'].includes(c.status)&&c.protocol==='FHIR');return {rows,rowCount:rows.length}}
  if(s.startsWith('INSERT INTO keymark_appointments')){
   const key=`${params[3]}|${params[2]}`,prior=state.appointments.get(key),inserted=!prior,id=prior?prior.id:`appt-${++apptSeq}`;
   const row={...(prior||{}),id,organization_id:params[0],facility_id:params[1],external_appointment_id:params[2],source_system:params[3],patient_external_id:params[4],patient_name:params[5],patient_phone:params[6],patient_email:params[7],appointment_at:params[8],department:params[9],appointment_type:params[10],notes:params[11],arrival_risk_score:params[12],consent_status:prior?.consent_status||'UNKNOWN',outreach_status:prior?.outreach_status||'NOT_STARTED',transportation_status:prior?.transportation_status||'NOT_ASSESSED',barrier_codes:prior?.barrier_codes||[]};
   state.appointments.set(key,row);
   return {rows:[{id,inserted}],rowCount:1};
  }
  if(s.startsWith('INSERT INTO keymark_integration_messages')){
   if(state.messages.some(m=>m.source_system===params[1]&&m.payload_digest===params[3]))return {rows:[],rowCount:0};
   state.messages.push({connection_id:params[0],source_system:params[1],external_message_id:params[2],payload_digest:params[3],status:'PROCESSED',appointment_id:params[4]});
   return {rows:[],rowCount:1};
  }
  if(s.startsWith('INSERT INTO keymark_events')){const type=(s.match(/'(INTEGRATION_INGESTED|OUTREACH_SENT)'/)||[])[1]||'EVENT';state.events.push({appointment_id:params[0],event_type:type});return {rows:[],rowCount:1}}
  if(s.startsWith('UPDATE keymark_connections SET last_success_at')){const c=state.connections.find(x=>x.id===params[0]);if(c){c.last_success_at=new Date().toISOString();c.last_error=null;c.status='ACTIVE'}return {rows:[],rowCount:1}}
  if(s.startsWith('UPDATE keymark_connections SET last_error')){const c=state.connections.find(x=>x.id===params[0]);if(c){c.status='ERROR';c.last_error=params[1]}return {rows:[],rowCount:1}}
  if(s.includes('FROM keymark_communications c JOIN keymark_appointments a')){const byId=new Map([...state.appointments.values()].map(a=>[a.id,a]));const rows=state.communications.filter(c=>['QUEUED','RETRY'].includes(c.status)&&c.attempt_count<4).map(c=>({...c,consent_status:byId.get(c.appointment_id)?.consent_status||'UNKNOWN'}));return {rows,rowCount:rows.length}}
  if(s.startsWith("UPDATE keymark_communications SET status='BLOCKED_CONSENT'")){const c=state.communications.find(x=>x.id===params[0]);if(c)c.status='BLOCKED_CONSENT';return {rows:[],rowCount:1}}
  if(s.startsWith("UPDATE keymark_communications SET status='SENT'")){const c=state.communications.find(x=>x.id===params[0]);if(c){c.status='SENT';c.provider_message_id=params[1]}return {rows:[],rowCount:1}}
  if(s.startsWith('UPDATE keymark_communications SET status=$2')){const c=state.communications.find(x=>x.id===params[0]);if(c){c.status=params[1];c.attempt_count=params[2]}return {rows:[],rowCount:1}}
  if(s.startsWith("UPDATE keymark_appointments SET outreach_status='CONTACTED'")){const a=[...state.appointments.values()].find(x=>x.id===params[0]);if(a&&['NOT_STARTED','SCHEDULED'].includes(a.outreach_status))a.outreach_status='CONTACTED';return {rows:[],rowCount:1}}
  return {rows:[],rowCount:0};
 }
 return {query,state};
}
function installFakeDb(fake){
 require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:fake.query,getPool:()=>null}};
 for(const rel of ['keymark-fhir-sync.cjs','keymark-outreach.cjs',path.join('_shared','keymark-outreach.cjs'),path.join('_shared','sms-consent.cjs')]){
  const resolved=require.resolve(path.join(functionsDir,rel));delete require.cache[resolved];
 }
}

test('FHIR poll ingests once, dedupes on re-poll, and lands contact details plus risk',async()=>{
 const fake=createFakeDb();installFakeDb(fake);
 fake.state.connections.push({id:'conn-1',organization_id:'org-1',facility_id:null,name:'Epic Sandbox',vendor:'EPIC',protocol:'FHIR',status:'ACTIVE',base_url:'https://ehr.example.com/fhir/r4',auth_type:'CLIENT_SECRET',last_success_at:null,configuration:{tokenUrl:'https://ehr.example.com/oauth2/token',clientId:'keymark',clientSecretEnvVar:'KEYMARK_PIPELINE_SECRET',lookaheadDays:30}});
 const previousFetch=global.fetch,previousSecret=process.env.KEYMARK_PIPELINE_SECRET;process.env.KEYMARK_PIPELINE_SECRET='simulated-secret';
 const start=new Date(Date.now()+72*3600000).toISOString();
 const appointment={resourceType:'Appointment',id:'appt-900',status:'booked',start,appointmentType:{coding:[{code:'FOLLOWUP',display:'Follow-up'}]},participant:[{actor:{reference:'Patient/pat-9'}},{actor:{reference:'Location/loc-1',display:'Cardiology'}}]};
 global.fetch=async url=>{
  const target=String(url);
  if(target.includes('/oauth2/token'))return {ok:true,json:async()=>({access_token:'sandbox-token'})};
  if(target.includes('/Patient/pat-9'))return {ok:true,json:async()=>({resourceType:'Patient',id:'pat-9',name:[{text:'Maria Example'}],telecom:[{system:'phone',value:'+13015550142'},{system:'email',value:'maria@example.com'}]})};
  if(target.includes('/Appointment'))return {ok:true,json:async()=>({resourceType:'Bundle',entry:[{resource:appointment}],link:[]})};
  throw new Error(`unexpected fetch ${target}`);
 };
 try{
  const {handler}=require(path.join(functionsDir,'keymark-fhir-sync.cjs'));
  const first=await handler(),firstBody=JSON.parse(first.body);
  assert.equal(first.statusCode,200);assert.equal(firstBody.processed,1);assert.equal(firstBody.ingested,1);
  assert.equal(fake.state.appointments.size,1);
  const row=[...fake.state.appointments.values()][0];
  assert.equal(row.patient_name,'Maria Example');assert.equal(row.patient_phone,'+13015550142');assert.equal(row.patient_email,'maria@example.com');
  assert.equal(row.arrival_risk_score,30);assert.equal(row.department,'Cardiology');
  assert.equal(fake.state.messages.length,1);
  assert.equal(fake.state.events.filter(e=>e.event_type==='INTEGRATION_INGESTED').length,1);
  const second=await handler(),secondBody=JSON.parse(second.body);
  assert.equal(secondBody.processed,1);assert.equal(secondBody.ingested,0);
  assert.equal(fake.state.appointments.size,1);assert.equal(fake.state.messages.length,1);
  assert.equal(fake.state.events.filter(e=>e.event_type==='INTEGRATION_INGESTED').length,1);
 }finally{global.fetch=previousFetch;if(previousSecret===undefined)delete process.env.KEYMARK_PIPELINE_SECRET;else process.env.KEYMARK_PIPELINE_SECRET=previousSecret}
});

test('outreach processor blocks unconsented sends and marks consented appointments contacted',async()=>{
 const fake=createFakeDb();installFakeDb(fake);
 fake.state.appointments.set('EPIC|A1',{id:'appt-a',consent_status:'GRANTED',outreach_status:'NOT_STARTED'});
 fake.state.appointments.set('EPIC|A2',{id:'appt-b',consent_status:'UNKNOWN',outreach_status:'NOT_STARTED'});
 fake.state.communications.push(
  {id:1,appointment_id:'appt-a',channel:'SMS',template_key:'APPOINTMENT_CONFIRMATION',destination:'+13015550142',consent_verified:true,status:'QUEUED',attempt_count:0},
  {id:2,appointment_id:'appt-b',channel:'SMS',template_key:'APPOINTMENT_CONFIRMATION',destination:'+13015550143',consent_verified:true,status:'QUEUED',attempt_count:0}
 );
 const previousFetch=global.fetch,previousEnv={sid:process.env.TWILIO_ACCOUNT_SID,token:process.env.TWILIO_AUTH_TOKEN,phone:process.env.TWILIO_PHONE_NUMBER};
 Object.assign(process.env,{TWILIO_ACCOUNT_SID:'AC-simulated',TWILIO_AUTH_TOKEN:'simulated-token',TWILIO_PHONE_NUMBER:'+12025550100'});
 let twilioCalls=0;
 global.fetch=async url=>{if(String(url).includes('api.twilio.com')){twilioCalls++;return {ok:true,json:async()=>({sid:'SMsimulated0000000000000000001'})}}throw new Error(`unexpected fetch ${url}`)};
 try{
  const {handler}=require(path.join(functionsDir,'keymark-outreach.cjs'));
  const res=await handler(),body=JSON.parse(res.body);
  assert.equal(res.statusCode,200);assert.deepEqual(body,{processed:2,sent:1,failed:0,blocked:1});
  assert.equal(fake.state.communications.find(c=>c.id===1).status,'SENT');
  assert.equal(fake.state.communications.find(c=>c.id===2).status,'BLOCKED_CONSENT');
  assert.equal(fake.state.appointments.get('EPIC|A1').outreach_status,'CONTACTED');
  assert.equal(fake.state.appointments.get('EPIC|A2').outreach_status,'NOT_STARTED');
  assert.equal(twilioCalls,1);
  assert.equal(fake.state.events.filter(e=>e.event_type==='OUTREACH_SENT').length,1);
 }finally{global.fetch=previousFetch;for(const [key,value] of Object.entries({TWILIO_ACCOUNT_SID:previousEnv.sid,TWILIO_AUTH_TOKEN:previousEnv.token,TWILIO_PHONE_NUMBER:previousEnv.phone})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});

test('a connection stuck in ERROR is retried by the poll and recovers to ACTIVE',async()=>{
 const fake=createFakeDb();installFakeDb(fake);
 // Mirrors the live Epic Sandbox state on 2026-11-01: the first poll failed
 // with a 403, the handler flipped the connection to ERROR, and (before this
 // fix) no later poll ever selected it again.
 fake.state.connections.push({id:'conn-err',organization_id:'org-1',facility_id:null,name:'Epic Sandbox',vendor:'EPIC',protocol:'FHIR',status:'ERROR',base_url:'https://ehr.example.com/fhir/r4',auth_type:'CLIENT_SECRET',last_success_at:new Date(Date.now()-3600000).toISOString(),last_error:'FHIR Appointment request failed (403)',configuration:{tokenUrl:'https://ehr.example.com/oauth2/token',clientId:'keymark',clientSecretEnvVar:'KEYMARK_PIPELINE_SECRET',lookaheadDays:30}});
 const previousFetch=global.fetch,previousSecret=process.env.KEYMARK_PIPELINE_SECRET;process.env.KEYMARK_PIPELINE_SECRET='simulated-secret';
 const start=new Date(Date.now()+72*3600000).toISOString();
 const appointment={resourceType:'Appointment',id:'appt-err-1',status:'booked',start,participant:[{actor:{reference:'Patient/pat-9'}},{actor:{reference:'Location/loc-1',display:'Cardiology'}}]};
 global.fetch=async url=>{
  const target=String(url);
  if(target.includes('/oauth2/token'))return {ok:true,json:async()=>({access_token:'sandbox-token'})};
  if(target.includes('/Patient/pat-9'))return {ok:true,json:async()=>({resourceType:'Patient',id:'pat-9',name:[{text:'Maria Example'}],telecom:[]})};
  if(target.includes('/Appointment'))return {ok:true,json:async()=>({resourceType:'Bundle',entry:[{resource:appointment}],link:[]})};
  throw new Error(`unexpected fetch ${target}`);
 };
 try{
  const {handler}=require(path.join(functionsDir,'keymark-fhir-sync.cjs'));
  const res=await handler(),body=JSON.parse(res.body);
  assert.equal(res.statusCode,200);assert.equal(body.processed,1);assert.equal(body.ingested,1);
  const conn=fake.state.connections.find(c=>c.id==='conn-err');
  assert.equal(conn.status,'ACTIVE');assert.equal(conn.last_error,null);
 }finally{global.fetch=previousFetch;if(previousSecret===undefined)delete process.env.KEYMARK_PIPELINE_SECRET;else process.env.KEYMARK_PIPELINE_SECRET=previousSecret}
});
