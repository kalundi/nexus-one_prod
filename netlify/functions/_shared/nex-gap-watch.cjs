'use strict';
// Proactive review suggestions from aggregated counts only (no raw questions).
const {report}=require('./nex-intent-insights.cjs');
const SAFE_TERM=/^[a-z -]{2,24}$/;
function utcWeek(date=new Date()){
 const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 const dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);
 return d.toISOString().slice(0,10);
}
async function suggestGaps(queryFn,clock=new Date()){
 const data=await report(queryFn,7);
 const total=Math.max(0,Number(data.summary?.total||0));
 const unanswered=Math.max(0,Number(data.summary?.unanswered||0));
 if(total<8||unanswered<3)return {created:0,signals:0};
 let created=0,signals=0;
 for(const gap of (data.gaps||[]).slice(0,5)){
  const count=Number(gap.count||0);
  const terms=Array.isArray(gap.terms)?gap.terms.filter(t=>SAFE_TERM.test(t)).sort().slice(0,4):[];
  if(count<3||!terms.length)continue;
  signals++;
  const sig='gap:'+utcWeek(clock)+':'+terms.join(',');
  const text='Nex received '+count+' unanswered questions in the past 7 days containing the recognized topic labels '+terms.join(', ')+'. Review approved Nexus public pages and consider a new verified FAQ or an intent-recognition improvement. These are question counts, not people, confirmed trips or validated demand. Human approval and separate publication are required.';
  const r=await queryFn(
   "WITH review AS (INSERT INTO nex_insight_reviews(created_by,period_days,suggestion) "+
   "SELECT 'nex-gap-watch',7,$2 WHERE NOT EXISTS (SELECT 1 FROM nex_autonomy_signals WHERE signal_key=$1) RETURNING id), "+
   "signal AS (INSERT INTO nex_autonomy_signals(signal_key,review_id) SELECT $1,id FROM review ON CONFLICT DO NOTHING RETURNING review_id) "+
   "SELECT review_id FROM signal",
   [sig,text]);
  if(r.rows.length)created++;
 }
 return {created,signals};
}
module.exports={utcWeek,suggestGaps};
