const {classifySmsKeyword,recordSmsPreference,verifyTwilioSignature}=require('./_shared/sms-consent.cjs');

const OPT_IN_MESSAGE='Nexus Medical Transit: You are subscribed to transactional booking and ride updates. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.';
const HELP_MESSAGE='Nexus Medical Transit: For help with booking or ride texts, call (888) 760-4990 or email contact@nexusmt.com. Msg & data rates may apply. Reply STOP to opt out.';
const xml=body=>({statusCode:200,headers:{'content-type':'text/xml; charset=utf-8','cache-control':'no-store'},body:`<?xml version="1.0" encoding="UTF-8"?><Response>${body||''}</Response>`});
const escapeXml=value=>String(value||'').replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
function parseParams(event){const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):String(event.body||'');return Object.fromEntries(new URLSearchParams(raw))}
function webhookUrl(){if(process.env.TWILIO_SMS_WEBHOOK_URL)return process.env.TWILIO_SMS_WEBHOOK_URL;const site=String(process.env.URL||process.env.DEPLOY_PRIME_URL||'https://nexusmt.com').replace(/\/$/,'');return `${site}/webhooks/twilio/sms`}

exports.handler=async event=>{
 if(String(event.httpMethod||'POST').toUpperCase()!=='POST')return {statusCode:405,headers:{allow:'POST'},body:'Method Not Allowed'};
 const params=parseParams(event);
 const signature=event.headers?.['x-twilio-signature']||event.headers?.['X-Twilio-Signature']||'';
 if(!verifyTwilioSignature({url:webhookUrl(),params,signature,token:process.env.TWILIO_AUTH_TOKEN}))return {statusCode:403,body:'Invalid Twilio signature'};
 const action=classifySmsKeyword(params.Body,params.OptOutType);
 if(action==='STOP')await recordSmsPreference(params.From,'OPTED_OUT',{source:'TWILIO_WEBHOOK',providerMessageId:params.MessageSid||null,keyword:String(params.Body||'STOP').trim().toUpperCase()});
 if(action==='START')await recordSmsPreference(params.From,'OPTED_IN',{source:'TWILIO_WEBHOOK',providerMessageId:params.MessageSid||null,keyword:String(params.Body||'START').trim().toUpperCase()});
 if(action==='START'&&!params.OptOutType)return xml(`<Message>${escapeXml(OPT_IN_MESSAGE)}</Message>`);
 if(action==='HELP'&&!params.OptOutType)return xml(`<Message>${escapeXml(HELP_MESSAGE)}</Message>`);
 return xml('');
};

module.exports.OPT_IN_MESSAGE=OPT_IN_MESSAGE;
module.exports.HELP_MESSAGE=HELP_MESSAGE;
