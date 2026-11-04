'use strict';
// Netlify Scheduled Function. No externally supplied question, role or diagnostics URL.
// Never includes customer data, trip records, private tokens, or sample prompts in alerts.
const {run}=require('./_shared/nex-health-checks.cjs');
const {json}=require('./_shared/http.cjs');
const CHECK_IDS=new Set(['booking','services','estimate-guidance','emergency','unknown-fallback','public-page','booking-video','site-base-config']);
function cleanReport(report){
 return {status:report.status,checkedAt:report.checkedAt,
  checks:(report.checks||[]).filter(x=>CHECK_IDS.has(x.id)).map(x=>({id:x.id,ok:x.ok===true}))};
}
function makeHandler({runner=run,fetchImpl=fetch,env=process.env,logger=console,queryFn=null}={}){
 return async function handler(){
  let report;
  try{
   report=await runner({baseUrl:env.NEX_MONITOR_BASE_URL||'https://nexusmt.com',fetchImpl});
  }catch{
   report={status:'degraded',checkedAt:new Date().toISOString(),checks:[{id:'site-base-config',ok:false}]};
  }
  const result=cleanReport(report);
  // Save coded synthetic outcomes for the admin health dashboard. DB
  // availability is not required for log/alert-based monitoring to operate.
  try{
   const write=queryFn||require('./_shared/db.cjs').query;
   await write('INSERT INTO nex_autonomy_runs(status,checks,changed_pages) VALUES($1,$2::jsonb,0)',[
    result.status,JSON.stringify(result.checks)
   ]);
  }catch{logger.warn('[NEX_MONITOR] health history write unavailable');}
  if(result.status!=='healthy'){
   logger.warn('[NEX_MONITOR] degraded: '+result.checks.filter(x=>!x.ok).map(x=>x.id).join(','));
   const webhook=env.NEX_MONITOR_ALERT_WEBHOOK_URL;
   if(webhook){
    try{
     const u=new URL(webhook);
     if(u.protocol==='https:' && !u.username && !u.password){
      // No prompts, chat transcripts, identifiers, credentials, or patient data.
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),7000);
      try{
       const res=await fetchImpl(webhook,{
         method:'POST',headers:{'content-type':'application/json'},
         body:JSON.stringify({text:'Nex synthetic checks degraded: '+result.checks.filter(x=>!x.ok).map(x=>x.id).join(', ')+'. Check Netlify function logs.'}),
         signal:controller.signal
       });
       if(!res.ok)logger.warn('[NEX_MONITOR] alert delivery failed (HTTP status '+res.status+')');
      }finally{clearTimeout(timer);}
     }
    }catch{logger.warn('[NEX_MONITOR] alert delivery unavailable');}
   }
  }
  return json(result.status==='healthy'?200:503,result);
 };
}
exports.handler=makeHandler();
exports.makeHandler=makeHandler;
exports.cleanReport=cleanReport;
