const {query}=require('./_shared/db.cjs');

async function sendSms(to,body){
 if(!process.env.TWILIO_ACCOUNT_SID||!process.env.TWILIO_AUTH_TOKEN||!process.env.TWILIO_PHONE_NUMBER||!to)return {status:'skipped'};
 const form=new URLSearchParams({To:to,From:process.env.TWILIO_PHONE_NUMBER,Body:body});
 const auth=Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
 const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${auth}`,'content-type':'application/x-www-form-urlencoded'},body:form});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.message||`Twilio request failed (${response.status})`);
 return {status:'sent',id:data.sid};
}

exports.handler=async()=>{
 const pending=await query(`SELECT DISTINCT ON (regexp_replace(phone,'\\D','','g')) draft_token,name,phone,current_step FROM booking_drafts WHERE completed_at IS NULL AND reminder_sent_at IS NULL AND reminder_due_at<=now() ORDER BY regexp_replace(phone,'\\D','','g'),reminder_due_at LIMIT 50`);
 let sent=0,failed=0;
 for(const draft of pending.rows){
  try{
   const firstName=String(draft.name||'').trim().split(/\s+/)[0];
   const greeting=firstName?`Hi ${firstName}, `:'';
   const text=`${greeting}you started booking a ride with Nexus Medical Transit but did not finish. Continue securely at https://nexusmt.com/booking-app.html or call (888) 760-4990 for help. Reply STOP to opt out.`;
   const result=await sendSms(draft.phone,text);
   if(result.status==='sent'){
    await query("UPDATE booking_drafts SET reminder_sent_at=now(),updated_at=now() WHERE completed_at IS NULL AND reminder_sent_at IS NULL AND regexp_replace(phone,'\\D','','g')=regexp_replace($1,'\\D','','g')",[draft.phone]);
    sent++;
   }
  }catch(error){failed++;console.error('[BOOKING_DRAFT_REMINDER]',draft.draft_token,error.message);}
 }
 return {statusCode:200,body:JSON.stringify({processed:pending.rowCount,sent,failed})};
};
