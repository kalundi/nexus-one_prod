const crypto=require('crypto');
const {query}=require('./db.cjs');

const STOP_KEYWORDS=new Set(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','REVOKE','OPTOUT','QUIT']);
const START_KEYWORDS=new Set(['START','YES','UNSTOP']);
const HELP_KEYWORDS=new Set(['HELP','INFO']);

function normalizePhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(!digits)return '';
 if(digits.length===10)return `+1${digits}`;
 if(digits.length===11&&digits.startsWith('1'))return `+${digits}`;
 return `+${digits}`;
}

function classifySmsKeyword(body,optOutType=''){
 const providerType=String(optOutType||'').trim().toUpperCase();
 if(['STOP','START','HELP'].includes(providerType))return providerType;
 const keyword=String(body||'').trim().toUpperCase();
 if(STOP_KEYWORDS.has(keyword))return 'STOP';
 if(START_KEYWORDS.has(keyword))return 'START';
 if(HELP_KEYWORDS.has(keyword))return 'HELP';
 return '';
}

function twilioSignature(url,params,token){
 const payload=Object.keys(params||{}).sort().reduce((value,key)=>value+key+String(params[key]??''),String(url||''));
 return crypto.createHmac('sha1',String(token||'')).update(payload).digest('base64');
}

function verifyTwilioSignature({url,params,signature,token}){
 if(!url||!signature||!token)return false;
 const expected=Buffer.from(twilioSignature(url,params,token));
 const actual=Buffer.from(String(signature));
 return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
}

async function ensureSmsConsentTable(){
 await query(`CREATE TABLE IF NOT EXISTS sms_consent_registry (
  phone_number text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('OPTED_OUT','OPTED_IN')),
  source text NOT NULL DEFAULT 'APPLICATION',
  provider_message_id text,
  last_keyword text,
  opted_out_at timestamptz,
  opted_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
 )`);
}

async function recordSmsPreference(phone,status,{source='APPLICATION',providerMessageId=null,keyword=null}={}){
 const normalized=normalizePhone(phone);
 if(!normalized)throw new Error('A valid phone number is required');
 if(!['OPTED_OUT','OPTED_IN'].includes(status))throw new Error('Invalid SMS consent status');
 await ensureSmsConsentTable();
 await query(`INSERT INTO sms_consent_registry(phone_number,status,source,provider_message_id,last_keyword,opted_out_at,opted_in_at)
  VALUES($1,$2,$3,$4,$5,CASE WHEN $2='OPTED_OUT' THEN now() END,CASE WHEN $2='OPTED_IN' THEN now() END)
  ON CONFLICT(phone_number) DO UPDATE SET status=EXCLUDED.status,source=EXCLUDED.source,provider_message_id=COALESCE(EXCLUDED.provider_message_id,sms_consent_registry.provider_message_id),last_keyword=EXCLUDED.last_keyword,opted_out_at=CASE WHEN EXCLUDED.status='OPTED_OUT' THEN now() ELSE sms_consent_registry.opted_out_at END,opted_in_at=CASE WHEN EXCLUDED.status='OPTED_IN' THEN now() ELSE sms_consent_registry.opted_in_at END,updated_at=now()`,[normalized,status,String(source||'APPLICATION'),providerMessageId,keyword]);
 return {phone:normalized,status};
}

async function isSmsOptedOut(phone){
 const normalized=normalizePhone(phone);
 if(!normalized)return false;
 await ensureSmsConsentTable();
 const result=await query('SELECT status FROM sms_consent_registry WHERE phone_number=$1 LIMIT 1',[normalized]);
 return result.rows[0]?.status==='OPTED_OUT';
}

async function sendSms(to,body){
 const normalized=normalizePhone(to);
 if(!normalized)return {status:'skipped-no-phone'};
 if(await isSmsOptedOut(normalized))return {status:'blocked-opt-out'};
 if(!process.env.TWILIO_ACCOUNT_SID||!process.env.TWILIO_AUTH_TOKEN||!process.env.TWILIO_PHONE_NUMBER)return {status:'skipped'};
 const form=new URLSearchParams({To:normalized,From:process.env.TWILIO_PHONE_NUMBER,Body:String(body||'')});
 const auth=Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
 const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${auth}`,'content-type':'application/x-www-form-urlencoded'},body:form});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  if(Number(data.code)===21610)await recordSmsPreference(normalized,'OPTED_OUT',{source:'TWILIO_21610',providerMessageId:data.sid||null,keyword:'STOP'}).catch(()=>{});
  throw Object.assign(new Error(data.message||`Twilio SMS failed (${response.status})`),{code:data.code,statusCode:response.status});
 }
 return {status:'sent',id:data.sid};
}

module.exports={STOP_KEYWORDS,START_KEYWORDS,HELP_KEYWORDS,normalizePhone,classifySmsKeyword,twilioSignature,verifyTwilioSignature,ensureSmsConsentTable,recordSmsPreference,isSmsOptedOut,sendSms};
