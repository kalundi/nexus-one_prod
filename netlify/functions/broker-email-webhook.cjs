const {Client}=require('pg');const crypto=require('crypto');

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

function parseEmailBody(body){
 const lines=clean(body).split('\n');
 const result={pickup:null,destination:null,trip_date:null,trip_time:null,service:'MEDICAL_TRANSPORT',broker_quoted_rate:0,broker_name:'Unknown',notes:''};
 let foundRatePattern=false;
 for(let i=0;i<lines.length;i++){
  const line=clean(lines[i]).toLowerCase();
  if(line.includes('pickup')||line.includes('from')){
   result.pickup=clean(lines[i].split(':').pop()||lines[i+1]||'');
  }
  if(line.includes('destination')||line.includes('to')||line.includes('dropoff')){
   result.destination=clean(lines[i].split(':').pop()||lines[i+1]||'');
  }
  if(line.includes('date')){
   const dateStr=clean(lines[i].split(':').pop()||lines[i+1]||'');
   if(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(dateStr)){
    result.trip_date=dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/)?.[0];
    result.trip_date=new Date(result.trip_date).toISOString().split('T')[0];
   }
  }
  if(line.includes('time')){
   const timeStr=clean(lines[i].split(':').pop()||lines[i+1]||'');
   if(/\d{1,2}:\d{2}/.test(timeStr)){
    result.trip_time=timeStr.match(/(\d{1,2}):(\d{2})/)?.[0];
   }
  }
  if(/\$?\d+(?:\.\d{2})?/.test(line)&&(line.includes('rate')||line.includes('cost')||line.includes('price')||line.includes('quote'))){
   const rate=line.match(/\$?(\d+(?:\.\d{2})?)/)?.[1];
   if(rate){
    result.broker_quoted_rate=Number(rate);
    foundRatePattern=true;
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
  const insertResult=await query('INSERT INTO broker_requests(broker_id,broker_name,service,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,trip_date,trip_time,broker_quoted_rate,platform_calculated_rate,rate_delta,submission_method,submitted_by,request_status) VALUES($1,$2,$3,$4,$5,null,null,null,null,$6,$7,$8,0,0,$9,$10,$11) RETURNING *',[brokerId,brokerName,parsed.service,parsed.pickup,parsed.destination,parsed.trip_date,parsed.trip_time,parsed.broker_quoted_rate,'EMAIL',clean(senderEmail),'AUTO_CONFIRMED']);
  const req=insertResult.rows[0];
  await query('INSERT INTO audit_log(entity_type,entity_id,action,details,created_by) VALUES($1,$2,$3,$4,$5)',['BROKER_REQUEST',req.id,'EMAIL_RECEIVED',JSON.stringify({from:senderEmail,parsed}),senderEmail]);
  console.log('[BROKER_EMAIL] Received: broker_id=%d, route=%s→%s, date=%s, rate=$%d',brokerId,parsed.pickup.substring(0,20),parsed.destination.substring(0,20),parsed.trip_date,parsed.broker_quoted_rate);
  return json(201,{success:true,request_id:req.id,broker_id:brokerId,broker_name:brokerName,parsed_route:`${parsed.pickup} → ${parsed.destination}`,parsed_date:parsed.trip_date,parsed_time:parsed.trip_time,parsed_rate:`$${parsed.broker_quoted_rate}`,auto_confirmed:true});
 }catch(err){
  console.error('[BROKER_EMAIL] Error:',err.message);
  return json(500,{error:'Internal server error',message:err.message});
 }
};
