'use strict';
const {json,bearer}=require('./_shared/http.cjs');
const {requireUser}=require('./_shared/auth.cjs');
const {query}=require('./_shared/db.cjs');
const {index}=require('./_shared/nex-media-index.cjs');
function makeHandler({authenticate=requireUser,queryFn=query}={}){
 return async function handler(event){
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed'});
  try{
   const user=await authenticate(bearer(event),['ADMIN']);
   if(!user||!user.session_id||user.role!=='ADMIN')return json(403,{error:'Admin session required'});
   const [latest,changes,signals,counts]=await Promise.all([
    queryFn("SELECT run_at,status,checks,changed_pages FROM nex_autonomy_runs ORDER BY run_at DESC LIMIT 15"),
    queryFn("SELECT path,discovered_at,review_id FROM nex_autonomy_changes ORDER BY discovered_at DESC LIMIT 15"),
    queryFn("SELECT signal_key,raised_at,review_id FROM nex_autonomy_signals ORDER BY raised_at DESC LIMIT 15"),
    queryFn("SELECT count(*)::int AS pending FROM nex_insight_reviews WHERE status='pending'")
   ]);
   return json(200,{
    runs:latest.rows.map(r=>({at:r.run_at,status:r.status,checks:(Array.isArray(r.checks)?r.checks:[]).map(x=>({id:String(x.id).slice(0,100),ok:x.ok===true})),changedPages:Number(r.changed_pages||0)})),
    changedPages:changes.rows,
    pendingSignals:signals.rows,
    pendingReviews:Number(counts.rows[0]?.pending||0),
    mediaIndex:{items:index().length,firstPartyOnly:true},
    policy:{autoPublish:false,autoDispatch:false,rawConversationsStored:false}
   });
  }catch{
   return json(503,{error:'Nex autonomy status unavailable. Verify migration 999.004 and database permissions.'});
  }
 };
}
exports.makeHandler=makeHandler;
exports.handler=makeHandler();
