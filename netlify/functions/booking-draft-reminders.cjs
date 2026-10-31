const {query}=require('./_shared/db.cjs');
const {sendSms,isValidUsPhone}=require('./_shared/sms-consent.cjs');

// A draft whose phone can never receive an SMS must not be retried on the
// every-minute schedule forever (Oct 2026: three such drafts produced
// ~17,120 Twilio 21211 Invalid 'To' failures in one week). Permanent
// failures are parked by stamping reminder_sent_at plus reminder_last_error
// (columns from migration 099.001); transient failures retry a bounded
// number of times with the due time pushed forward instead of re-firing
// on the next minute's run.
const MAX_REMINDER_ATTEMPTS=3;
const RETRY_DELAY_MINUTES=15;
const PERMANENT_TWILIO_ERROR_CODES=new Set([21211,21408,21610,21612]);

const PHONE_MATCH=`regexp_replace(phone,'\\D','','g')=regexp_replace($1,'\\D','','g')`;
const STILL_DUE=`completed_at IS NULL AND reminder_sent_at IS NULL`;

async function parkDraft(phone,{attempts,error}){
 await query(`UPDATE booking_drafts SET reminder_sent_at=now(),reminder_attempts=$2,reminder_last_error=$3,updated_at=now() WHERE ${STILL_DUE} AND ${PHONE_MATCH}`,[phone,attempts,error]);
}

async function deferDraft(phone,{attempts,error}){
 await query(`UPDATE booking_drafts SET reminder_attempts=$2,reminder_last_error=$3,reminder_due_at=now()+($4||' minutes')::interval,updated_at=now() WHERE ${STILL_DUE} AND ${PHONE_MATCH}`,[phone,attempts,error,String(RETRY_DELAY_MINUTES*attempts)]);
}

exports.handler=async()=>{
 const pending=await query(`SELECT DISTINCT ON (regexp_replace(phone,'\\D','','g')) draft_token,name,phone,current_step,reminder_attempts FROM booking_drafts WHERE completed_at IS NULL AND reminder_sent_at IS NULL AND reminder_due_at<=now() ORDER BY regexp_replace(phone,'\\D','','g'),reminder_due_at LIMIT 50`);
 let sent=0,blocked=0,failed=0,undeliverable=0;
 for(const draft of pending.rows){
  const attempts=Number(draft.reminder_attempts||0)+1;
  if(!isValidUsPhone(draft.phone)){
   await parkDraft(draft.phone,{attempts,error:'invalid-phone-format'});
   undeliverable++;
   continue;
  }
  try{
   const firstName=String(draft.name||'').trim().split(/\s+/)[0];
   const greeting=firstName?`Hi ${firstName}, `:'';
   // Branded pattern (approved 2026-10-31): standard prefix + primary number.
   const text=`Nexus Medical Transit: ${greeting}${firstName?'you':'You'} started booking a ride with us but did not finish. Continue securely at https://mynexusride.com or call (888) 639-5766. Msg & data rates may apply. Reply HELP for help. Reply STOP to opt out.`;
   const result=await sendSms(draft.phone,text);
   if(result.status==='sent'||result.status==='blocked-opt-out'){
    await query("UPDATE booking_drafts SET reminder_sent_at=now(),reminder_attempts=$2,updated_at=now() WHERE completed_at IS NULL AND reminder_sent_at IS NULL AND regexp_replace(phone,'\\D','','g')=regexp_replace($1,'\\D','','g')",[draft.phone,attempts]);
    if(result.status==='sent')sent++;else blocked++;
   }
  }catch(error){
   failed++;
   console.error('[BOOKING_DRAFT_REMINDER]',draft.draft_token,error.message);
   const code=Number(error.code);
   if(PERMANENT_TWILIO_ERROR_CODES.has(code)){
    await parkDraft(draft.phone,{attempts,error:`twilio-${code}`});
    undeliverable++;
   }else if(attempts>=MAX_REMINDER_ATTEMPTS){
    await parkDraft(draft.phone,{attempts,error:`max-attempts:${code||'unknown'}`});
   }else{
    await deferDraft(draft.phone,{attempts,error:`twilio-${code||'transient'}`});
   }
  }
 }
 return {statusCode:200,body:JSON.stringify({processed:pending.rowCount,sent,blocked,failed,undeliverable})};
};

exports.MAX_REMINDER_ATTEMPTS=MAX_REMINDER_ATTEMPTS;
exports.PERMANENT_TWILIO_ERROR_CODES=PERMANENT_TWILIO_ERROR_CODES;
