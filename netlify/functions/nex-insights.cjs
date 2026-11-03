'use strict';
// Separate administrative read endpoint. No public access to analytics.
const {json,bearer}=require('./_shared/http.cjs');
const {requireUser}=require('./_shared/auth.cjs');
const {query}=require('./_shared/db.cjs');
const {report}=require('./_shared/nex-intent-insights.cjs');
const {suggest}=require('./_shared/nex-ai-suggestions.cjs');
exports.handler=async event=>{
  if(!['GET','POST'].includes(event.httpMethod))return json(405,{error:'Method not allowed'});
  try {
    await requireUser(bearer(event),['ADMIN']);
    const days=Number(event.queryStringParameters?.days||30);
    const data=await report(query,days);
    if(event.httpMethod==='POST'){
      // No raw conversation text leaves Nexus: only de-identified aggregate counts.
      // POST returns draft recommendations for admin review; it never publishes them.
      const result=await suggest(data);
      return json(200,result);
    }
    return json(200,data);
  }catch(error){
    return json(error.statusCode||503,{error:error.statusCode?'Access denied':'Analytics or recommendations unavailable. Verify database migration and server AI configuration.'});
  }
};
