const {query}=require('./_shared/db.cjs');
const {sendSms}=require('./_shared/sms-consent.cjs');

exports.handler=async()=>{
 const pending=await query(`SELECT DISTINCT ON (regexp_replace(phone,'\\D','','g')) draft_token,name,phone,current_step FROM booking_drafts WHERE completed_at IS NULL AND reminder_sent_at IS NULL AND reminder_due_at<=now() ORDER BY regexp_replace(phone,'\\D','','g'),reminder_due_at LIMIT 50`);
 let sent=0,blocked=0,failed=0;
 for(const draft of pending.rows){
  try{
   const firstName=String(draft.name||'').trim().split(/\s+/)[0];
   const greeting=firstName?`Hi ${firstName}, `:'';
   const text=`${greeting}you started booking a ride with Nexus Medical Transit but did not finish. Continue securely at https://nexusmt.com/booking-app.html or call (888) 760-4990. Msg & data rates may apply. Reply HELP for help. Reply STOP to opt out.`;
   const result=await sendSms(draft.phone,text);
   if(result.status==='sent'||result.status==='blocked-opt-out'){
    await query("UPDATE booking_drafts SET reminder_sent_at=now(),updated_at=now() WHERE completed_at IS NULL AND reminder_sent_at IS NULL AND regexp_replace(phone,'\\D','','g')=regexp_replace($1,'\\D','','g')",[draft.phone]);
    if(result.status==='sent')sent++;else blocked++;
   }
  }catch(error){failed++;console.error('[BOOKING_DRAFT_REMINDER]',draft.draft_token,error.message);}
 }
 return {statusCode:200,body:JSON.stringify({processed:pending.rowCount,sent,blocked,failed})};
};
