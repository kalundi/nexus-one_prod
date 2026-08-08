const GRAPH_ROOT='https://graph.microsoft.com/v1.0';

const clean=(value)=>String(value??'').trim();

function graphConfig(){
 const tenantId=clean(process.env.M365_TENANT_ID||process.env.MICROSOFT_TENANT_ID);
 const clientId=clean(process.env.M365_CLIENT_ID||process.env.MICROSOFT_CLIENT_ID);
 const clientSecret=clean(process.env.M365_CLIENT_SECRET||process.env.MICROSOFT_CLIENT_SECRET);
 const mailbox=clean(process.env.M365_MAILBOX_ADDRESS||process.env.MICROSOFT_MAILBOX_ADDRESS||process.env.M365_INBOX_ADDRESS||'');
 return {tenantId,clientId,clientSecret,mailbox};
}

function requireGraphConfig(){
 const config=graphConfig();
 if(!config.tenantId||!config.clientId||!config.clientSecret||!config.mailbox){
  throw new Error('M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, and M365_MAILBOX_ADDRESS are required');
 }
 return config;
}

async function getGraphAccessToken(){
 const {tenantId,clientId,clientSecret}=requireGraphConfig();
 const body=new URLSearchParams({
  client_id:clientId,
  client_secret:clientSecret,
  grant_type:'client_credentials',
  scope:'https://graph.microsoft.com/.default'
 });
 const response=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,{
  method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},
  body
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(data.error_description||data.error||`Graph token request failed (${response.status})`);
 return data.access_token;
}

async function graphFetch(path,options={}){
 const token=await getGraphAccessToken();
 const response=await fetch(`${GRAPH_ROOT}${path}`,{
  ...options,
  headers:{
   authorization:`Bearer ${token}`,
   'content-type':'application/json',
   ...(options.headers||{})
  }
 });
 const text=await response.text();
 let data;
 try{data=text?JSON.parse(text):{};}catch(_error){data=text;}
 if(!response.ok){
  const message=typeof data==='string'?data:JSON.stringify(data).slice(0,500);
  throw new Error(`Graph request failed (${response.status}): ${message}`);
 }
 return data;
}

async function graphFetchUrl(url,options={}){
 const token=await getGraphAccessToken();
 const response=await fetch(url,{
  ...options,
  headers:{
   authorization:`Bearer ${token}`,
   'content-type':'application/json',
   ...(options.headers||{})
  }
 });
 const text=await response.text();
 let data;
 try{data=text?JSON.parse(text):{};}catch(_error){data=text;}
 if(!response.ok){
  const message=typeof data==='string'?data:JSON.stringify(data).slice(0,500);
  throw new Error(`Graph request failed (${response.status}): ${message}`);
 }
 return data;
}

function encodeGraphPathSegment(value){
 return encodeURIComponent(String(value||'').replace(/^\//,''));
}

async function listMessages({since,folder='Inbox',top=25,filter=''}){
 const {mailbox}=requireGraphConfig();
 const params=new URLSearchParams();
 params.set('$top',String(Math.min(Math.max(Number(top)||25,1),100)));
 params.set('$select','id,internetMessageId,subject,from,toRecipients,bodyPreview,body,receivedDateTime,hasAttachments,createdDateTime,lastModifiedDateTime');
 params.set('$orderby','receivedDateTime asc');
 if(filter)params.set('$filter',filter);
 const targetFolder=clean(folder)||'Inbox';
 const path=`/users/${encodeGraphPathSegment(mailbox)}/mailFolders/${encodeGraphPathSegment(targetFolder)}/messages?${params.toString()}`;
 return graphFetch(path);
}

async function getMessage({messageId,folder='Inbox'}){
 const {mailbox}=requireGraphConfig();
 const path=`/users/${encodeGraphPathSegment(mailbox)}/messages/${encodeGraphPathSegment(messageId)}?$select=id,internetMessageId,subject,from,toRecipients,bodyPreview,body,receivedDateTime,hasAttachments,createdDateTime,lastModifiedDateTime`;
 return graphFetch(path);
}

async function getMessageAttachments({messageId,folder='Inbox'}){
 const {mailbox}=requireGraphConfig();
 const path=`/users/${encodeGraphPathSegment(mailbox)}/messages/${encodeGraphPathSegment(messageId)}/attachments?$select=id,name,contentType,contentBytes,contentId,@odata.type,size`;
 const data=await graphFetch(path);
 return Array.isArray(data.value)?data.value:[];
}

async function getMessageMime({messageId}){
 const {mailbox}=requireGraphConfig();
 const path=`/users/${encodeGraphPathSegment(mailbox)}/messages/${encodeGraphPathSegment(messageId)}/$value`;
 return graphFetch(path,{headers:{accept:'message/rfc822'}});
}

function toBrokerAttachment(attachment){
 return {
  filename:clean(attachment?.name||attachment?.filename||'attachment.txt',180),
  type:clean(attachment?.contentType||attachment?.type||'application/octet-stream',160),
  content:String(attachment?.contentBytes||attachment?.content||'')
 };
}

function isFileAttachment(attachment){
 const type=clean(attachment?.['@odata.type']||'').toLowerCase();
 return !type || type.includes('fileattachment');
}

module.exports={
 GRAPH_ROOT,
 graphConfig,
 requireGraphConfig,
 getGraphAccessToken,
 graphFetch,
 graphFetchUrl,
 listMessages,
 getMessage,
 getMessageAttachments,
 getMessageMime,
 toBrokerAttachment,
 isFileAttachment
};
