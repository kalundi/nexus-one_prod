// Pawluxe Club main line (+1 877-729-5061) voice menu.
// Twilio requests this endpoint for the initial call and for every
// Gather / Dial / Record action callback (step passed as a query param).
// Menu: 1 = animal consultant (rings the consultant line), 2 = shop,
// 3 = book pet care, 4 = membership, 5 = holiday, 6 = hours/info,
// 7 = voicemail, 9 = repeat menu.
// The caller chooses a language once, at the start of the call
// (1 = English, 2 = French, 3 = Spanish; no input defaults to English).
// The choice rides along as a lang query param on every callback, and
// every prompt for the rest of the call is spoken in that language.
// Voicemail-bound callers hear only their language's recorded greeting,
// then are transferred to the voicemail line (VOICEMAIL_NUMBER); if that
// line does not answer, the caller falls back to leaving a recorded
// message here so no caller is lost.
// No input anywhere falls through to voicemail so no caller is lost.
const {verifyTwilioSignature}=require('./_shared/sms-consent.cjs');
const {query}=require('./_shared/db.cjs');

const CONSULTANT_NUMBER='+13015007946';
const VOICEMAIL_NUMBER='+12272452912';
const VOICE='Polly.Joanna';
const PATH='/webhooks/pawluxe/ivr';
const GREETING_URLS=[
 'https://nexusmt.com/assets/voicemail/pawluxe-voicemail-greeting-holiday-en.mp3',
 'https://nexusmt.com/assets/voicemail/pawluxe-voicemail-greeting-holiday-fr.mp3',
 'https://nexusmt.com/assets/voicemail/pawluxe-voicemail-greeting-holiday-es.mp3'
];
const LANG_VOICES={
 fr:{voice:'Polly.Celine',language:'fr-FR'},
 es:{voice:'Polly.Lucia',language:'es-ES'}
};
const normLang=value=>value==='fr'?'fr':value==='es'?'es':'en';
const langFromDigits=digits=>digits==='2'?'fr':digits==='3'?'es':'en';
const greetingIndex=lang=>lang==='fr'?1:lang==='es'?2:0;

