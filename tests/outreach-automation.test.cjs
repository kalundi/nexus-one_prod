const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const {createAutomation,inSendWindow,followUpDate,nextWindow}=require('../netlify/functions/_shared/outreach-automation.cjs');
const {OUTREACH_CAMPAIGN:campaign,outreachHtml}=require('../netlify/functions/_shared/outreach-content.cjs');
const audience=require('../data/montgomery-tier-a-outreach-pilot.json');
const day='2026-10-27T13:30:00.000Z';
async function setup(t,{date=day,recipients=audience.recipients,messages=[],suppressed=[],configured=true,send,query:wrap}={}){
 const db=new PGlite();t.after(()=>db.close());await db.exec('CREATE TABLE users(id uuid PRIMARY KEY);');
 const calls=[],requests=[];let current=new Date(date);
 const email={configuration:()=>({token:configured?'test-token':'',from:'fletcher@nexusmt.com',stream:configured?'broadcasts':''}),isConfigured:()=>configured,sendEmail:async(...args)=>{calls.push(args);return send?send(...args):{status:'sent',messageId:'test-'+calls.length,providerStatus:200};}};
 const query=wrap?wrap((...args)=>db.query(...args)):(...args)=>db.query(...args);
 const automation=createAutomation({query,email,recipients,now:()=>current,graphToken:async()=>'test-graph-token',fetcher:async url=>{
  requests.push(url);const data=url.includes('graph.microsoft.com')?{value:messages}:url.endsWith('/server')?{DeliveryType:'Live'}:url.endsWith('/suppressions/dump')?{Suppressions:suppressed.map(EmailAddress=>({EmailAddress,SuppressionReason:'ManualSuppression'}))}:{MessageStreamType:'Broadcasts',ArchivedAt:null};
  return {ok:true,status:200,json:async()=>data};
 }});
 await automation.ensureSchema();
 const seed=async(recipient,sentAt='2026-10-19T14:00:00Z')=>db.query(`INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,stage,status,sent_at) VALUES($1,$2,$3,'INITIAL','SENT',$4)`,[campaign.id,recipient.prospectId,recipient.email,sentAt]);
 return {db,automation,calls,requests,seed,setDate:date=>{current=new Date(date);}};
}
test('all 262 eligible contacts are unique and retain the original 25 recipient records',()=>{
 assert.equal(audience.recipients.length,262);assert.equal(audience.eligibleCount,262);assert.equal(new Set(audience.recipients.map(r=>r.email)).size,262);
 assert.ok(audience.recipients.every(r=>r.tier==='A'&&r.county==='Montgomery'&&!r.optOut));assert.equal(audience.recipients[0].prospectId,'LON-15030');
 assert.ok(outreachHtml('<unsafe>','A & B',true).includes('&lt;unsafe&gt;'));assert.ok(outreachHtml('Test','Example').includes('888-639-5766'));
});
test('Eastern window follows daylight saving changes and five business days skip weekends',()=>{
 assert.equal(inSendWindow(new Date(day)),true);assert.equal(inSendWindow(new Date('2026-10-27T09:30:00Z')),false);
 assert.equal(inSendWindow(new Date('2026-11-03T14:30:00Z')),true);assert.equal(inSendWindow(new Date('2026-11-03T13:30:00Z')),false);
 assert.equal(inSendWindow(new Date('2026-10-30T13:30:00Z')),false);
 assert.equal(followUpDate('2026-10-23T14:00:00Z'),'2026-10-30');assert.equal(followUpDate('2026-10-27T02:00:00Z'),'2026-11-02');
 assert.equal(nextWindow(new Date('2026-10-30T14:00:00Z')),'2026-11-03T14:30:00.000Z');
});
test('scheduler preserves 25 historical sends, sends due follow-ups once and caps each daily stage at 25',async t=>{
 const {automation,seed,calls,db}=await setup(t);for(const recipient of audience.recipients.slice(0,25))await seed(recipient);
 await automation.setEnabled(true);for(let i=0;i<65;i++)await automation.run();
 assert.equal(calls.length,50);assert.equal(calls.filter(c=>c[1].startsWith('Re: ')).length,25);
 assert.equal(calls.filter(c=>!c[1].startsWith('Re: ')).length,25);
 const historical=new Set(audience.recipients.slice(0,25).map(r=>r.email));assert.ok(calls.filter(c=>!c[1].startsWith('Re: ')).every(c=>!historical.has(c[0])));
 const dashboard=await automation.dashboard();assert.equal(dashboard.recipients.length,262);assert.equal(dashboard.automation.initialSent,50);assert.equal(dashboard.automation.followUpsSent,25);
 assert.ok(calls.every(c=>c[3].broadcast&&c[3].replyTo===campaign.replyTo));
 assert.equal((await db.query("SELECT count(*)::int AS n FROM outreach_deliveries WHERE status='SENDING'")).rows[0].n,0);
});
test('responses, provider suppressions and unsubscribe replies stop the next email',async t=>{
 const recipients=audience.recipients.slice(0,5),messages=[
  {from:{emailAddress:{address:recipients[0].email}},subject:'Re: '+campaign.subject,receivedDateTime:'2026-10-26T17:00:00Z',bodyPreview:'Please call our office.'},
  {from:{emailAddress:{address:recipients[1].email}},subject:'Unsubscribe',receivedDateTime:'2026-10-26T18:00:00Z',bodyPreview:'Unsubscribe. Remove me.'},
  {from:{emailAddress:{address:recipients[4].email}},subject:'Unrelated message',receivedDateTime:'2026-10-26T18:00:00Z',bodyPreview:'Hello'}
 ];
 const {automation,calls,seed,db}=await setup(t,{recipients,messages,suppressed:[recipients[2].email]});for(const r of recipients)await seed(r);
 await automation.setEnabled(true);await automation.run();await automation.run();assert.deepEqual(calls.map(c=>c[0]),[recipients[3].email,recipients[4].email]);
 const state=await automation.dashboard();assert.equal(state.automation.replied,1);assert.equal(state.automation.suppressed,2);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM outreach_suppressions')).rows[0].n,2);
 await automation.run();assert.equal(calls.length,2);
});
test('pause and out-of-window checks never contact the providers; missing config blocks with a visible error',async t=>{
 const {automation,calls,requests,setDate}=await setup(t,{configured:false});await automation.run();assert.equal(requests.length,0);
 await automation.setEnabled(true);setDate('2026-10-27T12:00:00Z');await automation.run();assert.equal(requests.length,0);
 setDate(day);const result=await automation.run();assert.equal(result.blocked,true);assert.match(result.error,/POSTMARK_SERVER_TOKEN/);assert.equal(calls.length,0);assert.equal((await automation.dashboard()).campaign.status,'BLOCKED');
});
test('overlapping workers and a permanent provider failure cannot resend or advance the batch',async t=>{
 const {automation,db,calls}=await setup(t,{send:()=>{throw Object.assign(Error('Rejected'),{providerStatus:422,providerCode:412});}});
 await automation.setEnabled(true);
 await db.query('UPDATE outreach_automation SET lease_until=$1',[new Date(+new Date(day)+60000).toISOString()]);assert.match((await automation.run()).reason,/Another/);assert.equal(calls.length,0);
 await db.query('UPDATE outreach_automation SET lease_until=NULL');await Promise.all([automation.run(),automation.run()]);assert.equal(calls.length,1);
 await automation.run();assert.equal(calls.length,1);const state=await automation.dashboard();assert.equal(state.campaign.status,'BLOCKED');assert.match(state.automation.error,/approval/);
});
test('uncertain delivery or failed persistence retains the unique claim and is not resent',async t=>{
 let fail=true;const recipients=audience.recipients.slice(0,1);
 const {automation,calls,db}=await setup(t,{recipients,query:base=>async(sql,params)=>{if(fail&&sql.startsWith("UPDATE outreach_deliveries SET status='SENT'")){fail=false;throw Error('Database interrupted');}return base(sql,params);}});
 await automation.setEnabled(true);await automation.run();await automation.run();assert.equal(calls.length,1);assert.equal((await db.query('SELECT status FROM outreach_deliveries')).rows[0].status,'SENDING');
});
test('follow-ups wait for five business days and do not loop after the one follow-up',async t=>{
 const recipients=audience.recipients.slice(0,1),{automation,calls,seed,setDate}=await setup(t,{recipients});await seed(recipients[0],'2026-10-22T14:00:00Z');await automation.setEnabled(true);
 await automation.run();assert.equal(calls.length,0);setDate('2026-10-29T13:30:00Z');await automation.run();assert.equal(calls.length,1);
 setDate('2026-11-10T14:30:00Z');await automation.run();assert.equal(calls.length,1);
});
