'use strict';
// Separate administrative read endpoint. No public access to analytics.
const {json,bearer}=require('./_shared/http.cjs');
const {requireUser}=require('./_shared/auth.cjs');
const {query}=require('./_shared/db.cjs');
const {report}=require('./_shared/nex-intent-insights.cjs');
exports.handler=async event=>{
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed'});
  try {
    await requireUser(bearer(event),['ADMIN']);
    const days=Number(event.queryStringParameters?.days||30);
    const data=await report(query,days);
    return json(200,data);
  }catch(error){
    return json(error.statusCode||503,{error:error.statusCode?'Access denied':'Analytics unavailable; ensure migration is applied.'});
  }
};
