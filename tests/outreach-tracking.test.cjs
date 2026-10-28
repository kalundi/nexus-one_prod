const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const {createAutomation}=require('../netlify/functions/_shared/outreach-automation.cjs');
const {OUTREACH_CAMPAIGN:campaign}=require('../netlify/functions/_shared/outreach-content.cjs');
const recipients=require('../data/montgomery-tier-a-outreach-pilot.json').recipients.slice(0,4);
test('provider delivery, open and bounce events are distinct from send history and survive outages',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec('CREATE TABLE users(id uuid PRIMARY KEY)');
 let fail=false,current=new Date('2026-10-27T14:00:00Z');
 const automation=createAutomation({query:(...args)=>db.query(...args),recipients,now:()=>current,email:{isConfigured:()=>true,configuration:()=>({token:'fixture'})},fetcher:async url=>{
  if(fail)throw Error('Offline');const id=url.split('/').at(-2);
  if(id==='expired')return {ok:false,status:404,json:async()=>({ErrorCode:701})};
  return {ok:true,status:200,json:async()=>({MessageID:id,TrackOpens:true,MessageEvents:[{Type:id,ReceivedAt:current.toISOString()}]})};
 }});
 await automation.ensureSchema();
 for(let i=0;i<4;i++)await db.query("INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,stage,status,sent_at,provider_message_id) VALUES($1,$2,$3,'INITIAL','SENT',$4,$5)",[campaign.id,recipients[i].prospectId,recipients[i].email,current,['Delivered','Opened','Bounced',null][i]]);
 await db.query("INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,stage,status,sent_at,provider_message_id) VALUES($1,$2,$3,'FOLLOW_UP','SENT',$4,'Opened')",[campaign.id,recipients[0].prospectId,recipients[0].email,current]);
 let data=await automation.dashboard();assert.deepEqual(data.recipients.map(r=>r.deliveryStatus),['DELIVERED','OPENED','BOUNCED','UNAVAILABLE']);assert.equal(data.recipients[0].followUpDeliveryStatus,'OPENED');assert.equal(data.recipients[0].followUpDue,null);assert.equal(data.automation.initialSent,4);
 fail=true;current=new Date(+current+120000);data=await automation.dashboard();assert.match(data.automation.trackingError,/could not/);assert.equal(data.recipients[0].deliveryStatus,'DELIVERED');
 fail=false;await db.query("UPDATE outreach_deliveries SET provider_message_id='expired' WHERE email=$1",[recipients[3].email]);data=await automation.dashboard();assert.equal(data.recipients[3].deliveryStatus,'UNAVAILABLE');
});
