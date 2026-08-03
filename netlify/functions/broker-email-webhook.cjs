const {Client}=require('pg');const crypto=require('crypto');
const {buildEmailRecipients,buildSmsRecipients}=require('./_shared/notification-routing.cjs');

const pool=new Client({connectionString:process.env.DATABASE_URL});
let connected=false;

async function ensureConnection(){
 if(!connected){
  await pool.connect();
  connected=true;
 }
}

async function query(sql,params){
 await ensureConnection();
 return await pool.query(sql,params);
}

function json(code,body){
 return {statusCode:code,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
}

function clean(s){return String(s||'').trim().substring(0,500);}

async function sendEmail(to,subject,html){
 const recipients=Array.isArray(to)?to:buildEmailRecipients(to);
 if(!process.env.SENDGRID_API_KEY||!process.env.SENDGRID_FROM_EMAIL||recipients.length===0)return {status:'skipped'};
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({personalizations:[{to:recipients.map((email)=>({email}))}],from:{email:process.env.SENDGRID_FROM_EMAIL,name:'Nexus Medical Transit'},subject,content:[{type:'text/html',value:html}]})});
 if(!response.ok)throw new Error(`SendGrid request failed (${response.status})`);
 return {status:'sent'};
}

async function sendBrokerRequestConfirmation(br,toEmail,brokerName){
 const subject=`Nexus broker request received — ${br.broker_name || brokerName || 'Broker request'}`;
 const html=`<h2>Broker request received</h2><p>Your request for <strong>${br.pickup}</strong> to <strong>${br.destination}</strong> on <strong>${br.trip_date}</strong> at <strong>${br.trip_time}</strong> has been received.</p><p>Status: <strong>${br.request_status || 'PENDING_DISPATCH_CONFIRMATION'}</strong></p><p>Dispatch will finalize the booking once ready.</p>`;
 const result=await sendEmail(buildEmailRecipients(toEmail),subject,html);
 return {email:result};
}

