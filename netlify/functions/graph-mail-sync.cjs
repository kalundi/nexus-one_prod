const {query}=require('./_shared/db.cjs');
const {simpleParser}=require('mailparser');
const {listMessages,getMessageAttachments,getMessageMime,toBrokerAttachment,isFileAttachment,requireGraphConfig,graphFetchUrl}=require('./_shared/ms-graph.cjs');
const brokerWebhook=require('./broker-email-webhook.cjs');

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
  const filter=buildFilter({since,subjectContains:config.subjectContains,sender:config.sender});
  let page=await listMessages({since,folder:config.folder,top:Number(queryParams.top||50),filter});
  const results=[];
  let newestSince=since;
  let total=0;
  while(page?.value?.length){
   for(const message of page.value){
    if(message.receivedDateTime&&new Date(message.receivedDateTime)>new Date(newestSince)){
     newestSince=message.receivedDateTime;
    }
    if(!senderMatches(message,config.sender))continue;
    total+=1;
    try{
     results.push(await processMessage(message,config.folder));
    }catch(error){
     results.push({status:'failed',error:error.message,messageId:message.internetMessageId||message.id});
    }
   }
   if(!page['@odata.nextLink'])break;
    page=await graphFetchUrl(page['@odata.nextLink']);
  }
  const failed=results.filter((result)=>result?.status==='failed'||Number(result?.statusCode||200)>=400);
  const savedSince=failed.length?since:newestSince;
  await setSyncState({since:savedSince,updatedAt:new Date().toISOString(),lastFailureCount:failed.length});
  return jsonResponse(200,{since,processed:results.length,totalMessages:total,latestSince:newestSince,savedSince,failed:failed.length,results});
 }catch(error){
  console.error('[GRAPH_MAIL_SYNC]',error.message);
  return jsonResponse(500,{error:error.message});
 }
};

exports.buildFilter=buildFilter;
exports.syncConfig=syncConfig;
exports.senderMatches=senderMatches;
