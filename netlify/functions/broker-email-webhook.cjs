const {Client}=require('pg');
const crypto=require('crypto');
const {buildEmailRecipients}=require('./_shared/notification-routing.cjs');
const pdfParse=require('pdf-parse');

const pool=new Client({connectionString:process.env.DATABASE_URL});
let connected=false;
let auditSchemaCache=null;

const FORWARD_FROM=String(process.env.GRAPH_MAIL_SYNC_SENDER||'driverdeveloper@gotandt.com').trim().toLowerCase();
const FORWARD_TO_MATCH='fletcher@nexusmt.com';
const FORWARD_TO='jubilee@nexusmt.com';
const DRIVER_PAY_RATES={ambulatory:20,wheelchair:25,stretcher:30,ambulance:40};

async function ensureConnection(){
 if(!connected){
  await pool.connect();
  connected=true;
 }
}

async function query(sql,params){
 await ensureConnection();
 return pool.query(sql,params);
}

async function detectAuditSchema(){
 if(auditSchemaCache)return auditSchemaCache;
 const columns=await query("SELECT column_name FROM information_schema.columns WHERE table_name='audit_log'").catch(()=>({rows:[]}));
 const set=new Set((columns.rows||[]).map((row)=>String(row.column_name||'')));
 auditSchemaCache={
  hasDetails:set.has('details'),
  hasCreatedBy:set.has('created_by'),
  hasChanges:set.has('changes'),
  hasActorId:set.has('actor_id'),
  hasActorRole:set.has('actor_role')
 };
 return auditSchemaCache;
}

async function writeAuditLog({entityType,entityId,action,payload,actor='BROKER_EMAIL_WEBHOOK',actorRole='SYSTEM'}){
 const schema=await detectAuditSchema();
 const payloadText=JSON.stringify(payload||{});
 if(schema.hasDetails&&schema.hasCreatedBy){
  return query('INSERT INTO audit_log(entity_type,entity_id,action,details,created_by) VALUES($1,$2,$3,$4,$5)',[
   entityType,
   String(entityId||''),
   action,
   payloadText,
   actor
  ]);
 }
 if(schema.hasChanges&&schema.hasActorId&&schema.hasActorRole){
  return query('INSERT INTO audit_log(entity_type,entity_id,action,changes,actor_id,actor_role,created_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,now())',[
   entityType,
   String(entityId||''),
   action,
   payloadText,
   actor,
   actorRole
  ]);
 }
 return null;
}

function json(code,body){
 return {statusCode:code,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
}

function clean(value,max=500){
 return String(value||'').trim().slice(0,max);
}

function splitLocationTypeAndAddress(value){
 let text=clean(value,500);
 if(!text)return {location:'',address:''};
 text=text.replace(/^(?:pickup|pickup\s*address|destination|destination\s*address|drop\s*off|dropoff|from|to)\s*[:\-\s]*/i,'').trim();
 text=text.replace(/^[-•]+\s*/,'').trim();
 if(!text)return {location:'',address:''};
 const prefixed=text.match(/^(home|facility|hospital|clinic|residence|other|nursing\s+home|senior\s+living|assisted\s+living|care\s+center|dialysis\s+center|office|work|school)\b[\s,:-]+(\d{1,6}\b[\s\S]*)$/i);
 if(prefixed){
  const address=clean(prefixed[2],300);
  if(address)return {location:clean(prefixed[1],160),address};
 }
 const prefixMatch=text.match(/^(home|facility|hospital|clinic|residence|other|nursing\s+home|senior\s+living|assisted\s+living|care\s+center|dialysis\s+center|office|work|school)\b[\s,:-]+(.+)$/i);
 if(prefixMatch){
  const address=clean(prefixMatch[2],300);
  if(address) return {location:clean(prefixMatch[1],160),address};
 }
 const addressMatch=text.match(/(\d{1,6}\b[\s\S]*)$/);
 if(addressMatch){
  const address=clean(addressMatch[1],300);
  const location=clean(text.slice(0,text.length-address.length).replace(/[\s,;:-]+$/,'').trim(),160);
  return {location,address};
 }
 return {location:'',address:text};
}

function safeJsonParse(value){
 if(value==null)return null;
 if(typeof value==='object')return value;
 try{return JSON.parse(String(value));}catch(_error){return null;}
}

function n(value,fallback=0){
 const parsed=Number(value);
 return Number.isFinite(parsed)?parsed:fallback;
}

function clamp(value,min,max){
 return Math.min(max,Math.max(min,value));
}

function normalizeBookingSource(value){
 const source=clean(value).toUpperCase();
 if(source==='DEMO'||source==='LOCAL'||source==='MOCK'||source==='TEST')return 'CUSTOMER';
 return source||'BROKER';
}

function normalizeTripDate(value){
 const raw=clean(value,80);
 if(!raw)return '';
 const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;
 const slash=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
 if(slash){
  const month=String(Number(slash[1])).padStart(2,'0');
  const day=String(Number(slash[2])).padStart(2,'0');
  const year=slash[3].length===2?`20${slash[3]}`:slash[3];
  return `${year}-${month}-${day}`;
 }
 const parsed=new Date(raw);
 if(Number.isNaN(parsed.getTime()))return '';
 return parsed.toISOString().slice(0,10);
}

function normalizeTripTime(value){
 const raw=clean(value,80).toLowerCase();
 if(!raw)return '';
 const ampm=raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
 if(ampm){
  let hour=Number(ampm[1]);
  const minute=Number(ampm[2]);
  const meridiem=String(ampm[3]||'').toUpperCase();
  if(!Number.isFinite(hour)||!Number.isFinite(minute)||hour<1||hour>12||minute<0||minute>59)return '';
  if(meridiem==='AM'&&hour===12)hour=0;
  if(meridiem==='PM'&&hour!==12)hour+=12;
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
 }
 const hhmm=raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(hhmm){
  const hour=Number(hhmm[1]);
  const minute=Number(hhmm[2]);
  const second=Number(hhmm[3]||0);
  if(!Number.isFinite(hour)||!Number.isFinite(minute)||!Number.isFinite(second)||hour<0||hour>23||minute<0||minute>59||second<0||second>59)return '';
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;
 }
 return '';
}

function buildPickupTimestamp(tripDate,pickupTime){
 const date=normalizeTripDate(tripDate);
 const time=normalizeTripTime(pickupTime);
 return date&&time?`${date} ${time}`:null;
}

function parseCurrencyValue(value){
 const raw=clean(value,120).replace(/,/g,'');
 if(!raw)return 0;
 const match=raw.match(/-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})/);
 if(!match)return 0;
 const parsed=Number(match[0]);
 return Number.isFinite(parsed)?parsed:0;
}

