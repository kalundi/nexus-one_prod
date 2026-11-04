'use strict';
// Privacy-safe Nex synthetic checks. Never send patient names, trips or chat logs.
// Each check returns a stable code, pass/fail and bounded duration only.
const {createAssistant}=require('./visitor-assistant-core.cjs');
const CASES=Object.freeze([
 {id:'booking',question:'How does booking work?',check:body=>body.mode!=='fallback'&&body.sources?.includes('booking-how')&&body.relatedContent?.some(x=>x.kind==='video')&&body.relatedContent?.some(x=>x.url==='https://mynexusride.com')},
 {id:'services',question:'What services do you offer?',check:body=>body.sources?.includes('services-overview')&&/wheelchair/i.test(body.answer)},
 {id:'estimate-guidance',question:'How much does a wheelchair ride cost?',check:body=>body.sources?.includes('pricing')&&!/\$\s*\d/.test(body.answer)},
 {id:'emergency',question:'Someone is having a heart attack',check:body=>body.mode==='safety'&&/\b911\b/.test(body.answer)&&!body.relatedContent},
 {id:'unknown-fallback',question:'What is the molecular formula of the imaginary element unobtainium?',check:body=>body.mode==='fallback'&&!body.relatedContent}
]);
function timeoutFetch(fetchImpl,ms){
 return async function(url,opts={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetchImpl(url,{...opts,signal:controller.signal,redirect:'follow'});}
  finally{clearTimeout(timer);}
 };
}
function isAllowedBase(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:' && !u.username && !u.password &&
    (u.hostname==='nexusmt.com'||u.hostname==='www.nexusmt.com'||u.hostname.endsWith('.netlify.app'));
 }catch{return false;}
}
function checkContentType(headers,kind){
 const type=String(headers?.get?.('content-type')||'').toLowerCase();
 if(kind==='video')return /^video\/mp4\b/.test(type);
 return /text\/html/.test(type);
}
async function run({fetchImpl=fetch,baseUrl='https://nexusmt.com',assistant=null,now=Date.now,timeoutMs=9000}={}){
 const started=now();
 const checks=[];
 const core=assistant||createAssistant({env:{},now,fetchImpl:async()=>{throw Error('Model network disallowed in deterministic diagnostics');}});
 for(const [i,c] of CASES.entries()){
  const start=now();
  try{
   const r=await core.ask(c.question,'nex-synthetic-'+i);
   checks.push({id:c.id,ok:r.status===200&&Boolean(c.check(r.body||{})),durationMs:Math.max(0,now()-start)});
  }catch{checks.push({id:c.id,ok:false,durationMs:Math.max(0,now()-start)});}
 }
 if(isAllowedBase(baseUrl)){
  const limited=timeoutFetch(fetchImpl,timeoutMs);
  const url=new URL(baseUrl);
  for(const [id,pathname,kind] of [
   ['public-page','/ask-nex.html','html'],
   ['booking-video','/assets/nexus-booking-app-walkthrough-v6-narrated.mp4','video']]){
   const start=now();
   try{
    // HEAD asks only for headers: no synthetic chat requests, PII or analytics events.
    const response=await limited(new URL(pathname,url).toString(),{method:'HEAD',cache:'no-store'});
    checks.push({id,ok:response.ok&&checkContentType(response.headers,kind),durationMs:Math.max(0,now()-start)});
   }catch{checks.push({id,ok:false,durationMs:Math.max(0,now()-start)});}
  }
 }else checks.push({id:'site-base-config',ok:false,durationMs:0});
 return {
  status:checks.every(c=>c.ok)?'healthy':'degraded',
  checkedAt:new Date(now()).toISOString(),
  durationMs:Math.max(0,now()-started),
  checks
 };
}
module.exports={run,CASES,isAllowedBase,checkContentType};
