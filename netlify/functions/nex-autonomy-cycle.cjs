'use strict';
// Scheduled, read-only inspection + review-queue creation. Never publishes FAQs
// or performs trips, payments, healthcare decisions, or staff actions.
const {query}=require('./_shared/db.cjs');
const {scan}=require('./_shared/nex-site-watch.cjs');
const {suggestGaps}=require('./_shared/nex-gap-watch.cjs');
const {json}=require('./_shared/http.cjs');
async function runCycle({queryFn=query,fetchImpl=fetch,now=()=>new Date(),logger=console}={}){
 const checks=[],summaries={changedPages:0,newReviews:0};
 try{
  const site=await scan({queryFn,fetchImpl});
  checks.push(...site.checks.map(c=>({id:c.id,ok:c.ok===true})));
  summaries.changedPages=site.changes.length;
  summaries.newReviews=site.changes.length;
 }catch{checks.push({id:'site-watch',ok:false});}
 try{
  const gaps=await suggestGaps(queryFn,now());
  summaries.newReviews+=gaps.created;
  checks.push({id:'gap-watch',ok:true});
 }catch{checks.push({id:'gap-watch',ok:false});}
 const status=checks.length&&checks.every(x=>x.ok)?'healthy':'degraded';
 try{
  await queryFn('INSERT INTO nex_autonomy_runs(status,checks,changed_pages) VALUES($1,$2::jsonb,$3)',[
   status,JSON.stringify(checks),summaries.changedPages
  ]);
 }catch{checks.push({id:'health-history',ok:false});}
 if(checks.some(x=>!x.ok))logger.warn('[NEX_AUTONOMY] degraded checks: '+checks.filter(x=>!x.ok).map(x=>x.id).join(', '));
 // Only coded outcomes, never actual page bodies, prompts or visitor details.
 return {status:checks.every(x=>x.ok)?'healthy':'degraded',checks,changedPages:summaries.changedPages,newReviews:summaries.newReviews};
}
exports.runCycle=runCycle;
exports.handler=async()=>{
 const result=await runCycle();
 return json(result.status==='healthy'?200:503,result);
};
