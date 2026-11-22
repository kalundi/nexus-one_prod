'use strict';
const crypto = require('node:crypto');
const SIGNALS = new Set(['task','deadline','question','decision','other']);
const GROUP_PATTERN = /^[0-9a-zA-Z_-]{5,100}@g\.us$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
function allowedGroups(env){
 return new Set(String(env.NEX_GROUP_ALLOWLIST||'').split(',').map(x=>x.trim()).filter(x=>GROUP_PATTERN.test(x)));
}
function hmac(value,secret){return crypto.createHmac('sha256',secret).update(value).digest('hex');}
function signalFor(text){
 const body=String(text||'').slice(0,4096);
 if(/\b(by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|end of (the )?week)|due (on|by|tomorrow|today)|deadline|before \d{1,2}|\bEOD\b)\b/i.test(body))return 'deadline';
 if(/\b(please (send|complete|review|confirm|call|check|update|submit)|can you (send|complete|review|confirm)|action item|assigned to|follow[ -]?up|need(s)? to)\b/i.test(body))return 'task';
 if(/\b(decided|approved|agreed|final decision|we will proceed)\b/i.test(body))return 'decision';
 if(body.includes('?'))return 'question';
 return 'other';
}
function normalizeMessage(message,{secret,allowlist,now=Date.now(),startedAt=now}={}){
 if(!secret||String(secret).length<32||!(allowlist instanceof Set))return null;
 if(!message||message.fromMe===true||message.hasMedia===true||message.type!=='chat')return null;
 const group=String(message.from||'');
 if(!GROUP_PATTERN.test(group)||!allowlist.has(group))return null;
 const author=String(message.author||'');
 const id=String(message.id?._serialized||'');
 const body=String(message.body||'');
 const seconds=Number(message.timestamp);
 if(!author||!id||id.length>512||!body.trim()||body.length>4096||!Number.isFinite(seconds))return null;
 const occurred=seconds*1000;
 // No historical backfill; skip stale or implausible timestamps.
 if(occurred<Math.max(now-10*60*1000,startedAt-3000)||occurred>now+60*1000)return null;
 return {
  event_digest:hmac('event:'+id,secret),
  group_digest:hmac('group:'+group,secret),
  sender_digest:hmac('sender:'+author,secret),
  signal_type:signalFor(body),
  message_type:'text',
  occurred_at:new Date(occurred).toISOString()
 };
}
function validateConfig(env,discovery=false){
 if(env.NEX_GROUP_DEDICATED_ACCOUNT_CONFIRMED!=='true')throw Error('Dedicated account confirmation required');
 if(!env.NEX_GROUP_AUTH_DIR||!require('node:path').isAbsolute(env.NEX_GROUP_AUTH_DIR))throw Error('Use an absolute persistent auth directory');
 if(discovery)return;
 if(env.NEX_GROUP_BRIDGE_ENABLED!=='true'||env.NEX_GROUP_NOTICE_CONFIRMED!=='true')throw Error('Bridge and member notice must both be explicitly enabled');
 if(!env.NEX_GROUP_SHARED_SECRET||env.NEX_GROUP_SHARED_SECRET.length<32)throw Error('Strong shared secret required');
 if(allowedGroups(env).size===0)throw Error('At least one approved group JID required');
 const url=new URL(env.NEX_GROUP_INGEST_URL||'');
 if(url.protocol!=='https:'||url.hostname!=='nexusmt.com'||url.pathname!=='/.netlify/functions/nex-group-ingest'||url.search||url.hash)throw Error('Only the Nexus HTTPS group ingest endpoint is supported');
}
module.exports={allowedGroups,hmac,signalFor,normalizeMessage,validateConfig,SIGNALS,DIGEST_PATTERN};
