const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const M=require('../netlify/functions/_shared/maintenance.cjs');
test('two failures confirm one incident, repeated samples deduplicate, recovery and recurrence reset it',()=>{
 const fail={id:'booking',label:'Booking',status:'fail',detail:'HTTP 500'};
 let r=M.reduceReport({},[fail],0);assert.equal(r.checks[0].incidentAt,null);
 r=M.reduceReport(r,[fail],1000);assert.equal(r.history.length,1);const incident=r.checks[0].incidentAt;
 r=M.reduceReport(r,[fail],2000);assert.equal(r.history.length,1);assert.equal(r.checks[0].incidentAt,incident);
 r=M.reduceReport(r,[{...fail,status:'pass'}],3000);assert.equal(r.history[0].event,'Recovered');assert.equal(r.checks[0].incidentAt,null);
 r=M.reduceReport(r,[fail],4000);r=M.reduceReport(r,[fail],5000);assert.notEqual(r.checks[0].incidentAt,incident);
});
function fixtureFetcher({bad=false,aiText='Review the failed check.'}={}){
 return async (url,options)=>{
  if(url==='https://api.openai.com/v1/responses')return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:aiText}]}]}),{headers:{'content-type':'application/json'}});
  const target=M.TARGETS.find(t=>'https://nexusmt.com'+t[2]===url);assert.ok(target,'Only fixed allowlisted URLs are probed');
  assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,undefined);
  return new Response(target[3] || JSON.stringify({error:'Authentication required'}),{status:bad?503:target[4]||200,headers:{'content-type':target[3]?'text/html':'application/json'}});
 };
}
async function fixture(run){const db=new PGlite();try{await run(db,(...args)=>db.query(...args));}finally{await db.close();}}
test('real SQL persists reports, cooldown and lease prevent repeated runs, acknowledgment survives subsequent samples',()=>fixture(async(db,query)=>{
 let bad=true;const monitor=M.createMonitor({query,env:{GOOGLE_MAPS_BROWSER_KEY:'SECRET'},fetchImpl:(...args)=>fixtureFetcher({bad})(...args)});
 assert.equal((await monitor.snapshot()).checks.length,0);
 let report=await monitor.run();assert.equal(report.checks.filter(c=>c.status==='fail').length,M.TARGETS.length);assert.equal(JSON.stringify(report).includes('SECRET'),false);
 assert.equal((await monitor.run()).skipped,true);
 await query("UPDATE maintenance_monitor SET last_started=now()-interval '2 minutes'");report=await monitor.run();assert.ok(report.checks[0].incidentAt);assert.equal(report.history.length,M.TARGETS.length);
 await monitor.acknowledge('booking');assert.equal((await monitor.snapshot()).checks[0].acknowledged,true);
 await query("UPDATE maintenance_monitor SET last_started=now()-interval '2 minutes'");await monitor.run();assert.equal((await monitor.snapshot()).checks[0].acknowledged,true);
 bad=false;await query("UPDATE maintenance_monitor SET last_started=now()-interval '2 minutes'");report=await monitor.run();assert.equal(report.checks[0].acknowledged,false);assert.equal(report.history[0].event,'Recovered');
 const acknowledgments=(await query('SELECT acknowledgements FROM maintenance_monitor')).rows[0].acknowledgements;assert.deepEqual(acknowledgments,{});
 await query("UPDATE maintenance_monitor SET last_started=now()-interval '2 minutes',lease_until=now()+interval '1 minute'");assert.equal((await monitor.run()).skipped,true);
 await assert.rejects(monitor.acknowledge('missing'),e=>e.statusCode===404);
 const rls=(await query("SELECT relrowsecurity FROM pg_class WHERE relname='maintenance_monitor'")).rows[0];assert.equal(rls.relrowsecurity,true);
 await db.exec('CREATE ROLE maintenance_reader; GRANT USAGE ON SCHEMA public TO maintenance_reader; GRANT SELECT ON maintenance_monitor TO maintenance_reader; SET ROLE maintenance_reader;');
 assert.equal((await query('SELECT * FROM maintenance_monitor')).rows.length,0);
 await db.exec('RESET ROLE');
}));
test('missing AI is explicit; connected AI sends only synthetic findings with bounded stateless request and hourly limit',()=>fixture(async(db,query)=>{
 const missing=M.createMonitor({query,env:{},fetchImpl:fixtureFetcher()});await assert.rejects(missing.investigate(),e=>e.statusCode===503);
 let payload;
 const monitor=M.createMonitor({query,env:{OPENAI_API_KEY:'DO-NOT-EXPOSE',OPENAI_MODEL:'configured-model'},fetchImpl:async(url,options)=>{if(url.includes('api.openai.com'))payload=JSON.parse(options.body);return fixtureFetcher({bad:true})(url,options);}});
 await monitor.run();let report=await monitor.investigate();assert.equal(report.investigation.status,'Review required');assert.equal(report.aiConnected,true);assert.equal(JSON.stringify(report).includes('DO-NOT-EXPOSE'),false);
 assert.equal(payload.store,false);assert.equal(payload.max_output_tokens,1600);assert.equal(payload.tools,undefined);assert.equal(payload.model,'configured-model');assert.equal(payload.input.includes('DO-NOT-EXPOSE'),false);
 await assert.rejects(monitor.investigate(),e=>e.statusCode===429);
}));
test('AI provider failure preserves reports and does not expose provider errors',()=>fixture(async(db,query)=>{
 const monitor=M.createMonitor({query,env:{MAINTENANCE_AI_API_KEY:'secret',MAINTENANCE_AI_MODEL:'model'},fetchImpl:async(url,options)=>url.includes('api.openai.com')?new Response('secret provider details',{status:500}):fixtureFetcher({bad:true})(url,options)});
 await monitor.run();await assert.rejects(monitor.investigate(),e=>e.statusCode===502&&!e.message.includes('secret'));assert.ok((await monitor.snapshot()).checkedAt);
}));
test('admin API rejects anonymous and non-admin roles before any monitor access',async()=>{
 let touched=false;
 const handler=M.createHandler({monitor:{snapshot:async()=>{touched=true;return {checks:[]};}},requireUser:async(token,roles)=>{assert.deepEqual(roles,['ADMIN']);if(token!=='admin')throw Object.assign(Error('Denied'),{statusCode:token?403:401});},bearer:e=>e.token,json:(statusCode,body)=>({statusCode,body}),parseBody:()=>({})});
 for(const token of ['', 'patient','driver','dispatcher','facility']){await assert.rejects(handler({token},['admin','maintenance'],'GET'));assert.equal(touched,false);}
 assert.equal((await handler({token:'admin'},['admin','maintenance'],'GET')).statusCode,200);
 assert.equal(await handler({},['unrelated'],'GET'),null);
 assert.equal((await handler({token:'admin'},['admin','maintenance','delete'],'POST')).statusCode,404);
});
test('scheduled handler runs only for published production deploys with a scheduler payload',async()=>{
 const {createScheduledHandler}=await import('../netlify/functions/maintenance-monitor.mjs');let calls=0;
 const handler=createScheduledHandler({run:async()=>{calls++;return {checkedAt:'fixture',checks:[]};}});
 const request=()=>new Request('https://nexusmt.com',{method:'POST',body:JSON.stringify({next_run:'2026-10-25T17:00:00Z'})});
 for(const deploy of [{context:'deploy-preview',published:false},{context:'branch-deploy',published:false},{context:'production',published:false}])await handler(request(),{deploy});
 assert.equal(calls,0);
 assert.equal((await handler(new Request('https://nexusmt.com',{method:'POST',body:'{}'}),{deploy:{context:'production',published:true}})).status,400);
 await handler(request(),{deploy:{context:'production',published:true}});assert.equal(calls,1);
});
test('redirects, wrong content, and network exceptions fail without retaining sensitive response bodies',()=>fixture(async(db,query)=>{
 const monitor=M.createMonitor({query,env:{},fetchImpl:async(url)=>{
  if(url.endsWith('booking-app.html'))return new Response('PRIVATE RESPONSE BODY',{status:302});
  if(url.endsWith('livecare.html'))throw Error('PRIVATE EXCEPTION');
  return new Response('Wrong content',{status:200,headers:{'content-type':'text/html'}});
 }});const report=await monitor.run();assert.equal(report.checks[0].status,'fail');assert.equal(report.checks[1].status,'fail');assert.equal(JSON.stringify(report).includes('PRIVATE'),false);
}));
