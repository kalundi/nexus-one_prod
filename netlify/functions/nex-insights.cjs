'use strict';
// Authenticated dashboard for aggregated Nex analytics and human review only.
const {json,bearer,parseBody}=require('./_shared/http.cjs');
const {requireUser,audit}=require('./_shared/auth.cjs');
const {query}=require('./_shared/db.cjs');
const {report,readiness}=require('./_shared/nex-intent-insights.cjs');
const {suggest}=require('./_shared/nex-ai-suggestions.cjs');
const Reviews=require('./_shared/nex-insight-reviews.cjs');
exports.handler=async event=>{
  if(!['GET','POST','PATCH'].includes(event.httpMethod))return json(405,{error:'Method not allowed'});
  try {
    const user=await requireUser(bearer(event),['ADMIN']);
    // Fallback authentication does not grant data or mutation privileges.
    if(!user.session_id)return json(403,{error:'An active administrator session is required.'});
    const params=event.queryStringParameters||{};
    if(event.httpMethod==='GET'&&params.readiness==='1')return json(200,await readiness(query));
    if(event.httpMethod==='GET'&&params.reviews==='1')return json(200,{reviews:await Reviews.list(query)});
    if(event.httpMethod==='PATCH'){
      const body=parseBody(event);
      const updated=await Reviews.setStatus(query,body.id,body.status,user.id);
      if(!updated)return json(409,{error:'Review item not found or already finalized.'});
      await audit('NEX_INSIGHT',updated.id,'NEX_REVIEW_'+updated.status.toUpperCase(),{actor:user.id}).catch(()=>{});
      return json(200,{review:updated});
    }
    const days=Number(params.days||30);
    const data=await report(query,days);
    if(event.httpMethod==='POST'){
      const ai=await suggest(data);
      if(ai.status!=='review-required')return json(200,ai);
      const item=await Reviews.save(query,user.id,data.days,ai.suggestions);
      await audit('NEX_INSIGHT',item.id,'NEX_REVIEW_CREATED',{actor:user.id,periodDays:data.days}).catch(()=>{});
      return json(200,{status:'review-required',suggestions:ai.suggestions,review:item});
    }
    return json(200,data);
  }catch(error){
    return json(error.statusCode||503,{error:error.statusCode?'Access denied or invalid review action':'Nex analytics or recommendation queue unavailable. Verify migrations and AI configuration.'});
  }
};
