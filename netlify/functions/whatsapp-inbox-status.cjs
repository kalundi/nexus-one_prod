'use strict';
// Admin-only, metadata-only monitoring for the initial WhatsApp integration.
const {json,bearer}=require('./_shared/http.cjs');
const {requireUser}=require('./_shared/auth.cjs');
const {query}=require('./_shared/db.cjs');
function makeHandler({authenticate=requireUser,dbQuery=query}={}){
 return async event=>{
  if(String(event.httpMethod||'').toUpperCase()!=='GET')return json(405,{error:'Method not allowed'},{allow:'GET'});
  try{
   const user=await authenticate(bearer(event),['ADMIN']);
   if(!user||user.role!=='ADMIN'||!user.session_id)return json(403,{error:'Active administrator session required'});
   const result=await dbQuery(`SELECT direction,message_type,occurred_at,received_at,
     left(contact_digest,12) AS conversation_key
     FROM nex_whatsapp_message_events ORDER BY received_at DESC LIMIT 100`);
   return json(200,{events:result.rows,
     policy:{mode:'metadata_only',autoReply:false,sendEnabled:false,
       importedHistory:false,storedMessageBodies:false}});
  }catch(error){
   if(error?.statusCode===401||error?.statusCode===403)return json(error.statusCode,{error:error.message});
   return json(503,{error:'WhatsApp inbox status unavailable'});
  }
 };
}
exports.makeHandler=makeHandler;
exports.handler=makeHandler();
