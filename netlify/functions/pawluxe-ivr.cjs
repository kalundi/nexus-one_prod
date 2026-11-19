// Pawluxe Club main line (+1 877-729-5061) voice menu.
// Twilio requests this endpoint for the initial call and for every
// Gather / Dial / Record action callback (step passed as a query param).
// Menu: 1 = animal consultant (rings the consultant line), 2 = shop,
// 3 = book pet care, 4 = membership, 5 = holiday, 6 = hours/info,
// 7 = voicemail, 9 = repeat menu.
// Voicemail-bound callers are transferred to the voicemail line
// (VOICEMAIL_NUMBER); if that line does not answer, the caller falls
// back to leaving a recorded message here so no caller is lost.
// No input anywhere falls through to voicemail so no caller is lost.
const {verifyTwilioSignature}=require('./_shared/sms-consent.cjs');

const CONSULTANT_NUMBER='+13015007946';
const VOICEMAIL_NUMBER='+12272452912';
const VOICE='Polly.Joanna';
const PATH='/webhooks/pawluxe/ivr';

const xml=body=>({statusCode:200,headers:{'content-type':'text/xml; charset=utf-8','cache-control':'no-store'},body:`<?xml version="1.0" encoding="UTF-8"?><Response>${body||''}</Response>`});
const say=text=>`<Say voice="${VOICE}">${text}</Say>`;
let BASE='';
const selfUrl=step=>`${BASE}${PATH}${step?`?step=${step}`:''}`;

const INFO={
 '2':'Our shop just stocked up for the holidays: snuffle toys, festive pet toys, and best sellers starting at seven dollars. Shop anytime at pawluxe dot club, and members earn points on every order.',
 '3':'We offer dog walking from fifteen dollars, pet sitting, overnight stays, boarding, and pet taxi, seven days a week. Holiday spots fill fast, and an animal consultant can book you right now.',
 '4':'Pawluxe Plus and V I P members save on every order and every booking, earn points, and get priority holiday boarding. A consultant can sign you up in under a minute.',
 '5':'Happy Howlidays from Pawluxe Club! Holiday boarding and overnight care are booking now, and our Christmas collection is in the shop. Book early, because when those spots are gone, they are gone.',
 '6':'Pawluxe Club is open online around the clock at pawluxe dot club. Pet care is by appointment, seven days a week.'
};

function voicemailTwiml(intro){
 return say(intro)
  +`<Record maxLength="120" transcribe="true" playBeep="true" action="${selfUrl('thanks')}" method="POST"/>`
  +say('We did not hear a message. Visit us anytime at pawluxe dot club. Goodbye.')
  +'<Hangup/>';
}

function voicemailTransferTwiml(intro){
 return say(intro)
  +`<Dial timeout="25" action="${selfUrl('aftervm')}" method="POST">${VOICEMAIL_NUMBER}</Dial>`;
}

function buildTwiml({digits,step,dialCallStatus,base}={}){
 BASE=String(base||'').replace(/\/$/,'');
 if(step==='afterdial'){
  if(dialCallStatus==='completed')return '<Hangup/>';
  return voicemailTransferTwiml('Sorry we missed you. Please hold while we connect you.');
 }
 if(step==='aftervm'){
  if(dialCallStatus==='completed')return '<Hangup/>';
  return voicemailTwiml('Sorry we missed you. Please leave your name, your phone number, and how we can help after the tone. We will return your call within 24 hours.');
 }
 if(step==='voicemail'){
  return voicemailTransferTwiml('Please hold while we connect you.');
 }
 if(step==='thanks'){
  return say('Thank you for calling Pawluxe Club. Your message is in, and we will call you back within 24 hours. In the meantime, shop new arrivals and book care anytime at pawluxe dot club. Happy Howlidays!')+'<Hangup/>';
 }
 if(step==='postinfo'){
  return `<Gather numDigits="1" timeout="6" action="${selfUrl()}" method="POST">`
   +say('To talk to an animal consultant now, press 1. To leave a message and get a call back within 24 hours, press 7. Or press 9 to hear the menu again.')
   +'</Gather>'
   +`<Redirect method="POST">${selfUrl('voicemail')}</Redirect>`;
 }
 if(digits==='1'){
  return say('Connecting you with an animal consultant now. Please hold.')
   +`<Dial timeout="25" action="${selfUrl('afterdial')}" method="POST">${CONSULTANT_NUMBER}</Dial>`;
 }
 if(digits&&INFO[digits]){
  return say(INFO[digits])+`<Redirect method="POST">${selfUrl('postinfo')}</Redirect>`;
 }
 if(digits==='7'){
  return `<Redirect method="POST">${selfUrl('voicemail')}</Redirect>`;
 }
 // Main menu: initial call, digit 9, or any unrecognized digit.
 return `<Gather numDigits="1" timeout="6" action="${selfUrl()}" method="POST">`
  +say('Thank you for calling Pawluxe Club, premium pet care, thoughtfully delivered. Press 1 to talk to an animal consultant. Press 2 for shop best sellers and new arrivals. Press 3 to book pet care: walking, sitting, boarding, or pet taxi. Press 4 for membership savings. Press 5 for holiday boarding and specials. Press 6 for hours and information. Or press 7 to leave a message, and we will return your call within 24 hours.')
  +'</Gather>'
  +`<Redirect method="POST">${selfUrl('voicemail')}</Redirect>`;
}

function parseParams(event){const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):String(event.body||'');return Object.fromEntries(new URLSearchParams(raw))}
function webhookUrl(event,step){
 const site=String(process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
 const path=String(event.path||PATH);
 return `${site}${path}${step?`?step=${encodeURIComponent(step)}`:''}`;
}

exports.handler=async event=>{
 if(String(event.httpMethod||'POST').toUpperCase()!=='POST')return {statusCode:405,headers:{allow:'POST'},body:'Method Not Allowed'};
 const step=event.queryStringParameters?.step||'';
 const params=parseParams(event);
 const signature=event.headers?.['x-twilio-signature']||event.headers?.['X-Twilio-Signature']||'';
 if(!verifyTwilioSignature({url:webhookUrl(event,step),params,signature,token:process.env.TWILIO_AUTH_TOKEN}))return {statusCode:403,body:'Invalid Twilio signature'};
 const site=String(process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
 return xml(buildTwiml({digits:params.Digits||'',step,dialCallStatus:params.DialCallStatus||'',base:site}));
};

module.exports.buildTwiml=buildTwiml;
