const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const {createAutomation,inSendWindow,launchWindowActive,followUpDate,nextWindow}=require('../netlify/functions/_shared/outreach-automation.cjs');
const {OUTREACH_CAMPAIGN:campaign,EMERGENCY_PLAN_ROUND:roundCampaign,WEDNESDAY_AGREEMENT_BROADCAST:wednesdayCampaign,outreachHtml}=require('../netlify/functions/_shared/outreach-content.cjs');
const {SIGNATURE_CARD_BASE64}=require('../netlify/functions/_shared/outreach-signature-image.cjs');
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
function buildBroadcast(db,{recipients,suppressed=[],now,campaignDef}){
 const calls=[];
 const email={configuration:()=>({token:'test-token',from:'fletcher@nexusmt.com',stream:'broadcasts'}),isConfigured:()=>true,sendEmail:async(...args)=>{calls.push(args);return {status:'sent',messageId:'bcast-'+calls.length,providerStatus:200};}};
 const automation=createAutomation({query:(...args)=>db.query(...args),email,recipients,now,graphToken:async()=>'test-graph-token',fetcher:async url=>{
  const data=url.includes('graph.microsoft.com')?{value:[]}:url.endsWith('/server')?{DeliveryType:'Live'}:url.endsWith('/suppressions/dump')?{Suppressions:suppressed.map(EmailAddress=>({EmailAddress,SuppressionReason:'ManualSuppression'}))}:{MessageStreamType:'Broadcasts',ArchivedAt:null};
  return {ok:true,status:200,json:async()=>data};
 },campaignDef});
 return {automation,calls};
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
test('emergency-plan round content: exact subject, header line, COMAR references and image signature with text fallback',()=>{
 assert.equal(roundCampaign.subject,'Your dedicated transportation partner — with an agreement on file for your emergency plan');
 const html=outreachHtml('Grace Lee','Example Facility',false,roundCampaign);
 assert.ok(html.includes('Nexus Medical Transit — your dedicated transportation partner'));
 assert.ok(html.includes('Hello Grace Lee,'));assert.ok(html.includes('COMAR 10.07.02.40'));assert.ok(html.includes('COMAR 10.07.14.47'));
 assert.ok(html.includes('mynexusride.com'));assert.ok(html.includes('(888) 760-4990'));
 assert.ok(html.includes('<img src="cid:nexus-signature-card"'));assert.ok(html.includes('alt="Fletcher Kalundi, Chief Accessibility Officer (CAO), Nexus Medical Transit LLC. Book a Ride: (888) 639-5766.'));
 assert.ok(html.includes('Chief Accessibility Officer (CAO)<br>'));assert.ok(!html.includes('WMATC Certificate No. 4152'));
 const pilotHtml=outreachHtml('Grace Lee','Example Facility');
 assert.ok(!pilotHtml.includes('cid:nexus-signature-card'));assert.ok(pilotHtml.includes('WMATC Certificate No. 4152'));
 assert.ok(Buffer.from(SIGNATURE_CARD_BASE64,'base64').length>100000);
});
test('signature card loads from the assets data file byte-identical to the approved card',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const assetPath=path.join(__dirname,'..','netlify','functions','_shared','assets','nexus-signature-card.b64');
 const fileBase64=fs.readFileSync(assetPath,'utf8').replace(/\s+/g,'');
 assert.equal(fileBase64,SIGNATURE_CARD_BASE64);
 const png=Buffer.from(SIGNATURE_CARD_BASE64,'base64');
 assert.equal(png.length,401745);
 assert.equal(crypto.createHash('sha256').update(png).digest('hex'),'a216a35c32308db5c4a01e317bf0f029cb14dca1363801ca65f655d5a98da33f');
 assert.ok(png.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])));
});
test('emergency-plan round sends to already-emailed prospects, excludes suppressed, attaches the signature card and never follows up',async t=>{
 const recipients=audience.recipients.slice(0,5),monday='2026-11-16T14:30:00.000Z';
 assert.equal(inSendWindow(new Date(monday)),false);assert.equal(inSendWindow(new Date(monday),roundCampaign),true);
 const {db,seed,calls:pilotCalls}=await setup(t,{recipients,date:monday,suppressed:[recipients[2].email]});
 for(const r of recipients)await seed(r);
 const calls=[];let current=new Date(monday);
 const email={configuration:()=>({token:'test-token',from:'fletcher@nexusmt.com',stream:'broadcasts'}),isConfigured:()=>true,sendEmail:async(...args)=>{calls.push(args);return {status:'sent',messageId:'round-'+calls.length,providerStatus:200};}};
 const round=createAutomation({query:(...args)=>db.query(...args),email,recipients,now:()=>current,graphToken:async()=>'test-graph-token',fetcher:async url=>{
  const data=url.includes('graph.microsoft.com')?{value:[]}:url.endsWith('/server')?{DeliveryType:'Live'}:url.endsWith('/suppressions/dump')?{Suppressions:[{EmailAddress:recipients[2].email,SuppressionReason:'ManualSuppression'}]}:{MessageStreamType:'Broadcasts',ArchivedAt:null};
  return {ok:true,status:200,json:async()=>data};
 },campaignDef:roundCampaign});
 await round.ensureSchema();
 // startEnabled: the owner-approved round runs without a separate enable step.
 for(let i=0;i<6;i++)await round.run();
 assert.deepEqual(calls.map(c=>c[0]).sort(),recipients.filter(r=>r!==recipients[2]).map(r=>r.email).sort());
 assert.ok(calls.every(c=>c[1]===roundCampaign.subject));
 assert.ok(calls.every(c=>c[2].includes('cid:nexus-signature-card')&&c[2].includes('COMAR 10.07.02.40')));
 assert.ok(calls.every(c=>c[3].broadcast===true&&c[3].attachments?.length===1&&c[3].attachments[0].contentId==='cid:nexus-signature-card'&&c[3].attachments[0].content===SIGNATURE_CARD_BASE64));
 assert.equal(pilotCalls.length,0);
 const roundState=await round.dashboard();assert.equal(roundState.automation.initialSent,4);assert.equal(roundState.automation.followUpsSent,0);assert.equal(roundState.followUpPreviewHtml,null);
 current=new Date('2026-11-30T14:30:00.000Z');await round.run();await round.run();assert.equal(calls.length,4);
});
test('emergency-plan round launch sends the whole broadcast immediately outside the window, then normal rules resume',async t=>{
 const recipients=audience.recipients.slice(0,30),mondayAfternoon='2026-11-16T20:30:00.000Z';// Monday 3:30 PM Eastern
 assert.equal(inSendWindow(new Date(mondayAfternoon),roundCampaign),false);
 assert.equal(launchWindowActive(new Date(mondayAfternoon),roundCampaign),true);
 assert.equal(launchWindowActive(new Date('2026-11-18T20:30:00.000Z'),roundCampaign),false);
 const {db}=await setup(t,{recipients,date:mondayAfternoon});
 let current=new Date(mondayAfternoon);
 const {automation,calls}=buildBroadcast(db,{recipients,now:()=>current,campaignDef:roundCampaign});
 await automation.ensureSchema();
 await automation.run();assert.equal(calls.length,15);// one launch batch, outside the window
 await automation.run();assert.equal(calls.length,30);// second batch passes the usual 25/day cap: the launch lifts it
 assert.ok(calls.every(c=>c[1]===roundCampaign.subject));
 await automation.run();assert.equal(calls.length,30);// launch complete: nothing left, no more sends that day
 const state=await automation.dashboard();assert.equal(state.automation.initialSent,30);
});
test('after the launch dates pass, an unsent round recipient waits for the window and the one-per-run pace',async t=>{
 const recipients=audience.recipients.slice(0,2),wednesdayAfternoon='2026-11-18T20:30:00.000Z';// Wednesday 3:30 PM Eastern, launch over
 const {db}=await setup(t,{recipients,date:wednesdayAfternoon});
 let current=new Date(wednesdayAfternoon);
 const {automation,calls}=buildBroadcast(db,{recipients,now:()=>current,campaignDef:roundCampaign});
 await automation.ensureSchema();
 const result=await automation.run();assert.equal(calls.length,0);assert.match(result.reason,/Outside the send window/);
 current=new Date('2026-11-19T14:30:00.000Z');// Thursday 9:30 AM Eastern, inside the window
 await automation.run();assert.equal(calls.length,1);
 await automation.run();assert.equal(calls.length,2);
 await automation.run();assert.equal(calls.length,2);
});
test('Wednesday follow-up broadcast content: exact subject, header line, COMAR references and image signature',()=>{
 assert.equal(wednesdayCampaign.subject,'Still time to get your transportation agreement on file');
 assert.deepEqual(wednesdayCampaign.sendDates,['2026-11-18']);
 assert.equal(wednesdayCampaign.excludeRepliesFromCampaignId,roundCampaign.id);
 assert.equal(inSendWindow(new Date('2026-11-18T14:30:00.000Z'),wednesdayCampaign),true);// Wed Nov 18, 9:30 AM Eastern
 assert.equal(inSendWindow(new Date('2026-11-17T14:30:00.000Z'),wednesdayCampaign),false);// Tuesday: too early
 assert.equal(inSendWindow(new Date('2026-11-25T14:30:00.000Z'),wednesdayCampaign),false);// the next Wednesday is not a send date
 const html=outreachHtml('Grace Lee','Example Facility',false,wednesdayCampaign);
 assert.ok(html.includes('Nexus Medical Transit — your dedicated transportation partner'));
 assert.ok(html.includes('Hello Grace Lee,'));assert.ok(html.includes('short follow-up to my note on Monday'));
 assert.ok(html.includes('COMAR 10.07.02.40 / COMAR 10.07.14.47'));assert.ok(html.includes('OHCQ reminded facilities of this in July'));
 assert.ok(html.includes('dedicated transportation partner'));assert.ok(html.includes('(888) 639-5766'));assert.ok(html.includes('mynexusride.com'));
 assert.ok(html.includes('No volume commitment, no exclusivity.'));
 assert.ok(html.includes('<img src="cid:nexus-signature-card"'));assert.ok(html.includes('alt="Fletcher Kalundi, Chief Accessibility Officer (CAO), Nexus Medical Transit LLC. Book a Ride: (888) 639-5766.'));
});
test('Wednesday broadcast goes only on Nov 18 and excludes suppressed addresses and emergency-round repliers',async t=>{
 const recipients=audience.recipients.slice(0,5),tuesday='2026-11-17T14:30:00.000Z';
 const {db}=await setup(t,{recipients,date:tuesday});
 // Emergency-plan round history: recipient 0 replied, recipient 1 received it silently.
 await db.query(`INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,stage,status,sent_at,replied_at) VALUES($1,$2,$3,'INITIAL','SENT','2026-11-16T20:31:00Z','2026-11-17T15:00:00Z')`,[roundCampaign.id,recipients[0].prospectId,recipients[0].email]);
 await db.query(`INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,stage,status,sent_at) VALUES($1,$2,$3,'INITIAL','SENT','2026-11-16T20:32:00Z')`,[roundCampaign.id,recipients[1].prospectId,recipients[1].email]);
 let current=new Date(tuesday);
 const {automation,calls}=buildBroadcast(db,{recipients,suppressed:[recipients[2].email],now:()=>current,campaignDef:wednesdayCampaign});
 await automation.ensureSchema();
 await automation.run();assert.equal(calls.length,0);// Tuesday: the single send date has not arrived
 current=new Date('2026-11-18T14:30:00.000Z');// Wednesday 9:30 AM Eastern
 await automation.run();
 assert.deepEqual(calls.map(c=>c[0]).sort(),[recipients[1].email,recipients[3].email,recipients[4].email].sort());
 assert.ok(calls.every(c=>c[1]===wednesdayCampaign.subject));
 assert.ok(calls.every(c=>c[2].includes('cid:nexus-signature-card')&&c[3].attachments?.[0]?.contentId==='cid:nexus-signature-card'));
 await automation.run();assert.equal(calls.length,3);
 const state=await automation.dashboard();assert.equal(state.automation.initialSent,3);assert.equal(state.followUpPreviewHtml,null);
 current=new Date('2026-11-19T14:30:00.000Z');await automation.run();assert.equal(calls.length,3);// no second day of sending
});
test('follow-ups wait for five business days and do not loop after the one follow-up',async t=>{
 const recipients=audience.recipients.slice(0,1),{automation,calls,seed,setDate}=await setup(t,{recipients});await seed(recipients[0],'2026-10-22T14:00:00Z');await automation.setEnabled(true);
 await automation.run();assert.equal(calls.length,0);setDate('2026-10-29T13:30:00Z');await automation.run();assert.equal(calls.length,1);
 setDate('2026-11-10T14:30:00Z');await automation.run();assert.equal(calls.length,1);
});
