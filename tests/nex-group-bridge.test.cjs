'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {allowedGroups,signalFor,normalizeMessage,validateConfig,hmac}=require('../tools/nex-whatsapp-group-bridge/filters.cjs');
const {makeHandler,configured}=require('../netlify/functions/nex-group-ingest.cjs');
const G='12036333333333@g.us',OTHER='12036344444444@g.us';
const secret='private-testing-secret-with-64-characters-0123456789abcdef';
const now=Date.now();
const base={NEX_GROUP_BRIDGE_ENABLED:'true',NEX_GROUP_DEDICATED_ACCOUNT_CONFIRMED:'true',
  NEX_GROUP_NOTICE_CONFIRMED:'true',NEX_GROUP_ALLOWLIST:G,NEX_GROUP_SHARED_SECRET:secret,
  NEX_GROUP_AUTH_DIR:'/var/lib/nex-wa/session',NEX_GROUP_INGEST_URL:'https://nexusmt.com/.netlify/functions/nex-group-ingest'};
const serverEnv={NEX_GROUP_INGEST_ENABLED:'true',NEX_GROUP_SHARED_SECRET:secret,
  NEX_GROUP_ALLOWED_DIGESTS:hmac('group:'+G,secret)};
function msg(patch={}){return {from:G,author:'1234567890@c.us',id:{_serialized:'msg-unique'},body:'Please send the invoice by Friday',fromMe:false,hasMedia:false,type:'chat',
 timestamp:Math.floor(now/1000),...patch}}
function signed(obj,withEnv=serverEnv,timestamp=now){
 const body=JSON.stringify(obj),sig=crypto.createHmac('sha256',withEnv.NEX_GROUP_SHARED_SECRET).update(timestamp+'.'+body).digest('hex');
 return {httpMethod:'POST',headers:{'x-nex-group-timestamp':String(timestamp),'x-nex-group-signature':'sha256='+sig},body};
}
test('all monitoring switches, notice, account, group list and HTTPS URL are required',()=>{
 assert.doesNotThrow(()=>validateConfig(base,false));
 for(const [key,v] of [['NEX_GROUP_BRIDGE_ENABLED','false'],['NEX_GROUP_NOTICE_CONFIRMED','false'],
  ['NEX_GROUP_DEDICATED_ACCOUNT_CONFIRMED','false'],['NEX_GROUP_ALLOWLIST',''],
  ['NEX_GROUP_INGEST_URL','http://nexusmt.com/.netlify/functions/nex-group-ingest']]){
  assert.throws(()=>validateConfig({...base,[key]:v},false));
 }
});
test('only approved new inbound text from group is normalized',()=>{
 const allowlist=allowedGroups(base);
 const item=normalizeMessage(msg(),{secret,allowlist,now});
 assert.ok(item);assert.equal(item.signal_type,'deadline');assert.equal(item.message_type,'text');
 assert.equal(item.group_digest,hmac('group:'+G,secret));
 for(const patch of [{from:OTHER},{from:'15551112222@c.us'},{fromMe:true},{hasMedia:true},
  {type:'image'},{timestamp:Math.floor((now-20*60*1000)/1000)},
  {timestamp:Math.floor((now-60*1000)/1000)},{body:''},{id:null}]){
  assert.equal(normalizeMessage(msg(patch),{secret,allowlist,now}),null);
 }
 assert.doesNotMatch(JSON.stringify(item),/invoice|Friday|1234567890|12036333333|@g\.us/);
});
test('local signal classifier never returns message contents',()=>{
 assert.equal(signalFor('Please send your updates'), 'task');
 assert.equal(signalFor('Can we meet?'),'question');
 assert.equal(signalFor('We approved the plan'),'decision');
 assert.equal(signalFor('Good morning team'),'other');
});
test('webhook is off by default and rejects untrusted input',async()=>{
 assert.equal(configured({}),false);
 const disabled=makeHandler({env:{},dbQuery:async()=>{throw Error('no')}});
 assert.equal((await disabled({httpMethod:'POST'})).statusCode,503);
 const handler=makeHandler({env:serverEnv,dbQuery:async()=>({}) ,now:()=>now});
 const record=normalizeMessage(msg(),{secret,allowlist:allowedGroups(base),now});
 assert.equal((await handler({...signed(record),headers:{}})).statusCode,401);
 assert.equal((await handler(signed(record,serverEnv,now-6*60*1000))).statusCode,401);
 assert.equal((await handler(signed({...record,group_digest:hmac('group:'+OTHER,secret)}))).statusCode,422);
 assert.equal((await handler(signed({...record,body:'private message'}))).statusCode,422);
 assert.equal((await handler({...signed(record),body:'{malformed'})).statusCode,401);
});
test('valid signed record inserts via parameters, never message text',async()=>{
 const item=normalizeMessage(msg(),{secret,allowlist:allowedGroups(base),now});
 const writes=[];
 const handler=makeHandler({env:serverEnv,dbQuery:async(sql,params)=>{writes.push({sql,params});return {rowCount:1}},now:()=>now});
 const r=await handler(signed(item));
 assert.equal(r.statusCode,200);assert.equal(writes.length,1);
 assert.equal(writes[0].params.length,6);
 assert.match(writes[0].sql,/ON CONFLICT/);
 assert.doesNotMatch(JSON.stringify(writes),/Please send|invoice|@g\.us|@c\.us/);
});
test('bridge dashboard is protected by administrator role guard',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'..');
 const guard=fs.readFileSync(path.join(root,'auth-guard.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'nex-group-monitor.html'),'utf8');
 const browser=fs.readFileSync(path.join(root,'nex-group-monitor.js'),'utf8');
 assert.ok(guard.includes("'/nex-group-monitor.html':['ADMIN']"));
 assert.ok(html.includes('src="/auth-guard.js"'));
 assert.ok(html.includes('noindex,nofollow'));
 assert.ok(browser.includes('nex-group-status'));
 assert.ok(!browser.includes('/sendMessage'));
});
