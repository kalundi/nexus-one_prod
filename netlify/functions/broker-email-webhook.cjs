const {Client}=require('pg');
const crypto=require('crypto');
const {buildEmailRecipients}=require('./_shared/notification-routing.cjs');

const pool=new Client({connectionString:process.env.DATABASE_URL});
let connected=false;

const FORWARD_FROM='xxxx@gotandt.com';
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

function json(code,body){
 return {statusCode:code,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
}

function clean(value,max=500){
 return String(value||'').trim().slice(0,max);
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
 const recipients=Array.isArray(to)?to:buildEmailRecipients(to);
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
  const response=await fetch(webhookUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
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

function decodeAttachmentText(attachment){
 const filename=clean(attachment.filename||'',180).toLowerCase();
 const type=clean(attachment.type||'',160).toLowerCase();
 const isTextual=type.startsWith('text/')||type.includes('json')||type.includes('xml')||type.includes('csv')||filename.endsWith('.txt')||filename.endsWith('.csv')||filename.endsWith('.json')||filename.endsWith('.xml');
 if(!isTextual)return '';
 try{
  const decoded=Buffer.from(String(attachment.content||''),'base64').toString('utf8');
  if(decoded&&decoded.trim())return decoded;
 }catch(_error){
  // Ignore base64 decode failures.
 }
 return clean(attachment.content||'',20000);
}

function parseBrokerIntakeText(input){
 const text=clean(input,20000);
 if(!text)return null;
 const lines=text.split(/\r?\n/).map((line)=>clean(line,400)).filter(Boolean);
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
  service:'ambulatory',
  broker_name:'Unknown Broker',
  broker_quoted_rate:0,
  distance_miles:0,
  notes:''
 };

 const pickupMatch=text.match(/(?:^|\r?\n)\s*(pickup|origin|from)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const destinationMatch=text.match(/(?:^|\r?\n)\s*(destination|dropoff|drop off|to)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const dateMatch=text.match(/(?:^|\r?\n)\s*(date)\s*[:|-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/i);
 const timeMatch=text.match(/(?:^|\r?\n)\s*(time)\s*[:|-]\s*([0-9]{1,2}:[0-9]{2}(?:\s*(?:AM|PM))?)/i);
 const serviceMatch=text.match(/(?:^|\r?\n)\s*(service|level of service)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const brokerNameMatch=text.match(/(?:^|\r?\n)\s*(broker|company)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const rateMatch=text.match(/(?:^|\r?\n)\s*(rate|cost|price|quote)\s*[:|-]?\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i);
 const milesMatch=text.match(/(?:^|\r?\n)\s*(miles|distance)\s*[:|-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);

 if(pickupMatch)result.pickup=clean(pickupMatch[2],300);
 if(destinationMatch)result.destination=clean(destinationMatch[2],300);
 if(dateMatch)result.trip_date=clean(dateMatch[2],30);
 if(timeMatch)result.trip_time=clean(timeMatch[2],30);
 if(serviceMatch)result.service=clean(serviceMatch[2],120);
 if(brokerNameMatch)result.broker_name=clean(brokerNameMatch[2],160);
 if(rateMatch)result.broker_quoted_rate=n(rateMatch[2],0);
 if(milesMatch)result.distance_miles=n(milesMatch[2],0);

 for(const line of lines){
  const lower=line.toLowerCase();
  if(!result.pickup&&/(pickup|origin|from)/.test(lower))result.pickup=valueAfterColon(line);
  if(!result.destination&&/(destination|dropoff|drop off|to)/.test(lower))result.destination=valueAfterColon(line);
  if(!result.trip_date){
   const foundDate=line.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4})/);
   if(foundDate)result.trip_date=foundDate[1];
  }
  if(!result.trip_time){
   const foundTime=line.match(/([0-9]{1,2}:[0-9]{2}(?:\s*(?:AM|PM))?)/i);
   if(foundTime)result.trip_time=foundTime[1];
  }
  if(result.broker_quoted_rate<=0&&/(rate|cost|price|quote)/.test(lower)){
   const foundRate=line.match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/);
   if(foundRate)result.broker_quoted_rate=n(foundRate[1],0);
  }
  if(result.distance_miles<=0&&/(mile|distance)/.test(lower)){
   const foundMiles=line.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
   if(foundMiles)result.distance_miles=n(foundMiles[1],0);
  }
 }

 result.trip_date=normalizeTripDate(result.trip_date);
 result.trip_time=normalizeTripTime(result.trip_time);
 if(!result.trip_date||!result.trip_time||!result.pickup||!result.destination||result.broker_quoted_rate<=0)return null;
 result.notes=clean(`Parsed from broker confirmation attachment/email.`,400);
 return result;
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

async function ensureBrokerVarianceColumn(){
 await query(`ALTER TABLE broker_requests ADD COLUMN IF NOT EXISTS variance numeric(10,2)`).catch(()=>{});
}

async function insertBrokerRequest({brokerId,brokerName,service,pickup,destination,tripDate,tripTime,brokerRate,platformRate,variance,submissionMethod,submittedBy,distanceMiles}){
 await ensureBrokerVarianceColumn();
 const insertSql=`INSERT INTO broker_requests(
  broker_id,booking_reference,broker_name,service,pickup,destination,
  pickup_lat,pickup_lng,destination_lat,destination_lng,
  trip_date,trip_time,broker_quoted_rate,platform_calculated_rate,rate_delta,variance,
  submission_method,submitted_by,request_status,dispatch_notes
 ) VALUES($1,null,$2,$3,$4,$5,null,null,null,null,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
  dispatchNote
 ]);
 return result.rows[0];
}

async function createBookingFromBrokerRequest(parsed,{brokerName,brokerRate,platformRate,tripCostEstimate,tripDate,tripTime}){
 const bookingReference=reference();
 const notes=[
  'Broker confirmation intake created from inbound email attachment.',
  `Broker quoted (with 2h wait): $${Number(brokerRate||0).toFixed(2)}`,
  `Platform rate (with 2h wait): $${Number(platformRate||0).toFixed(2)}`,
  `Variance: $${Number((brokerRate-platformRate)||0).toFixed(2)}`,
  `Estimated operating cost: $${Number(tripCostEstimate||0).toFixed(2)}`
 ].join(' | ');
 const result=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_miles,estimated_duration,estimated_fare,booking_source,submitter_entity,broker_company_name,broker_accepted_rate,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,null,null,null,$12,null,$13,$14,$15,$16,$17,now(),now()) RETURNING *`,[
  bookingReference,
  brokerName||'Broker Request',
  null,
  null,
  parsed.service,
  parsed.pickup,
  parsed.destination,
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
 return result.rows[0];
}

async function forwardBrokerEmailIfNeeded({from,to,subject,text,attachments}){
 const sender=clean(from,200).toLowerCase();
 const recipients=clean(to,500).toLowerCase();
 if(sender!==FORWARD_FROM)return {status:'skipped'};
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

exports.handler=async(event)=>{
 try{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  const payload=typeof event.body==='string'?JSON.parse(event.body):event.body||{};
  const senderEmail=clean(payload.from||payload.sender||'',200).toLowerCase();
  const senderName=clean(payload.sender_name||payload.from_name||senderEmail.split('@')[0]||'Unknown Broker',160);
  const recipient=clean(payload.to||payload.recipient||'',320);
  const subject=clean(payload.subject||'',240);
  const emailBody=clean(payload.text||payload.html||payload.body||'',20000);
  if(!senderEmail||!emailBody)return json(400,{error:'Missing from or body'});

  const attachments=parsePotentialAttachmentInfo(payload);
  await forwardBrokerEmailIfNeeded({from:senderEmail,to:recipient,subject,text:emailBody,attachments}).catch((error)=>console.error('[BROKER_FORWARD]',error.message));

  const hasConfirmationSubject=/confirmation/i.test(subject);
  const attachmentText=(attachments||[]).map((attachment)=>decodeAttachmentText(attachment)).filter(Boolean).join('\n\n');
  const parseSource=attachmentText||emailBody;
  const parsed=parseBrokerIntakeText(parseSource);
  if(!parsed)return json(400,{error:'Could not parse pickup, destination, date, time, or quoted rate from email/attachment'});

  const brokerInfo=await query('SELECT id,name FROM brokers WHERE lower(trim(contact_email))=$1 LIMIT 1',[senderEmail]).catch(()=>({rows:[]}));
  const brokerId=brokerInfo.rows[0]?.id||null;
  const brokerName=clean(brokerInfo.rows[0]?.name||parsed.broker_name||senderName,160);

  const settings=await readPlatformSettings();
  const rateInfo=computePlatformRate(parsed,settings);
  const waitCost=rateInfo.twoHourWaitCost;
  const brokerRateWithWait=Number((n(parsed.broker_quoted_rate,0)+waitCost).toFixed(2));
  const platformRate=Number(rateInfo.platformRate.toFixed(2));
  const variance=Number((brokerRateWithWait-platformRate).toFixed(2));
  const costBreakdown=estimateTripOperatingCost({...parsed,distance_miles:rateInfo.distanceMiles},settings);

  const tripDate=normalizeTripDate(parsed.trip_date);
  const tripTime=normalizeTripTime(parsed.trip_time);
  if(!tripDate||!tripTime)return json(400,{error:'Invalid trip date or time in parsed broker intake'});

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
   submissionMethod:'EMAIL_ATTACHMENT',
   submittedBy:senderEmail,
   distanceMiles:rateInfo.distanceMiles
  });

  let booking=null;
  if(hasConfirmationSubject&&attachments.length>0){
   booking=await createBookingFromBrokerRequest(parsed,{
    brokerName,
    brokerRate:brokerRateWithWait,
    platformRate,
    tripCostEstimate:costBreakdown.tripCost,
    tripDate,
    tripTime
   });
   await query('UPDATE broker_requests SET booking_reference=$2,updated_at=now() WHERE id=$1',[request.id,booking.reference]).catch(()=>{});
   await notifyTeamsForBrokerReview({
    request:{...request,booking_reference:booking.reference},
    booking,
    parsed:{...parsed,distance_miles:rateInfo.distanceMiles},
    platformRate,
    brokerRate:brokerRateWithWait,
    variance,
    tripCostEstimate:costBreakdown.tripCost,
    costBreakdown
   }).catch((error)=>console.error('[BROKER_TEAMS]',error.message));
  }

  await query('INSERT INTO audit_log(entity_type,entity_id,action,details,created_by) VALUES($1,$2,$3,$4,$5)',[
   'BROKER_REQUEST',
   String(request.id),
   'EMAIL_RECEIVED',
   JSON.stringify({
    from:senderEmail,
    to:recipient,
    subject,
    hasConfirmationSubject,
    attachmentCount:attachments.length,
    bookingReference:booking?.reference||null,
    parsed:{...parsed,trip_date:tripDate,trip_time:tripTime,distance_miles:rateInfo.distanceMiles},
    brokerQuotedWithWait:brokerRateWithWait,
    platformRate,
    variance,
    estimatedTripCost:costBreakdown.tripCost
   }),
   senderEmail
  ]).catch(()=>{});

  const confirmationHtml=`<h2>Broker confirmation intake received</h2><p>We received your request for <strong>${parsed.pickup}</strong> to <strong>${parsed.destination}</strong> on <strong>${tripDate}</strong> at <strong>${tripTime.slice(0,5)}</strong>.</p><p>Status: <strong>PENDING DISPATCH CONFIRMATION</strong></p><p>Broker quoted (incl. 2h wait): <strong>$${brokerRateWithWait.toFixed(2)}</strong></p><p>Platform rate (incl. 2h wait): <strong>$${platformRate.toFixed(2)}</strong></p><p>Variance: <strong>$${variance.toFixed(2)}</strong></p><p>Dispatch will review and confirm final acceptance.</p>`;
  await sendEmail([senderEmail],`Nexus broker request received — ${brokerName}`,confirmationHtml).catch(()=>{});

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
   status:'PENDING_DISPATCH_CONFIRMATION',
   message:'Broker request processed and routed for dispatch/Admin_NMT review.'
  });
 }catch(error){
  console.error('[BROKER_EMAIL] Error:',error.message);
  return json(500,{error:'Internal server error',message:error.message});
 }
};