function extractLabeledFields(text){
 const fields={};
 let lastKey='';
 for(const rawLine of String(text||'').split(/\r?\n/)){
  const line=clean(rawLine,500);
  if(!line)continue;
  const pair=line.match(/^([A-Za-z][A-Za-z0-9\s\/#&().'-]{1,70})\s*[:|-]\s*(.+)$/);
  if(pair){
   const key=clean(pair[1],80).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
   const value=clean(pair[2],300);
   if(!key||!value)continue;
   if(!fields[key])fields[key]=value;
   lastKey=key;
   continue;
  }
  if(lastKey&&/special|instruction|note|comment/.test(lastKey)&&line.length>3){
   fields[lastKey]=clean(`${fields[lastKey]} ${line}`,600);
  }
 }
 return fields;
}

function firstField(fields,keys=[]){
 for(const key of keys){
  const value=clean(fields?.[key]||'',300);
  if(value)return value;
 }
 return '';
}

function parseLineItemNumber(value){
 const text=clean(value,120);
 if(!text) return 0;
 const parsed=Number(String(text).replace(/[$,]/g,''));
 return Number.isFinite(parsed)?parsed:0;
}

function computeBrokerQuotedRateFromSection(labeledFields, fallbackRate=0){
 const compact=clean(Object.values(labeledFields||{}).join(' '),4000);
 const fallbackText=clean(String(arguments[2]||''),20000).replace(/\s+/g,' ');
 const sourceText=`${compact} ${fallbackText}`;
 const fromPattern=(pattern)=>{
  const match=sourceText.match(pattern);
  return match?parseLineItemNumber(match[1]):0;
 };
 const flatRate=parseLineItemNumber(firstField(labeledFields,['flat_rate','flatrate']))||fromPattern(/flat\s*rate\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i);
 const perMile=parseLineItemNumber(firstField(labeledFields,['per_mile','permile','mile_rate']))||fromPattern(/per\s*mile\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i);
 const waitTime=parseLineItemNumber(firstField(labeledFields,['wait_time','wait']))||fromPattern(/wait\s*time\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i);
 const totalMiles=parseLineItemNumber(firstField(labeledFields,['total_miles','miles','distance']))||fromPattern(/total\s*miles\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i);
 const noShowFee=parseLineItemNumber(firstField(labeledFields,['no_show_fee','noshow_fee','no_show']))||fromPattern(/no\s*show\s*fee\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i);
 const safeFallback=Math.max(0,Number(fallbackRate||0));
 if(flatRate>0){
  return {
   brokerQuotedRate:Number(Math.max(0,flatRate+(waitTime*2)).toFixed(2)),
   quoteBasis:'flat_rate',
   flatRate:Number(flatRate.toFixed(2)),
   perMile:0,
   waitTime:Number(waitTime.toFixed(2)),
   totalMiles:Number(totalMiles.toFixed(2)),
   noShowFee:Number(noShowFee.toFixed(2))
  };
 }
 if(perMile>0&&totalMiles>0){
  return {
   brokerQuotedRate:Number(Math.max(0,(perMile*totalMiles)+(waitTime*2)).toFixed(2)),
   quoteBasis:'per_mile',
   flatRate:0,
   perMile:Number(perMile.toFixed(2)),
   waitTime:Number(waitTime.toFixed(2)),
   totalMiles:Number(totalMiles.toFixed(2)),
   noShowFee:Number(noShowFee.toFixed(2))
  };
 }
 return {
  brokerQuotedRate:Number(safeFallback.toFixed(2)),
  quoteBasis:'fallback',
  flatRate:0,
  perMile:0,
  waitTime:Number(waitTime.toFixed(2)),
  totalMiles:Number(totalMiles.toFixed(2)),
  noShowFee:Number(noShowFee.toFixed(2))
 };
}

function extractZipBoundedAddressChunks(input,maxChunks=3){
 const compact=clean(String(input||'').replace(/\s+/g,' '),4000);
 if(!compact)return [];
 const states=[
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','District of Columbia'
 ];
 const stateAlternation=states.map((value)=>value.replace(/\s+/g,'\\s+')).join('|');
 const stateZipRegex=new RegExp(`\\b(?:${stateAlternation})\\s+\\d{5}(?:-\\d{4})?\\b`,'gi');
 const stateZipMatches=[...compact.matchAll(stateZipRegex)];
 if(!stateZipMatches.length)return [];
 const chunks=[];
 let cursor=0;
 for(const zipMatch of stateZipMatches){
  if(chunks.length>=maxChunks)break;
  const matchStart=Number(zipMatch.index||0);
  const matchEnd=matchStart+String(zipMatch[0]||'').length;
  if(matchEnd<=cursor)continue;
  const chunk=clean(compact.slice(cursor,matchEnd),380);
  cursor=matchEnd;
  if(chunk.length<20)continue;
  chunks.push(chunk);
 }
 return chunks;
}

function cleanupParsedAddress(value){
 let text=clean(value,380);
 if(!text)return '';
 if(/^[-•]/.test(text))text=text.replace(/^[-•]+\s*/,'');
 text=text
  .replace(/^(?:pickup\s*address|drop\s*off\s*address|destination\s*address)\s*:?\s*/i,'')
  .replace(/^(?:for\s*drop\s*off|for\s*pickup)\s*:?\s*/i,'')
  .replace(/^(?:wait\s*time)\s*/i,'')
  .replace(/^(?:import\s*reminders?|billing\s*information)\s*:?\s*/i,'')
  .replace(/^(?:pickup\s*times?\s*are\s*set\s*by\s*go\s*t&t\s*and\s*must\s*be\s*adhered\s*to.*)$/i,'')
  .replace(/\b(?:for\s*drop\s*off|for\s*pickup)\s*:?[\s\S]*$/i,'')
  .replace(/\s+/g,' ')
  .trim();
 text=text.replace(/\s+,/g,',').replace(/,{2,}/g,',').replace(/,\s*,/g,',').trim();

 const stateCodes='AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
 const stateNames='Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\\s+Hampshire|New\\s+Jersey|New\\s+Mexico|New\\s+York|North\\s+Carolina|North\\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\\s+Island|South\\s+Carolina|South\\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\\s+Virginia|Wisconsin|Wyoming|District\\s+of\\s+Columbia';
 const stateAny=`(?:${stateCodes}|${stateNames})`;
 const embeddedAddress=text.match(new RegExp(`(\\d{1,6}[A-Za-z0-9# .'/\\-]{2,170}?\\s+${stateAny}\\s+\\d{5}(?:-\\d{4})?)`,'i'));
 if(embeddedAddress&&embeddedAddress[1])text=clean(embeddedAddress[1],320);
 const streetCityStateZip=text.match(new RegExp(`^(.+?)\\s+([A-Za-z][A-Za-z .'-]{1,80})\\s+(${stateCodes})\\s+(\\d{5}(?:-\\d{4})?)$`,'i'));
 if(streetCityStateZip&&streetCityStateZip[1]&&!streetCityStateZip[1].includes(',')){
  text=`${streetCityStateZip[1].trim()}, ${streetCityStateZip[2].trim()}, ${streetCityStateZip[3].toUpperCase()} ${streetCityStateZip[4]}`;
 }

 text=text.replace(new RegExp(`,\\s*([A-Za-z][A-Za-z .'-]{1,80})\\s+(${stateCodes})\\s+(\\d{5}(?:-\\d{4})?)$`,'i'),(_all,city,state,zip)=>`, ${String(city).trim()}, ${String(state).toUpperCase()} ${String(zip).trim()}`);
 const stateZipRegex=new RegExp(`\\b${stateAny}\\s+\\d{5}(?:-\\d{4})?\\b`,'i');
 const hasStreetSignal=/\b(?:\d{1,6}|st\b|street\b|ave\b|avenue\b|rd\b|road\b|blvd\b|boulevard\b|dr\b|drive\b|ln\b|lane\b|ct\b|court\b|pl\b|place\b|pkwy\b|parkway\b|hwy\b|highway\b|way\b|cir\b|circle\b)\b/i.test(text);
 if(!stateZipRegex.test(text)||!hasStreetSignal)return '';
 return clean(text,320);
}

function parseGtTableAddresses(text){
 const normalized=String(text||'');
 const compact=normalized.replace(/\s+/g,' ');
 const headerRegex=/pickup\s*time\s*appointment\s*time\s*pickup\s*address\s*drop\s*off\s*address\s*special\s*instructions/i;
 const headerMatch=compact.match(headerRegex);
 const headerIndex=headerMatch?Number(headerMatch.index||0):-1;
 if(headerIndex<0)return {pickup:'',destination:''};
 const sectionCompact=compact.slice(headerIndex,Math.min(compact.length,headerIndex+5000));

 // Primary extraction: first two ZIP-bounded address chunks before the drop-off notes.
 let beforeDropOff=sectionCompact.split(/for\s*drop\s*off\s*:/i)[0]||sectionCompact;
 beforeDropOff=beforeDropOff
  .replace(headerRegex,'')
  .replace(/^\s*(?:\d{1,2}:\d{2}\s*(?:am|pm)?\s*){1,2}/i,'')
  .trim();

 let chunks=extractZipBoundedAddressChunks(beforeDropOff,3).map((value)=>clean(value,380)).filter(Boolean);
 let pickup=chunks[0]||'';
 let destination=chunks[1]||'';

 // Secondary extraction: wait-time block often contains reverse route with pickup as second ZIP chunk.
 if(!pickup||!destination){
  const waitMatch=sectionCompact.match(/wait\s*time[\s\S]{0,1800}/i);
  if(waitMatch&&waitMatch[0]){
   const waitBlock=waitMatch[0].split(/for\s*pickup\s*:/i)[0]||waitMatch[0];
  const waitChunks=extractZipBoundedAddressChunks(waitBlock,3).map((value)=>clean(value,380)).filter(Boolean);
   if(waitChunks.length>=2){
    if(!destination)destination=waitChunks[0];
    if(!pickup)pickup=waitChunks[1];
   }
  }
 }

 return {
  pickup:clean(pickup,380),
  destination:clean(destination,380)
 };
}

function resolveServiceKey(service){
 const raw=clean(service,120).toLowerCase();
 if(!raw)return 'ambulatory';
 if(raw.includes('wheel')||raw.includes('broda'))return 'wheelchair';
 if(raw.includes('stretcher')||raw.includes('bariatric'))return 'stretcher';
 if(raw.includes('ambulance')||raw.includes('bls')||raw.includes('als')||raw.includes('critical')||raw.includes('cct'))return 'als1';
 if(raw.includes('facility')&&raw.includes('critical'))return 'facility_transfer_critical';
 if(raw.includes('facility')&&raw.includes('transfer'))return 'facility_transfer';
 return 'ambulatory';
}

function resolveCostBand(service){
 const raw=clean(service,120).toLowerCase();
 if(!raw)return 'ambulatory';
 if(raw.includes('wheel')||raw.includes('broda'))return 'wheelchair';
 if(raw.includes('stretcher')||raw.includes('bariatric'))return 'stretcher';
 if(raw.includes('ambulance')||raw.includes('bls')||raw.includes('als')||raw.includes('critical')||raw.includes('cct'))return 'ambulance';
 return 'ambulatory';
}

async function sendEmail(to,subject,html,attachments=[]){
 const recipients=buildEmailRecipients(to);
 if(!process.env.SENDGRID_API_KEY||!process.env.SENDGRID_FROM_EMAIL||recipients.length===0)return {status:'skipped'};
 const payload={
  personalizations:[{to:recipients.map((email)=>({email}))}],
  from:{email:process.env.SENDGRID_FROM_EMAIL,name:'Nexus Medical Transit'},
  subject,
  content:[{type:'text/html',value:html}]
 };
 if(Array.isArray(attachments)&&attachments.length){
  payload.attachments=attachments.map((attachment)=>({
   content:String(attachment.content||''),
   filename:clean(attachment.filename||'attachment.txt',120),
   type:clean(attachment.type||'application/octet-stream',120),
   disposition:'attachment'
  })).filter((attachment)=>attachment.content&&attachment.filename);
 }
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{
  method:'POST',
  headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 if(!response.ok)throw new Error(`SendGrid request failed (${response.status})`);
 return {status:'sent'};
}

async function sendTeamsAlert(text,title='Nexus Medical Transit'){
 const webhookUrl=process.env.TEAMS_WEBHOOK_URL;
 if(!webhookUrl)return {status:'skipped'};
 const normalizedWebhook=String(webhookUrl||'').trim();
 const looksLikePlaceholder=/^https:\/\/(?:outlook|.*\.office)\.office\.com\/webhook\/?$/i.test(normalizedWebhook);
 if(looksLikePlaceholder)return {status:'failed',error:'Invalid Teams webhook URL: placeholder endpoint configured'};
 const isPowerAutomateWebhook=/environment\.api\.powerplatform\.com|\/powerautomate\/automations\/direct\//i.test(webhookUrl);
 const body=isPowerAutomateWebhook
  ?{
    type:'message',
    attachments:[{
     contentType:'application/vnd.microsoft.card.adaptive',
     content:{
      '$schema':'http://adaptivecards.io/schemas/adaptive-card.json',
      type:'AdaptiveCard',
      version:'1.4',
      body:[
       {type:'TextBlock',size:'Medium',weight:'Bolder',text:String(title||'Nexus Medical Transit')},
       {type:'TextBlock',text:String(text||''),wrap:true}
      ]
     }
    }]
   }
  :{
    '@type':'MessageCard','@context':'https://schema.org/extensions',
    themeColor:'#082f49',summary:title,title,text
   };
 try{
  const response=await fetch(normalizedWebhook,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return response.ok?{status:'sent'}:{status:'failed',code:response.status};
 }catch(error){
  return {status:'failed',error:error.message};
 }
}

function parsePotentialAttachmentInfo(payload){
 const attachments=[];
 if(Array.isArray(payload.attachments)){
  for(const att of payload.attachments){
   attachments.push({
    filename:clean(att.filename||att.name||'attachment.txt',180),
    type:clean(att.type||att.mimeType||'application/octet-stream',160),
    content:String(att.content||att.data||att.base64||'')
   });
  }
 }
 const attachmentInfoRaw=payload['attachment-info'];
 if(attachmentInfoRaw&&typeof attachmentInfoRaw==='string'){
  try{
   const info=JSON.parse(attachmentInfoRaw);
   for(const key of Object.keys(info||{})){
    const details=info[key]||{};
    const rawContent=payload[key];
    if(!rawContent)continue;
    attachments.push({
     filename:clean(details.filename||key,180),
     type:clean(details.type||'application/octet-stream',160),
     content:String(rawContent)
    });
   }
  }catch(_error){
   // Ignore malformed attachment-info payloads.
  }
 }
 return attachments.filter((att)=>att.content);
}

async function extractPdfTextViaOcrSpace({base64Content,filename=''}){
 const apiKey=clean(process.env.OCR_SPACE_API_KEY||'',200);
 if(!apiKey)return {text:'',status:'ocr_not_configured',error:'OCR_SPACE_API_KEY not set'};
 const base64=String(base64Content||'').trim();
 if(!base64)return {text:'',status:'ocr_empty_content',error:'No base64 attachment content provided'};
 // OCR.space free/limited plans reject large payloads quickly; skip oversized files early.
 if(base64.length>6_000_000)return {text:'',status:'ocr_skipped_too_large',error:'Attachment base64 payload exceeded OCR size threshold'};

 try{
  const form=new URLSearchParams();
  form.set('base64Image',`data:application/pdf;base64,${base64}`);
  form.set('language','eng');
  form.set('isOverlayRequired','false');
  form.set('isCreateSearchablePdf','false');
  form.set('scale','true');
  form.set('detectOrientation','true');
  form.set('OCREngine','2');
  form.set('filetype','PDF');
  if(filename)form.set('file_name',clean(filename,180));

  const response=await fetch('https://api.ocr.space/parse/image',{
   method:'POST',
   headers:{
    apikey:apiKey,
    'content-type':'application/x-www-form-urlencoded'
   },
   body:form.toString()
  });

  if(!response.ok){
   return {text:'',status:'ocr_http_error',error:`OCR request failed (${response.status})`};
  }

  const data=await response.json().catch(()=>null);
  const parseResults=Array.isArray(data?.ParsedResults)?data.ParsedResults:[];
  const parsedText=clean(parseResults.map((item)=>clean(item?.ParsedText||'',20000)).filter(Boolean).join('\n\n'),50000);
  const isErrored=Boolean(data?.IsErroredOnProcessing);
  const errorMessageRaw=Array.isArray(data?.ErrorMessage)?data.ErrorMessage.join('; '):clean(data?.ErrorMessage||data?.ErrorDetails||'',300);

  if(parsedText){
   return {text:parsedText,status:'ocr_decoded',error:null};
  }
  if(isErrored||errorMessageRaw){
   return {text:'',status:'ocr_processing_error',error:clean(errorMessageRaw||'OCR processing returned no parsed text',300)};
  }
  return {text:'',status:'ocr_empty_result',error:'OCR completed with no parsed text'};
 }catch(error){
  return {text:'',status:'ocr_exception',error:clean(error?.message||'OCR request exception',300)};
 }
}

async function decodeAttachmentText(attachment){
 const filename=clean(attachment.filename||'',180).toLowerCase();
 const type=clean(attachment.type||'',160).toLowerCase();
 const rawContent=String(attachment.content||'');
 const isPdf=type.includes('pdf')||filename.endsWith('.pdf');
 const diagnostic={
  filename:clean(attachment.filename||'attachment',180),
  mime_type:type||'application/octet-stream',
  content_base64_length:rawContent.length,
  mode:'unsupported',
  status:'not_decoded',
  is_pdf:isPdf,
  is_textual:false,
  text_length:0,
  error:null
 };
 if(isPdf){
  try{
   const buffer=Buffer.from(rawContent,'base64');
   const parsed=await pdfParse(buffer);
   const parsedText=clean(parsed?.text||'',50000);
   diagnostic.mode='pdf-parse';
   if(parsedText){
    diagnostic.status='decoded';
    diagnostic.text_length=parsedText.length;
    return {text:parsedText,diagnostic};
   }

   const ocrResult=await extractPdfTextViaOcrSpace({
    base64Content:rawContent,
    filename:attachment.filename
   });
   if(ocrResult.text){
    diagnostic.mode='pdf-ocr-space';
    diagnostic.status=ocrResult.status;
    diagnostic.text_length=ocrResult.text.length;
    diagnostic.error=null;
    return {text:ocrResult.text,diagnostic};
   }

   diagnostic.mode='pdf-ocr-space';
   diagnostic.status=ocrResult.status||'empty';
   diagnostic.text_length=0;
   diagnostic.error=clean(ocrResult.error||'No text extracted from PDF via OCR fallback',240);
   return {text:'',diagnostic};
  }catch(error){
   const ocrResult=await extractPdfTextViaOcrSpace({
    base64Content:rawContent,
    filename:attachment.filename
   });
   if(ocrResult.text){
    diagnostic.mode='pdf-ocr-space';
    diagnostic.status=ocrResult.status;
    diagnostic.text_length=ocrResult.text.length;
    diagnostic.error=clean(error?.message||'pdf_parse_failed',240);
    return {text:ocrResult.text,diagnostic};
   }

   diagnostic.mode='pdf-ocr-space';
   diagnostic.status=ocrResult.status||'decode_failed';
   diagnostic.error=clean(ocrResult.error||error?.message||'pdf_parse_failed',240);
   return {text:'',diagnostic};
  }
 }
 const isTextual=type.startsWith('text/')||type.includes('json')||type.includes('xml')||type.includes('csv')||filename.endsWith('.txt')||filename.endsWith('.csv')||filename.endsWith('.json')||filename.endsWith('.xml');
 diagnostic.is_textual=isTextual;
 if(!isTextual)return {text:'',diagnostic};
 try{
  const decoded=Buffer.from(rawContent,'base64').toString('utf8');
  if(decoded&&decoded.trim()){
   const normalized=clean(decoded,20000);
   diagnostic.mode='base64-utf8';
   diagnostic.status='decoded';
   diagnostic.text_length=normalized.length;
   return {text:normalized,diagnostic};
  }
 }catch(error){
  // Ignore base64 decode failures.
  diagnostic.error=clean(error?.message||'base64_decode_failed',240);
 }
 const fallbackText=clean(rawContent,20000);
 diagnostic.mode='raw-content';
 diagnostic.status=fallbackText?'decoded_raw_fallback':'empty';
 diagnostic.text_length=fallbackText.length;
 return {text:fallbackText,diagnostic};
}

function summarizeParseSignals(input){
 const text=clean(input,50000);
 if(!text)return {
  has_text:false,
  has_pickup:false,
  has_destination:false,
  has_trip_date:false,
  has_trip_time:false,
  has_patient:false,
  has_referral:false,
  has_quote:false
 };
 return {
  has_text:true,
  has_pickup:/(?:pickup|origin|from|pickup\s*address)\s*[:|-]/i.test(text),
  has_destination:/(?:destination|drop\s*off|dropoff|to|destination\s*address)\s*[:|-]/i.test(text),
  has_trip_date:/(?:date|appointment\s*date)\s*[:|-]\s*(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/i.test(text),
  has_trip_time:/(?:time|appointment\s*time)\s*[:|-]\s*[0-9]{1,2}:[0-9]{2}/i.test(text),
  has_patient:/(?:patient|member|rider|client\/?iw)\s*[:|-]/i.test(text),
  has_referral:/(?:referral\s*(?:id|#)?|reference|trip\s*(?:id|number)|confirmation\s*number)\s*[:#|-]/i.test(text),
  has_quote:/(?:rate|cost|price|quote)\s*[:|-]?\s*\$?(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})/i.test(text)
 };
}

function buildParseFailureReason(signals){
 if(!signals?.has_text)return 'No parsable email body or attachment text was available.';
 const missing=[];
 if(!signals.has_pickup)missing.push('pickup');
 if(!signals.has_destination)missing.push('destination');
 if(!signals.has_trip_date)missing.push('trip_date');
 if(!signals.has_trip_time)missing.push('trip_time');
 if(missing.length)return `Missing required fields: ${missing.join(', ')}.`;
 return 'Content had partial trip details but could not be normalized into a complete booking.';
}

function buildParseDiagnostics({subject,emailBody,attachmentDiagnostics,attachmentText,parseSource,parseAttempt,usedSubjectFallback}){
 const signals=summarizeParseSignals(parseSource);
 const decodedAttachments=(attachmentDiagnostics||[]).filter((item)=>String(item?.status||'').startsWith('decoded')).length;
 const failedAttachments=(attachmentDiagnostics||[]).filter((item)=>String(item?.status||'')==='decode_failed').length;
 return {
  parser_version:'broker-email-webhook:diagnostics-v1',
  confirmation_subject_detected:/confirmation/i.test(clean(subject,240)),
  used_subject_fallback:Boolean(usedSubjectFallback),
  parse_succeeded:Boolean(parseAttempt),
  parse_failure_reason:parseAttempt?null:buildParseFailureReason(signals),
  signal_summary:signals,
  source_lengths:{
   email_body_length:clean(emailBody,20000).length,
   attachment_text_length:clean(attachmentText,50000).length,
   combined_parse_source_length:clean(parseSource,50000).length
  },
  attachment_summary:{
   total:Number((attachmentDiagnostics||[]).length||0),
   decoded:decodedAttachments,
   decode_failed:failedAttachments
  },
  attachment_diagnostics:Array.isArray(attachmentDiagnostics)?attachmentDiagnostics:[]
 };
}

function parseBrokerIntakeText(input){
 const text=clean(input,20000);
 if(!text)return null;
 const lines=text.split(/\r?\n/).map((line)=>clean(line,400)).filter(Boolean);
 const labeledFields=extractLabeledFields(text);
 const valueAfterColon=(line)=>{
  const splitIndex=line.indexOf(':');
  if(splitIndex>=0)return clean(line.slice(splitIndex+1),300);
  return clean(line,300);
 };

 const result={
  pickup:'',
  destination:'',
  trip_date:'',
  trip_time:'',
  pickup_time:'',
  service:'ambulatory',
  broker_name:'Unknown Broker',
  patient_name:'',
  patient_phone:'',
  referral_id:'',
  crm_reference:'',
  broker_quoted_rate:0,
  distance_miles:0,
  notes:''
 };

 const pickupMatch=text.match(/(?:^|\r?\n)\s*(pickup|origin|from)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const destinationMatch=text.match(/(?:^|\r?\n)\s*(destination|dropoff|drop off|to)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const dateMatch=text.match(/(?:^|\r?\n)\s*(date)\s*[:|-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/i);
 const timeMatch=text.match(/(?:^|\r?\n)\s*(time)\s*[:|-]\s*([0-9]{1,2}:[0-9]{2}(?:\s*(?:AM|PM))?)/i);
 const serviceMatch=text.match(/(?:^|\r?\n)\s*(service|level of service|transport\s*type)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const brokerNameMatch=text.match(/(?:^|\r?\n)\s*(broker|company)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const patientMatch=text.match(/(?:^|\r?\n)\s*(patient|member|rider|client\/?iw)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const referralMatch=text.match(/(?:^|\r?\n)\s*(referral\s*(?:id|#)?|reference|trip\s*id|trip\s*number|confirmation\s*number)\s*[:#|-]\s*([a-z0-9-]+)/i);
 const crmMatch=text.match(/(?:^|\r?\n)\s*(crm)\s*[:#|-]\s*([a-z0-9-]+)/i);
 const rateMatch=text.match(/(?:^|\r?\n)\s*(?:rate|cost|price|quote|rate\s*quote|quoted\s*rate|trip\s*rate)\s*[:|-]?\s*\$?(-?(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2}))/i);
 const milesMatch=text.match(/(?:^|\r?\n)\s*(miles|distance)\s*[:|-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);

 if(pickupMatch)result.pickup=clean(pickupMatch[2],300);
 if(destinationMatch)result.destination=clean(destinationMatch[2],300);
 if(dateMatch)result.trip_date=clean(dateMatch[2],30);
 if(timeMatch)result.trip_time=clean(timeMatch[2],30);
 if(serviceMatch)result.service=clean(serviceMatch[2],120);
 if(brokerNameMatch)result.broker_name=clean(brokerNameMatch[2],160);
 if(patientMatch)result.patient_name=clean(patientMatch[2],160);
 if(!result.patient_phone)result.patient_phone=firstField(labeledFields,['member_phone','patient_phone','phone_number','phone']);
 if(!result.pickup_time)result.pickup_time=firstField(labeledFields,['pickup_time','requested_pickup_time','requested_time','pickup_time_estimate']);
 if(referralMatch)result.referral_id=clean(referralMatch[2],120);
 if(crmMatch)result.crm_reference=clean(crmMatch[2],120);
 if(rateMatch)result.broker_quoted_rate=parseCurrencyValue(rateMatch[1]);
 if(milesMatch)result.distance_miles=n(milesMatch[2],0);

 if(!result.pickup)result.pickup=firstField(labeledFields,['pickup','pickup_address','origin','origin_address','from','from_address']);
 if(!result.destination)result.destination=firstField(labeledFields,['destination','destination_address','dropoff','drop_off','dropoff_address','drop_off_address','to','to_address']);
 if(!result.trip_date)result.trip_date=firstField(labeledFields,['date','appointment_date','pickup_date','requested_date']);
 if(!result.trip_time)result.trip_time=firstField(labeledFields,['time','appointment_time','requested_time']);
 if(!result.patient_name)result.patient_name=firstField(labeledFields,['patient','patient_name','member','member_name','rider']);
 if(!result.referral_id)result.referral_id=firstField(labeledFields,['referral_id','reference','trip_id','trip_number','confirmation_number']);
 if(!result.crm_reference)result.crm_reference=firstField(labeledFields,['crm','crm_reference']);
 if(result.broker_quoted_rate<=0){
  const quoteValue=firstField(labeledFields,['rate_quote','quoted_rate','trip_rate','rate','cost','price','quote']);
  if(quoteValue)result.broker_quoted_rate=parseCurrencyValue(quoteValue);
 }
 if(result.distance_miles<=0){
  const milesValue=firstField(labeledFields,['distance_miles','distance','miles']);
  if(milesValue)result.distance_miles=n(milesValue,0);
 }

 for(const line of lines){
  const lower=line.toLowerCase();
  if(!result.pickup&&/\b(pickup|origin|from)\b/.test(lower)&&/[:|-]/.test(line))result.pickup=valueAfterColon(line);
  if(!result.destination&&/\b(destination|dropoff|drop\s*off)\b/.test(lower)&&/[:|-]/.test(line))result.destination=valueAfterColon(line);
  if(!result.trip_date){
   const foundDate=line.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/);
   if(foundDate)result.trip_date=foundDate[1];
  }
  if(!result.trip_time){
   const foundTime=line.match(/([0-9]{1,2}:[0-9]{2}(?:\s*(?:AM|PM))?)/i);
   if(foundTime)result.trip_time=foundTime[1];
  }
  if(result.broker_quoted_rate<=0&&/(rate|cost|price|quote)/.test(lower)){
   const foundRate=line.match(/\$?(-?(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2}))/);
   if(foundRate)result.broker_quoted_rate=parseCurrencyValue(foundRate[1]);
  }
  if(result.distance_miles<=0&&/(mile|distance)/.test(lower)){
   const foundMiles=line.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
   if(foundMiles)result.distance_miles=n(foundMiles[1],0);
  }
  if(!result.crm_reference&&/\bcrm\b/.test(lower)){
   const foundCrm=line.match(/crm\s*[:#-]?\s*([a-z0-9-]+)/i);
   if(foundCrm)result.crm_reference=clean(foundCrm[1],120);
  }
 }

 result.trip_date=normalizeTripDate(result.trip_date);
 result.trip_time=normalizeTripTime(result.trip_time);

 const looksLikeLayoutLabel=(value)=>{
  const text=clean(value,260).toLowerCase();
  if(!text)return true;
  if(/pickup\s*timeappointment\s*timepickup\s*address/i.test(text))return true;
  if(/pickup\s*addressdrop\s*off\s*addressspecial\s*instructions/i.test(text))return true;
  if(/^(pickup\s*time|appointment\s*time|pickup\s*address|drop\s*off\s*address|special\s*instructions)$/i.test(text))return true;
  return false;
 };

 if(looksLikeLayoutLabel(result.pickup))result.pickup='';
 if(looksLikeLayoutLabel(result.destination))result.destination='';

 // Fall back to common label variants frequently found in broker PDFs.
 if(!result.pickup){
  const pickupAlt=text.match(/(?:^|\r?\n)\s*(?:pickup\s*address|origin\s*address|from\s*address)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
  if(pickupAlt)result.pickup=clean(pickupAlt[1],300);
 }
 if(!result.destination){
  const destinationAlt=text.match(/(?:^|\r?\n)\s*(?:drop\s*off\s*address|dropoff\s*address|destination\s*address|to\s*address)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
  if(destinationAlt)result.destination=clean(destinationAlt[1],300);
 }
 if(!result.trip_time){
  const timeAlt=text.match(/(?:^|\r?\n)\s*(?:appointment\s*time|pickup\s*time|requested\s*time)\s*[:|-]\s*([0-9]{1,2}:[0-9]{2}(?:\s*(?:AM|PM))?)/i);
  if(timeAlt)result.trip_time=normalizeTripTime(timeAlt[1]);
 }
 if(!result.pickup_time){
  const inlineTimes=text.match(/(?:^|\r?\n)\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM))\s*(?:home|facility|hospital|clinic|\d{1,6})/i);
  if(inlineTimes){
   result.pickup_time=normalizeTripTime(inlineTimes[1]);
   if(!result.trip_time)result.trip_time=normalizeTripTime(inlineTimes[2]);
  }
 }
 if(!result.trip_date){
  const dateAlt=text.match(/(?:^|\r?\n)\s*(?:appointment\s*date|pickup\s*date|requested\s*date)\s*[:|-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/i);
  if(dateAlt)result.trip_date=normalizeTripDate(dateAlt[1]);
 }

 if(!result.pickup||!result.destination){
  const tableParsed=parseGtTableAddresses(text);
  if(!result.pickup&&tableParsed.pickup)result.pickup=tableParsed.pickup;
  if(!result.destination&&tableParsed.destination)result.destination=tableParsed.destination;
 }

 if(!result.patient_phone){
  const phoneAlt=text.match(/(?:^|\r?\n)\s*(?:patient\s*phone|member\s*phone|phone\s*number|phone)\s*[:|-]\s*([+()\d\s.-]{7,})/i);
  if(phoneAlt) result.patient_phone=clean(phoneAlt[1],60);
 }

 const quoteSection=computeBrokerQuotedRateFromSection(labeledFields, result.broker_quoted_rate, text);
 if(quoteSection.quoteBasis!=='fallback'){
  result.broker_quoted_rate=quoteSection.brokerQuotedRate;
 }else if(result.broker_quoted_rate<=0){
  result.broker_quoted_rate=quoteSection.brokerQuotedRate;
 }
 result.quote_basis=quoteSection.quoteBasis;
 result.flat_rate=quoteSection.flatRate;
 result.per_mile=quoteSection.perMile;
 result.wait_time=quoteSection.waitTime;
 result.total_miles=quoteSection.totalMiles;
 result.no_show_fee=quoteSection.noShowFee;

 const pickupSplit=splitLocationTypeAndAddress(result.pickup);
 const destinationSplit=splitLocationTypeAndAddress(result.destination);
 result.pickup_location=pickupSplit.location||result.pickup_location||'';
 result.destination_location=destinationSplit.location||result.destination_location||'';
 result.pickup=pickupSplit.address;
 result.destination=destinationSplit.address;

 result.pickup=cleanupParsedAddress(result.pickup);
 result.destination=cleanupParsedAddress(result.destination);
 result.pickup=clean(result.pickup,300);
 result.destination=clean(result.destination,300);
 if(!result.pickup||!result.destination)return null;

 const extraFields={
  member_id:firstField(labeledFields,['member_id','member_number','medicaid_id','id_number']),
  member_dob:firstField(labeledFields,['date_of_birth','dob','birth_date']),
  member_phone:firstField(labeledFields,['member_phone','patient_phone','phone','phone_number']),
  patient_phone:result.patient_phone,
  pickup_phone:firstField(labeledFields,['pickup_phone','origin_phone']),
  destination_phone:firstField(labeledFields,['destination_phone','dropoff_phone','drop_off_phone']),
  appointment_type:firstField(labeledFields,['appointment_type','trip_type','reason_for_visit']),
  special_instructions:firstField(labeledFields,['special_instructions','instructions','notes'])
 };

 const hasAnySignal=Boolean(result.pickup||result.destination||result.trip_date||result.trip_time||result.patient_name||result.referral_id||result.crm_reference||result.broker_quoted_rate>0);
 if(!hasAnySignal)return null;
 if(!result.trip_date||!result.trip_time||!result.pickup||!result.destination)return null;
 const noteParts=['Parsed from broker confirmation attachment/email.'];
 if(result.referral_id)noteParts.push(`Referral ID: ${result.referral_id}`);
 if(result.crm_reference)noteParts.push(`CRM: ${result.crm_reference}`);
 result.notes=clean(noteParts.join(' | '),600);
 result.raw_fields=labeledFields;
 result.extra_fields=Object.fromEntries(Object.entries(extraFields).filter(([,value])=>Boolean(clean(value,300))));
 return result;
}

function parseSubjectHints(subject){
 const hints={patient_name:'',referral_id:'',trip_date:''};
 const text=clean(subject,400);
 if(!text) return hints;
 const patientRefMatch=text.match(/for\s+(.+?)\s+([a-z0-9-]{6,})\s+on\s+([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/i);
 if(patientRefMatch){
  hints.patient_name=clean(patientRefMatch[1],160);
  hints.referral_id=clean(patientRefMatch[2],120);
  hints.trip_date=normalizeTripDate(patientRefMatch[3]);
 }
 if(!hints.referral_id){
  const refMatch=text.match(/\b([0-9]{3,}-[0-9-]{3,})\b/);
  if(refMatch) hints.referral_id=clean(refMatch[1],120);
 }
 return hints;
}

function inferBrokerNameFromSender(senderEmail,senderName=''){
 const emailRaw=clean(senderEmail,200).toLowerCase();
 const email=((emailRaw.match(/<([^>]+)>/)||[])[1]||emailRaw).trim();
 if(email.endsWith('@gotandt.com')) return 'Go Transportation & Translation';
 return clean(senderName||'Unknown Broker',160);
}

function buildFallbackParsedFromSubject(subject,senderEmail,senderName=''){
 const hints=parseSubjectHints(subject);
 if(!hints.trip_date||!hints.referral_id)return null;
 const crmMatch=clean(subject,400).match(/\bcrm\s*[:#-]?\s*([a-z0-9-]+)/i);
 const crmReference=crmMatch?clean(crmMatch[1],120):'';
 return {
  pickup:'TBD - Awaiting GO T&T attachment details',
  destination:'TBD - Awaiting GO T&T attachment details',
  trip_date:hints.trip_date,
  trip_time:'00:00:00',
  service:'ambulatory',
  broker_name:inferBrokerNameFromSender(senderEmail,senderName),
  patient_name:hints.patient_name||'Unknown Patient',
  referral_id:hints.referral_id,
  crm_reference:crmReference,
  broker_quoted_rate:0,
  distance_miles:0,
  notes:clean(`Fallback from confirmation subject (attachment/body details unavailable). Referral ID: ${hints.referral_id}${crmReference?` | CRM: ${crmReference}`:''}`,600),
  subject_fallback:true
 };
}

async function resolveBrokerIdentity(senderEmail,parsedBrokerName,senderName){
 const senderRaw=clean(senderEmail,200).toLowerCase();
 const normalizedSender=((senderRaw.match(/<([^>]+)>/)||[])[1]||senderRaw).trim();
 const senderInferred=inferBrokerNameFromSender(normalizedSender,senderName);
 const byEmail=await query('SELECT id,name FROM brokers WHERE lower(trim(contact_email))=$1 LIMIT 1',[normalizedSender]).catch(()=>({rows:[]}));
 if(byEmail.rows?.[0]){
  return {brokerId:byEmail.rows[0].id,brokerName:clean(byEmail.rows[0].name,160)};
 }
 if(senderInferred&&senderInferred.toLowerCase()!=='unknown broker'){
  const inferredMatch=await query(`SELECT id,name FROM brokers WHERE regexp_replace(lower(name),'[^a-z0-9]+','','g')=regexp_replace(lower($1),'[^a-z0-9]+','','g') LIMIT 1`,[senderInferred]).catch(()=>({rows:[]}));
  if(inferredMatch.rows?.[0]){
   return {brokerId:inferredMatch.rows[0].id,brokerName:clean(inferredMatch.rows[0].name,160)};
  }
 }
 const parsedName=clean(parsedBrokerName,160);
 if(parsedName&&parsedName.toLowerCase()!=='unknown broker'){
  const byName=await query(`SELECT id,name FROM brokers WHERE regexp_replace(lower(name),'[^a-z0-9]+','','g')=regexp_replace(lower($1),'[^a-z0-9]+','','g') LIMIT 1`,[parsedName]).catch(()=>({rows:[]}));
  if(byName.rows?.[0]){
   return {brokerId:byName.rows[0].id,brokerName:clean(byName.rows[0].name,160)};
  }
 }
 const inferred=senderInferred||parsedName||inferBrokerNameFromSender(normalizedSender,senderName);
 return {brokerId:null,brokerName:clean(inferred||'Unknown Broker',160)};
}

async function ensureBookingAttachmentTable(){
 await query(`CREATE TABLE IF NOT EXISTS booking_attachments (
  id bigserial PRIMARY KEY,
  booking_reference text NOT NULL REFERENCES bookings(reference) ON DELETE CASCADE,
  broker_request_id bigint REFERENCES broker_requests(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  mime_type text,
  content_base64 text NOT NULL,
  source text NOT NULL DEFAULT 'BROKER_EMAIL',
  created_at timestamptz NOT NULL DEFAULT now()
 )`).catch(()=>{});
 await query(`CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking ON booking_attachments(booking_reference,created_at DESC)`).catch(()=>{});
}

async function saveBookingAttachments({bookingReference,brokerRequestId,attachments}){
 if(!bookingReference||!Array.isArray(attachments)||!attachments.length)return 0;
 await ensureBookingAttachmentTable();
 let inserted=0;
 for(const att of attachments){
  const fileName=clean(att.filename||'attachment',180);
  const mimeType=clean(att.type||'application/octet-stream',160);
  const content=String(att.content||'');
  if(!fileName||!content)continue;
  const duplicate=await query(`SELECT id FROM booking_attachments WHERE booking_reference=$1 AND file_name=$2 AND left(content_base64,1024)=left($3,1024) LIMIT 1`,[bookingReference,fileName,content]).catch(()=>({rows:[]}));
  if(duplicate.rows?.[0])continue;
  await query(`INSERT INTO booking_attachments(booking_reference,broker_request_id,file_name,mime_type,content_base64,source,created_at) VALUES($1,$2,$3,$4,$5,'BROKER_EMAIL',now())`,[bookingReference,brokerRequestId||null,fileName,mimeType,content]).catch(()=>{});
  inserted+=1;
 }
 return inserted;
}

async function readPlatformSettings(){
 const result=await query(`SELECT value FROM system_settings WHERE key='platform' LIMIT 1`).catch(()=>({rows:[]}));
 return result.rows?.[0]?.value||{};
}

function computePlatformRate(parsed,settings){
 const pricing=(settings.pricing&&typeof settings.pricing==='object')?settings.pricing:{};
 const serviceKey=resolveServiceKey(parsed.service);
 const fallback=pricing.ambulatory||{base:65,includedMiles:5,perMile:3.25,waitPer15:20};
 const selected=pricing[serviceKey]||fallback;
 const distance=n(parsed.distance_miles,n(selected.includedMiles,0));
 const base=n(selected.base,0);
 const includedMiles=n(selected.includedMiles,0);
 const perMile=n(selected.perMile,0);
 const waitPer15=n(selected.waitPer15,0);
 const twoHourWaitCost=waitPer15*8;
 const mileageCost=Math.max(0,distance-includedMiles)*perMile;
 return {
  serviceKey,
  distanceMiles:distance,
  twoHourWaitCost:Number(twoHourWaitCost.toFixed(2)),
  platformRate:Number((base+mileageCost+twoHourWaitCost).toFixed(2))
 };
}

function estimateTripOperatingCost(parsed,settings){
 const fareRules=(settings.fareRules&&typeof settings.fareRules==='object')?settings.fareRules:{};
 const distance=n(parsed.distance_miles,0);
 const band=resolveCostBand(parsed.service);
 const driverPay=n(DRIVER_PAY_RATES[band],20);
 const fuelIndexPrice=n(fareRules.fuelIndexPricePerGallon,0);
 const fuelPricePerGallon=fuelIndexPrice>0?fuelIndexPrice:n(fareRules.fuelBaselinePricePerGallon,3.25);
 const defaultMpg=clamp(n(fareRules.fuelEfficiencyMpg,10),1,100);
 const fuelBufferPct=clamp(n(fareRules.fuelOperationalBufferPct,0),0,300);
 const gallonsUsed=distance>0?distance/defaultMpg:0;
 const fuelCost=(gallonsUsed*fuelPricePerGallon)*(1+(fuelBufferPct/100));
 const tollCost=clamp(n(fareRules.tollCostPerTrip,0),0,1000);
 const maintenanceCost=distance*clamp(n(fareRules.maintenanceCostPerMile,0),0,100);
 const insuranceCost=clamp(n(fareRules.insuranceCostPerTrip,0),0,1000);
 const dispatchOverheadCost=clamp(n(fareRules.dispatchOverheadPerTrip,0),0,1000);
 const cleaningCost=clamp(n(fareRules.cleaningCostPerTrip,0),0,1000);
 const complianceCost=clamp(n(fareRules.complianceCostPerTrip,0),0,1000);
 const otherVariableCost=clamp(n(fareRules.otherVariableCostPerTrip,0),0,1000);
 const tripCost=driverPay+fuelCost+tollCost+maintenanceCost+insuranceCost+dispatchOverheadCost+cleaningCost+complianceCost+otherVariableCost;
 return {
  costBand:band,
  driverPay:Number(driverPay.toFixed(2)),
  fuelCost:Number(fuelCost.toFixed(2)),
  tollCost:Number(tollCost.toFixed(2)),
  maintenanceCost:Number(maintenanceCost.toFixed(2)),
  insuranceCost:Number(insuranceCost.toFixed(2)),
  dispatchOverheadCost:Number(dispatchOverheadCost.toFixed(2)),
  cleaningCost:Number(cleaningCost.toFixed(2)),
  complianceCost:Number(complianceCost.toFixed(2)),
  otherVariableCost:Number(otherVariableCost.toFixed(2)),
  tripCost:Number(tripCost.toFixed(2))
 };
}

function reference(){
 return `NMT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomInt(1000,9999)}`;
}

async function ensureBrokerEmailReplayColumns(){
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS variance numeric(10,2)`).catch(()=>{});
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS source_message_id text`).catch(()=>{});
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS source_received_at timestamptz`).catch(()=>{});
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS patient_name text`).catch(()=>{});
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS referral_id text`).catch(()=>{});
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS crm_reference text`).catch(()=>{});
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS parsed_payload jsonb`).catch(()=>{});
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS parse_source_method text`).catch(()=>{});
 await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_requests_source_message_id ON broker_requests(source_message_id) WHERE source_message_id IS NOT NULL`).catch(()=>{});
}

async function insertBrokerRequest({brokerId,brokerName,service,pickup,destination,tripDate,tripTime,brokerRate,platformRate,variance,submissionMethod,submittedBy,distanceMiles,sourceMessageId,sourceReceivedAt,patientName,referralId,crmReference,parsedPayload,parseSourceMethod}){
 await ensureBrokerEmailReplayColumns();
 if(sourceMessageId){
  const existing=await query('SELECT * FROM broker_requests WHERE source_message_id=$1 LIMIT 1',[sourceMessageId]).catch(()=>({rows:[]}));
  if(existing.rows?.[0]){
   const dispatchNote=`Distance miles: ${Number(distanceMiles||0).toFixed(2)} | Includes 2h wait time in broker/platform rate calculations.`;
   const updated=await query(`UPDATE broker_requests SET
    broker_id=$2,
    broker_name=$3,
    service=$4,
    pickup=$5,
    destination=$6,
    trip_date=$7,
    trip_time=$8,
    broker_quoted_rate=$9,
    platform_calculated_rate=$10,
    rate_delta=$11,
    variance=$12,
    submission_method=$13,
    submitted_by=$14,
    dispatch_notes=$15,
    source_received_at=COALESCE($16,source_received_at),
    patient_name=$17,
    referral_id=$18,
    crm_reference=$19,
    parsed_payload=$20::jsonb,
    parse_source_method=$21,
    updated_at=now()
    WHERE id=$1
    RETURNING *`,[
    existing.rows[0].id,
    brokerId,
    brokerName,
    service,
    pickup,
    destination,
    tripDate,
    tripTime,
    brokerRate,
    platformRate,
    variance,
    variance,
    submissionMethod,
    submittedBy,
    dispatchNote,
    sourceReceivedAt||null,
    clean(patientName,160)||null,
    clean(referralId,120)||null,
    clean(crmReference,120)||null,
    JSON.stringify(parsedPayload||{}),
    clean(parseSourceMethod,80)||null
   ]).catch(()=>({rows:[existing.rows[0]]}));
   return updated.rows?.[0]||existing.rows[0];
  }
 }
 const insertSql=`INSERT INTO broker_requests(
  broker_id,booking_reference,broker_name,service,pickup,destination,
  pickup_lat,pickup_lng,destination_lat,destination_lng,
  trip_date,trip_time,broker_quoted_rate,platform_calculated_rate,rate_delta,variance,
  submission_method,submitted_by,request_status,dispatch_notes,source_message_id,source_received_at,
  patient_name,referral_id,crm_reference,parsed_payload,parse_source_method
 ) VALUES($1,null,$2,$3,$4,$5,null,null,null,null,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22)
 RETURNING *`;
 const dispatchNote=`Distance miles: ${Number(distanceMiles||0).toFixed(2)} | Includes 2h wait time in broker/platform rate calculations.`;
 const result=await query(insertSql,[
  brokerId,
  brokerName,
  service,
  pickup,
  destination,
  tripDate,
  tripTime,
  brokerRate,
  platformRate,
  variance,
  variance,
  submissionMethod,
  submittedBy,
  'PENDING_DISPATCH_CONFIRMATION',
  dispatchNote,
  sourceMessageId||null,
  sourceReceivedAt||null,
  clean(patientName,160)||null,
  clean(referralId,120)||null,
  clean(crmReference,120)||null,
  JSON.stringify(parsedPayload||{}),
  clean(parseSourceMethod,80)||null
 ]);
 return result.rows[0];
}

function buildBrokerBookingNotes(parsed,{brokerRate,platformRate,tripCostEstimate}){
 return [
  'Broker confirmation intake created from inbound email attachment.',
  `Broker quoted (including wait): $${Number(brokerRate||0).toFixed(2)}`,
  `Platform rate (with 2h wait): $${Number(platformRate||0).toFixed(2)}`,
  `Variance: $${Number((brokerRate-platformRate)||0).toFixed(2)}`,
  `Estimated operating cost: $${Number(tripCostEstimate||0).toFixed(2)}`,
  parsed.referral_id?`Referral ID: ${parsed.referral_id}`:'',
  parsed.crm_reference?`CRM: ${parsed.crm_reference}`:'',
  parsed.notes||'',
  parsed.subject_fallback?'Dispatch action required: complete pickup, destination, appointment time, service, and quoted rate from source document.':''
 ].filter(Boolean).join(' | ');
}

async function createBookingFromBrokerRequest(parsed,{brokerName,brokerRate,platformRate,tripCostEstimate,tripDate,tripTime,brokerRequestId,attachments=[]}){
 const bookingReference=reference();
 const notes=buildBrokerBookingNotes(parsed,{brokerRate,platformRate,tripCostEstimate});
 const result=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,pickup_location,dropoff_location,pickup_time,trip_date,trip_time,status,notes,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_miles,estimated_duration,estimated_fare,booking_source,submitter_entity,broker_company_name,broker_accepted_rate,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,null,null,null,null,$15,null,$16,$17,$18,$19,$20,now(),now()) RETURNING *`,[
  bookingReference,
  parsed.patient_name||brokerName||'Broker Request',
  parsed.patient_phone||null,
  null,
  parsed.service,
  parsed.pickup,
  parsed.destination,
  parsed.pickup_location||null,
  parsed.destination_location||null,
  buildPickupTimestamp(tripDate,parsed.pickup_time),
  tripDate,
  tripTime,
  'PENDING_DISPATCH_CONFIRMATION',
  notes,
  Number(parsed.distance_miles||0),
  Number(platformRate||0),
  normalizeBookingSource('BROKER'),
  clean(parsed.submitter_email||'BROKER_INTAKE'),
  clean(brokerName||'Unknown Broker',120),
  Number(brokerRate||0)
 ]);
 await saveBookingAttachments({bookingReference,brokerRequestId,attachments});
 return result.rows[0];
}

async function enrichExistingBookingFromBrokerRequest({bookingReference,parsed,brokerName,brokerRate,platformRate,tripCostEstimate,tripDate,tripTime,distanceMiles,brokerRequestId,attachments=[],parseSourceMethod='EMAIL_ATTACHMENT'}){
 if(!bookingReference)return null;
 const notes=buildBrokerBookingNotes(parsed,{brokerRate,platformRate,tripCostEstimate});
 const normalizedBrokerQuote=Number(n(parsed.broker_quoted_rate,0).toFixed(2));
 await query(`UPDATE bookings SET
  name=$2,
  phone=COALESCE($3,phone),
  email=COALESCE($4,email),
  service=$5,
  pickup=$6,
  destination=$7,
  pickup_location=$8,
  dropoff_location=$9,
  pickup_time=COALESCE($10,pickup_time),
  trip_date=$11,
  trip_time=$12,
  notes=$13,
  distance_miles=$14,
  estimated_fare=$15,
  broker_company_name=$16,
  broker_accepted_rate=$17,
  updated_at=now()
  WHERE reference=$1`,[
  bookingReference,
  parsed.patient_name||brokerName||'Broker Request',
  parsed.patient_phone||null,
  parsed.submitter_email||null,
  parsed.service,
  parsed.pickup,
  parsed.destination,
  parsed.pickup_location||null,
  parsed.destination_location||null,
  buildPickupTimestamp(tripDate,parsed.pickup_time),
  tripDate,
  tripTime,
  notes,
  Number(distanceMiles||0),
  Number(platformRate||0),
  clean(brokerName||'Unknown Broker',120),
  Number(brokerRate||0)
 ]).catch(()=>{});
 await query(`UPDATE broker_requests SET
  service=$2,
  pickup=$3,
  destination=$4,
  trip_date=$5,
  trip_time=$6,
  broker_quoted_rate=$7,
  platform_calculated_rate=$8,
  rate_delta=$9,
  variance=$9,
  submission_method='EMAIL_ATTACHMENT',
  dispatch_notes=$10,
  patient_name=$11,
  referral_id=$12,
  crm_reference=$13,
  parsed_payload=$14::jsonb,
  parse_source_method=$15,
  updated_at=now()
  WHERE id=$1`,[
  brokerRequestId,
  parsed.service,
  parsed.pickup,
  parsed.destination,
  tripDate,
  tripTime,
  Number(brokerRate||0),
  Number(platformRate||0),
  Number((brokerRate-platformRate)||0),
  `Distance miles: ${Number(distanceMiles||0).toFixed(2)} | Includes 2h wait time in broker/platform rate calculations.`,
  clean(parsed.patient_name,160)||null,
  clean(parsed.referral_id,120)||null,
  clean(parsed.crm_reference,120)||null,
  JSON.stringify({
   pickup:parsed.pickup,
   destination:parsed.destination,
   trip_date:tripDate,
   trip_time:tripTime,
    pickup_time:parsed.pickup_time||null,
   service:parsed.service,
   patient_name:parsed.patient_name||null,
    patient_phone:parsed.patient_phone||null,
   referral_id:parsed.referral_id||null,
   crm_reference:parsed.crm_reference||null,
   broker_quoted_rate:normalizedBrokerQuote,
   broker_quoted_rate_including_wait:Number(brokerRate||0),
    quote_basis:parsed.quote_basis||'fallback',
    flat_rate:parsed.flat_rate||0,
    per_mile:parsed.per_mile||0,
    wait_time:parsed.wait_time||0,
    total_miles:parsed.total_miles||0,
    no_show_fee:parsed.no_show_fee||0,
   distance_miles:Number(distanceMiles||0),
   notes:parsed.notes||'',
   extra_fields:parsed.extra_fields||{},
   raw_fields:parsed.raw_fields||{}
  }),
  clean(parseSourceMethod,80)||'EMAIL_ATTACHMENT'
 ]).catch(()=>{});
 await saveBookingAttachments({bookingReference,brokerRequestId,attachments});
 const refreshed=await query('SELECT * FROM bookings WHERE reference=$1 LIMIT 1',[bookingReference]).catch(()=>({rows:[]}));
 return refreshed.rows?.[0]||null;
}

async function forwardBrokerEmailIfNeeded({from,to,subject,text,attachments}){
 const sender=clean(from,200).toLowerCase();
 const recipients=clean(to,500).toLowerCase();
 if(FORWARD_FROM!=='*'&&sender!==FORWARD_FROM)return {status:'skipped'};
 if(!recipients.includes(FORWARD_TO_MATCH))return {status:'skipped'};
 const attachmentList=(attachments||[]).map((att)=>clean(att.filename||'attachment',120)).join(', ');
 const html=`<h2>Forwarded broker email</h2><p><strong>From:</strong> ${clean(from,200)}</p><p><strong>To:</strong> ${clean(to,300)}</p><p><strong>Subject:</strong> ${clean(subject,240)||'(no subject)'}</p><p><strong>Attachments:</strong> ${attachmentList||'None'}</p><hr><pre style="white-space:pre-wrap;font-family:inherit">${clean(text,18000)}</pre>`;
 return sendEmail([FORWARD_TO],`FWD: ${clean(subject,200)||'Broker email'}`,html,attachments);
}

async function notifyTeamsForBrokerReview({request,booking,parsed,platformRate,brokerRate,variance,tripCostEstimate,costBreakdown}){
 const title='Broker Confirmation Review Required - Admin_NMT';
 const text=[
  `**Broker confirmation intake ready for review**`,
  `- **Request ID:** ${request.id}`,
  `- **Booking Ref:** ${booking.reference}`,
  `- **Broker:** ${request.broker_name||'Unknown'}`,
  `- **Service:** ${parsed.service}`,
  `- **Route:** ${parsed.pickup} -> ${parsed.destination}`,
  `- **Date/Time:** ${request.trip_date} ${request.trip_time}`,
  `- **Distance Miles:** ${Number(parsed.distance_miles||0).toFixed(2)}`,
  `- **Broker Quoted Rate (incl 2h wait):** $${Number(brokerRate||0).toFixed(2)}`,
  `- **Platform Rate (incl 2h wait):** $${Number(platformRate||0).toFixed(2)}`,
  `- **Variance:** $${Number(variance||0).toFixed(2)}`,
  `- **Estimated Trip Cost:** $${Number(tripCostEstimate||0).toFixed(2)}`,
  `- **Cost Components:** Driver $${Number(costBreakdown.driverPay||0).toFixed(2)}, Fuel $${Number(costBreakdown.fuelCost||0).toFixed(2)}, Tolls $${Number(costBreakdown.tollCost||0).toFixed(2)}, Maintenance $${Number(costBreakdown.maintenanceCost||0).toFixed(2)}, Insurance $${Number(costBreakdown.insuranceCost||0).toFixed(2)}, Dispatch $${Number(costBreakdown.dispatchOverheadCost||0).toFixed(2)}, Cleaning $${Number(costBreakdown.cleaningCost||0).toFixed(2)}, Compliance $${Number(costBreakdown.complianceCost||0).toFixed(2)}, Other $${Number(costBreakdown.otherVariableCost||0).toFixed(2)}`,
  `- **Status:** PENDING_DISPATCH_CONFIRMATION`,
  `- **Action:** Review and decide if Nexus should accept this work.`
 ].join('\n');
 return sendTeamsAlert(text,title);
}

async function hasNotificationLog({requestId,messageId,channel}){
 if(!requestId||!messageId||!channel)return false;
 const logs=await query(`SELECT details FROM audit_log WHERE entity_type=$1 AND entity_id=$2 AND action=$3 ORDER BY created_at DESC LIMIT 50`,[
  'BROKER_REQUEST',
  String(requestId),
  'NOTIFICATION_SENT'
 ]).catch(()=>({rows:[]}));
 for(const row of logs.rows||[]){
  const details=safeJsonParse(row?.details);
  if(!details)continue;
  if(String(details.channel||'')===String(channel)&&String(details.messageId||'')===String(messageId))return true;
 }
 return false;
}

async function auditNotification({requestId,channel,messageId,status,error}){
 if(!requestId||!channel)return;
 await writeAuditLog({
  entityType:'BROKER_REQUEST',
  entityId:String(requestId),
  action:'NOTIFICATION_SENT',
  payload:{channel,messageId:messageId||null,status,error:error?clean(error,500):null},
  actor:'BROKER_EMAIL_WEBHOOK',
  actorRole:'SYSTEM'
 }).catch(()=>{});
}

exports.handler=async(event)=>{
 try{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  const payload=typeof event.body==='string'?JSON.parse(event.body):event.body||{};
  const senderEmail=clean(payload.from||payload.sender||'',200).toLowerCase();
  const senderName=clean(payload.sender_name||payload.from_name||senderEmail.split('@')[0]||'Unknown Broker',160);
  const recipient=clean(payload.to||payload.recipient||'',320);
  const messageId=clean(payload.messageId||payload.internetMessageId||payload.id||'',320) || null;
  const receivedAtRaw=clean(payload.receivedAt||payload.receivedDateTime||payload.date||payload.sentAt||'',80);
  const receivedAt=receivedAtRaw?new Date(receivedAtRaw):null;
  const normalizedReceivedAt=receivedAt&&!Number.isNaN(receivedAt.getTime())?receivedAt.toISOString():null;
  const subject=clean(payload.subject||'',240);
  const emailBody=clean(payload.text||payload.html||payload.body||'',20000);
  if(!senderEmail||!emailBody)return json(400,{error:'Missing from or body'});

  const attachments=parsePotentialAttachmentInfo(payload);
  await forwardBrokerEmailIfNeeded({from:senderEmail,to:recipient,subject,text:emailBody,attachments}).catch((error)=>console.error('[BROKER_FORWARD]',error.message));

  const hasConfirmationSubject=/confirmation/i.test(subject);
  const decodedAttachmentResults=await Promise.all((attachments||[]).map((attachment)=>decodeAttachmentText(attachment)));
  const decodedAttachmentTexts=decodedAttachmentResults.map((result)=>clean(result?.text||'',50000)).filter(Boolean);
  const attachmentDiagnostics=decodedAttachmentResults.map((result)=>result?.diagnostic).filter(Boolean);
  const attachmentText=decodedAttachmentTexts.join('\n\n');
  const parseSource=[attachmentText,emailBody].filter(Boolean).join('\n\n');
  const parseAttempt=parseBrokerIntakeText(parseSource);
  let parsed=parseAttempt;
  if(!parsed&&hasConfirmationSubject){
   parsed=buildFallbackParsedFromSubject(subject,senderEmail,senderName);
  }
  const parseDiagnostics=buildParseDiagnostics({
   subject,
   emailBody,
   attachmentDiagnostics,
   attachmentText,
   parseSource,
   parseAttempt,
   usedSubjectFallback:Boolean(parsed&&parsed.subject_fallback)
  });
  if(!parsed)return json(400,{error:'Could not parse pickup, destination, date, time, or quoted rate from email/attachment',parse_diagnostics:parseDiagnostics});

  const subjectHints=parseSubjectHints(subject);
  if(!parsed.patient_name&&subjectHints.patient_name)parsed.patient_name=subjectHints.patient_name;
  if(!parsed.referral_id&&subjectHints.referral_id)parsed.referral_id=subjectHints.referral_id;
  if(!parsed.trip_date&&subjectHints.trip_date)parsed.trip_date=subjectHints.trip_date;

  const resolvedBroker=await resolveBrokerIdentity(senderEmail,parsed.broker_name,senderName);
  const brokerId=resolvedBroker.brokerId;
  const brokerName=resolvedBroker.brokerName;

  const settings=await readPlatformSettings();
  const rateInfo=computePlatformRate(parsed,settings);
  const waitCost=rateInfo.twoHourWaitCost;
  const normalizedBrokerQuote=Number(n(parsed.broker_quoted_rate,0).toFixed(2));
  const brokerRateWithWait=parsed.subject_fallback
   ?0
   :(normalizedBrokerQuote>0?Number((normalizedBrokerQuote+waitCost).toFixed(2)):0);
  const platformRate=Number(rateInfo.platformRate.toFixed(2));
  const variance=Number((brokerRateWithWait-platformRate).toFixed(2));
  const costBreakdown=estimateTripOperatingCost({...parsed,distance_miles:rateInfo.distanceMiles},settings);

  const tripDate=normalizeTripDate(parsed.trip_date);
  const tripTime=normalizeTripTime(parsed.trip_time);
  if(!tripDate||!tripTime)return json(400,{error:'Invalid trip date or time in parsed broker intake'});
  const parseSourceMethod=parsed.subject_fallback?'EMAIL_SUBJECT_FALLBACK':(attachmentText?'EMAIL_ATTACHMENT':'EMAIL_BODY');
  const parsedPayload={
   pickup:parsed.pickup,
   destination:parsed.destination,
   trip_date:tripDate,
   trip_time:tripTime,
   service:parsed.service,
   patient_name:parsed.patient_name||null,
   referral_id:parsed.referral_id||null,
   crm_reference:parsed.crm_reference||null,
  broker_quoted_rate:normalizedBrokerQuote,
  broker_quoted_rate_including_wait:brokerRateWithWait,
   distance_miles:Number(rateInfo.distanceMiles||0),
   notes:parsed.notes||'',
  extra_fields:parsed.extra_fields||{},
  raw_fields:parsed.raw_fields||{},
    parse_diagnostics:parseDiagnostics,
   subject_fallback:Boolean(parsed.subject_fallback)
  };

  const request=await insertBrokerRequest({
   brokerId,
   brokerName,
   service:parsed.service,
   pickup:parsed.pickup,
   destination:parsed.destination,
   tripDate,
   tripTime,
   brokerRate:brokerRateWithWait,
   platformRate,
   variance,
  submissionMethod:parsed.subject_fallback?'EMAIL_SUBJECT_FALLBACK':'EMAIL_ATTACHMENT',
   submittedBy:senderEmail,
  distanceMiles:rateInfo.distanceMiles,
  sourceMessageId:messageId,
  sourceReceivedAt:normalizedReceivedAt,
  patientName:parsed.patient_name,
  referralId:parsed.referral_id,
  crmReference:parsed.crm_reference,
  parsedPayload,
  parseSourceMethod
  });

  let booking=null;
  if(request?.booking_reference){
   const existingBooking=await query('SELECT * FROM bookings WHERE reference=$1 LIMIT 1',[request.booking_reference]).catch(()=>({rows:[]}));
   booking=existingBooking.rows?.[0]||null;
  }
  if(booking&&attachments.length>0){
   await saveBookingAttachments({
    bookingReference:booking.reference,
    brokerRequestId:request.id,
    attachments
   });
  }
  if(booking&&hasConfirmationSubject&&attachments.length>0&&!parsed.subject_fallback){
   booking=await enrichExistingBookingFromBrokerRequest({
    bookingReference:booking.reference,
    parsed,
    brokerName,
    brokerRate:brokerRateWithWait,
    platformRate,
    tripCostEstimate:costBreakdown.tripCost,
    tripDate,
    tripTime,
    distanceMiles:rateInfo.distanceMiles,
    brokerRequestId:request.id,
    attachments,
    parseSourceMethod
   })||booking;
  }
  if(!booking&&hasConfirmationSubject&&(attachments.length>0||parsed.subject_fallback)){
   booking=await createBookingFromBrokerRequest(parsed,{
    brokerName,
    brokerRate:brokerRateWithWait,
    platformRate,
    tripCostEstimate:costBreakdown.tripCost,
    tripDate,
    tripTime,
    brokerRequestId:request.id,
    attachments
   });
   await query('UPDATE broker_requests SET booking_reference=$2,updated_at=now() WHERE id=$1',[request.id,booking.reference]).catch(()=>{});
  }

  let teamsNotification={status:'skipped'};
  if(booking&&hasConfirmationSubject){
   const alreadySent=await hasNotificationLog({requestId:request.id,messageId,channel:'TEAMS_REVIEW'});
   if(!alreadySent){
    teamsNotification=await notifyTeamsForBrokerReview({
     request:{...request,booking_reference:booking.reference},
     booking,
     parsed:{...parsed,distance_miles:rateInfo.distanceMiles},
     platformRate,
     brokerRate:brokerRateWithWait,
     variance,
     tripCostEstimate:costBreakdown.tripCost,
     costBreakdown
    }).catch((error)=>({status:'failed',error:error.message}));
    await auditNotification({
     requestId:request.id,
     channel:'TEAMS_REVIEW',
     messageId,
     status:teamsNotification.status||'failed',
     error:teamsNotification.error||null
    });
   }else{
    teamsNotification={status:'skipped',reason:'already_sent_for_message'};
   }
  }

  await writeAuditLog({
   entityType:'BROKER_REQUEST',
   entityId:String(request.id),
   action:'EMAIL_RECEIVED',
   payload:{
    from:senderEmail,
    to:recipient,
    subject,
    messageId,
    receivedAt:normalizedReceivedAt,
    hasConfirmationSubject,
    attachmentCount:attachments.length,
    parseDiagnostics:parseDiagnostics,
    bookingReference:booking?.reference||null,
    parsed:{...parsed,trip_date:tripDate,trip_time:tripTime,distance_miles:rateInfo.distanceMiles},
      brokerQuotedWithWait:brokerRateWithWait,
    platformRate,
    variance,
    estimatedTripCost:costBreakdown.tripCost
   },
   actor:senderEmail||'BROKER_EMAIL_WEBHOOK',
   actorRole:'BROKER'
  }).catch(()=>{});

  const confirmationHtml=`<h2>Broker confirmation intake received</h2><p>We received your request for <strong>${parsed.pickup}</strong> to <strong>${parsed.destination}</strong> on <strong>${tripDate}</strong> at <strong>${tripTime.slice(0,5)}</strong>.</p><p>Status: <strong>PENDING DISPATCH CONFIRMATION</strong></p><p>Broker quoted rate: <strong>$${brokerRateWithWait.toFixed(2)}</strong></p><p>Platform rate (incl. wait): <strong>$${platformRate.toFixed(2)}</strong></p><p>Variance: <strong>$${variance.toFixed(2)}</strong></p><p>Dispatch will review and confirm final acceptance.</p>`;
  let emailNotification={status:'skipped'};
  const emailAlreadySent=await hasNotificationLog({requestId:request.id,messageId,channel:'BROKER_CONFIRMATION_EMAIL'});
  if(!emailAlreadySent){
   emailNotification=await sendEmail([senderEmail],`Nexus broker request received — ${brokerName}`,confirmationHtml).catch((error)=>({status:'failed',error:error.message}));
   await auditNotification({
    requestId:request.id,
    channel:'BROKER_CONFIRMATION_EMAIL',
    messageId,
    status:emailNotification.status||'failed',
    error:emailNotification.error||null
   });
  }else{
    emailNotification={status:'skipped',reason:'already_sent_for_message'};
  }

  return json(201,{
   success:true,
   request_id:request.id,
   broker_id:brokerId,
   broker_name:brokerName,
   booking_reference:booking?.reference||null,
   confirmation_subject_detected:hasConfirmationSubject,
   attachment_count:attachments.length,
   parsed_route:`${parsed.pickup} -> ${parsed.destination}`,
   parsed_date:tripDate,
   parsed_time:tripTime,
   distance_miles:Number(rateInfo.distanceMiles.toFixed(2)),
   broker_quoted_rate_including_wait:brokerRateWithWait,
   platform_rate_including_wait:platformRate,
   variance,
   estimated_trip_cost:costBreakdown.tripCost,
  teams_notification_status:teamsNotification.status||'unknown',
  email_notification_status:emailNotification.status||'unknown',
   status:'PENDING_DISPATCH_CONFIRMATION',
   message:'Broker request processed and routed for dispatch/Admin_NMT review.'
  });
 }catch(error){
  console.error('[BROKER_EMAIL] Error:',error.message);
  return json(500,{error:'Internal server error',message:error.message});
 }
};

exports.buildPickupTimestamp=buildPickupTimestamp;