function parseEmailBody(body){
 const text=clean(body);
 const lines=text.split(/\r?\n/).map((line)=>clean(line)).filter(Boolean);
 const result={pickup:null,destination:null,trip_date:null,trip_time:null,service:'MEDICAL_TRANSPORT',broker_quoted_rate:0,broker_name:'Unknown',notes:''};
 const datePatterns=[/(\d{4}-\d{2}-\d{2})/,/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/];
 const timePattern=/\b(\d{1,2}:\d{2})\b/;
 const ratePattern=/\$?(\d+(?:\.\d{2})?)/;
 const extractValue=(line)=>{
  const separator=line.indexOf(':');
  if(separator>=0){
   return clean(line.slice(separator+1));
  }
  return clean(line);
 };
 const pickupMatch=text.match(/(?:^|\r?\n)\s*(pickup|origin|from)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const destinationMatch=text.match(/(?:^|\r?\n)\s*(destination|dropoff|drop off|to)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
 const dateMatch=text.match(/(?:^|\r?\n)\s*(date)\s*[:|-]\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
 const timeMatch=text.match(/(?:^|\r?\n)\s*(time)\s*[:|-]\s*(\d{1,2}:\d{2})/i);
 const rateMatch=text.match(/(?:^|\r?\n)\s*(rate|cost|price|quote)\s*[:|-]?\s*\$?(\d+(?:\.\d{2})?)/i);
 if(pickupMatch){result.pickup=clean(pickupMatch[2]);}
 if(destinationMatch){result.destination=clean(destinationMatch[2]);}
 if(dateMatch){result.trip_date=clean(dateMatch[2]);}
 if(timeMatch){result.trip_time=clean(timeMatch[2]);}
 if(rateMatch){result.broker_quoted_rate=Number(rateMatch[2]);}
 for(const line of lines){
  const lower=line.toLowerCase();
  if(!result.pickup && /(pickup|origin|from)/.test(lower)){
   result.pickup=extractValue(line);
  }
  if(!result.destination && /(destination|dropoff|drop off|to)/.test(lower)){
   result.destination=extractValue(line);
  }
  if(!result.trip_date){
   const matchedDate=datePatterns.map((pattern)=>line.match(pattern)?.[1]).find(Boolean);
   if(matchedDate){
    result.trip_date=matchedDate;
   }
  }
  if(!result.trip_time){
   const timeMatchInLine=line.match(timePattern);
   if(timeMatchInLine){
    result.trip_time=timeMatchInLine[1];
   }
  }
  if(result.broker_quoted_rate<=0 && /(rate|cost|price|quote)/.test(lower)){
   const rateMatchInLine=line.match(ratePattern);
   if(rateMatchInLine){
    result.broker_quoted_rate=Number(rateMatchInLine[1]);
   }
  }
 }
 if(!result.pickup||!result.destination||!result.trip_date||!result.trip_time||result.broker_quoted_rate<=0){
  return null;
 }
 return result;
}

exports.handler=async(event)=>{
 try{
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  const body=typeof event.body==='string'?JSON.parse(event.body):event.body;
  const senderEmail=clean(body.from||body.sender||'unknown@broker.local');
  const senderName=clean(body.sender_name||senderEmail.split('@')[0]||'Unknown Broker');
  const emailBody=clean(body.text||body.html||body.body||'');
  if(!senderEmail||!emailBody)return json(400,{error:'Missing from or body'});
  const brokerInfo=await query('SELECT id,name FROM brokers WHERE contact_email=$1 LIMIT 1',[senderEmail]);
  const brokerId=brokerInfo.rows[0]?.id||null;
  const brokerName=brokerInfo.rows[0]?.name||senderName;
  const parsed=parseEmailBody(emailBody);
  if(!parsed)return json(400,{error:'Could not parse pickup, destination, date, time, or rate from email body'});
  const insertResult=await query('INSERT INTO broker_requests(broker_id,broker_name,service,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,trip_date,trip_time,broker_quoted_rate,platform_calculated_rate,rate_delta,submission_method,submitted_by,request_status) VALUES($1,$2,$3,$4,$5,null,null,null,null,$6,$7,$8,0,0,$9,$10,$11) RETURNING *',[brokerId,brokerName,parsed.service,parsed.pickup,parsed.destination,parsed.trip_date,parsed.trip_time,parsed.broker_quoted_rate,'EMAIL',clean(senderEmail),'PENDING_DISPATCH_CONFIRMATION']);
  const req=insertResult.rows[0];
  await query('INSERT INTO audit_log(entity_type,entity_id,action,details,created_by) VALUES($1,$2,$3,$4,$5)',['BROKER_REQUEST',req.id,'EMAIL_RECEIVED',JSON.stringify({from:senderEmail,parsed}),senderEmail]);
  const confirmationMessage='Your broker request has been received and is pending dispatch confirmation. It will be finalized once dispatch completes the booking.';
  if(clean(senderEmail) && senderEmail !== 'unknown@broker.local'){
   await sendBrokerRequestConfirmation(req,clean(senderEmail),brokerName).catch(()=>{});
  }
  const smsRecipients=buildSmsRecipients(null);
  if(smsRecipients.length){
   await Promise.allSettled(smsRecipients.map(phone=>fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:phone,From:process.env.TWILIO_PHONE_NUMBER,Body:`Broker request received: ${brokerName} - ${parsed.pickup} to ${parsed.destination}`})}).catch(()=>{})));
  }
  console.log('[BROKER_EMAIL] Received: broker_id=%d, route=%s→%s, date=%s, rate=$%d',brokerId,parsed.pickup.substring(0,20),parsed.destination.substring(0,20),parsed.trip_date,parsed.broker_quoted_rate);
  return json(201,{success:true,request_id:req.id,broker_id:brokerId,broker_name:brokerName,parsed_route:`${parsed.pickup} → ${parsed.destination}`,parsed_date:parsed.trip_date,parsed_time:parsed.trip_time,parsed_rate:`$${parsed.broker_quoted_rate}`,auto_confirmed:false,clientMessage:confirmationMessage,message:confirmationMessage});
 }catch(err){
  console.error('[BROKER_EMAIL] Error:',err.message);
  return json(500,{error:'Internal server error',message:err.message});
 }
};
