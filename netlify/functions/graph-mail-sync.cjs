const {query}=require('./_shared/db.cjs');
const {simpleParser}=require('mailparser');
const {listMessages,getMessageAttachments,getMessageMime,toBrokerAttachment,isFileAttachment,requireGraphConfig,graphFetchUrl}=require('./_shared/ms-graph.cjs');
const brokerWebhook=require('./broker-email-webhook.cjs');

const DEFAULT_SINCE='2026-07-31T00:00:00Z';

function jsonResponse(statusCode,body){
 return {statusCode,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
}

function clean(value){
 return String(value||'').trim();
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

function buildFilter({since,subjectContains='confirmation',sender='xxxx@gotandt.com'}){
 const safeSince=since;
 const normalizedSender=clean(sender).toLowerCase();
 const hasSender=normalizedSender && normalizedSender!=='*' && normalizedSender!=='any' && normalizedSender!=='all';
 const senderClause=hasSender?` and from/emailAddress/address eq '${String(normalizedSender).replace(/'/g,"''")}'`:'';
 return `receivedDateTime ge ${safeSince} and contains(subject,'${String(subjectContains).replace(/'/g,"''")}')${senderClause} and hasAttachments eq true`;
}

async function processMessage(message){
 const attachments=await getMessageAttachments({messageId:message.id,folder:'Inbox'}).catch(()=>[]);
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
    const syncState=await getSyncState();
    const since=parseSince(event.queryStringParameters?.since||event.queryStringParameters?.start||syncState.since||DEFAULT_SINCE);
  if(method!=='GET'&&method!=='POST'){
   return jsonResponse(405,{error:'Method not allowed'});
  }
  const filter=buildFilter({since,subjectContains:event.queryStringParameters?.subjectContains||'confirmation',sender:event.queryStringParameters?.sender||'xxxx@gotandt.com'});
  let page=await listMessages({since,folder:'Inbox',top:Number(event.queryStringParameters?.top||50),filter});
  const results=[];
  let newestSince=since;
  let total=0;
  while(page?.value?.length){
   for(const message of page.value){
    total+=1;
    if(message.receivedDateTime&&new Date(message.receivedDateTime)>new Date(newestSince)){
     newestSince=message.receivedDateTime;
    }
    try{
     results.push(await processMessage(message));
    }catch(error){
     results.push({status:'failed',error:error.message,messageId:message.internetMessageId||message.id});
    }
   }
   if(!page['@odata.nextLink'])break;
    page=await graphFetchUrl(page['@odata.nextLink']);
  }
  await setSyncState({since:newestSince,updatedAt:new Date().toISOString()});
  return jsonResponse(200,{since,processed:results.length,totalMessages:total,latestSince:newestSince,results});
 }catch(error){
  console.error('[GRAPH_MAIL_SYNC]',error.message);
  return jsonResponse(500,{error:error.message});
 }
};
