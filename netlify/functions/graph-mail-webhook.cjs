const {getMessage,getMessageAttachments,toBrokerAttachment,isFileAttachment,requireGraphConfig}=require('./_shared/ms-graph.cjs');
const brokerWebhook=require('./broker-email-webhook.cjs');

function textResponse(statusCode,text){
 return {statusCode,headers:{'Content-Type':'text/plain; charset=utf-8'},body:String(text||'')};
}

function jsonResponse(statusCode,body){
 return {statusCode,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
}

function normalizeNotificationMessageId(notification){
 const resourceDataId=notification?.resourceData?.id||notification?.resourceData?.messageId;
 if(resourceDataId)return String(resourceDataId);
 const resource=String(notification?.resource||'');
 const segments=resource.split('/').filter(Boolean);
 return segments[segments.length-1]||'';
}

function getValidationToken(event){
 return event.queryStringParameters?.validationToken||event.body?.validationToken||'';
}

async function invokeBrokerWebhook(payload){
 const response=await brokerWebhook.handler({httpMethod:'POST',body:JSON.stringify(payload),headers:{'content-type':'application/json'}});
 const body=typeof response.body==='string'?JSON.parse(response.body):response.body||{};
 return {statusCode:response.statusCode||200,body};
}

async function processGraphNotification(notification){
 const messageId=normalizeNotificationMessageId(notification);
 if(!messageId)return {status:'skipped',reason:'missing_message_id'};
 const folder='Inbox';
 const message=await getMessage({messageId,folder});
 const attachments=message.hasAttachments?await getMessageAttachments({messageId,folder}):[];
 const brokerAttachments=attachments.filter(isFileAttachment).map(toBrokerAttachment).filter((att)=>att.content);
 const toRecipients=(message.toRecipients||[]).map((recipient)=>recipient?.emailAddress?.address).filter(Boolean).join(', ');
 const sender=message.from?.emailAddress?.address||'';
 const payload={
  from:sender,
  sender_name:message.from?.emailAddress?.name||sender,
  to:toRecipients,
  subject:message.subject||'',
  text:message.bodyPreview||message.body?.content||'',
  html:message.body?.content||'',
  messageId:message.internetMessageId||message.id||messageId,
  internetMessageId:message.internetMessageId||message.id||messageId,
  receivedDateTime:message.receivedDateTime||message.createdDateTime||new Date().toISOString(),
  attachments:brokerAttachments,
  source:'graph-webhook'
 };
 return invokeBrokerWebhook(payload);
}

exports.handler=async(event)=>{
 try{
  requireGraphConfig();
  const validationToken=getValidationToken(event);
  if(validationToken){
   return textResponse(200,validationToken);
  }
  if(event.httpMethod!=='POST'){
   return jsonResponse(405,{error:'Method not allowed'});
  }
  const body=typeof event.body==='string'?JSON.parse(event.body):event.body||{};
  const notifications=Array.isArray(body.value)?body.value:[];
  const results=[];
  for(const notification of notifications){
   try{
    results.push(await processGraphNotification(notification));
   }catch(error){
    results.push({status:'failed',error:error.message});
   }
  }
  return jsonResponse(200,{processed:results.length,results});
 }catch(error){
  console.error('[GRAPH_MAIL_WEBHOOK]',error.message);
  return jsonResponse(500,{error:error.message});
 }
};
