'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeHandler,normalize,authorized,configured}=require('../netlify/functions/whatsapp-webhook.cjs');
const {makeHandler:makeAdminHandler}=require('../netlify/functions/whatsapp-inbox-status.cjs');

const env={
 WHATSAPP_INGEST_ENABLED:'true',
 WHATSAPP_BASIC_AUTH_USER:'nexuswa',
 WHATSAPP_BASIC_AUTH_PASSWORD:'a-long-unique-secret-for-testing-only',
 WHATSAPP_PHONE_NUMBER_ID:'phone-1',
 WHATSAPP_CONTACT_HMAC_KEY:'an-example-test-key-with-over-32-characters'
};
const headers={authorization:'Basic '+Buffer.from(env.WHATSAPP_BASIC_AUTH_USER+':'+env.WHATSAPP_BASIC_AUTH_PASSWORD).toString('base64')};
const webhook=(field,records,number='phone-1')=>({
 object:'whatsapp_business_account',
 entry:[{changes:[{field,value:{messaging_product:'whatsapp',
   metadata:{phone_number_id:number},
   ...(field==='messages'?{messages:records}:field==='smb_message_echoes'?{message_echoes:records}:{history:records})}}]}]
});
const event=(body,extra={})=>({httpMethod:'POST',headers,body:JSON.stringify(body),...extra});

test('intake remains disabled unless all protected configuration is provided',async()=>{
 assert.equal(configured({...env,WHATSAPP_INGEST_ENABLED:'false'}),false);
 const response=await makeHandler({env:{},dbQuery:async()=>{throw Error('must not write')}})(event({}));
 assert.equal(response.statusCode,503);
});
test('rejects unauthenticated requests and wrong phone IDs',async()=>{
 assert.equal(authorized({headers},env),true);
 assert.equal(authorized({headers:{authorization:'Basic '+Buffer.from('nexuswa:bad').toString('base64')}},env),false);
 let writes=0;
 const handler=makeHandler({env,dbQuery:async()=>{writes++}});
 assert.equal((await handler(event({}, {headers:{}}))).statusCode,401);
 assert.equal((await handler(event(webhook('messages',[{id:'wamid.1',from:'15551234567',type:'text'}],'another-phone')))).statusCode,403);
 assert.equal(writes,0);
});
test('inbound and phone-app echoes are pseudonymous and do not store message content',async()=>{
 const incoming=webhook('messages',[{id:'wamid.1',from:'15551234567',timestamp:'1795400000',
  type:'text',text:{body:'Patient identity and sensitive details must not be stored'}}]);
 const records=normalize(incoming,env);
 assert.equal(records.length,1);
 assert.equal(records[0].direction,'inbound');
 assert.equal(records[0].message_type,'text');
 assert.match(records[0].contact_digest,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(records),/15551234567|Patient identity|sensitive details/);
 const outgoing=normalize(webhook('smb_message_echoes',[{id:'wamid.2',to:'15551234567',from:'15550000000',
  type:'text',text:{body:'outgoing private text'}}]),env);
 assert.equal(outgoing[0].direction,'outbound_app');
 assert.equal(outgoing[0].contact_digest,records[0].contact_digest);
 assert.doesNotMatch(JSON.stringify(outgoing),/outgoing private text/);
});
test('history, contacts and statuses are ignored; no chat history is imported',async()=>{
 assert.deepEqual(normalize(webhook('history',[{threads:[{messages:[{text:{body:'old chat'}}]}]}]),env),[]);
 assert.deepEqual(normalize(webhook('smb_app_state_sync',[{contact:{full_name:'Private Person'}}]),env),[]);
 assert.deepEqual(normalize(webhook('messages',[]),env),[]);
});
test('accepted messages use parameterized insert and stable idempotency keys',async()=>{
 const calls=[];
 const handler=makeHandler({env,dbQuery:async(sql,args)=>{calls.push({sql,args});return {rowCount:1}}});
 const incoming=event(webhook('messages',[{id:'wamid.duplicate',from:'15551234567',type:'text',
  text:{body:'No customer text in DB'}}]));
 for(let i=0;i<2;i++){
  const response=await handler(incoming);
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).accepted,1);
 }
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/ON CONFLICT .* DO NOTHING/);
 assert.deepEqual(calls[0].args,calls[1].args);
 assert.doesNotMatch(calls[0].args[0],/No customer text|15551234567/);
});
test('DB failure gives retriable 503, no payload or secret in response',async()=>{
 const response=await makeHandler({env,dbQuery:async()=>{throw Error('sensitive internal db error')},logger:()=>{}})(
  event(webhook('messages',[{id:'wamid.1',from:'15551234567',type:'text'}])));
 assert.equal(response.statusCode,503);
 assert.doesNotMatch(response.body,/sensitive|secret|db error/);
});
test('admin status requires a real ADMIN session and exposes no bodies',async()=>{
 const handler=makeAdminHandler({
  authenticate:async()=>({role:'ADMIN',session_id:'active-session'}),
  dbQuery:async()=>({rows:[{direction:'inbound',message_type:'text',conversation_key:'0123456789ab'}]})
 });
 const response=await handler({httpMethod:'GET',headers:{authorization:'Bearer live'}});
 assert.equal(response.statusCode,200);
 const body=JSON.parse(response.body);
 assert.equal(body.policy.autoReply,false);
 assert.equal(body.policy.storedMessageBodies,false);
 assert.equal(body.events[0].conversation_key,'0123456789ab');
 const noSession=makeAdminHandler({
  authenticate:async()=>({role:'ADMIN'}),
  dbQuery:async()=>{throw Error('must not query')}
 });
 assert.equal((await noSession({httpMethod:'GET',headers:{}})).statusCode,403);
});


test('dashboard remains administrator-gated and cannot display or send message bodies',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const root=path.resolve(__dirname,'..');
 const guard=fs.readFileSync(path.join(root,'auth-guard.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'nex-whatsapp-status.html'),'utf8');
 const ui=fs.readFileSync(path.join(root,'nex-whatsapp-status.js'),'utf8');
 assert.ok(guard.includes("'/nex-whatsapp-status.html':['ADMIN']"));
 assert.ok(html.includes('src="/auth-guard.js"'));
 assert.ok(html.includes('noindex,nofollow'));
 assert.ok(ui.includes('whatsapp-inbox-status'));
 assert.ok(!ui.includes('/messages')&&!ui.includes('/send-message')&&!ui.includes('/send-whatsapp'));
 assert.ok(html.includes('message metadata only'));
});
test('malformed POST payload fails closed with 400',async()=>{
 const handler=makeHandler({env,dbQuery:async()=>{throw Error('never called')}});
 const response=await handler({httpMethod:'POST',headers,body:'{not valid JSON'});
 assert.equal(response.statusCode,400);
});
