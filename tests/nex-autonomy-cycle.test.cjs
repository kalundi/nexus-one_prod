'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PAGES,scan,normalizePage,digest}=require('../netlify/functions/_shared/nex-site-watch.cjs');
const {utcWeek,suggestGaps,suggestWeekly}=require('../netlify/functions/_shared/nex-gap-watch.cjs');
const {guidance}=require('../netlify/functions/_shared/nex-workflow-guides.cjs');
const {index,recommendations}=require('../netlify/functions/_shared/nex-media-index.cjs');
const {relatedFor}=require('../netlify/functions/_shared/nex-social-content.cjs');
const {makeHandler}=require('../netlify/functions/nex-autonomy-status.cjs');
const {runCycle}=require('../netlify/functions/nex-autonomy-cycle.cjs');

function inMemorySiteDb(){
 const hashes=new Map(),events=new Map();
 let reviews=0;
 const query=async(sql,args=[])=>{
  if(sql.startsWith('SELECT digest FROM nex_autonomy_snapshots'))return {rows:hashes.has(args[0])?[{digest:hashes.get(args[0])}]:[]};
  if(sql.startsWith('INSERT INTO nex_autonomy_snapshots')){if(!hashes.has(args[0]))hashes.set(args[0],args[1]);return {rows:[]};}
  if(sql.startsWith('UPDATE nex_autonomy_snapshots')){if(args[1])hashes.set(args[0],args[1]);return {rows:[]};}
  if(sql.includes('WITH review AS')&&sql.includes('nex_autonomy_changes')){
   const key=args[0]+':'+args[2];
   if(events.has(key))return {rows:[]};
   const item={id:events.size+1,review_id:++reviews};events.set(key,item);return {rows:[item]};
  }
  throw Error('Unexpected SQL: '+sql);
 };
 return {query,hashes,events};
}
const textPage='Nexus wheelchair and stretcher transport availability for planned appointments and accessible passenger booking. '.repeat(3);
const response=html=>({ok:true,status:200,headers:{get:k=>k==='content-type'?'text/html':k==='content-length'?String(html.length):''},text:async()=>html});
test('initial public source scan creates only hashes, not review suggestions',async()=>{
 const db=inMemorySiteDb();
 const first=await scan({queryFn:db.query,fetchImpl:async()=>response(textPage)});
 assert.equal(first.scanned,PAGES.length);
 assert.equal(first.changes.length,0);
 assert.ok(first.checks.every(x=>x.ok&&x.baseline));
 assert.equal(db.hashes.size,PAGES.length);
 assert.equal(db.events.size,0);
});
test('changed approved source creates one review and never saves raw HTML',async()=>{
 const db=inMemorySiteDb();
 await scan({queryFn:db.query,fetchImpl:async()=>response(textPage)});
 const changed=await scan({queryFn:db.query,fetchImpl:async(url)=>response(url.includes('/wheelchair-transportation.html')?textPage+' New wheelchair accessibility paragraph.':textPage)});
 assert.equal(changed.changes.length,1);
 assert.equal(changed.changes[0].path,'wheelchair-transportation.html');
 const again=await scan({queryFn:db.query,fetchImpl:async(url)=>response(url.includes('/wheelchair-transportation.html')?textPage+' New wheelchair accessibility paragraph.':textPage)});
 assert.equal(again.changes.length,0);
 assert.equal(db.events.size,1);
 assert.equal(digest('<div>Hello</div>'),digest('Hello'));
 assert.doesNotMatch(JSON.stringify([...db.events.keys()]),/New wheelchair accessibility paragraph/);
});
test('source drift scans use fixed approved paths and reject untrusted URLs',async()=>{
 const db=inMemorySiteDb();
 const scanned=[];
 const out=await scan({queryFn:db.query,fetchImpl:async(url,options)=>{
  scanned.push({url,method:options.method,redirect:options.redirect});return response(textPage);
 }});
 assert.equal(out.changes.length,0);
 assert.ok(scanned.every(x=>x.url.startsWith('https://nexusmt.com/')&&x.method==='GET'&&x.redirect==='manual'));
 assert.equal(normalizePage('<script>secrets</script><main>Public content</main>'),'Public content');
});
test('weekly signal uses stable UTC week key',()=>{
 assert.equal(utcWeek(new Date('2026-11-03T12:00:00Z')),'2026-11-02');
 assert.equal(utcWeek(new Date('2026-11-08T22:00:00Z')),'2026-11-02');
});
test('role-aware workflow guidance never provides instructions to an unauthorized role',()=>{
 assert.match(guidance('How can I assign a driver to a trip?','ADMIN').answer,/Dispatch board/);
 assert.equal(guidance('How can I assign a driver to a trip?','DRIVER'),null);
 assert.ok(guidance('How do I approve Nex knowledge?','ADMIN'));
 assert.equal(guidance('How do I approve Nex knowledge?','FACILITY'),null);
});
test('media index only exposes first-party curated assets, with a topical video',()=>{
 const media=index();
 assert.ok(media.length>3);
 assert.ok(media.every(x=>x.url.startsWith('https://nexusmt.com/assets/')&&!x.url.includes('..')));
 const video=recommendations('wheelchair',1);
 assert.ok(video.length===1&&video[0].kind==='video');
 const matches=relatedFor('Show wheelchair transportation video',['wheelchair']);
 assert.ok(matches.some(x=>x.kind==='video'));
});
test('administrator-only history endpoint rejects missing/non-admin sessions',async()=>{
 const handler=makeHandler({
  authenticate:async()=>({id:'dispatcher',role:'DISPATCHER',session_id:'active'}),
  queryFn:async()=>{throw Error('Must not access DB');}
 });
 const result=await handler({httpMethod:'GET',headers:{authorization:'Bearer test'}});
 assert.equal(result.statusCode,403);
});
test('daily cycle saves only check statuses and never publishes approved FAQs',async()=>{
 let saved=null;
 const result=await runCycle({
  queryFn:async(sql,args=[])=>{
   if(sql.startsWith('SELECT digest'))return {rows:[]};
   if(sql.startsWith('INSERT INTO nex_autonomy_snapshots'))return {rows:[]};
   if(sql.includes('count(*)::int AS total'))return {rows:[{total:0,unanswered:0,emergencies:0}]};
   if(sql.includes('FROM nex_intent_events'))return {rows:[]};
   if(sql.startsWith('INSERT INTO nex_autonomy_runs')){saved=args;return {rows:[]};}
   throw Error('Unexpected query');
  },
  fetchImpl:async()=>response(textPage),
  logger:{warn:()=>{}},env:{}
 });
 assert.equal(result.status,'healthy');
 assert.ok(saved);
 assert.doesNotMatch(JSON.stringify(saved),/patient|pickup address|individual conversation/i);
});

test('weekly AI briefing remains disabled without explicit protected configuration',async()=>{
 const output=await suggestWeekly(async()=>{throw Error('No SQL or AI calls permitted');},{env:{},fetchImpl:()=>{throw Error('No external AI request permitted');}});
 assert.equal(output.status,'disabled');
 assert.equal(output.created,0);
});