const STRINGS={
 en:{
  menu:'Thank you for calling Pawluxe Club, premium pet care, thoughtfully delivered. Press 1 to talk to an animal consultant. Press 2 for shop best sellers and new arrivals. Press 3 to book pet care: walking, sitting, boarding, or pet taxi. Press 4 for membership savings. Press 5 for holiday boarding and specials. Press 6 for hours and information. Or press 7 to leave a message, and we will return your call within 24 hours.',
  info:{
   '2':'Our shop just stocked up for the holidays: snuffle toys, festive pet toys, and best sellers starting at seven dollars. Shop anytime at pawluxe dot club, and members earn points on every order.',
   '3':'We offer dog walking from fifteen dollars, pet sitting, overnight stays, boarding, and pet taxi, seven days a week. Holiday spots fill fast, and an animal consultant can book you right now.',
   '4':'Pawluxe Plus and V I P members save on every order and every booking, earn points, and get priority holiday boarding. A consultant can sign you up in under a minute.',
   '5':'Happy Howlidays from Pawluxe Club! Holiday boarding and overnight care are booking now, and our Christmas collection is in the shop. Book early, because when those spots are gone, they are gone.',
   '6':'Pawluxe Club is open online around the clock at pawluxe dot club. Pet care is by appointment, seven days a week.'
  },
  postinfo:'To talk to an animal consultant now, press 1. To leave a message and get a call back within 24 hours, press 7. Or press 9 to hear the menu again.',
  connecting:'Connecting you with an animal consultant now. Please hold.',
  vmIntro:'Please hold while we connect you.',
  afterdialIntro:'Sorry we missed you. Please hold while we connect you.',
  recordPrompt:'Sorry we missed you. Please leave your name, your phone number, and how we can help after the tone. We will return your call within 24 hours.',
  noMessage:'We did not hear a message. Visit us anytime at pawluxe dot club. Goodbye.',
  thanks:'Thank you for calling Pawluxe Club. Your message is in, and we will call you back within 24 hours. In the meantime, shop new arrivals and book care anytime at pawluxe dot club. Happy Howlidays!'
 },
 fr:{
  menu:"Merci d'avoir appelé Pawluxe Club, des soins premium pour animaux, offerts avec soin. Appuyez sur le 1 pour parler à un conseiller animalier. Appuyez sur le 2 pour les meilleurs vendeurs et les nouveautés de la boutique. Appuyez sur le 3 pour réserver des soins pour animaux : promenade, garde, pension ou taxi pour animaux. Appuyez sur le 4 pour les économies des membres. Appuyez sur le 5 pour la pension et les offres spéciales des fêtes. Appuyez sur le 6 pour les horaires et les informations. Ou appuyez sur le 7 pour laisser un message, et nous vous rappellerons dans les 24 heures.",
  info:{
   '2':"Notre boutique vient de faire le plein pour les fêtes : jouets à renifler, jouets festifs pour animaux et meilleurs vendeurs à partir de sept dollars. Magasinez en tout temps à pawluxe point club, et les membres accumulent des points sur chaque commande.",
   '3':"Nous offrons la promenade de chiens à partir de quinze dollars, la garde d'animaux, les nuitées, la pension et le taxi pour animaux, sept jours sur sept. Les places pour les fêtes se remplissent vite, et un conseiller animalier peut réserver pour vous dès maintenant.",
   '4':"Les membres Pawluxe Plus et V I P économisent sur chaque commande et chaque réservation, accumulent des points et obtiennent la priorité pour la pension des fêtes. Un conseiller peut vous inscrire en moins d'une minute.",
   '5':"Joyeuses fêtes de la part de Pawluxe Club! La pension et les nuitées des fêtes sont maintenant offertes à la réservation, et notre collection de Noël est en boutique. Réservez tôt, car lorsque ces places seront parties, elles seront parties.",
   '6':"Pawluxe Club est ouvert en ligne en tout temps à pawluxe point club. Les soins pour animaux sont sur rendez-vous, sept jours sur sept."
  },
  postinfo:"Pour parler à un conseiller animalier maintenant, appuyez sur le 1. Pour laisser un message et recevoir un rappel dans les 24 heures, appuyez sur le 7. Ou appuyez sur le 9 pour réentendre le menu.",
  connecting:"Nous vous mettons en relation avec un conseiller animalier. Veuillez patienter.",
  vmIntro:"Veuillez patienter pendant que nous vous connectons.",
  afterdialIntro:"Désolé de vous avoir manqué. Veuillez patienter pendant que nous vous connectons.",
  recordPrompt:"Désolé de vous avoir manqué. Veuillez laisser votre nom, votre numéro de téléphone et comment nous pouvons vous aider après le signal sonore. Nous vous rappellerons dans les 24 heures.",
  noMessage:"Nous n'avons pas entendu de message. Visitez-nous en tout temps à pawluxe point club. Au revoir.",
  thanks:"Merci d'avoir appelé Pawluxe Club. Votre message est bien reçu, et nous vous rappellerons dans les 24 heures. En attendant, découvrez les nouveautés et réservez des soins en tout temps à pawluxe point club. Joyeuses fêtes!"
 },
 es:{
  menu:'Gracias por llamar a Pawluxe Club, cuidado premium para mascotas, entregado con esmero. Presione 1 para hablar con un asesor de animales. Presione 2 para los productos más vendidos y las novedades de la tienda. Presione 3 para reservar cuidado de mascotas: paseo, cuidado en casa, alojamiento o taxi para mascotas. Presione 4 para ahorros de membresía. Presione 5 para alojamiento y ofertas especiales de las fiestas. Presione 6 para horarios e información. O presione 7 para dejar un mensaje, y le devolveremos la llamada dentro de las 24 horas.',
  info:{
   '2':'Nuestra tienda acaba de abastecerse para las fiestas: juguetes para olfatear, juguetes festivos para mascotas y los más vendidos desde siete dólares. Compre en cualquier momento en pawluxe punto club, y los miembros ganan puntos en cada pedido.',
   '3':'Ofrecemos paseo de perros desde quince dólares, cuidado de mascotas, pernoctaciones, alojamiento y taxi para mascotas, los siete días de la semana. Los lugares para las fiestas se llenan rápido, y un asesor de animales puede reservar por usted ahora mismo.',
   '4':'Los miembros Pawluxe Plus y V I P ahorran en cada pedido y cada reserva, ganan puntos y tienen prioridad en el alojamiento de las fiestas. Un asesor puede inscribirlo en menos de un minuto.',
   '5':'¡Felices fiestas de parte de Pawluxe Club! El alojamiento y el cuidado nocturno para las fiestas ya están abiertos para reservas, y nuestra colección de Navidad está en la tienda. Reserve temprano, porque cuando esos lugares se acaben, se acabaron.',
   '6':'Pawluxe Club está abierto en línea las 24 horas en pawluxe punto club. El cuidado de mascotas es con cita previa, los siete días de la semana.'
  },
  postinfo:'Para hablar con un asesor de animales ahora, presione 1. Para dejar un mensaje y recibir una llamada dentro de las 24 horas, presione 7. O presione 9 para escuchar el menú otra vez.',
  connecting:'Lo estamos conectando con un asesor de animales. Por favor espere.',
  vmIntro:'Por favor espere mientras lo conectamos.',
  afterdialIntro:'Lamentamos no haberlo atendido. Por favor espere mientras lo conectamos.',
  recordPrompt:'Lamentamos no haberlo atendido. Por favor deje su nombre, su número de teléfono y cómo podemos ayudarle después del tono. Le devolveremos la llamada dentro de las 24 horas.',
  noMessage:'No escuchamos ningún mensaje. Visítenos en cualquier momento en pawluxe punto club. Adiós.',
  thanks:'Gracias por llamar a Pawluxe Club. Su mensaje fue recibido, y le devolveremos la llamada dentro de las 24 horas. Mientras tanto, compre las novedades y reserve cuidado en cualquier momento en pawluxe punto club. ¡Felices fiestas!'
 }
};

