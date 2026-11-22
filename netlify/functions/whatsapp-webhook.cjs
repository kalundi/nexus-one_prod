'use strict';
// 360dialog WhatsApp Business App coexistence: metadata-only, read-only ingestion.
// Deliberately NO message body, patient details, contact phone number, history import,
// AI inference, or outbound replies are persisted/performed by this endpoint.
const crypto=require('node:crypto');
const {query}=require('./_shared/db.cjs');
const {json}=require('./_shared/http.cjs');

const ACCEPTED_DIRECTIONS=new Set(['inbound','outbound_app']);
const MAX_BODY_BYTES=2*1024*1024;
const MAX_MESSAGES=500;
const log=()=>console.warn('[WHATSAPP_INTAKE] failed; inspect function status without logging payload');

function safeEquals(a,b){
 const h1=crypto.createHash('sha256').update(String(a)).digest();
 const h2=crypto.createHash('sha256').update(String(b)).digest();
 return crypto.timingSafeEqual(h1,h2);
}
function authorized(event,env){
 const header=event.headers?.authorization||event.headers?.Authorization||'';
 if(!/^Basic\s+/i.test(header))return false;
 const token=header.replace(/^Basic\s+/i,'').trim();
 if(!/^[a-zA-Z0-9+/=]+$/.test(token)||token.length>2048)return false;
 const decoded=Buffer.from(token,'base64').toString('utf8');
 const sep=decoded.indexOf(':');
 if(sep<1)return false;
 return safeEquals(decoded.slice(0,sep),env.WHATSAPP_BASIC_AUTH_USER)
     &&safeEquals(decoded.slice(sep+1),env.WHATSAPP_BASIC_AUTH_PASSWORD);
}
function timestampOf(raw){
 const seconds=Number(raw);
 if(!Number.isFinite(seconds)||seconds<946684800||seconds>4102444800)return null;
 return new Date(seconds*1000).toISOString();
}
function digestContact(contact,secret){
 return crypto.createHmac('sha256',secret).update(String(contact)).digest('hex');
}
function normalize(payload,env){
 if(payload?.object!=='whatsapp_business_account'||!Array.isArray(payload.entry))return [];
 const items=[];
 for(const entry of payload.entry){
  for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
   const field=String(change?.field||'');
   // Never ingest one-time historical chats, contact sync, statuses or arbitrary fields.
   if(field!=='messages'&&field!=='smb_message_echoes')continue;
   const value=change?.value||{};
   const phoneId=String(value.metadata?.phone_number_id||'');
   if(phoneId!==env.WHATSAPP_PHONE_NUMBER_ID)throw Object.assign(Error('Unexpected WhatsApp number'),{statusCode:403});
   const direction=field==='messages'?'inbound':'outbound_app';
   if(!ACCEPTED_DIRECTIONS.has(direction))continue;
   const messages=direction==='inbound'?value.messages:value.message_echoes;
   for(const m of Array.isArray(messages)?messages:[]){
    const id=String(m?.id||'').trim();
    const contact=String(direction==='inbound'?m?.from:m?.to||'').trim();
    // Avoid recording groups, unsupported identifiers or unrecognized items.
    if(!id||id.length>255||!/^[0-9]{6,20}$/.test(contact))continue;
    const type=String(m?.type||'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,32)||'unknown';
    items.push({provider_message_id:id,phone_number_id:phoneId,
      contact_digest:digestContact(contact,env.WHATSAPP_CONTACT_HMAC_KEY),
      direction,message_type:type,occurred_at:timestampOf(m.timestamp)});
    if(items.length>MAX_MESSAGES)throw Object.assign(Error('Webhook batch too large'),{statusCode:413});
   }
  }
 }
 return items;
}
function configured(env){
 return env.WHATSAPP_INGEST_ENABLED==='true'
  &&Boolean(env.WHATSAPP_BASIC_AUTH_USER&&env.WHATSAPP_BASIC_AUTH_PASSWORD
    &&env.WHATSAPP_PHONE_NUMBER_ID&&env.WHATSAPP_CONTACT_HMAC_KEY?.length>=32);
}
function makeHandler({env=process.env,dbQuery=query,logger=log}={}){
 return async event=>{
  if(String(event.httpMethod||'').toUpperCase()!=='POST')return json(405,{error:'Method not allowed'},{allow:'POST'});
  if(!configured(env))return json(503,{error:'WhatsApp intake not configured'});
  if(!authorized(event,env))return json(401,{error:'Not authorized'},{'www-authenticate':'Basic realm="Nexus WhatsApp"'});
  try{
   const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):String(event.body||'');
   if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)return json(413,{error:'Webhook payload too large'});
   let body;
   try{body=JSON.parse(raw);}catch{return json(400,{error:'Malformed webhook JSON'});}
   const records=normalize(body,env);
   if(!records.length)return json(200,{ok:true,accepted:0});
   // Single parameterized batch and unique index make Meta retries idempotent.
   // Do not acknowledge a failed write: the provider should retry.
   await dbQuery(`INSERT INTO nex_whatsapp_message_events
     (provider_message_id,phone_number_id,contact_digest,direction,message_type,occurred_at)
     SELECT x.provider_message_id,x.phone_number_id,x.contact_digest,x.direction,x.message_type,x.occurred_at
     FROM jsonb_to_recordset($1::jsonb) AS x(
       provider_message_id text,phone_number_id text,contact_digest text,
       direction text,message_type text,occurred_at timestamptz)
     ON CONFLICT (phone_number_id,provider_message_id,direction) DO NOTHING`,[JSON.stringify(records)]);
   return json(200,{ok:true,accepted:records.length});
  }catch(error){
   if(error?.statusCode===403)return json(403,{error:'Number not authorized'});
   if(error?.statusCode===413)return json(413,{error:'Webhook batch too large'});
   logger();
   return json(503,{error:'WhatsApp intake temporarily unavailable'});
  }
 };
}
exports.makeHandler=makeHandler;
exports.handler=makeHandler();
exports.normalize=normalize;
exports.authorized=authorized;
exports.configured=configured;
