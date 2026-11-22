'use strict';
// Ingests *only pseudonymized signal categories* from a manually allowlisted group
// bridge. Does not accept/retain raw messages, WhatsApp identifiers or patient data.
const crypto=require('node:crypto');
const {query}=require('./_shared/db.cjs');
const {json}=require('./_shared/http.cjs');
const HEX=/^[a-f0-9]{64}$/;
const SIGNALS=new Set(['task','deadline','question','decision','other']);
const KEYS=['event_digest','group_digest','sender_digest','signal_type','message_type','occurred_at'];
function authenticated(event,body,env,now=Date.now()){
 const headers=event.headers||{};
 const ts=String(headers['x-nex-group-timestamp']||headers['X-Nex-Group-Timestamp']||'');
 const sig=String(headers['x-nex-group-signature']||headers['X-Nex-Group-Signature']||'');
 if(!/^\d{13}$/.test(ts)||Math.abs(Number(ts)-now)>5*60*1000||!/^sha256=[a-f0-9]{64}$/.test(sig))return false;
 const expected=crypto.createHmac('sha256',env.NEX_GROUP_SHARED_SECRET).update(ts+'.'+body).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(sig.slice(7),'hex'),Buffer.from(expected,'hex'));
}
function cleanRecord(obj,env,now=Date.now()){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
 if(Object.keys(obj).length!==KEYS.length||!KEYS.every(k=>Object.hasOwn(obj,k)))return null;
 if(!HEX.test(obj.event_digest)||!HEX.test(obj.group_digest)||!HEX.test(obj.sender_digest))return null;
 const allowed=String(env.NEX_GROUP_ALLOWED_DIGESTS||'').split(',').map(x=>x.trim());
 if(!allowed.includes(obj.group_digest))return null;
 if(!SIGNALS.has(obj.signal_type)||obj.message_type!=='text')return null;
 const when=Date.parse(obj.occurred_at);
 if(!Number.isFinite(when)||when<now-10*60*1000||when>now+60*1000)return null;
 return KEYS.map(k=>obj[k]);
}
function configured(env){
 return env.NEX_GROUP_INGEST_ENABLED==='true'&&typeof env.NEX_GROUP_SHARED_SECRET==='string'
  &&env.NEX_GROUP_SHARED_SECRET.length>=32
  &&String(env.NEX_GROUP_ALLOWED_DIGESTS||'').split(',').some(v=>HEX.test(v.trim()));
}
function makeHandler({env=process.env,dbQuery=query,now=()=>Date.now()}={}){
 return async event=>{
  if(String(event.httpMethod||'').toUpperCase()!=='POST')return json(405,{error:'Method not allowed'},{allow:'POST'});
  if(!configured(env))return json(503,{error:'Group listener intake disabled'});
  const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):String(event.body||'');
  if(Buffer.byteLength(raw)>2048)return json(413,{error:'Event too large'});
  if(!authenticated(event,raw,env,now()))return json(401,{error:'Not authorized'});
  let value;try{value=JSON.parse(raw)}catch{return json(400,{error:'Malformed JSON'})}
  const record=cleanRecord(value,env,now());
  if(!record)return json(422,{error:'Unapproved or malformed event'});
  try{
   await dbQuery(`INSERT INTO nex_group_signals
    (event_digest,group_digest,sender_digest,signal_type,message_type,occurred_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (event_digest) DO NOTHING`,record);
   return json(200,{ok:true});
  }catch{
   // Do not log any event or secret on errors; caller may retry.
   return json(503,{error:'Group signals temporarily unavailable'});
  }
 };
}
exports.makeHandler=makeHandler;exports.handler=makeHandler();exports.authenticated=authenticated;
exports.cleanRecord=cleanRecord;exports.configured=configured;