const xml=body=>({statusCode:200,headers:{'content-type':'text/xml; charset=utf-8','cache-control':'no-store'},body:`<?xml version="1.0" encoding="UTF-8"?><Response>${body||''}</Response>`});
let BASE='';
let LANG='en';
const say=(text,lang=LANG)=>{
 const voice=LANG_VOICES[lang];
 return voice?`<Say voice="${voice.voice}" language="${voice.language}">${text}</Say>`:`<Say voice="${VOICE}">${text}</Say>`;
};
const selfUrl=step=>{
 const parts=[];
 if(step)parts.push(`step=${step}`);
 if(LANG==='fr'||LANG==='es')parts.push(`lang=${LANG}`);
 // selfUrl is only ever embedded in TwiML, where a raw & is invalid XML
 // (Twilio error 12100) — escape it for the XML parser; Twilio decodes
 // &amp; back to & before requesting the URL.
 return `${BASE}${PATH}${parts.length?`?${parts.join('&')}`:''}`.replace(/&/g,'&amp;');
};
const T=()=>STRINGS[LANG];

function mainMenu(){
 return `<Gather numDigits="1" timeout="6" action="${selfUrl()}" method="POST">`
  +say(T().menu)
  +'</Gather>'
  +`<Redirect method="POST">${selfUrl('voicemail')}</Redirect>`;
}

function languageMenu(){
 return `<Gather numDigits="1" timeout="6" action="${selfUrl('lang')}" method="POST">`
  +say('Thank you for calling Pawluxe Club. For English, press 1.','en')
  +say('Pour le français, appuyez sur le 2.','fr')
  +say('Para español, oprima el 3.','es')
  +'</Gather>'
  +mainMenu();
}

function voicemailTwiml(intro){
 return say(intro)
  +`<Record maxLength="120" transcribe="true" playBeep="true" action="${selfUrl('thanks')}" method="POST"/>`
  +say(T().noMessage)
  +'<Hangup/>';
}

function voicemailTransferTwiml(intro){
 return say(intro)
  +`<Play>${GREETING_URLS[greetingIndex(LANG)]}</Play>`
  +`<Dial timeout="25" action="${selfUrl('aftervm')}" method="POST">${VOICEMAIL_NUMBER}</Dial>`;
}

