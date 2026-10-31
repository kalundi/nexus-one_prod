const {query}=require('./_shared/db.cjs');
const {simpleParser}=require('mailparser');
const {listMessages,getMessage,getMessageAttachments,getMessageMime,toBrokerAttachment,isFileAttachment,requireGraphConfig,graphFetchUrl}=require('./_shared/ms-graph.cjs');
const brokerWebhook=require('./broker-email-webhook.cjs');

// Runaway-window guard: previously one permanently failing message pinned
// the saved `since` watermark at the window start, so every 10-minute run
// re-listed and re-processed the whole mailbox window back to the default
// start date, serially downloading attachments/MIME per message — runs
// stretched past 20 s and overlapped. Now the watermark always advances
// past processed mail, failures are carried in the sync state and retried
// individually by message id, and each run processes a bounded number of
// messages.
const MAX_MESSAGES_PER_RUN=200;
const MAX_MESSAGE_ATTEMPTS=3;
const MAX_RETRIES_PER_RUN=50;

const DEFAULT_SINCE='2026-07-31T00:00:00Z';
const DEFAULT_SENDER='driverdeveloper@gotandt.com';
const DEFAULT_SUBJECT='confirmation';
const DEFAULT_FOLDER='Inbox';

function jsonResponse(statusCode,body){
 return {statusCode,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
}

function clean(value){
 return String(value||'').trim();
}

function syncConfig(queryParams={}){
 return {
  sender:clean(queryParams.sender||process.env.GRAPH_MAIL_SYNC_SENDER||DEFAULT_SENDER),
  subjectContains:clean(queryParams.subjectContains||process.env.GRAPH_MAIL_SYNC_SUBJECT_CONTAINS||DEFAULT_SUBJECT),
  folder:clean(queryParams.folder||process.env.GRAPH_MAIL_SYNC_FOLDER||DEFAULT_FOLDER)||DEFAULT_FOLDER
 };
}

function parseSince(input){
 const raw=clean(input)||DEFAULT_SINCE;
 const parsed=new Date(raw);
 if(Number.isNaN(parsed.getTime()))throw new Error(`Invalid since value: ${raw}`);
 return parsed.toISOString();
}

async function getSyncState(){
 const r=await query(`SELECT value FROM system_settings WHERE key='graph_mail_sync_state' LIMIT 1`).catch(()=>({rows:[]}));
 return r.rows?.[0]?.value||{};
}

async function setSyncState(state){
 await query(`INSERT INTO system_settings(key,value,updated_at) VALUES('graph_mail_sync_state',$1::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[JSON.stringify(state||{})]);
}

async function invokeBrokerWebhook(payload){
 const response=await brokerWebhook.handler({httpMethod:'POST',body:JSON.stringify(payload),headers:{'content-type':'application/json'}});
 const body=typeof response.body==='string'?JSON.parse(response.body):response.body||{};
 return {statusCode:response.statusCode||200,body};
}

function buildFilter({since,subjectContains=DEFAULT_SUBJECT,sender=DEFAULT_SENDER}){
 const safeSince=since;
 const normalizedSender=clean(sender).toLowerCase();
 const hasSender=normalizedSender && normalizedSender!=='*' && normalizedSender!=='any' && normalizedSender!=='all';
 const senderDomain=normalizedSender.match(/^\*?(@[a-z0-9.-]+)$/i)?.[1]||'';
 const escapedSender=String(normalizedSender).replace(/'/g,"''");
 const senderClause=!hasSender||senderDomain?'':` and from/emailAddress/address eq '${escapedSender}'`;
 return `receivedDateTime ge ${safeSince} and contains(subject,'${String(subjectContains).replace(/'/g,"''")}')${senderClause} and hasAttachments eq true`;
}

function senderMatches(message,senderFilter){
 const filter=clean(senderFilter).toLowerCase();
 if(!filter||filter==='*'||filter==='any'||filter==='all')return true;
 const address=clean(message?.from?.emailAddress?.address).toLowerCase();
 const domain=filter.match(/^\*?(@[a-z0-9.-]+)$/i)?.[1]||'';
 return domain?address.endsWith(domain):address===filter;
}

async function processMessage(message,folder=DEFAULT_FOLDER){
 const attachments=await getMessageAttachments({messageId:message.id,folder}).catch(()=>[]);
 let brokerAttachments=attachments.filter(isFileAttachment).map(toBrokerAttachment).filter((att)=>att.content);
 if(!brokerAttachments.length&&message?.id){
  try{
   const mime=await getMessageMime({messageId:message.id});
   if(typeof mime==='string'&&mime.length){
    const parsed=await simpleParser(mime);
    const fromMime=(parsed.attachments||[]).map((att)=>(
     {
      filename:clean(att.filename||'attachment.bin')||'attachment.bin',
      type:clean(att.contentType||'application/octet-stream')||'application/octet-stream',
      content:Buffer.isBuffer(att.content)?att.content.toString('base64'):''
     }
    )).filter((att)=>att.content);
    if(fromMime.length)brokerAttachments=fromMime;
   }
  }catch(_error){
   // Ignore MIME parsing failures and continue with body-only payload.
  }
 }
 const payload={
  from:message.from?.emailAddress?.address||'',
  sender_name:message.from?.emailAddress?.name||message.from?.emailAddress?.address||'',
  to:(message.toRecipients||[]).map((recipient)=>recipient?.emailAddress?.address).filter(Boolean).join(', '),
  subject:message.subject||'',
  text:message.body?.content||message.bodyPreview||'',
  html:message.body?.content||'',
  messageId:message.internetMessageId||message.id,
  internetMessageId:message.internetMessageId||message.id,
  receivedDateTime:message.receivedDateTime||new Date().toISOString(),
  attachments:brokerAttachments,
  source:'graph-sync'
 };
 return invokeBrokerWebhook(payload);
}

function outcomeFailed(outcome){
 return outcome?.status==='failed'||Number(outcome?.statusCode||200)>=400;
}

exports.handler=async(event)=>{
 try{
  requireGraphConfig();
  const method=event.httpMethod||'GET';
  const queryParams=event.queryStringParameters||{};
  const config=syncConfig(queryParams);
  const syncState=await getSyncState();
  const since=parseSince(queryParams.since||queryParams.start||syncState.since||process.env.GRAPH_MAIL_SYNC_SINCE||DEFAULT_SINCE);
  if(method!=='GET'&&method!=='POST'){
   return jsonResponse(405,{error:'Method not allowed'});
  }
  // Failure carry-over from previous runs: retry these individually by id
  // instead of re-processing the whole window. Entries that exhaust
  // MAX_MESSAGE_ATTEMPTS move to deadLetterMessageIds in the saved state
  // (kept visible for manual follow-up, never silently dropped on sight).
  const failedMessages={...(syncState.failedMessages||{})};
  const deadLetterMessageIds=[...(syncState.deadLetterMessageIds||[])];
  let retried=0,retryRecovered=0;
  for(const [messageId,record] of Object.entries(failedMessages)){
   if(retried>=MAX_RETRIES_PER_RUN)break;
   if(Number(record?.attempts||0)>=MAX_MESSAGE_ATTEMPTS){
    delete failedMessages[messageId];
    if(!deadLetterMessageIds.includes(messageId))deadLetterMessageIds.push(messageId);
    continue;
   }
   retried+=1;
   try{
    const message=await getMessage({messageId,folder:config.folder});
    if(!senderMatches(message,config.sender)){
     delete failedMessages[messageId];
     continue;
    }
    const outcome=await processMessage(message,config.folder);
    if(outcomeFailed(outcome))throw new Error(outcome.error||`Broker webhook returned ${outcome.statusCode||'an error'}`);
    delete failedMessages[messageId];
    retryRecovered+=1;
   }catch(error){
    if(/Graph request failed \(404\)/.test(error.message)){
     // Message no longer exists in the mailbox; nothing left to retry.
     delete failedMessages[messageId];
     continue;
    }
    const attempts=Number(record?.attempts||0)+1;
    if(attempts>=MAX_MESSAGE_ATTEMPTS){
     delete failedMessages[messageId];
     if(!deadLetterMessageIds.includes(messageId))deadLetterMessageIds.push(messageId);
    }else{
     failedMessages[messageId]={attempts,error:String(error.message||'failed').slice(0,300),lastTriedAt:new Date().toISOString()};
    }
   }
  }
  const filter=buildFilter({since,subjectContains:config.subjectContains,sender:config.sender});
  let page=await listMessages({since,folder:config.folder,top:Number(queryParams.top||50),filter});
  const results=[];
  let newestSince=since;
  let lastProcessedAt=null;
  let total=0;
  let capped=false;
  while(page?.value?.length&&!capped){
   for(const message of page.value){
    if(total>=MAX_MESSAGES_PER_RUN){capped=true;break;}
    if(message.receivedDateTime&&new Date(message.receivedDateTime)>new Date(newestSince)){
     newestSince=message.receivedDateTime;
    }
    if(!senderMatches(message,config.sender))continue;
    total+=1;
    try{
     const outcome=await processMessage(message,config.folder);
     results.push(outcome);
     if(outcomeFailed(outcome)){
      failedMessages[message.id]={attempts:1,error:String(outcome.error||`Broker webhook returned ${outcome.statusCode||'an error'}`).slice(0,300),lastTriedAt:new Date().toISOString()};
     }
    }catch(error){
     results.push({status:'failed',error:error.message,messageId:message.internetMessageId||message.id});
     if(message.id)failedMessages[message.id]={attempts:1,error:String(error.message||'failed').slice(0,300),lastTriedAt:new Date().toISOString()};
    }
    if(message.receivedDateTime)lastProcessedAt=message.receivedDateTime;
   }
   if(capped||!page['@odata.nextLink'])break;
    page=await graphFetchUrl(page['@odata.nextLink']);
  }
  const failed=results.filter(outcomeFailed);
  // The watermark advances past everything this run actually processed —
  // a failing message no longer pins it (it is retried from state instead).
  // When the per-run cap cut a page short, only advance to the last
  // processed message so the remainder is listed again next run.
  const savedSince=capped?(lastProcessedAt||since):newestSince;
  await setSyncState({since:savedSince,updatedAt:new Date().toISOString(),lastFailureCount:failed.length,failedMessages,deadLetterMessageIds});
  return jsonResponse(200,{since,processed:results.length,totalMessages:total,latestSince:newestSince,savedSince,failed:failed.length,retried,retryRecovered,deadLettered:deadLetterMessageIds.length,results});
 }catch(error){
  console.error('[GRAPH_MAIL_SYNC]',error.message);
  return jsonResponse(500,{error:error.message});
 }
};

exports.MAX_MESSAGES_PER_RUN=MAX_MESSAGES_PER_RUN;
exports.MAX_MESSAGE_ATTEMPTS=MAX_MESSAGE_ATTEMPTS;
exports.buildFilter=buildFilter;
exports.syncConfig=syncConfig;
exports.senderMatches=senderMatches;
