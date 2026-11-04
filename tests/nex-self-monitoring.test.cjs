'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,isAllowedBase,checkContentType}=require('../netlify/functions/_shared/nex-health-checks.cjs');
const {makeHandler}=require('../netlify/functions/nex-monitor.cjs');

function fakeResponse(kind,ok=true){
 return {ok,status:ok?200:404,headers:{get:key=>key==='content-type'?(kind==='video'?'video/mp4':'text/html; charset=utf-8'):''}};
}
test('healthy synthetic public answers and deployed asset probes pass',async()=>{
 const requested=[];
 const result=await run({
  fetchImpl:async(url,opts)=>{
   requested.push({url,method:opts.method});
   return fakeResponse(url.endsWith('.mp4')?'video':'html');
  }
 });
 assert.equal(result.status,'healthy',JSON.stringify(result));
 assert.equal(result.checks.length,7);
 assert.deepEqual(requested.map(x=>x.method),['HEAD','HEAD']);
 assert.ok(result.checks.every(x=>x.ok));
});
test('degraded media MIME type is caught without content or patient data',async()=>{
 const result=await run({fetchImpl:async()=>fakeResponse('html')});
 assert.equal(result.status,'degraded');
 assert.deepEqual(result.checks.filter(x=>!x.ok).map(x=>x.id),['booking-video']);
 assert.ok(result.checks.every(x=>!('question' in x)&&!('answer' in x)&&!('patient' in x)));
});
test('invalid monitor base is rejected to avoid untrusted outbound fetch',async()=>{
 assert.equal(isAllowedBase('http://nexusmt.com'),false);
 assert.equal(isAllowedBase('https://nexusmt.com.evil.com'),false);
 assert.equal(isAllowedBase('https://user:pass@nexusmt.com'),false);
 assert.equal(isAllowedBase('https://example.netlify.app'),false);
 const result=await run({baseUrl:'https://nexusmt.com.evil.com',fetchImpl:()=>{throw Error('must not fetch');}});
 assert.equal(result.status,'degraded');
 assert.ok(result.checks.some(x=>x.id==='site-base-config'&&!x.ok));
});
test('video probe rejects SPA HTML fallback masquerading as a file',()=>{
 assert.equal(checkContentType(fakeResponse('video').headers,'video'),true);
 assert.equal(checkContentType(fakeResponse('html').headers,'video'),false);
});
test('degraded monitor sends bounded alert only when configured',async()=>{
 let sent=null;
 const output=await makeHandler({
  runner:async()=>({status:'degraded',checkedAt:'2026-11-03T00:00:00.000Z',
   checks:[{id:'booking',ok:false},{id:'bad-private-id',ok:false}]}),
  env:{NEX_MONITOR_ALERT_WEBHOOK_URL:'https://example.com/webhook'},
  fetchImpl:async(url,opts)=>{sent={url,body:JSON.parse(opts.body)};return {ok:true,status:200};},
  logger:{warn:()=>{}}
 })();
 assert.equal(output.statusCode,503);
 assert.deepEqual(JSON.parse(output.body).checks,[{id:'booking',ok:false}]);
 assert.equal(sent.url,'https://example.com/webhook');
 assert.match(sent.body.text,/booking/);
 assert.doesNotMatch(sent.body.text,/bad-private-id|patient|conversation|token/i);
});
test('healthy monitor does not send an alert',async()=>{
 const output=await makeHandler({
  runner:async()=>({status:'healthy',checkedAt:'2026-11-03T00:00:00.000Z',checks:[{id:'booking',ok:true}]}),
  env:{NEX_MONITOR_ALERT_WEBHOOK_URL:'https://example.com/webhook'},
  fetchImpl:async()=>{throw Error('unexpected webhook');}
 })();
 assert.equal(output.statusCode,200);
});
