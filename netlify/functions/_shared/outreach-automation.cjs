const Email=require('./email.cjs');
const Graph=require('./ms-graph.cjs');
const audience=require('../../../data/montgomery-tier-a-outreach-pilot.json');
const {OUTREACH_CAMPAIGN:campaign,outreachHtml}=require('./outreach-content.cjs');
const {randomUUID}=require('node:crypto');
const normalize=value=>String(value??'').trim().toLowerCase();
const clock=new Intl.DateTimeFormat('en-CA',{timeZone:campaign.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'});
function localClock(date){const p=Object.fromEntries(clock.formatToParts(date).map(p=>[p.type,p.value]));return {date:`${p.year}-${p.month}-${p.day}`,day:p.weekday,minutes:Number(p.hour)*60+Number(p.minute)};}
function inSendWindow(date){const p=localClock(date);return ['Tue','Wed','Thu'].includes(p.day)&&p.minutes>=570&&p.minutes<=630;}
function followUpDate(sentAt){const p=localClock(new Date(sentAt)),date=new Date(p.date+'T12:00:00Z');let days=0;while(days<campaign.followUpBusinessDays){date.setUTCDate(date.getUTCDate()+1);if(![0,6].includes(date.getUTCDay()))days++;}return date.toISOString().slice(0,10);}
function nextWindow(date){for(let i=0;i<8*24*60;i++){const next=new Date(Math.ceil((+date+1)/60000)*60000+i*60000);if(inSendWindow(next))return next.toISOString();}return null;}
function replyMatches(message,initial){return normalize(message.from?.emailAddress?.address)===normalize(initial.email)&&new Date(message.receivedDateTime)>=new Date(initial.sent_at)&&normalize(message.subject).includes(normalize(campaign.subject));}

function createAutomation({query,email=Email,fetcher=fetch,graphToken,recipients=audience.recipients,now=()=>new Date()}={}){
 if(!graphToken)graphToken=async()=>{
  const credentials=Graph.requireGraphCredentials();
  const response=await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`,{method:'POST',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.clientId,client_secret:credentials.clientSecret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'})});
  const data=await response.json();if(!response.ok||!data.access_token)throw Error('Microsoft reply mailbox authentication failed.');return data.access_token;
 };
 let schema;
 function ensureSchema(){return schema||(schema=(async()=>{
  await query(`CREATE TABLE IF NOT EXISTS outreach_suppressions(email text PRIMARY KEY,reason text,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id) ON DELETE SET NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS outreach_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id text NOT NULL,prospect_id text NOT NULL,email text NOT NULL,facility text,contact_name text,stage text NOT NULL DEFAULT 'INITIAL',status text NOT NULL,provider_status integer,error_message text,sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(campaign_id,email,stage))`);
  await query('ALTER TABLE outreach_deliveries ADD COLUMN IF NOT EXISTS claimed_at timestamptz');
  await query('ALTER TABLE outreach_deliveries ADD COLUMN IF NOT EXISTS provider_message_id text');
  await query('ALTER TABLE outreach_deliveries ADD COLUMN IF NOT EXISTS replied_at timestamptz');
  await query('ALTER TABLE outreach_deliveries ADD COLUMN IF NOT EXISTS tracking jsonb');
  await query('ALTER TABLE outreach_deliveries ADD COLUMN IF NOT EXISTS tracking_checked_at timestamptz');
  await query(`CREATE INDEX IF NOT EXISTS idx_outreach_delivery_stage ON outreach_deliveries(campaign_id,stage,status)`);
  await query(`CREATE TABLE IF NOT EXISTS outreach_automation(campaign_id text PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,last_run_at timestamptz,reply_checked_at timestamptz,connections_checked_at timestamptz,last_error text,delivery_blocked boolean NOT NULL DEFAULT false,lease_id uuid,lease_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now())`);
  for(const table of ['outreach_suppressions','outreach_deliveries','outreach_automation']){
   await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
   await query(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
   await query(`REVOKE ALL ON TABLE ${table} FROM anon,authenticated`).catch(()=>{});
  }
  await query('INSERT INTO outreach_automation(campaign_id) VALUES($1) ON CONFLICT DO NOTHING',[campaign.id]);
 })().catch(error=>{schema=null;throw error;}));}
 async function state(){return (await query('SELECT * FROM outreach_automation WHERE campaign_id=$1',[campaign.id])).rows[0];}
 async function postmark(path){
  const config=email.configuration({broadcast:true});
  const response=await fetcher('https://api.postmarkapp.com'+path,{signal:AbortSignal.timeout(5000),headers:{'X-Postmark-Server-Token':config.token,Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(`Postmark connection rejected (HTTP ${response.status}). Check POSTMARK_SERVER_TOKEN and the Broadcast stream.`);
  return data;
 }
 async function graph(url,token){
  const target=new URL(url);if(target.origin!=='https://graph.microsoft.com'||!target.pathname.startsWith('/v1.0/users/'))throw Error('Invalid reply mailbox continuation');
  const response=await fetcher(url,{signal:AbortSignal.timeout(5000),headers:{authorization:`Bearer ${token}`}});
  if(!response.ok)throw Error(`Reply mailbox could not be checked (HTTP ${response.status}). Follow-ups are held.`);
  return response.json();
 }
 async function syncReplies(){
  const deadline=Date.now()+12000,token=await graphToken();
  const initial=(await query(`SELECT email,sent_at FROM outreach_deliveries WHERE campaign_id=$1 AND stage='INITIAL' AND status='SENT' AND sent_at IS NOT NULL AND replied_at IS NULL`,[campaign.id])).rows;
  const automation=await state(),started=now();
  const oldest=initial.reduce((value,row)=>Math.min(value,+new Date(row.sent_at)),+started);
  const since=new Date(automation.reply_checked_at?+new Date(automation.reply_checked_at)-300000:oldest-60000);
  const params=new URLSearchParams({$top:'100',$select:'from,subject,receivedDateTime,bodyPreview',$filter:`receivedDateTime ge ${since.toISOString()}`,$orderby:'receivedDateTime asc'});
  let url=`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(campaign.replyTo)}/messages?${params}`;
  const byEmail=new Map(initial.map(row=>[normalize(row.email),row]));let pages=0;
  while(url){
   if(++pages>20||Date.now()>deadline)throw Error('Reply scan needs more time. Automatic sends are held until the mailbox scan completes.');
   const data=await graph(url,token);if(!Array.isArray(data.value))throw Error('Reply mailbox returned an invalid response');
   for(const message of data.value){
    const address=normalize(message.from?.emailAddress?.address),sent=byEmail.get(address);
    if(!sent||!(new Date(message.receivedDateTime)>=new Date(sent.sent_at)))continue;
    // A reply stops this sequence. Explicit opt-outs also stop other outreach,
    // including a contact who changes the reply subject to "Unsubscribe".
    const leading=String(message.bodyPreview||'').split(/\n(?:From:|On .+wrote:|Hello )/i)[0].slice(0,600);
    const optOut=/\b(unsubscribe|remove me|do not (?:email|contact)|stop (?:emailing|contacting))\b/i.test(leading)||/^(?:re:\s*)?(unsubscribe|remove me|stop emailing)\b/i.test(String(message.subject||''));
    if(!replyMatches(message,sent)&&!optOut)continue;
    await query(`UPDATE outreach_deliveries SET replied_at=COALESCE(replied_at,$3) WHERE campaign_id=$1 AND lower(email)=$2 AND stage='INITIAL'`,[campaign.id,address,message.receivedDateTime]);
    if(optOut)await suppress(address,'Recipient requested no further email');
   }
   url=data['@odata.nextLink']||null;
  }
  await query('UPDATE outreach_automation SET reply_checked_at=$2 WHERE campaign_id=$1',[campaign.id,started.toISOString()]);
 }
 async function suppress(address,reason){await query('INSERT INTO outreach_suppressions(email,reason) VALUES($1,$2) ON CONFLICT(email) DO NOTHING',[normalize(address),reason]);}
 async function connections(){
  const config=email.configuration({broadcast:true});
  if(!config.token)throw Error('POSTMARK_SERVER_TOKEN is missing.');
  if(!config.from)throw Error('EMAIL_FROM is missing.');
  if(!config.stream)throw Error('POSTMARK_BROADCAST_MESSAGE_STREAM is missing.');
  const [server,stream,dump]=await Promise.all([postmark('/server'),postmark('/message-streams/'+encodeURIComponent(config.stream)),postmark(`/message-streams/${encodeURIComponent(config.stream)}/suppressions/dump`)]);
  if(server.DeliveryType!=='Live')throw Error('Postmark is in Sandbox mode. Live outreach is held.');
  if(stream.MessageStreamType!=='Broadcasts'||stream.ArchivedAt)throw Error('The configured Postmark stream must be an active Broadcast stream.');
  if(!Array.isArray(dump.Suppressions))throw Error('Postmark suppressions could not be checked.');
  const selected=new Set(recipients.map(r=>normalize(r.email)));
  for(const item of dump.Suppressions)if(selected.has(normalize(item.EmailAddress)))await suppress(item.EmailAddress,'Postmark '+(item.SuppressionReason||'suppression'));
  try{await syncReplies();}catch(error){if(/Reply|reply/.test(error.message))throw error;throw Error('Microsoft reply mailbox connection failed. Automatic sends are held.');}
  await query('UPDATE outreach_automation SET connections_checked_at=$2 WHERE campaign_id=$1',[campaign.id,now().toISOString()]);
 }
 async function checkConnections(){
  await ensureSchema();
  try{await connections();await query('UPDATE outreach_automation SET last_error=NULL,delivery_blocked=false WHERE campaign_id=$1',[campaign.id]);return {ok:true,checkedAt:now().toISOString()};}
  catch(error){await query('UPDATE outreach_automation SET last_error=$2 WHERE campaign_id=$1',[campaign.id,error.message]);return {ok:false,error:error.message};}
 }
 async function setEnabled(enabled){await ensureSchema();await query('UPDATE outreach_automation SET enabled=$2,updated_at=$3 WHERE campaign_id=$1',[campaign.id,enabled,now().toISOString()]);}
 async function syncTracking(){
  if(!email.isConfigured({broadcast:true}))return null;
  // Rotate bounded batches so a refresh cannot exhaust the function timeout.
  const pending=(await query(`SELECT id,provider_message_id FROM outreach_deliveries WHERE campaign_id=$1 AND status='SENT' AND provider_message_id IS NOT NULL AND (tracking_checked_at IS NULL OR tracking_checked_at<$2) ORDER BY tracking_checked_at ASC NULLS FIRST LIMIT 8`,[campaign.id,new Date(+now()-60000).toISOString()])).rows;
  let failed=false;
  await Promise.all(pending.map(async row=>{
   try{
    const config=email.configuration({broadcast:true});
    const response=await fetcher('https://api.postmarkapp.com/messages/outbound/'+encodeURIComponent(row.provider_message_id)+'/details',{signal:AbortSignal.timeout(5000),headers:{'X-Postmark-Server-Token':config.token,Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok){
     if(response.status===404||data.ErrorCode===701){await query('UPDATE outreach_deliveries SET tracking=COALESCE(tracking,$2::jsonb),tracking_checked_at=$3 WHERE id=$1',[row.id,JSON.stringify({status:'UNAVAILABLE'}),now().toISOString()]);return;}
     throw Error('Tracking unavailable');
    }
    if(data.MessageID!==row.provider_message_id||!Array.isArray(data.MessageEvents))throw Error('Invalid tracking response');
    const event=type=>data.MessageEvents.find(e=>e.Type===type);
    const tracking={status:event('Bounced')?'BOUNCED':event('Opened')?'OPENED':event('Delivered')?'DELIVERED':'SENT',deliveredAt:event('Delivered')?.ReceivedAt||null,openedAt:event('Opened')?.ReceivedAt||null,bouncedAt:event('Bounced')?.ReceivedAt||null,openTracking:data.TrackOpens===true};
    await query('UPDATE outreach_deliveries SET tracking=$2::jsonb,tracking_checked_at=$3 WHERE id=$1',[row.id,JSON.stringify(tracking),now().toISOString()]);
   }catch{failed=true;await query('UPDATE outreach_deliveries SET tracking_checked_at=$2 WHERE id=$1',[row.id,now().toISOString()]);}
  }));
  return failed?'Some Postmark delivery updates could not be refreshed. Previously confirmed statuses are retained.':null;
 }
 async function dashboard(){
  await ensureSchema();const trackingError=await syncTracking();const automation=await state(),deliveries=(await query('SELECT * FROM outreach_deliveries WHERE campaign_id=$1',[campaign.id])).rows;
  const suppressed=new Set((await query('SELECT lower(email) AS email FROM outreach_suppressions')).rows.map(r=>r.email));
  const index=new Map(deliveries.map(row=>[normalize(row.email)+'/'+row.stage,row]));
  const rows=recipients.map((recipient,i)=>{
   const initial=index.get(normalize(recipient.email)+'/INITIAL'),follow=index.get(normalize(recipient.email)+'/FOLLOW_UP');
   const trackingStatus=row=>row?.tracking?.status||(row?.status==='SENT'?(row.provider_message_id?'PENDING':'UNAVAILABLE'):null);
   return {...recipient,sequence:i+1,status:suppressed.has(normalize(recipient.email))?'SUPPRESSED':initial?.replied_at?'REPLIED':initial?.status||'READY',sentAt:initial?.sent_at||null,deliveryStatus:trackingStatus(initial),deliveryTracking:initial?.tracking||null,trackingCheckedAt:initial?.tracking_checked_at||null,followUpDeliveryStatus:trackingStatus(follow),followUpSentAt:follow?.sent_at||null,followUpStatus:suppressed.has(normalize(recipient.email))?'SUPPRESSED':initial?.replied_at?'STOPPED':follow?.status||'PENDING',followUpDue:initial?.sent_at&&!follow&&!initial.replied_at&&!suppressed.has(normalize(recipient.email))?followUpDate(initial.sent_at):null,error:follow?.error_message||initial?.error_message||null};
  });
  const configured=email.isConfigured({broadcast:true}),blocked=!configured||automation.last_error||automation.delivery_blocked;
  const status=!automation.enabled?'PAUSED':blocked?'BLOCKED':automation.connections_checked_at?'AUTOMATIC':'CHECKING CONNECTIONS';
  return {campaign:{...campaign,status,sendEnabled:automation.enabled},selection:audience.selection,eligibleCount:audience.eligibleCount,recipients:rows,previewHtml:outreachHtml(rows[0]?.contactName,rows[0]?.facility),followUpPreviewHtml:outreachHtml(rows[0]?.contactName,rows[0]?.facility,true),delivery:{emailProvider:'Postmark',postmark:configured?'configured':'not-configured',sender:campaign.fromEmail},automation:{trackingError,enabled:automation.enabled,lastRunAt:automation.last_run_at,replyCheckedAt:automation.reply_checked_at,connectionsCheckedAt:automation.connections_checked_at,error:automation.last_error||(!configured?'Configure a valid Postmark token and Broadcast stream.':null),nextCheckAt:nextWindow(now()),dailyInitialLimit:25,dailyFollowUpLimit:25,followUpsPerProspect:1,initialSent:deliveries.filter(r=>r.stage==='INITIAL'&&r.status==='SENT').length,followUpsSent:deliveries.filter(r=>r.stage==='FOLLOW_UP'&&r.status==='SENT').length,replied:rows.filter(r=>r.status==='REPLIED').length,suppressed:rows.filter(r=>r.status==='SUPPRESSED').length}};
 }
 async function run(){
  const wallStarted=Date.now();await ensureSchema();let automation=await state();if(!automation.enabled)return {processed:0,reason:'Automatic outreach is paused'};
  if(!inSendWindow(now()))return {processed:0,reason:'Outside Tuesday–Thursday 9:30–10:30 AM Eastern'};
  const lease=randomUUID(),started=now();
  const claimed=await query(`UPDATE outreach_automation SET lease_id=$2,lease_until=$3,last_run_at=$4 WHERE campaign_id=$1 AND enabled=true AND (lease_until IS NULL OR lease_until<$4) RETURNING campaign_id`,[campaign.id,lease,new Date(+started+120000).toISOString(),started.toISOString()]);
  if(!claimed.rows.length)return {processed:0,reason:'Another outreach worker is running'};
  let processed=0,sent=0;
  try{
   if(automation.delivery_blocked)throw Error(automation.last_error||'Email delivery is held. Check connections before resuming.');
   await connections();
   await query('UPDATE outreach_automation SET last_error=NULL WHERE campaign_id=$1',[campaign.id]);
   const deliveries=(await query('SELECT * FROM outreach_deliveries WHERE campaign_id=$1',[campaign.id])).rows;
   const index=new Map(deliveries.map(row=>[normalize(row.email)+'/'+row.stage,row]));
   const today=localClock(now()).date,used={INITIAL:0,FOLLOW_UP:0};
   for(const row of deliveries){const attempted=row.claimed_at||row.sent_at;if(attempted&&localClock(new Date(attempted)).date===today&&row.stage in used)used[row.stage]++;}
   const tasks=[];
   for(const recipient of recipients){
    const address=normalize(recipient.email),initial=index.get(address+'/INITIAL');
    if(initial?.status==='SENT'&&!initial.replied_at&&initial.sent_at&&followUpDate(initial.sent_at)<=today&&!index.has(address+'/FOLLOW_UP'))tasks.push({recipient,stage:'FOLLOW_UP'});
   }
   for(const recipient of recipients)if(!index.has(normalize(recipient.email)+'/INITIAL'))tasks.push({recipient,stage:'INITIAL'});
   for(const {recipient,stage} of tasks){
    // Scheduled functions have a 30-second ceiling. One send per minute leaves
    // time to record provider acceptance, and 61 ticks cover both daily quotas.
    if(processed>=1||Date.now()-wallStarted>9000)break;
    if(used[stage]>=25)continue;
    // Check pause, suppression and replies again immediately before claiming.
    if(!inSendWindow(now())||!(await state()).enabled)break;
    const address=normalize(recipient.email);if(recipient.optOut===true)continue;
    const stopped=await query(`SELECT 1 FROM outreach_suppressions WHERE lower(email)=$1 UNION ALL SELECT 1 FROM outreach_deliveries WHERE campaign_id=$2 AND lower(email)=$1 AND replied_at IS NOT NULL LIMIT 1`,[address,campaign.id]);
    if(stopped.rows.length)continue;
    const delivery=await query(`INSERT INTO outreach_deliveries(campaign_id,prospect_id,email,facility,contact_name,stage,status,claimed_at) VALUES($1,$2,$3,$4,$5,$6,'SENDING',$7) ON CONFLICT(campaign_id,email,stage) DO NOTHING RETURNING id`,[campaign.id,recipient.prospectId,address,recipient.facility,recipient.contactName,stage,now().toISOString()]);
    if(!delivery.rows.length)continue;processed++;used[stage]++;
    let result;
    try{
     result=await email.sendEmail(address,stage==='FOLLOW_UP'?'Re: '+campaign.subject:campaign.subject,outreachHtml(recipient.contactName,recipient.facility,stage==='FOLLOW_UP'),{broadcast:true,fromEmail:campaign.fromEmail,fromName:campaign.fromName,replyTo:campaign.replyTo,trackOpens:true});
     if(result.status!=='sent')throw Error('Postmark Broadcast is not configured.');
    }catch(error){
     const inactive=error.providerCode===406;
     const status=inactive?'SUPPRESSED':error.providerStatus?'FAILED':'UNKNOWN';
     const message=inactive?'Address suppressed by Postmark':error.providerStatus?`Postmark rejected email (HTTP ${error.providerStatus}; code ${error.providerCode||'unknown'}). Check the account connection and sending approval.`:'Delivery could not be confirmed. Check Postmark before retrying this recipient.';
     await query('UPDATE outreach_deliveries SET status=$2,error_message=$3,provider_status=$4 WHERE id=$1',[delivery.rows[0].id,status,message,error.providerStatus||null]);
     if(inactive){await suppress(address,message);continue;}
     await query('UPDATE outreach_automation SET delivery_blocked=true,last_error=$2 WHERE campaign_id=$1',[campaign.id,message]);break;
    }
    // Keep accepted messages claimed if persistence fails; never automatically resend.
    await query(`UPDATE outreach_deliveries SET status='SENT',sent_at=$2,provider_status=$3,provider_message_id=$4,error_message=NULL WHERE id=$1`,[delivery.rows[0].id,now().toISOString(),result.providerStatus||200,result.messageId||null]);sent++;
   }
   return {processed,sent};
  }catch(error){await query('UPDATE outreach_automation SET last_error=$2 WHERE campaign_id=$1',[campaign.id,error.message]);return {processed,sent,blocked:true,error:error.message};}
  finally{await query('UPDATE outreach_automation SET lease_id=NULL,lease_until=NULL WHERE campaign_id=$1 AND lease_id=$2',[campaign.id,lease]);}
 }
 return {ensureSchema,setEnabled,checkConnections,dashboard,syncTracking,run};
}
module.exports={createAutomation,localClock,inSendWindow,followUpDate,nextWindow,replyMatches};
