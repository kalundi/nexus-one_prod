const {classifySmsKeyword,recordSmsPreference,verifyTwilioSignature}=require('./_shared/sms-consent.cjs');

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
 if(action==='HELP'&&!params.OptOutType)return xml(`<Message>${escapeXml('Nexus Medical Transit support: call (888) 760-4990. Reply STOP to stop texts.')}</Message>`);
 return xml('');
};
