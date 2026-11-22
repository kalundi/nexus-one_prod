'use strict';
// Read-only, unofficial linked-device client. No sendMessage calls or chat-body uploads.
// Run as a dedicated unprivileged service user on a persistent, access-restricted VPS.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {Client,LocalAuth}=require('whatsapp-web.js');
const {allowedGroups,normalizeMessage,validateConfig,matchesExpectedAccount,hmac}=require('./filters.cjs');
const env=require('./deploy/credentials.cjs').loadRuntimeConfig(process.env);
const discovery=env.NEX_GROUP_DISCOVERY_MODE==='true';
validateConfig(env,discovery);
if(typeof process.getuid==='function'&&process.getuid()===0)throw Error('Do not run bridge as root');
fs.mkdirSync(env.NEX_GROUP_AUTH_DIR,{recursive:true,mode:0o700});
fs.chmodSync(env.NEX_GROUP_AUTH_DIR,0o700);
const authClientId=env.NEX_GROUP_ACCOUNT_MODE==='existing_business'?'nex-current-business':'nex-dedicated';
const client=new Client({authStrategy:new LocalAuth({clientId:authClientId,dataPath:env.NEX_GROUP_AUTH_DIR}),
 puppeteer:{headless:true,args:['--disable-dev-shm-usage']}});
let ready=false;
let monitorStartedAt=Number.POSITIVE_INFINITY;
const backlog=[];
let draining=false;
async function drain(){
 if(draining||!ready||!backlog.length)return;
 draining=true;
 try{
  while(backlog.length&&ready){
   const item=backlog[0],body=JSON.stringify(item);
   const ts=String(Date.now());
   const signature=crypto.createHmac('sha256',env.NEX_GROUP_SHARED_SECRET).update(ts+'.'+body).digest('hex');
   let ok=false;
   for(let attempt=0;attempt<3;attempt++){
    try{
     const result=await fetch(env.NEX_GROUP_INGEST_URL,{
      method:'POST',redirect:'error',headers:{'content-type':'application/json','x-nex-group-timestamp':ts,'x-nex-group-signature':'sha256='+signature},
      body,signal:AbortSignal.timeout(8000)
     });
     if(result.ok){ok=true;break;}
     if(result.status>=400&&result.status<500)break;
    }catch{ /* no event contents in logs */ }
    await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
   }
   if(!ok)console.error('[NEX GROUP] Metadata delivery not acknowledged; event dropped without message content');
   backlog.shift();
  }
 }finally{draining=false}
}
if(env.NEX_GROUP_ACCOUNT_MODE==='existing_business'){
 console.warn('[NEX GROUP] WARNING: Unofficial linked-device integration with the LIVE business number could result in account restrictions. Local browser storage may sync all chats, including non-approved groups and direct messages. Monitoring is not active until an approved allowlist and business notice are configured.');
}
client.on('qr',qr=>{
 if(!process.stdout.isTTY){console.warn('[NEX GROUP] QR available only on an interactive terminal; no QR written to system logs');return;}
 require('qrcode-terminal').generate(qr,{small:true});
});
client.on('ready',async()=>{
 // Never process messages for the wrong number, even if a QR from another
 // WhatsApp account was scanned. Do not log any account identifier.
 if(!matchesExpectedAccount(client.info,env)){
  ready=false;
  console.error('[NEX GROUP] Linked account does not match the expected Nexus business number. No monitoring enabled; unlink the unexpected session from its phone.');
  await client.destroy().catch(()=>{});
  process.exitCode=1;
  return;
 }
 ready=true;
 monitorStartedAt=Date.now();
 if(discovery){
  if(!process.stdout.isTTY){console.error('[NEX GROUP] Discover groups from an interactive terminal only');return;}
  const chats=await client.getChats();
  console.log('Group list for local configuration (do not publish names or IDs):');
  for(const c of chats.filter(x=>x.isGroup)){
   const digest=env.NEX_GROUP_SHARED_SECRET?.length>=32?hmac('group:'+c.id._serialized,env.NEX_GROUP_SHARED_SECRET):'set-secret-first';
   console.log(c.name+' | '+c.id._serialized+' | '+digest);
  }
  console.log('Discovery mode: no messages are monitored or forwarded. Stop process after collecting IDs.');
 }else console.log('[NEX GROUP] Connected in read-only, approved-group metadata mode');
});
client.on('disconnected',()=>{ready=false;console.error('[NEX GROUP] Linked device disconnected; no processing')});
client.on('message',message=>{
 if(discovery||!ready)return;
 const item=normalizeMessage(message,{secret:env.NEX_GROUP_SHARED_SECRET,allowlist:allowedGroups(env),startedAt:monitorStartedAt});
 if(!item)return;
 if(backlog.length>=100){console.error('[NEX GROUP] Metadata queue full; item discarded');return;}
 backlog.push(item);
 void drain();
});
process.on('SIGINT',async()=>{ready=false;await client.destroy();process.exit(0)});
client.initialize().catch(()=>{console.error('[NEX GROUP] Initialization failed');process.exitCode=1});
