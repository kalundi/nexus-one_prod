'use strict';
// Administrator-only aggregate activity. No chat contents or contact identities.
const {json,bearer}=require('./_shared/http.cjs');
const {requireUser}=require('./_shared/auth.cjs');
const {query}=require('./_shared/db.cjs');
function makeHandler({authenticate=requireUser,dbQuery=query}={}){
 return async event=>{
  if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed'},{allow:'GET'});
  try{
   const user=await authenticate(bearer(event),['ADMIN']);
   if(!user||user.role!=='ADMIN'||!user.session_id)return json(403,{error:'Active administrator session required'});
   const {rows}=await dbQuery(`SELECT group_digest,signal_type,count(*)::int AS count,max(received_at) AS latest
    FROM nex_group_signals
    WHERE received_at > now()-interval '7 days'
    GROUP BY group_digest,signal_type ORDER BY max(received_at) DESC LIMIT 100`);
   return json(200,{events:rows.map(r=>({
     group_key:String(r.group_digest).slice(0,12),signal_type:r.signal_type,
     count:Number(r.count),latest:r.latest
   })),policy:{autoReply:false,messageBodiesStored:false,historyImported:false,windowDays:7}});
  }catch(e){
   if(e?.statusCode===401||e?.statusCode===403)return json(e.statusCode,{error:e.message});
   return json(503,{error:'Group activity unavailable'});
  }
 };
}
exports.makeHandler=makeHandler;exports.handler=makeHandler();
