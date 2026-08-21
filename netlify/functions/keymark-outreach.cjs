const {query}=require('./_shared/db.cjs');
const {deliver,twilioConfigured}=require('./_shared/keymark-outreach.cjs');
exports.handler=async()=>{
 try{
  if(!twilioConfigured())return {statusCode:200,body:JSON.stringify({processed:0,configurationRequired:'Twilio credentials are not configured'})};
  const pending=await query(`SELECT c.*,a.consent_status FROM keymark_communications c JOIN keymark_appointments a ON a.id=c.appointment_id WHERE c.status IN ('QUEUED','RETRY') AND c.scheduled_at<=now() AND c.attempt_count<4 ORDER BY c.scheduled_at LIMIT 25`);
  let sent=0,failed=0,blocked=0;
  for(const item of pending.rows){
   if(item.consent_status!=='GRANTED'||item.consent_verified!==true){await query(`UPDATE keymark_communications SET status='BLOCKED_CONSENT',last_error='Consent was not granted at send time' WHERE id=$1`,[item.id]);blocked++;continue}
   try{const providerId=await deliver(item.channel,item.destination,item.template_key);await query(`UPDATE keymark_communications SET status='SENT',sent_at=now(),provider_message_id=$2,attempt_count=attempt_count+1,last_error=null WHERE id=$1`,[item.id,providerId]);await query(`INSERT INTO keymark_events(appointment_id,event_type,event_status,channel,actor_role,details) VALUES($1,'OUTREACH_SENT','SENT',$2,'SYSTEM',$3)`,[item.appointment_id,item.channel,JSON.stringify({templateKey:item.template_key,providerMessageId:providerId})]);sent++}catch(error){if(error.code==='SMS_OPTED_OUT'){await query(`UPDATE keymark_communications SET status='BLOCKED_CONSENT',last_error='Recipient opted out of SMS' WHERE id=$1`,[item.id]);blocked++;continue}const attempts=Number(item.attempt_count||0)+1,status=attempts>=4?'FAILED':'RETRY';await query(`UPDATE keymark_communications SET status=$2,attempt_count=$3,last_error=$4,scheduled_at=now()+($5||' minutes')::interval WHERE id=$1`,[item.id,status,attempts,String(error.message).slice(0,500),String(Math.min(60,5*Math.pow(2,attempts-1)))]);failed++}
  }
  return {statusCode:200,body:JSON.stringify({processed:pending.rowCount,sent,failed,blocked})};
 }catch(error){console.error('[KEYMARK_OUTREACH]',error);return {statusCode:500,body:JSON.stringify({error:'KeyMark outreach processing failed'})}}
};