function buildTwiml({digits,step,dialCallStatus,base,lang}={}){
 BASE=String(base||'').replace(/\/$/,'');
 LANG=normLang(lang);
 if(step==='lang'){
  LANG=langFromDigits(digits);
  return mainMenu();
 }
 if(step==='afterdial'){
  if(dialCallStatus==='completed')return '<Hangup/>';
  return voicemailTransferTwiml(T().afterdialIntro);
 }
 if(step==='aftervm'){
  if(dialCallStatus==='completed')return '<Hangup/>';
  return voicemailTwiml(T().recordPrompt);
 }
 if(step==='voicemail'){
  return voicemailTransferTwiml(T().vmIntro);
 }
 if(step==='thanks'){
  return say(T().thanks)+'<Hangup/>';
 }
 if(step==='postinfo'){
  return `<Gather numDigits="1" timeout="6" action="${selfUrl()}" method="POST">`
   +say(T().postinfo)
   +'</Gather>'
   +`<Redirect method="POST">${selfUrl('voicemail')}</Redirect>`;
 }
 if(step==='whisper'){
  return `<Gather numDigits="1" timeout="8" action="${selfUrl('whisperhandle')}" method="POST">`
   +say('You have a call from Pawluxe Club. Press 1 to accept.','en')
   +'</Gather>'
   +'<Hangup/>';
 }
 if(step==='whisperhandle'){
  if(digits==='1')return '';
  return '<Hangup/>';
 }
 if(!step&&!digits&&!lang){
  return languageMenu();
 }
 if(digits==='1'){
  return say(T().connecting)
   +`<Dial timeout="25" action="${selfUrl('afterdial')}" method="POST"><Number url="${selfUrl('whisper')}" method="POST">${CONSULTANT_NUMBER}</Number></Dial>`;
 }
 if(digits&&T().info[digits]){
  return say(T().info[digits])+`<Redirect method="POST">${selfUrl('postinfo')}</Redirect>`;
 }
 if(digits==='7'){
  return `<Redirect method="POST">${selfUrl('voicemail')}</Redirect>`;
 }
 // Main menu: digit 9, or any unrecognized digit.
 return mainMenu();
}

function parseParams(event){const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):String(event.body||'');return Object.fromEntries(new URLSearchParams(raw))}
function webhookUrl(event,step,lang){
 const site=String(process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
 const path=String(event.path||PATH);
 const parts=[];
 if(step)parts.push(`step=${encodeURIComponent(step)}`);
 if(lang)parts.push(`lang=${encodeURIComponent(lang)}`);
 return `${site}${path}${parts.length?`?${parts.join('&')}`:''}`;
}

exports.handler=async event=>{
 if(String(event.httpMethod||'POST').toUpperCase()!=='POST')return {statusCode:405,headers:{allow:'POST'},body:'Method Not Allowed'};
 const step=event.queryStringParameters?.step||'';
 const lang=event.queryStringParameters?.lang||'';
 const params=parseParams(event);
 const signature=event.headers?.['x-twilio-signature']||event.headers?.['X-Twilio-Signature']||'';
 const token=process.env.TWILIO_AUTH_TOKEN;
 // Twilio signs POST webhook URLs that carry a query string in one of two
 // ways: the full URL (query included) plus the body params, or the bare
 // URL with the query params merged into the signed parameter list.
 // Accept either construction; both require the real auth token to forge.
 const mergedParams={...params};
 if(step)mergedParams.step=step;
 if(lang)mergedParams.lang=lang;
 const signatureValid=verifyTwilioSignature({url:webhookUrl(event,step,lang),params,signature,token})
  ||verifyTwilioSignature({url:webhookUrl(event,'',''),params:mergedParams,signature,token});
 if(!signatureValid)return {statusCode:403,body:'Invalid Twilio signature'};
 const site=String(process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
 // Call screening hangs up the consultant leg when nobody presses 1, but
 // Twilio reports that Dial as 'completed' — the failure fixed on the Nexus
 // line in PR #187. Track explicit acceptances in the shared
 // voice_dispatch_accepts table: a 'completed' afterdial only hangs up when
 // the consultant actually accepted; otherwise the caller goes to voicemail.
 if(step==='whisperhandle'&&(params.Digits||'')==='1'){
  const parentSid=params.ParentCallSid||params.CallSid||'';
  if(parentSid){
   await query(`CREATE TABLE IF NOT EXISTS voice_dispatch_accepts(call_sid TEXT PRIMARY KEY,accepted_at TIMESTAMPTZ NOT NULL DEFAULT now())`).catch(()=>null);
   await query(`INSERT INTO voice_dispatch_accepts(call_sid) VALUES($1) ON CONFLICT(call_sid) DO NOTHING`,[parentSid]).catch(()=>null);
  }
 }
 let dialCallStatus=params.DialCallStatus||'';
 if(step==='afterdial'&&dialCallStatus.toLowerCase()==='completed'){
  const acc=await query(`SELECT call_sid FROM voice_dispatch_accepts WHERE call_sid=$1 OR call_sid=$2 LIMIT 1`,[params.CallSid||'',params.DialCallSid||'']).catch(()=>null);
  if(!(acc&&acc.rows&&acc.rows.length))dialCallStatus='no-answer';
 }
 return xml(buildTwiml({digits:params.Digits||'',step,dialCallStatus,base:site,lang}));
};

module.exports.buildTwiml=buildTwiml;
