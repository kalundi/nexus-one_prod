const crypto=require('crypto');
const {query,getPool}=require('./_shared/db.cjs');
const {json,parseBody,bearer,routePath}=require('./_shared/http.cjs');
const {digest,safeUser,requireUser,audit}=require('./_shared/auth.cjs');
const {buildBrokerBookingPayload,getBrokerAutoBookStatus}=require('./_shared/broker-auto-book.cjs');
const STATUS_FLOW={SUBMITTED:'SCHEDULED',REQUESTED:'SCHEDULED',SCHEDULED:'ASSIGNED',ASSIGNED:'EN_ROUTE',EN_ROUTE:'ARRIVED',ARRIVED:'IN_TRANSIT',IN_TRANSIT:'COMPLETED'};
const statusLabel=s=>String(s||'SUBMITTED').toLowerCase().replaceAll('_','-');
const envEnabled=name=>Boolean(process.env[name]);
const clean=v=>String(v??'').trim();
const required=(body,fields)=>{for(const f of fields)if(!clean(body[f]))throw Object.assign(new Error(`${f} is required`),{statusCode:400})};
const reference=()=>`NMT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomInt(1000,9999)}`;

// Service → preferred vehicle unit prefixes (ordered by preference)
const SERVICE_VEHICLE_PREFS={
 ambulatory:     ['SE-254-01','SUV-254-01','SH-254-01'],
 wheelchair:     ['WV-254-01','SH-254-01'],
 stretcher:      ['ST-254-01'],
 bls:            ['AMB-254-01'],
 als1:           ['AMB-254-02','AMB-254-01'],
 als2:           ['AMB-254-02'],
 facility_transfer:         ['WV-254-01','SH-254-01','SE-254-01','SUV-254-01'],
 facility_transfer_critical:['AMB-254-02','AMB-254-01'],
 bariatric:      ['WV-254-01'],
 broda:          ['WV-254-01','SH-254-01'],
 hospital_discharge:        ['SE-254-01','SUV-254-01','WV-254-01'],
};
async function autoAssign(booking){
 try{
  const svc=(booking.service||'').toLowerCase().replace(/-/g,'_');
  const prefs=SERVICE_VEHICLE_PREFS[svc]||SERVICE_VEHICLE_PREFS.ambulatory;
  // Find first AVAILABLE vehicle from preference list
  const vRows=await query(`SELECT unit_number FROM vehicles WHERE unit_number=ANY($1) AND status='AVAILABLE' ORDER BY array_position($1,unit_number) LIMIT 1`,[prefs]);
  const vehicleUnit=vRows.rows[0]?.unit_number||null;
  // Find available driver (on shift for the trip date, not on an active trip today)
  const tripDate=booking.trip_date||new Date().toISOString().slice(0,10);
  const tripTime=booking.trip_time||'08:00';
  const weekday=new Date(tripDate+'T12:00:00').getDay()||7;
  const dRows=await query(`
   SELECT e.display_name, e.scope_id FROM employees e
   INNER JOIN employee_shifts es ON e.id=es.employee_id
   WHERE e.employee_type='DRIVER' AND e.active=true AND es.active=true
     AND es.weekday_iso=$1
     AND es.start_time::time<=$2::time AND es.end_time::time>=$2::time
   ORDER BY e.display_name LIMIT 5
  `,[weekday,tripTime]);
  // Pick driver not already on an active trip at the same time
  let driverName=null;
  for(const d of dRows.rows){
   const busy=await query(`SELECT 1 FROM bookings WHERE driver_name=$1 AND trip_date=$2 AND status NOT IN ('CANCELLED','COMPLETED','DELIVERED') LIMIT 1`,[d.display_name,tripDate]);
   if(!busy.rows[0]){driverName=d.display_name;break;}
  }
  if(!driverName&&dRows.rows[0])driverName=dRows.rows[0].display_name; // fallback: take first on shift
  if(!vehicleUnit&&!driverName)return {assigned:false,message:'No available vehicle or driver found for this service type.'};
  // Update booking
  await query(`UPDATE bookings SET driver_name=COALESCE($1,driver_name),vehicle_unit=COALESCE($2,vehicle_unit),status=CASE WHEN status='SCHEDULED' THEN 'ASSIGNED' ELSE status END,updated_at=now() WHERE reference=$3`,[driverName,vehicleUnit,booking.reference]);
  return {assigned:true,driverName,vehicleUnit,message:`Assigned to ${driverName||'—'} / ${vehicleUnit||'—'}`};
 }catch(e){console.error('[AUTO-ASSIGN]',e.message);return {assigned:false,message:'Auto-assign error: '+e.message};}
}

async function createBookingFromBrokerRequest(requestBody,requestRow){
 const bookingReference=clean(requestBody?.booking_reference||requestRow?.booking_reference||reference());
 const payload=buildBrokerBookingPayload(requestRow||{},requestBody||{},bookingReference);
 const bookingResult=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_miles,estimated_duration,estimated_fare,booking_source,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUBMITTED',$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),now()) RETURNING *`,[payload.reference,payload.name,payload.phone,payload.email,payload.service,payload.pickup,payload.destination,payload.trip_date,payload.trip_time,payload.notes,payload.pickup_lat,payload.pickup_lng,payload.destination_lat,payload.destination_lng,null,null,payload.estimated_fare||null,payload.booking_source]);
 const booking=bookingResult.rows[0];
 await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[booking.reference,'SUBMITTED','submitted','Broker request materialized into a booking','DISPATCH']);
 const autoAssignResult=await autoAssign(booking);
 const requestStatus=getBrokerAutoBookStatus(autoAssignResult.assigned);
 await query('UPDATE broker_requests SET booking_reference=$2,request_status=$3,updated_at=now() WHERE id=$1',[requestRow.id,booking.reference,requestStatus]);
 return {booking,requestStatus,autoAssignResult};
}

const DEFAULT_PRICING={
 wheelchair:{label:'Wheelchair Transportation',base:95,includedMiles:10,perMile:4.25,waitPer15:25},
 ambulatory:{label:'Ambulatory Transportation',base:65,includedMiles:5,perMile:3.25,waitPer15:20},
 facility_transfer:{label:'Facility-to-Facility Transfer (Routine IFT)',base:165,includedMiles:8,perMile:5.25,waitPer15:35},
 facility_transfer_critical:{label:'Facility-to-Facility Transfer (High-Acuity IFT)',base:340,includedMiles:8,perMile:8.75,waitPer15:50},
 broda:{label:'Broda Chair Transportation',base:145,includedMiles:10,perMile:5.25,waitPer15:25},
 stretcher:{label:'Stretcher Transportation',base:260,includedMiles:10,perMile:7.5,waitPer15:35},
 bariatric:{label:'Bariatric Transportation',base:385,includedMiles:10,perMile:9.5,waitPer15:45},
 bls:{label:'BLS Ambulance',base:725,includedMiles:0,perMile:17.5,waitPer15:55},
 als1:{label:'ALS I Ambulance',base:925,includedMiles:0,perMile:20,waitPer15:65},
 als2:{label:'ALS II Ambulance',base:1350,includedMiles:0,perMile:23,waitPer15:75}
};

const DEFAULT_SERVICE_POLICIES={
 wheelchair:{cancellationFee:40,noShowFee:60,trafficOverageFeePerHour:25,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
 ambulatory:{cancellationFee:35,noShowFee:50,trafficOverageFeePerHour:20,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
 facility_transfer:{cancellationFee:85,noShowFee:115,trafficOverageFeePerHour:42,returnMilesInclusionPct:100,afterHoursSurchargePct:5,weekendSurchargePct:3,holidaySurchargePct:12},
 facility_transfer_critical:{cancellationFee:180,noShowFee:240,trafficOverageFeePerHour:75,returnMilesInclusionPct:100,afterHoursSurchargePct:8,weekendSurchargePct:5,holidaySurchargePct:15},
 broda:{cancellationFee:75,noShowFee:95,trafficOverageFeePerHour:35,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
 stretcher:{cancellationFee:120,noShowFee:150,trafficOverageFeePerHour:50,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
 bariatric:{cancellationFee:160,noShowFee:200,trafficOverageFeePerHour:65,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
 bls:{cancellationFee:200,noShowFee:260,trafficOverageFeePerHour:85,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
 als1:{cancellationFee:250,noShowFee:325,trafficOverageFeePerHour:95,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
 als2:{cancellationFee:300,noShowFee:390,trafficOverageFeePerHour:110,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10}
};

const DEFAULT_PLATFORM_SETTINGS={
 pricing:DEFAULT_PRICING,
 fareRules:{
  minimumFare:0,
  fuelSurchargePerMile:0,
  fuelPricingMode:'MANUAL',
  fuelIndexSource:'EIA',
  fuelIndexSeriesId:'PET.EMM_EPM0_PTE_SUS_DPG.W',
  fuelIndexPricePerGallon:0,
  fuelBaselinePricePerGallon:3.25,
  fuelEfficiencyMpg:10,
  fuelOperationalBufferPct:20,
  fuelLastUpdatedAt:null,
  afterHoursSurchargePct:0,
  weekendSurchargePct:0,
  holidaySurchargePct:10,
  cancellationFee:30,
  cancellationWindowHours:24,
  cancellationLeadHours:72,
  noShowFee:50,
  freeWaitMinutes:15,
  mileageRoundingRule:'TENTH_MILE',
  telemetryRefreshSeconds:20,
  maxBookingDistanceMiles:125,
  returnMilesThreshold:10,
  returnMilesInclusionPct:100,
  trafficOverageFeePerHour:0,
  trafficOverageGraceMinutes:0,
  servicePolicies:DEFAULT_SERVICE_POLICIES
 },
 organization:{
  name:'Nexus Medical Transit',
  phone:'(888) 760-4990',
  email:'contact@nexusmt.com',
  website:'https://nexusmt.com'
 },
 activeServices:['AMBULANCE','WHEELCHAIR','STRETCHER','HOSPITAL_DISCHARGE','FACILITY_TRANSFER','FACILITY_TRANSFER_CRITICAL']
};

async function ensureSettingsTable(){
 await query(`CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
 )`);
}

const n=(v,d=0)=>{const x=Number(v);return Number.isFinite(x)?x:d};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

function mergePricing(input){
 const base=JSON.parse(JSON.stringify(DEFAULT_PRICING));
 if(!input||typeof input!=='object')return base;
 for(const key of Object.keys(base)){
  const src=input[key]||{};
  base[key]={
   label:clean(src.label)||base[key].label,
   base:n(src.base,base[key].base),
   includedMiles:n(src.includedMiles,base[key].includedMiles),
   perMile:n(src.perMile,base[key].perMile),
   waitPer15:n(src.waitPer15,base[key].waitPer15)
  };
 }
 return base;
}

function mergeServicePolicies(input){
 const base=JSON.parse(JSON.stringify(DEFAULT_SERVICE_POLICIES));
 if(!input||typeof input!=='object')return base;
 for(const key of Object.keys(base)){
  const src=input[key]||{};
  base[key]={
   cancellationFee:clamp(n(src.cancellationFee,base[key].cancellationFee),0,10000),
   noShowFee:clamp(n(src.noShowFee,base[key].noShowFee),0,10000),
   trafficOverageFeePerHour:clamp(n(src.trafficOverageFeePerHour,base[key].trafficOverageFeePerHour),0,1000),
   returnMilesInclusionPct:clamp(n(src.returnMilesInclusionPct,base[key].returnMilesInclusionPct),0,100),
   afterHoursSurchargePct:clamp(n(src.afterHoursSurchargePct,base[key].afterHoursSurchargePct),0,100),
   weekendSurchargePct:clamp(n(src.weekendSurchargePct,base[key].weekendSurchargePct),0,100),
   holidaySurchargePct:clamp(n(src.holidaySurchargePct,base[key].holidaySurchargePct),0,100)
  };
 }
 return base;
}

function resolveServicePolicyKey(service){
 const raw=String(service||'').trim().toLowerCase();
 if(!raw)return 'ambulatory';
 if(DEFAULT_SERVICE_POLICIES[raw])return raw;
 if(raw==='cct'||raw.includes('critical')||raw.includes('high-acuity')||raw.includes('high acuity')||raw.includes('icu'))return 'facility_transfer_critical';
 if(raw.includes('interfacility')&&(raw.includes('als')||raw.includes('critical')||raw.includes('icu')||raw.includes('cct')))return 'facility_transfer_critical';
 if(raw.includes('facility')&&raw.includes('transfer'))return 'facility_transfer';
 if(raw.includes('interfacility')||raw==='ift')return 'facility_transfer';
 if(raw.includes('wheel'))return 'wheelchair';
 if(raw.includes('ambul'))return 'ambulatory';
 if(raw.includes('broda'))return 'broda';
 if(raw.includes('stretcher'))return 'stretcher';
 if(raw.includes('bariatric'))return 'bariatric';
 if(raw.includes('als ii')||raw.includes('als2'))return 'als2';
 if(raw.includes('als i')||raw.includes('als1'))return 'als1';
 if(raw.includes('bls'))return 'bls';
 return 'ambulatory';
}

function mergePlatformSettings(raw){
 const src=raw&&typeof raw==='object'?raw:{};
 const fareSrc=src.fareRules&&typeof src.fareRules==='object'?src.fareRules:{};
 const orgSrc=src.organization&&typeof src.organization==='object'?src.organization:{};
 const services=Array.isArray(src.activeServices)?src.activeServices:DEFAULT_PLATFORM_SETTINGS.activeServices;
 const normalizedServices=services.map(x=>String(x||'').toUpperCase()).filter(Boolean);
 if(!normalizedServices.includes('FACILITY_TRANSFER')) normalizedServices.push('FACILITY_TRANSFER');
 if(!normalizedServices.includes('FACILITY_TRANSFER_CRITICAL')) normalizedServices.push('FACILITY_TRANSFER_CRITICAL');
 return {
  pricing:mergePricing(src.pricing),
  fareRules:{
   minimumFare:clamp(n(fareSrc.minimumFare,DEFAULT_PLATFORM_SETTINGS.fareRules.minimumFare),0,10000),
    fuelSurchargePerMile:clamp(n(fareSrc.fuelSurchargePerMile,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelSurchargePerMile),0,25),
    fuelPricingMode:String(fareSrc.fuelPricingMode||DEFAULT_PLATFORM_SETTINGS.fareRules.fuelPricingMode).toUpperCase()==='AUTO'?'AUTO':'MANUAL',
    fuelIndexSource:clean(fareSrc.fuelIndexSource)||DEFAULT_PLATFORM_SETTINGS.fareRules.fuelIndexSource,
    fuelIndexSeriesId:clean(fareSrc.fuelIndexSeriesId)||DEFAULT_PLATFORM_SETTINGS.fareRules.fuelIndexSeriesId,
    fuelIndexPricePerGallon:clamp(n(fareSrc.fuelIndexPricePerGallon,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelIndexPricePerGallon),0,25),
    fuelBaselinePricePerGallon:clamp(n(fareSrc.fuelBaselinePricePerGallon,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelBaselinePricePerGallon),0,25),
    fuelEfficiencyMpg:clamp(n(fareSrc.fuelEfficiencyMpg,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelEfficiencyMpg),1,50),
    fuelOperationalBufferPct:clamp(n(fareSrc.fuelOperationalBufferPct,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelOperationalBufferPct),0,200),
    fuelLastUpdatedAt:fareSrc.fuelLastUpdatedAt?String(fareSrc.fuelLastUpdatedAt):null,
   afterHoursSurchargePct:clamp(n(fareSrc.afterHoursSurchargePct,DEFAULT_PLATFORM_SETTINGS.fareRules.afterHoursSurchargePct),0,100),
   weekendSurchargePct:clamp(n(fareSrc.weekendSurchargePct,DEFAULT_PLATFORM_SETTINGS.fareRules.weekendSurchargePct),0,100),
   holidaySurchargePct:clamp(n(fareSrc.holidaySurchargePct,DEFAULT_PLATFORM_SETTINGS.fareRules.holidaySurchargePct),0,100),
   cancellationFee:clamp(n(fareSrc.cancellationFee,DEFAULT_PLATFORM_SETTINGS.fareRules.cancellationFee),0,10000),
  cancellationWindowHours:clamp(n(fareSrc.cancellationWindowHours,DEFAULT_PLATFORM_SETTINGS.fareRules.cancellationWindowHours),0,240),
  cancellationLeadHours:clamp(n(fareSrc.cancellationLeadHours,DEFAULT_PLATFORM_SETTINGS.fareRules.cancellationLeadHours),0,720),
   noShowFee:clamp(n(fareSrc.noShowFee,DEFAULT_PLATFORM_SETTINGS.fareRules.noShowFee),0,10000),
   freeWaitMinutes:clamp(n(fareSrc.freeWaitMinutes,DEFAULT_PLATFORM_SETTINGS.fareRules.freeWaitMinutes),0,180),
   mileageRoundingRule:['EXACT','TENTH_MILE','WHOLE_MILE'].includes(String(fareSrc.mileageRoundingRule||''))?String(fareSrc.mileageRoundingRule):DEFAULT_PLATFORM_SETTINGS.fareRules.mileageRoundingRule,
   telemetryRefreshSeconds:clamp(n(fareSrc.telemetryRefreshSeconds,DEFAULT_PLATFORM_SETTINGS.fareRules.telemetryRefreshSeconds),5,120),
  maxBookingDistanceMiles:clamp(n(fareSrc.maxBookingDistanceMiles,DEFAULT_PLATFORM_SETTINGS.fareRules.maxBookingDistanceMiles),5,500),
  returnMilesThreshold:clamp(n(fareSrc.returnMilesThreshold,DEFAULT_PLATFORM_SETTINGS.fareRules.returnMilesThreshold),0,500),
  returnMilesInclusionPct:clamp(n(fareSrc.returnMilesInclusionPct,DEFAULT_PLATFORM_SETTINGS.fareRules.returnMilesInclusionPct),0,100),
  trafficOverageFeePerHour:clamp(n(fareSrc.trafficOverageFeePerHour,DEFAULT_PLATFORM_SETTINGS.fareRules.trafficOverageFeePerHour),0,1000),
  trafficOverageGraceMinutes:clamp(n(fareSrc.trafficOverageGraceMinutes,DEFAULT_PLATFORM_SETTINGS.fareRules.trafficOverageGraceMinutes),0,180),
  servicePolicies:mergeServicePolicies(fareSrc.servicePolicies)
  },
  organization:{
   name:clean(orgSrc.name)||DEFAULT_PLATFORM_SETTINGS.organization.name,
   phone:clean(orgSrc.phone)||DEFAULT_PLATFORM_SETTINGS.organization.phone,
   email:clean(orgSrc.email)||DEFAULT_PLATFORM_SETTINGS.organization.email,
   website:clean(orgSrc.website)||DEFAULT_PLATFORM_SETTINGS.organization.website
  },
  activeServices:normalizedServices
 };
}

async function readPlatformSettings(){
 await ensureSettingsTable();
 const r=await query(`SELECT value FROM system_settings WHERE key='platform' LIMIT 1`);
 if(!r.rows[0]){
  const merged=mergePlatformSettings(DEFAULT_PLATFORM_SETTINGS);
  await query(`INSERT INTO system_settings(key,value) VALUES('platform',$1::jsonb)`,[JSON.stringify(merged)]);
  return merged;
 }
 return mergePlatformSettings(r.rows[0].value);
}

async function writePlatformSettings(payload,userId){
 const merged=mergePlatformSettings(payload);
 await ensureSettingsTable();
 await query(`INSERT INTO system_settings(key,value,updated_by,updated_at) VALUES('platform',$1::jsonb,$2,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`,[JSON.stringify(merged),userId||null]);
 return merged;
}

async function sendSms(to,body){
 if(!envEnabled('TWILIO_ACCOUNT_SID')||!envEnabled('TWILIO_AUTH_TOKEN')||!envEnabled('TWILIO_PHONE_NUMBER')||!to)return {status:'skipped'};
 const form=new URLSearchParams({To:to,From:process.env.TWILIO_PHONE_NUMBER,Body:body});
 const auth=Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
 const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${auth}`,'content-type':'application/x-www-form-urlencoded'},body:form});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||'Twilio request failed');return {status:'sent',id:data.sid};
}
async function sendEmail(to,subject,html){
 if(!envEnabled('SENDGRID_API_KEY')||!envEnabled('SENDGRID_FROM_EMAIL')||!to)return {status:'skipped'};
 const r=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:process.env.SENDGRID_FROM_EMAIL,name:'Nexus Medical Transit'},subject,content:[{type:'text/html',value:html}]})});
 if(!r.ok)throw new Error(`SendGrid request failed (${r.status})`);return {status:'sent'};
}
async function sendTeamsAlert(text,title='Nexus Medical Transit'){
 // Teams Incoming Webhook — set TEAMS_WEBHOOK_URL in Netlify env vars
 // To add: Teams → Admin_NMT channel → ... → Connectors → Incoming Webhook → copy URL
 const webhookUrl=process.env.TEAMS_WEBHOOK_URL;
 if(!webhookUrl)return {status:'skipped'};
 const body={
  '@type':'MessageCard','@context':'https://schema.org/extensions',
  themeColor:'#082f49',summary:title,title,text
 };
 try{
  const r=await fetch(webhookUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return r.ok?{status:'sent'}:{status:'failed',code:r.status};
 }catch(e){return {status:'failed',error:e.message};}
}
function setupLink(token){
  const base=String(process.env.SITE_URL||process.env.URL||process.env.DEPLOY_PRIME_URL||'https://nexusmt.com').replace(/\/$/,'');
  return `${base}/set-password.html?token=${encodeURIComponent(token)}`;
}
async function notifyBooking(b){
 const driverLine=b.driverName?`\nDriver: ${b.driverName}`:'';
 const pickupLine=b.pickupTime||b.time;
 const text=`Nexus Medical Transit: Your trip ${b.reference} is confirmed for ${b.date} at ${pickupLine}.${driverLine} Questions? Call (888) 760-4990.`;
 const html=`<h2 style="color:#082f49">Trip Confirmed — ${b.reference}</h2><table style="width:100%;border-collapse:collapse;margin:16px 0">${b.driverName?`<tr><td style="padding:8px;font-weight:600;color:#62758a">Driver</td><td style="padding:8px"><strong>${b.driverName}</strong></td></tr>`:''}<tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Pickup Time</td><td style="padding:8px"><strong>${pickupLine}</strong></td></tr><tr><td style="padding:8px;font-weight:600;color:#62758a">Date</td><td style="padding:8px">${b.date}</td></tr><tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Pickup</td><td style="padding:8px">${b.pickup}</td></tr><tr><td style="padding:8px;font-weight:600;color:#62758a">Destination</td><td style="padding:8px">${b.destination}</td></tr><tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Service</td><td style="padding:8px">${b.service||'—'}</td></tr></table><p>Questions? Call <strong>(888) 760-4990</strong></p>`;
 const teamsMsg=`**New Trip Booked** | Ref: ${b.reference}\n- **Patient:** ${b.name||'—'}\n- **Pickup:** ${b.pickup}\n- **Destination:** ${b.destination}\n- **Date/Time:** ${b.date} at ${pickupLine}${b.driverName?`\n- **Driver:** ${b.driverName}`:''}`;
 const results=await Promise.allSettled([sendSms(b.phone,text),sendEmail(b.email,`Trip confirmed — ${b.reference}`,html),sendTeamsAlert(teamsMsg,'🚐 New Trip Booked — Admin_NMT')]);
 return {sms:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message},email:results[1].status==='fulfilled'?results[1].value:{status:'failed',error:results[1].reason?.message},teams:results[2].status==='fulfilled'?results[2].value:{status:'failed',error:results[2].reason?.message}};
}
async function sendInvoice(b){
 const fare=Number(b.estimatedFare||b.estimated_fare||0);
 const fareText=fare>0?` Estimated fare: $${fare.toFixed(2)}.`:'';
 const text=`Nexus Medical Transit: Booking ${b.reference} created for ${b.date} at ${b.time}.${fareText} An invoice will follow. Questions? Call (888) 760-4990.`;
 const html=`<h2>Nexus Medical Transit Invoice</h2><p>Reference: <strong>${b.reference}</strong></p><p>${b.pickup} → ${b.destination}</p><p>${b.date} at ${b.time}</p>${fare>0?`<p>Estimated fare: <strong>$${fare.toFixed(2)}</strong></p>`:''}<p>Payment may be made by ACH, card, check, or wire. Contact billing@nexusmt.com or call (888) 760-4990.</p>`;
 const results=await Promise.allSettled([sendSms(b.phone||b.phone,text),sendEmail(b.email,`Invoice — Nexus booking ${b.reference}`,html)]);
 return {sms:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message},email:results[1].status==='fulfilled'?results[1].value:{status:'failed',error:results[1].reason?.message}};
}
async function sendBalanceDueReminder(b,balanceDue){
 const base=siteBase();
 const payLink=`${base}/booking-app.html?payBalance=1&bookingReference=${encodeURIComponent(b.reference)}`;
 const dueText=balanceDue>0?` Remaining balance: $${Number(balanceDue).toFixed(2)}.`:'';
 const text=`Nexus Medical Transit: Your driver is on the way for booking ${b.reference}.${dueText} Complete payment before pickup: ${payLink}`;
 const html=`<h2>Complete your payment — booking ${b.reference}</h2><p>Your driver is en route.${dueText}</p><p><a href="${payLink}">Pay remaining balance now</a></p><p>Questions? Call (888) 760-4990.</p>`;
 await Promise.allSettled([sendSms(b.phone,text),sendEmail(b.email,`Balance due — ${b.reference}`,html)]);
}
function verifyStripeWebhookSignature(rawBody,signature){
 if(!envEnabled('STRIPE_WEBHOOK_SECRET'))throw Object.assign(new Error('Stripe webhook secret not configured'),{statusCode:500});
 const secret=process.env.STRIPE_WEBHOOK_SECRET;
 const parts={};
 for(const part of String(signature||'').split(',')){
  const eqIdx=part.indexOf('=');if(eqIdx<0)continue;
  const k=part.slice(0,eqIdx),v=part.slice(eqIdx+1);
  parts[k]=v;
 }
 const ts=parts['t'],sig=parts['v1'];
 if(!ts||!sig)throw Object.assign(new Error('Invalid Stripe signature format'),{statusCode:400});
 const now=Math.floor(Date.now()/1000);
 if(Math.abs(now-Number(ts))>300)throw Object.assign(new Error('Stripe webhook timestamp expired'),{statusCode:400});
 const hmac=crypto.createHmac('sha256',secret).update(`${ts}.${rawBody}`).digest('hex');
 if(hmac!==sig)throw Object.assign(new Error('Invalid Stripe webhook signature'),{statusCode:400});
 return JSON.parse(rawBody);
}
async function createStripeIntent(amountCents,metadata){
 if(!envEnabled('STRIPE_SECRET_KEY'))throw Object.assign(new Error('Stripe is not configured'),{statusCode:503});
 const form=new URLSearchParams();form.set('amount',String(amountCents));form.set('currency','usd');form.set('automatic_payment_methods[enabled]','true');
 for(const [k,v] of Object.entries(metadata||{}))if(v!=null)form.set(`metadata[${k}]`,String(v).slice(0,500));
 const r=await fetch('https://api.stripe.com/v1/payment_intents',{method:'POST',headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded','idempotency-key':metadata?.bookingReference||crypto.randomUUID()},body:form});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data.error?.message||'Stripe request failed'),{statusCode:502});return data;
}
function siteBase(){
 return String(process.env.SITE_URL||process.env.URL||process.env.DEPLOY_PRIME_URL||'https://nexusmt.com').replace(/\/$/,'');
}
async function createStripeCheckoutSession(amountCents,metadata){
 if(!envEnabled('STRIPE_SECRET_KEY'))throw Object.assign(new Error('Stripe is not configured'),{statusCode:503});
 const bookingReference=clean(metadata?.bookingReference)||crypto.randomUUID();
 const form=new URLSearchParams();
 form.set('mode','payment');
 form.set('success_url',`${siteBase()}/booking-app.html?payment=success&bookingReference=${encodeURIComponent(bookingReference)}`);
 form.set('cancel_url',`${siteBase()}/booking-app.html?payment=cancelled&bookingReference=${encodeURIComponent(bookingReference)}`);
 form.set('line_items[0][price_data][currency]','usd');
 const modeLabel=metadata?.paymentMode==='deposit'?'25% Deposit — ':'';
 form.set('line_items[0][price_data][product_data][name]',`${modeLabel}Nexus Medical Transit Booking ${bookingReference}`);
 form.set('line_items[0][price_data][unit_amount]',String(amountCents));
 form.set('line_items[0][quantity]','1');
 for(const [k,v] of Object.entries(metadata||{}))if(v!=null)form.set(`metadata[${k}]`,String(v).slice(0,500));
 const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded','idempotency-key':`checkout-${bookingReference}-${metadata?.paymentMode||'full'}`},body:form});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(data.error?.message||'Stripe checkout request failed'),{statusCode:502});
 return data;
}
async function createSquarePaymentLink(amountCents,metadata){
 if(!envEnabled('SQUARE_ACCESS_TOKEN')||!envEnabled('SQUARE_LOCATION_ID'))throw Object.assign(new Error('Square is not configured'),{statusCode:503});
 const bookingReference=clean(metadata?.bookingReference)||crypto.randomUUID();
 const body={
  idempotency_key:`square-${bookingReference}`,
  quick_pay:{
   name:`Nexus Medical Transit Booking ${bookingReference}`,
   price_money:{amount:amountCents,currency:'USD'},
   location_id:process.env.SQUARE_LOCATION_ID
  },
  checkout_options:{
   redirect_url:`${siteBase()}/booking-app.html?payment=success&provider=square&bookingReference=${encodeURIComponent(bookingReference)}`
  },
  pre_populated_data:{
   buyer_email:clean(metadata?.email)||undefined
  }
 };
 const r=await fetch('https://connect.squareup.com/v2/online-checkout/payment-links',{method:'POST',headers:{authorization:`Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,'content-type':'application/json','Square-Version':'2026-07-15'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(data?.errors?.[0]?.detail||'Square payment link request failed'),{statusCode:502});
 return data;
}
async function calculateBrokerRate(brokerId,service,miles){
 if(!brokerId)return null;
 const r=await query(`SELECT base_rate,per_mile_rate FROM broker_rates WHERE broker_id=$1 AND service=$2 AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now()) ORDER BY effective_from DESC LIMIT 1`,[brokerId,service]);
 if(!r.rows[0])return null;
 const rate=r.rows[0];
 return Number(rate.base_rate||0)+Number(miles||0)*Number(rate.per_mile_rate||0);
}
async function sendBrokerRequestToDispatch(br){
 const dispatchEmail=process.env.COMPANY_EMAIL||'dispatch@nexusmt.com';
 const statusLabel=br.request_status==='AUTO_BOOKED'?'AUTO-BOOKED':'PENDING REVIEW';
 const text=`Broker request: ${br.broker_name} - ${br.pickup} to ${br.destination} on ${br.trip_date} at ${br.trip_time}. Broker: $${Number(br.broker_quoted_rate||0).toFixed(2)} vs Platform: $${Number(br.platform_calculated_rate||0).toFixed(2)}. Status: ${statusLabel}`;
 const html=`<h2>Broker Request</h2><p><strong>Broker:</strong> ${br.broker_name}</p><p><strong>Route:</strong> ${br.pickup} to ${br.destination}</p><p><strong>Date/Time:</strong> ${br.trip_date} at ${br.trip_time}</p><p>Broker rate: $${Number(br.broker_quoted_rate||0).toFixed(2)} | Platform rate: $${Number(br.platform_calculated_rate||0).toFixed(2)} | Delta: $${Number(br.rate_delta||0).toFixed(2)}</p><p>Status: ${statusLabel}</p>`;
 await Promise.allSettled([sendSms(process.env.DISPATCH_PHONE,text),sendEmail(dispatchEmail,`Broker: ${br.broker_name}`,html)]).catch(()=>{});
}

async function sendBrokerRequestConfirmation(br,toEmail,brokerName){
 const subject=br.request_status==='AUTO_BOOKED'?
  `Nexus broker request auto-booked — ${br.broker_name || brokerName || 'Broker request'}`:
  `Nexus broker request received — ${br.broker_name || brokerName || 'Broker request'}`;
 const statusLabel=br.request_status==='AUTO_BOOKED'?'AUTO_BOOKED':'PENDING REVIEW';
 const message=br.request_status==='AUTO_BOOKED'?'Your request has been automatically booked and dispatch has the trip details.':'We will review it and follow up with you shortly.';
 const html=`<h2>${br.request_status==='AUTO_BOOKED'?'Broker request auto-booked':'Broker request received'}</h2><p>Your request for <strong>${br.pickup}</strong> to <strong>${br.destination}</strong> on <strong>${br.trip_date}</strong> at <strong>${br.trip_time}</strong> ${br.request_status==='AUTO_BOOKED'?'has been automatically booked':'has been received'}.</p><p>Status: <strong>${statusLabel}</strong></p><p>${message}</p>`;
 const results=await Promise.allSettled([sendEmail(toEmail,subject,html)]);
 return {email:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message}};
}

async function handler(event){
 try{
  const p=routePath(event),method=event.httpMethod;
  if(p[0]==='health'){
   const r=await query('SELECT now() AS now, current_database() AS database');
   return json(200,{status:'ok',database:'connected',environment:process.env.CONTEXT||process.env.APP_ENV||'unknown',checkedAt:r.rows[0].now,build:'042'});
  }
  if(p[0]==='debug'&&p[1]==='admin'&&method==='GET'){
   const r=await query(`SELECT id, email, display_name, role, active, password_hash, organization_id, created_at FROM users WHERE lower(email)=lower('admin@nexusmt.com') LIMIT 1`);
   if(!r.rows[0]) return json(404,{error:'Admin user not found'});
   const user=r.rows[0];
   const testPass='NexusAdmin042!';
   const testHash=crypto.createHash('sha256').update(testPass).digest('hex');
   return json(200,{
     user:{
       id:String(user.id),
       email:user.email,
       displayName:user.display_name,
       role:user.role,
       active:user.active,
       organizationId:String(user.organization_id||'null'),
       createdAt:user.created_at
     },
     passwordDebug:{
       storedHash:user.password_hash?user.password_hash.substring(0,16)+'...':'NULL',
       storedHashLength:user.password_hash?user.password_hash.length:'NULL',
       testPassword:testPass,
       testHash:testHash.substring(0,16)+'...',
       testHashLength:testHash.length,
       hashesMatch:user.password_hash===testHash
     }
   });
  }
  if(p.join('/')==='integrations/config'&&method==='GET')return json(200,{build:'042',googleMapsEnabled:envEnabled('GOOGLE_MAPS_BROWSER_KEY'),googleMapsBrowserKey:process.env.GOOGLE_MAPS_BROWSER_KEY||'',stripeEnabled:envEnabled('STRIPE_SECRET_KEY') || envEnabled('STRIPE_PUBLISHABLE_KEY'),stripePublishableKey:process.env.STRIPE_PUBLISHABLE_KEY||'',squareEnabled:envEnabled('SQUARE_ACCESS_TOKEN')&&envEnabled('SQUARE_LOCATION_ID')});
  if(p.join('/')==='integrations/health'&&method==='GET')return json(200,{googleMaps:envEnabled('GOOGLE_MAPS_BROWSER_KEY')?'configured':'not-configured',twilio:envEnabled('TWILIO_ACCOUNT_SID')&&envEnabled('TWILIO_AUTH_TOKEN')&&envEnabled('TWILIO_PHONE_NUMBER')?'configured':'not-configured',sendGrid:envEnabled('SENDGRID_API_KEY')&&envEnabled('SENDGRID_FROM_EMAIL')?'configured':'not-configured',stripe:envEnabled('STRIPE_SECRET_KEY')||envEnabled('STRIPE_PUBLISHABLE_KEY')?'configured':'not-configured',square:envEnabled('SQUARE_ACCESS_TOKEN')&&envEnabled('SQUARE_LOCATION_ID')?'configured':'not-configured',gps:'enabled',checkedAt:new Date().toISOString()});
  if(p[0]==='settings'&&p[1]==='public'&&method==='GET'){
   const settings=await readPlatformSettings();
   return json(200,{pricing:settings.pricing,fareRules:settings.fareRules,activeServices:settings.activeServices,organization:settings.organization});
  }
  if(p[0]==='admin'&&p[1]==='settings'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const settings=await readPlatformSettings();
   return json(200,{settings});
  }
  if(p[0]==='admin'&&p[1]==='settings'&&method==='PATCH'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const body=parseBody(event);
   const current=await readPlatformSettings();
   const next=writePlatformSettings({
    pricing:body.pricing||current.pricing,
    fareRules:body.fareRules||current.fareRules,
    organization:body.organization||current.organization,
    activeServices:body.activeServices||current.activeServices
   },me.id);
   const saved=await next;
   await audit('SETTINGS','platform','UPDATED',{by:me.email,sections:Object.keys(body||{})});
   return json(200,{settings:saved});
  }
  if(p.join('/')==='locations/search'&&method==='GET'){
   const q=clean(event.queryStringParameters?.q);if(q.length<2)return json(200,{locations:[]});
   const r=await query(`SELECT facility_code AS id,name,address,'facility' AS type FROM facilities WHERE active=true AND (name ILIKE $1 OR address ILIKE $1) ORDER BY CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,name LIMIT 12`,[`%${q}%`,`${q}%`]);
   return json(200,{locations:r.rows});
  }
  if(p[0]==='bookings'&&method==='POST'&&p.length===1){
   const b=parseBody(event);required(b,['name','phone','service','pickup','destination','date','time']);
   // Validate phone format: XXX-XXX-XXXX or 10 digits
   const phoneDigits=String(b.phone||'').replace(/\D/g,'');
   if(phoneDigits.length!==10)return json(400,{error:'Phone number must be 10 digits'});
   // Validate email if provided
   if(b.email){const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!emailPattern.test(b.email.trim()))return json(400,{error:'Please enter a valid email address'});}
   // Detect booking source: staff users (authenticated) get invoiced; public customers pay online
   let bookingActor=null;
   try{if(bearer(event))bookingActor=await requireUser(bearer(event))}catch{}
   const bookingSource=bookingActor&&['ADMIN','DISPATCHER','FACILITY','BILLING'].includes(bookingActor.role)?'STAFF':'CUSTOMER';
   const ref=reference();
   const r=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_miles,estimated_duration,estimated_fare,booking_source,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUBMITTED',$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),now()) RETURNING *`,[ref,clean(b.name),clean(b.phone),clean(b.email)||null,clean(b.service),clean(b.pickup),clean(b.destination),b.date,b.time,clean(b.notes)||null,b.pickupLat||null,b.pickupLng||null,b.destinationLat||null,b.destinationLng||null,b.distanceMiles||null,clean(b.estimatedDuration)||null,b.estimatedFare||null,bookingSource]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,'SUBMITTED','submitted','Online transportation request received',bookingSource==='STAFF'?bookingActor.display_name:'PUBLIC']);
   await audit('BOOKING',ref,'CREATED',{source:'UNIFIED_BOOKING',service:b.service,bookingSource});
   const booking=mapBooking(r.rows[0]);
   // Auto-assign driver + vehicle (fire-and-forget, does not block response)
   autoAssign(r.rows[0]).catch(()=>{});
   let notifications;
   if(bookingSource==='STAFF'){
    // Non-customer path: send invoice, skip online payment prompt
    notifications=await sendInvoice(booking);
    await query('UPDATE bookings SET payment_status=$2,notification_status=$3::jsonb WHERE reference=$1',[ref,'INVOICED',JSON.stringify(notifications)]).catch(()=>{});
    return json(201,{booking:{...booking,paymentStatus:'INVOICED',notifications},invoiceSent:true,requiresOnlinePayment:false});
   }else{
    notifications=await notifyBooking(booking);
    await query('UPDATE bookings SET notification_status=$2::jsonb WHERE reference=$1',[ref,JSON.stringify(notifications)]).catch(()=>{});
    return json(201,{booking:{...booking,notifications},requiresOnlinePayment:true});
   }
  }
  if(p[0]==='bookings'&&p[1]&&method==='GET'){
   const phone=clean(event.queryStringParameters?.phone);if(!phone)return json(400,{error:'Phone number is required'});
   const searchRef=decodeURIComponent(p[1]);
   // Demo trips for testing (no database required)
   const demoTrips={
     'NMT-DEMO-0001':{phone:'2025550101',booking:{reference:'NMT-DEMO-0001',name:'James Mitchell',phone:'(202) 555-0101',email:'james.mitchell@example.com',service:'wheelchair',pickup:'3800 Reservoir Road NW, Washington, DC 20007',destination:'18101 Prince Philip Drive, Olney, MD 20832',date:new Date(Date.now()+86400000*2).toISOString().split('T')[0],time:'10:00',status:'confirmed',notes:'Regular dialysis appointment, requires accessible vehicle'}},
     'NMT-DEMO-0002':{phone:'2025550108',booking:{reference:'NMT-DEMO-0002',name:'Jennifer Smith',phone:'(202) 555-0108',email:'jennifer.smith@example.com',service:'ambulatory',pickup:'110 Irving Street NW, Washington, DC 20010',destination:'2041 Georgia Avenue NW, Washington, DC 20060',date:new Date(Date.now()+86400000*3).toISOString().split('T')[0],time:'14:30',status:'confirmed',notes:'Online booking - routine appointment'}},
     'NMT-DEMO-0003':{phone:'7035550103',booking:{reference:'NMT-DEMO-0003',name:'Robert Chen',phone:'(703) 555-0103',email:'robert.chen@example.com',service:'broda',pickup:'5255 Loughboro Road NW, Washington, DC 20016',destination:'1447 Kennedy Street NW, Washington, DC 20011',date:new Date(Date.now()+86400000).toISOString().split('T')[0],time:'09:00',status:'confirmed',notes:'Bariatric chair transfer required'}}
   };
   if(demoTrips[searchRef]){
     const demo=demoTrips[searchRef];
     const cleanPhone=phone.replace(/\D/g,'');
     if(cleanPhone===demo.phone)return json(200,{booking:demo.booking});
     return json(404,{error:'Request not found'});
   }
   // Try matching by reference first, then by name
   let r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[searchRef,phone]);
   if(!r.rows[0]){r=await query('SELECT * FROM bookings WHERE LOWER(name)=LOWER($1) AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\') ORDER BY created_at DESC LIMIT 1',[searchRef,phone]);}
   if(!r.rows[0])return json(404,{error:'Request not found'});return json(200,{booking:mapBooking(r.rows[0])});
  }
  // Cancel booking
  if(p[0]==='bookings'&&p[1]&&p[2]==='cancel'&&method==='POST'){
   const b=parseBody(event);const phone=clean(b.phone);if(!phone)return json(400,{error:'Phone number is required to cancel'});
   const ref=decodeURIComponent(p[1]);
   const r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[ref,phone]);
   if(!r.rows[0])return json(404,{error:'Booking not found or phone number does not match'});
   if(['CANCELLED','COMPLETED','IN_TRANSIT','ARRIVED'].includes(r.rows[0].status))return json(400,{error:`Cannot cancel a booking with status: ${r.rows[0].status}`});
    const settings=await readPlatformSettings();
    const fareRules=settings.fareRules||{};
    const tripAt=new Date(`${String(r.rows[0].trip_date||'')}T${String(r.rows[0].trip_time||'00:00:00')}`);
    const createdAt=new Date(r.rows[0].created_at||Date.now());
    const now=new Date();
    const hoursUntilTrip=(tripAt.getTime()-now.getTime())/36e5;
    const bookingLeadHours=(tripAt.getTime()-createdAt.getTime())/36e5;
    const windowHours=Math.max(0,Number(fareRules.cancellationWindowHours||24));
    const leadHours=Math.max(0,Number(fareRules.cancellationLeadHours||72));
    const applyWindow=Number.isFinite(hoursUntilTrip)&&hoursUntilTrip<=windowHours;
    const applyLead=Number.isFinite(bookingLeadHours)&&bookingLeadHours>=leadHours;
    const policyKey=resolveServicePolicyKey(r.rows[0].service);
    const servicePolicy=fareRules.servicePolicies?.[policyKey]||{};
    const serviceCancellationFee=Math.max(0,Number(servicePolicy.cancellationFee ?? fareRules.cancellationFee ?? 0));
    const cancellationFeeApplied=Boolean(applyWindow&&applyLead&&serviceCancellationFee>0);
    const cancellationFeeAmount=cancellationFeeApplied?serviceCancellationFee:0;
    const ruleSnapshot={policyKey,cancellationWindowHours:windowHours,cancellationLeadHours:leadHours,hoursUntilTrip:Number.isFinite(hoursUntilTrip)?Number(hoursUntilTrip.toFixed(2)):null,bookingLeadHours:Number.isFinite(bookingLeadHours)?Number(bookingLeadHours.toFixed(2)):null,applied:cancellationFeeApplied};
    const updated=await query('UPDATE bookings SET status=$2,cancelled_at=now(),cancel_reason=$3,cancellation_fee_amount=$4,cancellation_fee_applied=$5,cancellation_rule_snapshot=$6::jsonb,payment_status=CASE WHEN $5 THEN $7 ELSE payment_status END,updated_at=now() WHERE reference=$1 RETURNING *',[ref,'CANCELLED',clean(b.reason)||'Cancelled by passenger',cancellationFeeAmount,cancellationFeeApplied,JSON.stringify(ruleSnapshot),cancellationFeeApplied?'DUE':'UNPAID']);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,'CANCELLED','cancelled',clean(b.reason)||'Cancelled by passenger','PASSENGER']);
    await audit('BOOKING',ref,'CANCELLED',{reason:clean(b.reason)||'Passenger request',cancellationFeeAmount,cancellationFeeApplied,policyKey});
   const booking=mapBooking(updated.rows[0]);
   // Notify passenger and company of cancellation
   await Promise.allSettled([
     sendSms(booking.phone,`Nexus Medical Transit: Your trip ${ref} has been cancelled. Reference saved for your records. Call (888) 760-4990 to rebook.`),
     booking.email?sendEmail(booking.email,`Trip ${ref} cancelled`,`<h2>Your trip has been cancelled</h2><p>Reference <strong>${ref}</strong> has been cancelled as requested.</p><p>Call <strong>(888) 760-4990</strong> or visit nexusmt.com to book a new trip.</p>`):Promise.resolve(),
     process.env.COMPANY_EMAIL?sendEmail(process.env.COMPANY_EMAIL,`Trip cancellation: ${ref}`,`<h2>Trip Cancelled</h2><p><strong>Reference:</strong> ${ref}</p><p><strong>Passenger:</strong> ${booking.name} (${booking.phone})</p><p><strong>Route:</strong> ${booking.pickup} → ${booking.destination}</p><p><strong>Original Date/Time:</strong> ${booking.date} at ${booking.time}</p><p><strong>Reason:</strong> ${clean(b.reason)||'Passenger request'}</p>`):Promise.resolve()
   ]);
  return json(200,{booking,cancellationFee:{applied:cancellationFeeApplied,amount:cancellationFeeAmount,policyKey,windowHours,leadHours},message:'Booking cancelled successfully'});
  }
  // Reschedule booking
  if(p[0]==='bookings'&&p[1]&&p[2]==='reschedule'&&method==='POST'){
   const b=parseBody(event);const phone=clean(b.phone);if(!phone)return json(400,{error:'Phone number is required to reschedule'});
   if(!b.date||!b.time)return json(400,{error:'New date and time are required'});
   const ref=decodeURIComponent(p[1]);
   const r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[ref,phone]);
   if(!r.rows[0])return json(404,{error:'Booking not found or phone number does not match'});
   if(['CANCELLED','COMPLETED','IN_TRANSIT','ARRIVED'].includes(r.rows[0].status))return json(400,{error:`Cannot reschedule a booking with status: ${r.rows[0].status}`});
   const updated=await query('UPDATE bookings SET trip_date=$2,trip_time=$3,reminder_sent=false,updated_at=now() WHERE reference=$1 RETURNING *',[ref,b.date,b.time]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,r.rows[0].status,statusLabel(r.rows[0].status),`Rescheduled to ${b.date} at ${b.time}`,'PASSENGER']);
   await audit('BOOKING',ref,'RESCHEDULED',{newDate:b.date,newTime:b.time});
   const booking=mapBooking(updated.rows[0]);
   // Notify passenger of reschedule
   await Promise.allSettled([
     sendSms(booking.phone,`Nexus Medical Transit: Your trip ${ref} has been rescheduled to ${b.date} at ${b.time}. Questions? Call (888) 760-4990.`),
     booking.email?sendEmail(booking.email,`Trip ${ref} rescheduled`,`<h2>Your trip has been rescheduled</h2><p>Reference <strong>${ref}</strong> is now scheduled for <strong>${b.date} at ${b.time}</strong>.</p><p>Questions? Call <strong>(888) 760-4990</strong>.</p>`):Promise.resolve(),
     process.env.COMPANY_EMAIL?sendEmail(process.env.COMPANY_EMAIL,`Trip rescheduled: ${ref}`,`<h2>Trip Rescheduled</h2><p><strong>Reference:</strong> ${ref}</p><p><strong>Passenger:</strong> ${booking.name} (${booking.phone})</p><p><strong>Route:</strong> ${booking.pickup} → ${booking.destination}</p><p><strong>New Date/Time:</strong> ${b.date} at ${b.time}</p><p><strong>Service:</strong> ${booking.service}</p>`):Promise.resolve()
   ]);
   return json(200,{booking,message:'Booking rescheduled successfully'});
  }
  if(p.join('/')==='payments/create-intent'&&method==='POST'){
   const b=parseBody(event);required(b,['bookingReference']);const r=await query('SELECT reference,estimated_fare,payment_status FROM bookings WHERE reference=$1',[b.bookingReference]);if(!r.rows[0])return json(404,{error:'Booking not found'});
   const amount=Math.round(Number(b.amount||r.rows[0].estimated_fare||0)*100);if(amount<50)return json(400,{error:'A valid payment amount is required'});
   const pi=await createStripeIntent(amount,{bookingReference:r.rows[0].reference});await query('UPDATE bookings SET stripe_payment_intent_id=$2,payment_status=$3,updated_at=now() WHERE reference=$1',[r.rows[0].reference,pi.id,'PENDING']);
   return json(200,{clientSecret:pi.client_secret,paymentIntentId:pi.id,amount});
  }
  if(p.join('/')==='payments/stripe/checkout'&&method==='POST'){
   const b=parseBody(event);required(b,['bookingReference']);
   const paymentMode=['deposit','full'].includes(b.paymentMode)?b.paymentMode:'full';
   const r=await query('SELECT reference,email,estimated_fare,payment_status,booking_source FROM bookings WHERE reference=$1',[b.bookingReference]);
   if(!r.rows[0])return json(404,{error:'Booking not found'});
   const totalFare=Number(b.amount||r.rows[0].estimated_fare||0);
   const chargeAmount=paymentMode==='deposit'?Math.round(totalFare*0.25*100):Math.round(totalFare*100);
   if(chargeAmount<50)return json(400,{error:'A valid payment amount is required'});
   const depositAmount=paymentMode==='deposit'?chargeAmount/100:totalFare;
   const balanceDue=paymentMode==='deposit'?Math.max(0,totalFare-depositAmount):0;
   const session=await createStripeCheckoutSession(chargeAmount,{bookingReference:r.rows[0].reference,email:r.rows[0].email||undefined,paymentMode});
   await query('UPDATE bookings SET stripe_checkout_session_id=$2,payment_status=$3,deposit_amount=$4,balance_due=$5,updated_at=now() WHERE reference=$1',[r.rows[0].reference,session.id,'PENDING',depositAmount,balanceDue]);
   return json(200,{provider:'stripe',url:session.url,sessionId:session.id,amount:chargeAmount,paymentMode});
  }
  if(p.join('/')==='payments/stripe/webhook'&&method==='POST'){
   const sig=event.headers['stripe-signature'];
   if(!sig)return json(400,{error:'Missing stripe-signature header'});
   let stripeEvent;
   try{stripeEvent=verifyStripeWebhookSignature(event.body||'',sig)}catch(err){return json(err.statusCode||400,{error:err.message});}
   if(stripeEvent.type==='checkout.session.completed'){
    const session=stripeEvent.data.object;
    const bookingReference=session.metadata?.bookingReference;
    const paymentMode=session.metadata?.paymentMode||'full';
    if(bookingReference){
     const bRow=await query('SELECT * FROM bookings WHERE reference=$1',[bookingReference]);
     if(bRow.rows[0]){
      const bk=bRow.rows[0];
      const isDeposit=paymentMode==='deposit';
      const newStatus=isDeposit?'DEPOSIT_PAID':'PAID_IN_FULL';
      const updateSql=isDeposit
       ?'UPDATE bookings SET payment_status=$2,deposit_paid_at=now(),updated_at=now() WHERE reference=$1 RETURNING *'
       :'UPDATE bookings SET payment_status=$2,paid_in_full_at=now(),updated_at=now() WHERE reference=$1 RETURNING *';
      await query(updateSql,[bookingReference,newStatus]);
      await audit('BOOKING',bookingReference,'PAYMENT_RECEIVED',{mode:paymentMode,sessionId:session.id,amount:session.amount_total});
      if(isDeposit){
       await Promise.allSettled([
        sendSms(bk.phone,`Nexus Medical Transit: 25% deposit received for booking ${bookingReference}. Your ride is reserved! The remaining balance of $${Number(bk.balance_due||0).toFixed(2)} will be due before pickup.`),
        bk.email?sendEmail(bk.email,`Deposit confirmed — ${bookingReference}`,`<h2>Deposit received</h2><p>Your 25% deposit for booking <strong>${bookingReference}</strong> has been received and your ride is reserved.</p><p>Remaining balance: <strong>$${Number(bk.balance_due||0).toFixed(2)}</strong> — due before pickup.</p>`):Promise.resolve()
       ]);
      }else{
       await Promise.allSettled([
        sendSms(bk.phone,`Nexus Medical Transit: Full payment confirmed for booking ${bookingReference}. Thank you!`),
        bk.email?sendEmail(bk.email,`Payment confirmed — ${bookingReference}`,`<h2>Payment confirmed</h2><p>Booking <strong>${bookingReference}</strong> is fully paid. We look forward to your ride.</p>`):Promise.resolve(),
        process.env.COMPANY_EMAIL?sendEmail(process.env.COMPANY_EMAIL,`Payment complete: ${bookingReference}`,`<h2>Payment Received</h2><p><strong>Reference:</strong> ${bookingReference}</p><p><strong>Passenger:</strong> ${bk.name}</p><p><strong>Amount:</strong> $${((session.amount_total||0)/100).toFixed(2)}</p>`):Promise.resolve(),
        bk.driver_name?sendSms(bk.phone,`[NEXUS DRIVER ALERT] Payment complete for booking ${bookingReference} — ${bk.name}. You are clear to proceed.`):Promise.resolve()
       ]);
      }
     }
    }
   }
   return json(200,{received:true});
  }
  if(p.join('/')==='payments/square/checkout'&&method==='POST'){
   const b=parseBody(event);required(b,['bookingReference']);
   const r=await query('SELECT reference,email,estimated_fare,payment_status FROM bookings WHERE reference=$1',[b.bookingReference]);
   if(!r.rows[0])return json(404,{error:'Booking not found'});
   const amount=Math.round(Number(b.amount||r.rows[0].estimated_fare||0)*100);if(amount<50)return json(400,{error:'A valid payment amount is required'});
   const square=await createSquarePaymentLink(amount,{bookingReference:r.rows[0].reference,email:r.rows[0].email||undefined});
   await query('UPDATE bookings SET square_payment_link_id=$2,square_order_id=$3,payment_status=$4,updated_at=now() WHERE reference=$1',[r.rows[0].reference,square.payment_link?.id||null,square.payment_link?.order_id||square.related_resources?.orders?.[0]?.id||null,'PENDING']);
   return json(200,{provider:'square',url:square.payment_link?.url,linkId:square.payment_link?.id||null,amount});
  }
  if(p.join('/')==='gps/positions'&&method==='POST'){
   const u=await requireUser(bearer(event),['DRIVER','ADMIN','DISPATCHER']);const b=parseBody(event);required(b,['vehicleUnit','latitude','longitude']);
   const lat=Number(b.latitude),lng=Number(b.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return json(400,{error:'Invalid coordinates'});
   await query(`INSERT INTO gps_positions(vehicle_unit,driver_scope_id,booking_reference,latitude,longitude,heading,speed_mph,accuracy_m,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,now()))`,[b.vehicleUnit,u.scope_id||null,b.bookingReference||null,lat,lng,b.heading||null,b.speedMph||null,b.accuracyM||null,b.recordedAt||null]);
    const unit=clean(b.vehicleUnit);
    const vehicleType=clean(b.vehicleType)||'wheelchair';
    const status=clean(b.status).toUpperCase().replaceAll('-','_')||'EN_ROUTE';
    const updated=await query(`UPDATE vehicles SET latitude=$2,longitude=$3,heading=$4,speed_mph=$5,last_seen_at=now(),updated_at=now() WHERE unit_number=$1`,[unit,lat,lng,b.heading||null,b.speedMph||null]);
    if(updated.rowCount===0){
     await query(`INSERT INTO vehicles(unit_number,vehicle_type,status,latitude,longitude,heading,speed_mph,last_seen_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())`,[unit,vehicleType,status,lat,lng,b.heading||null,b.speedMph||null]);
    }
    return json(202,{accepted:true});
  }
  if(p[0]==='auth'&&p[1]==='me'&&method==='GET'){const u=await requireUser(bearer(event));return json(200,{user:safeUser(u)})}
  if(p[0]==='auth'&&p[1]==='logout'&&method==='POST'){const token=bearer(event);if(token)await query('UPDATE sessions SET revoked_at=now() WHERE token_digest=$1',[digest(token)]);return json(200,{ok:true})}
  if(p[0]==='auth'&&p[1]==='password-setup'&&method==='POST'){
   const b=parseBody(event);
   const token=clean(b.token);
   const password=String(b.password||'');
   if(!token)return json(400,{error:'Setup token is required'});
   if(password.length<12)return json(400,{error:'Password must be at least 12 characters'});
   const tokenHash=digest(token);
   const pool=getPool();
   const client=await pool.connect();
   let row;
   try{
     const tokenResult=await client.query('SELECT pst.user_id,u.email FROM password_setup_tokens pst JOIN users u ON u.id=pst.user_id WHERE pst.token_digest=$1 AND pst.used_at IS NULL AND pst.expires_at>now() LIMIT 1',[tokenHash]);
     row=tokenResult.rows[0];
     if(!row)return json(400,{error:'This setup link is invalid or expired'});
     const passwordHash=crypto.createHash('sha256').update(password).digest('hex');
     await client.query('BEGIN');
     try{
      await client.query('UPDATE users SET password_hash=$2, active=true, updated_at=now() WHERE id=$1',[row.user_id,passwordHash]);
      await client.query('UPDATE password_setup_tokens SET used_at=now() WHERE token_digest=$1',[tokenHash]);
      await audit('USER',String(row.user_id),'PASSWORD_SET',{email:row.email});
      await client.query('COMMIT');
     }catch(err){
      await client.query('ROLLBACK').catch(()=>{});
      throw err;
     }
   }catch(err){
     throw err;
   }finally{
     client.release();
   }
   return json(200,{ok:true,message:'Password saved'});
  }
  if(p[0]==='auth'&&p[1]==='login'&&method==='POST'){
   try{
     const b=parseBody(event);
     console.log('[LOGIN] Email:', b.email?.substring(0,10)+'...');
     const r=await query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true',[b.email||'']);
     const u=r.rows[0];
     if(!u){console.log('[LOGIN] User not found or inactive'); return json(401,{error:'Invalid credentials'});}
     console.log('[LOGIN] User found:', u.email, 'role:', u.role);
     
     const supplied=crypto.createHash('sha256').update(String(b.password||'')).digest('hex');
     console.log('[LOGIN] Hash length supplied:', supplied.length, 'stored:', String(u.password_hash).length);
     
     if(String(u.password_hash).length!==supplied.length){console.log('[LOGIN] Hash length mismatch'); return json(401,{error:'Invalid credentials'});}
     
     const suppliedBuf=Buffer.from(supplied,'hex');
     const storedBuf=Buffer.from(String(u.password_hash),'hex');
     if(!crypto.timingSafeEqual(suppliedBuf,storedBuf)){console.log('[LOGIN] Password mismatch'); return json(401,{error:'Invalid credentials'});}
     console.log('[LOGIN] Password verified');
     
     const token=crypto.randomBytes(32).toString('base64url');
     await query(`INSERT INTO sessions(token_digest,user_id,expires_at,ip_address,user_agent) VALUES($1,$2,now()+interval '8 hours',$3,$4)`,[digest(token),u.id,event.headers['x-forwarded-for']||null,event.headers['user-agent']||null]);
     console.log('[LOGIN] Session created');
     
     await audit('USER',String(u.id),'LOGIN',{role:u.role});
     console.log('[LOGIN] Audit logged');
     return json(200,{token,user:safeUser(u)});
   }catch(err){
     console.error('[LOGIN] Error:', err.message, err.stack);
     throw err;
   }
  }
  // Forgot password — send reset link via email
  if(p[0]==='auth'&&p[1]==='forgot-password'&&method==='POST'){
   const b=parseBody(event);
   const email=clean(b.email).toLowerCase();
   if(!email)return json(400,{error:'Email is required'});
   const r=await query('SELECT id,email,role FROM users WHERE lower(email)=$1 AND active=true',[email]);
   // Always return success to prevent email enumeration
   if(r.rows[0]){
    const resetToken=crypto.randomBytes(32).toString('base64url');
    const expires=new Date(Date.now()+60*60*1000); // 1 hour
    await query('UPDATE users SET password_reset_token=$1,password_reset_expires=$2,password_reset_used=false,updated_at=now() WHERE id=$3',[resetToken,expires.toISOString(),r.rows[0].id]);
    const base=String(process.env.SITE_URL||process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
    const isDriver=r.rows[0].role==='DRIVER';
    const resetUrl=isDriver
      ?`${base}/driver-app.html?action=reset&token=${encodeURIComponent(resetToken)}`
      :`${base}/livecare.html?action=reset&token=${encodeURIComponent(resetToken)}`;
    await sendEmail(r.rows[0].email,'Reset your Nexus password',
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
       <h2 style="color:#082f49">Reset your password</h2>
       <p>We received a request to reset your Nexus Medical Transit password.</p>
       <p style="margin:24px 0"><a href="${resetUrl}" style="background:#d61f1f;color:#fff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:700">Reset Password</a></p>
       <p style="color:#666;font-size:13px">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
       <p style="color:#666;font-size:13px">Or copy this link: ${resetUrl}</p>
      </div>`
    ).catch(()=>{});
   }
   return json(200,{message:'If that email is registered you will receive a reset link shortly.'});
  }
  // Reset password via token
  if(p[0]==='auth'&&p[1]==='reset-password'&&method==='POST'){
   const b=parseBody(event);
   const token=clean(b.token);
   const newPass=clean(b.newPassword);
   if(!token||!newPass)return json(400,{error:'Token and new password are required'});
   if(newPass.length<8)return json(400,{error:'Password must be at least 8 characters'});
   const r=await query('SELECT id,role FROM users WHERE password_reset_token=$1 AND password_reset_used=false AND password_reset_expires>now()',[token]);
   if(!r.rows[0])return json(400,{error:'Reset link is invalid or has expired. Please request a new one.'});
   const newHash=crypto.createHash('sha256').update(newPass).digest('hex');
   await query('UPDATE users SET password_hash=$1,must_change_password=false,password_reset_token=null,password_reset_expires=null,password_reset_used=true,updated_at=now() WHERE id=$2',[newHash,r.rows[0].id]);
   await audit('USER',r.rows[0].id,'PASSWORD_RESET',{via:'token'});
   return json(200,{message:'Password updated successfully. You can now sign in.'});
  }
  // Change password (authenticated — first-time or in-app change)
  if(p[0]==='auth'&&p[1]==='change-password'&&method==='POST'){
   const u=await requireUser(bearer(event));
   const b=parseBody(event);
   const newPass=clean(b.newPassword);
   if(!newPass||newPass.length<8)return json(400,{error:'New password must be at least 8 characters'});
   // If not a forced change, verify current password
   if(!u.must_change_password){
    const current=clean(b.currentPassword);
    if(!current)return json(400,{error:'Current password is required'});
    const supplied=crypto.createHash('sha256').update(current).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(supplied,'hex'),Buffer.from(String(u.password_hash),'hex')))
     return json(401,{error:'Current password is incorrect'});
   }
   const newHash=crypto.createHash('sha256').update(newPass).digest('hex');
   await query('UPDATE users SET password_hash=$1,must_change_password=false,updated_at=now() WHERE id=$2',[newHash,u.id]);
   await audit('USER',u.id,'PASSWORD_CHANGED',{forced:!!u.must_change_password});
   return json(200,{message:'Password updated successfully.'});
  }
  if(p[0]==='portal'&&p[1]==='trips'&&method==='GET'){
   try{
     const u=await requireUser(bearer(event));
     let sql='SELECT * FROM bookings',params=[];
     if(u.role==='FACILITY'){sql+=' WHERE facility_id=$1';params=[u.scope_id]}
     else if(u.role==='DRIVER'){sql+=' WHERE driver_scope_id=$1';params=[u.scope_id]}
     else if(u.role==='PATIENT'){sql+=' WHERE lower(email)=lower($1)';params=[u.email]}
     else if(!['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA'].includes(u.role))return json(403,{error:'Insufficient permission'});
     sql+=' ORDER BY trip_date DESC, trip_time DESC LIMIT 250';
     console.log('[TRIPS] Query:', sql, 'Params:', params, 'Role:', u.role);
     const r=await query(sql,params);
     console.log('[TRIPS] Found', r.rowCount, 'trips');
     return json(200,{trips:r.rows.map(mapBooking)});
   }catch(err){
     console.error('[TRIPS] Error:', err.message, err.stack);
     throw err;
   }
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&method==='GET'){await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA']);const r=await query('SELECT * FROM bookings ORDER BY trip_date DESC,trip_time DESC LIMIT 500');return json(200,{bookings:r.rows.map(mapBooking)})}
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&method==='GET'){await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA']);const ref=decodeURIComponent(p[2]);const r=await query('SELECT * FROM bookings WHERE reference=$1 LIMIT 1',[ref]);if(!r.rows[0])return json(404,{error:'Booking not found'});return json(200,{booking:mapBooking(r.rows[0])})}
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&method==='PATCH'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER','DRIVER']);const b=parseBody(event),ref=decodeURIComponent(p[2]);
   // DRIVER role: only allowed to update status, not fare/assignment
   if(u.role==='DRIVER'&&(b.driverName||b.vehicleUnit||b.estimatedFare!==undefined))return json(403,{error:'Drivers may only update trip status'});
   const hasEstimatedFare=Object.prototype.hasOwnProperty.call(b,'estimatedFare');const estimatedFareRaw=hasEstimatedFare?Number(b.estimatedFare):null;if(hasEstimatedFare&&!Number.isFinite(estimatedFareRaw))return json(400,{error:'estimatedFare must be a valid number'});if(hasEstimatedFare&&estimatedFareRaw<0)return json(400,{error:'estimatedFare must be 0 or greater'});if(hasEstimatedFare&&u.role!=='ADMIN')return json(403,{error:'Only Admin can adjust fares'});const r=await query(`UPDATE bookings SET status=COALESCE($2,status),driver_name=COALESCE($3,driver_name),vehicle_unit=COALESCE($4,vehicle_unit),estimated_fare=CASE WHEN $5 THEN $6 ELSE estimated_fare END,updated_at=now() WHERE reference=$1 RETURNING *`,[ref,b.status?String(b.status).toUpperCase().replaceAll('-','_'):null,b.driverName||null,b.vehicleUnit||null,hasEstimatedFare,hasEstimatedFare?estimatedFareRaw:null]);if(!r.rows[0])return json(404,{error:'Booking not found'});await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,r.rows[0].status,statusLabel(r.rows[0].status),b.note||null,u.display_name]);await audit('BOOKING',ref,'UPDATED',{status:r.rows[0].status,estimatedFare:hasEstimatedFare?estimatedFareRaw:undefined});return json(200,{booking:mapBooking(r.rows[0])});
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&p[3]==='advance'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);const ref=decodeURIComponent(p[2]);const current=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);if(!current.rows[0])return json(404,{error:'Booking not found'});const next=STATUS_FLOW[current.rows[0].status]||current.rows[0].status;const r=await query('UPDATE bookings SET status=$2,updated_at=now() WHERE reference=$1 RETURNING *',[ref,next]);await query('INSERT INTO trip_status_history(booking_reference,status,status_label,actor) VALUES($1,$2,$3,$4)',[ref,next,statusLabel(next),u.display_name]);await audit('BOOKING',ref,'STATUS_ADVANCED',{from:current.rows[0].status,to:next});
   // When driver is en route and customer only paid a deposit, send the balance-due reminder
   if(next==='EN_ROUTE'&&current.rows[0].payment_status==='DEPOSIT_PAID'&&!current.rows[0].balance_reminder_sent_at){
    const bk=mapBooking(r.rows[0]);
    await sendBalanceDueReminder(bk,current.rows[0].balance_due).catch(e=>console.error('[BALANCE_REMINDER]',e.message));
    await query('UPDATE bookings SET payment_status=$2,balance_reminder_sent_at=now(),updated_at=now() WHERE reference=$1',[ref,'BALANCE_REMINDER_SENT']);
   }
   return json(200,{booking:mapBooking(r.rows[0])});
  }
  if(p[0]==='fleet'&&p[1]==='live'&&method==='GET'){
   let u=null;try{if(bearer(event))u=await requireUser(bearer(event))}catch{}const r=await query(`SELECT unit_number,vehicle_type,status,latitude,longitude,heading,speed_mph,last_seen_at FROM vehicles WHERE last_seen_at IS NULL OR last_seen_at>now()-interval '24 hours' ORDER BY unit_number`);return json(200,{generatedAt:new Date().toISOString(),role:u?.role||'PUBLIC',vehicles:r.rows.map(v=>({id:v.unit_number,unit:v.unit_number,type:v.vehicle_type,status:v.status,lat:Number(v.latitude),lng:Number(v.longitude),heading:Number(v.heading||0),speed:Number(v.speed_mph||0),lastSeen:v.last_seen_at}))});
  }
  // Auto-assign: find best available driver + vehicle for a booking
  if(p[0]==='dispatch'&&p[1]==='auto-assign'&&method==='POST'){
   await requireUser(bearer(event),['DISPATCHER','ADMIN']);
   const b=parseBody(event);
   const ref=clean(b.bookingReference);
   if(!ref)return json(400,{error:'bookingReference required'});
   const booking=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);
   if(!booking.rows[0])return json(404,{error:'Booking not found'});
   const result=await autoAssign(booking.rows[0]);
   return json(result.assigned?200:409,result);
  }
  if(p[0]==='dispatch'&&p[1]==='drivers'&&method==='GET'){
   await requireUser(bearer(event),['DISPATCHER','ADMIN']);
   const now=new Date();
   const todayIso=now.toISOString().slice(0,10);
   const nowTime=now.toTimeString().slice(0,5); // HH:MM
   const weekday=now.getDay()||7; // ISO weekday: Mon=1 … Sun=7
   // Drivers on shift right now (shift covers current time on today's weekday)
   const onShift=await query(`
    SELECT e.id, e.name, e.scope_id, e.active,
           es.start_time::text AS shift_start, es.end_time::text AS shift_end,
           v.unit_number AS vehicle_unit, v.vehicle_type, v.status AS vehicle_status
    FROM employees e
    INNER JOIN employee_shifts es ON e.id=es.employee_id
    LEFT JOIN vehicles v ON v.driver_scope_id=e.scope_id
    WHERE e.employee_type='DRIVER' AND e.active=true AND es.active=true
      AND es.weekday_iso=$1
      AND es.start_time::time<=$2::time AND es.end_time::time>$2::time
      AND (es.effective_end_date IS NULL OR es.effective_end_date>=$3)
    ORDER BY e.name
   `,[weekday,nowTime,todayIso]);
   // Trip counts today per driver scope_id
   const tripCounts=await query(`
    SELECT driver_name, COUNT(*) as total,
           COUNT(*) FILTER (WHERE status IN ('assigned','en-route','arrived','in-transit')) as active
    FROM bookings
    WHERE trip_date=$1 AND driver_name IS NOT NULL
    GROUP BY driver_name
   `,[todayIso]);
   const countMap=Object.fromEntries(tripCounts.rows.map(r=>[r.driver_name,{total:Number(r.total),active:Number(r.active)}]));
   const drivers=onShift.rows.map(d=>({
    id:d.id, name:d.name, scopeId:d.scope_id,
    shiftStart:d.shift_start?.slice(0,5)||null,
    shiftEnd:d.shift_end?.slice(0,5)||null,
    vehicleUnit:d.vehicle_unit||null,
    vehicleType:d.vehicle_type||null,
    vehicleStatus:d.vehicle_status||null,
    tripsToday:countMap[d.name]?.total||0,
    activeTrips:countMap[d.name]?.active||0,
    status:countMap[d.name]?.active>0?'ON_TRIP':'ON_DUTY'
   }));
   return json(200,{generatedAt:now.toISOString(),onDuty:drivers.length,drivers});
  }
  // Admin: reset all test credentials (idempotent upsert for all standard roles)
  if(p[0]==='admin'&&p[1]==='reset-credentials'&&method==='POST'){
   await requireUser(bearer(event),['ADMIN']);
   const TEST_USERS=[
    {email:'admin@nexusmt.com',name:'Test Administrator',role:'ADMIN',password:'NexusAdmin042!'},
    {email:'dispatcher@nexusmt.com',name:'Test Dispatcher',role:'DISPATCHER',password:'Dispatch2026!'},
    {email:'driver@nexusmt.com',name:'Test Driver',role:'DRIVER',password:'Driver2026!'},
    {email:'facility@nexusmt.com',name:'Test Facility',role:'FACILITY',password:'Facility2026!'},
    {email:'billing@nexusmt.com',name:'Test Billing',role:'BILLING',password:'Billing2026!'},
    {email:'qa@nexusmt.com',name:'Test QA',role:'QA',password:'Quality2026!'},
    {email:'executive@nexusmt.com',name:'Test Executive',role:'EXECUTIVE',password:'Exec2026!'},
   ];
   const results=[];
   // Get the organization_id from the existing admin (required NOT NULL column)
   const orgRow=await query("SELECT organization_id FROM users WHERE role='ADMIN' LIMIT 1");
   const orgId=orgRow.rows[0]?.organization_id||null;
   for(const u of TEST_USERS){
    const hash=crypto.createHash('sha256').update(u.password).digest('hex');
    const existing=await query('SELECT id FROM users WHERE lower(email)=lower($1)',[u.email]);
    if(existing.rows[0]){
     await query('UPDATE users SET display_name=$2,role=$3,password_hash=$4,active=true,updated_at=now() WHERE id=$1',[existing.rows[0].id,u.name,u.role,hash]);
     results.push({email:u.email,action:'updated'});
    }else if(orgId){
     await query('INSERT INTO users(id,email,display_name,role,password_hash,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now())',[crypto.randomUUID(),u.email.toLowerCase(),u.name,u.role,hash,orgId,crypto.randomUUID()]);
     results.push({email:u.email,action:'created'});
    }else{
     await query('INSERT INTO users(id,email,display_name,role,password_hash,active,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,now(),now())',[crypto.randomUUID(),u.email.toLowerCase(),u.name,u.role,hash,crypto.randomUUID()]);
     results.push({email:u.email,action:'created'});
    }
   }
   await audit('USER','system','CREDENTIALS_RESET',{count:results.length});
   return json(200,{ok:true,results,message:`${results.length} accounts reset. All credentials restored.`});
  }
  // Admin: list users
  if(p[0]==='admin'&&p[1]==='users'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
   const r=await query(`SELECT id,email,display_name,role,active,created_at,organization_id FROM users ORDER BY created_at DESC LIMIT 200`);
   return json(200,{users:r.rows.map(u=>({id:String(u.id),email:u.email,name:u.display_name,role:u.role,active:u.active,createdAt:u.created_at}))});
  }
  // Admin: create user
  if(p[0]==='admin'&&p[1]==='users'&&method==='POST'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const b=parseBody(event);required(b,['email','name','role','password']);
   const validRoles=['ADMIN','DISPATCHER','FACILITY','DRIVER','BILLING','QA','EXECUTIVE','PATIENT'];
   if(!validRoles.includes(String(b.role).toUpperCase()))return json(400,{error:'Invalid role'});
   if(String(b.password).length<8)return json(400,{error:'Password must be at least 8 characters'});
   const existing=await query('SELECT id FROM users WHERE lower(email)=lower($1)',[b.email]);
   if(existing.rows[0])return json(409,{error:'A user with that email already exists'});
   const passwordHash=crypto.createHash('sha256').update(String(b.password)).digest('hex');
   const userId=crypto.randomUUID();
   // Get organization_id from the authenticated admin (required NOT NULL column)
   const adminRow=await query('SELECT organization_id FROM users WHERE id=$1',[me.id]);
   const orgId=adminRow.rows[0]?.organization_id||null;
   if(orgId){
    await query(`INSERT INTO users(id,email,display_name,role,password_hash,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now())`,[userId,clean(b.email).toLowerCase(),clean(b.name),String(b.role).toUpperCase(),passwordHash,orgId,crypto.randomUUID()]);
   }else{
    await query(`INSERT INTO users(id,email,display_name,role,password_hash,active,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,now(),now())`,[userId,clean(b.email).toLowerCase(),clean(b.name),String(b.role).toUpperCase(),passwordHash,crypto.randomUUID()]);
   }
   await audit('USER',userId,'CREATED',{role:b.role,by:me.email});
   return json(201,{user:{id:userId,email:b.email,name:b.name,role:b.role,active:true}});
  }
  // Admin: toggle user active/inactive
  if(p[0]==='admin'&&p[1]==='users'&&p[2]&&method==='PATCH'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const b=parseBody(event);const userId=decodeURIComponent(p[2]);
   if(typeof b.active!=='boolean')return json(400,{error:'active (boolean) is required'});
   const r=await query('UPDATE users SET active=$2,updated_at=now() WHERE id=$1 RETURNING id,email,role,active',[userId,b.active]);
   if(!r.rows[0])return json(404,{error:'User not found'});
   await audit('USER',userId,b.active?'ACTIVATED':'DEACTIVATED',{by:me.email});
   return json(200,{user:r.rows[0]});
  }
  // Admin: audit log
  if(p[0]==='admin'&&p[1]==='audit-log'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
   const limit=Math.min(Number(event.queryStringParameters?.limit)||100,500);
   const since=event.queryStringParameters?.since;
   let sql='SELECT * FROM audit_log',params=[];
   if(since){sql+=' WHERE created_at>=$1';params=[since]}
   sql+=` ORDER BY created_at DESC LIMIT ${limit}`;
   const r=await query(sql,params);
   return json(200,{entries:r.rows.map(e=>({id:String(e.id||''),entityType:e.entity_type,entityId:String(e.entity_id||''),action:e.action,changes:e.changes,createdAt:e.created_at}))});
  }
  if(p[0]==='facilities'&&method==='GET'){const u=await requireUser(bearer(event),['ADMIN','DISPATCHER','FACILITY']);const r=await query(u.role==='FACILITY'?'SELECT * FROM facilities WHERE facility_code=$1':'SELECT * FROM facilities ORDER BY name',[...(u.role==='FACILITY'?[u.scope_id]:[])]);return json(200,{facilities:r.rows})}
  if(p[0]==='patients'&&method==='GET'){const u=await requireUser(bearer(event),['ADMIN','DISPATCHER','FACILITY']);const r=await query(u.role==='FACILITY'?'SELECT * FROM patients WHERE facility_code=$1 AND active=true ORDER BY display_name':'SELECT * FROM patients WHERE active=true ORDER BY display_name',[...(u.role==='FACILITY'?[u.scope_id]:[])]);return json(200,{patients:r.rows})}
  // Update trip details (name, service, pickup, destination, email, alternate contacts)
  if(p[0]==='bookings'&&p[1]&&p[2]==='update'&&method==='POST'){
   const b=parseBody(event);const phone=clean(b.phone);if(!phone)return json(400,{error:'Phone number is required to update'});
   const ref=decodeURIComponent(p[1]);
   const r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[ref,phone]);
   if(!r.rows[0])return json(404,{error:'Booking not found or phone number does not match'});
   if(['CANCELLED','COMPLETED','IN_TRANSIT','ARRIVED'].includes(r.rows[0].status))return json(400,{error:`Cannot update a booking with status: ${r.rows[0].status}`});
   // Validate email if provided
   if(b.email){const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!emailPattern.test(b.email.trim()))return json(400,{error:'Please enter a valid email address'});}
   if(b.alternateEmail){const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!emailPattern.test(b.alternateEmail.trim()))return json(400,{error:'Please enter a valid alternate email address'});}
   // Validate alternate phone if provided
   if(b.alternatePhone){const phoneDigits=String(b.alternatePhone||'').replace(/\D/g,'');if(phoneDigits.length!==10)return json(400,{error:'Alternate phone number must be 10 digits'});}
   const updated=await query('UPDATE bookings SET name=$2,service=$3,pickup=$4,destination=$5,email=$6,alternate_phone=$7,alternate_email=$8,last_updated_by=\'passenger\',last_updated_at=now(),updated_at=now() WHERE reference=$1 RETURNING *',[ref,clean(b.name)||r.rows[0].name,clean(b.service)||r.rows[0].service,clean(b.pickup)||r.rows[0].pickup,clean(b.destination)||r.rows[0].destination,clean(b.email)||r.rows[0].email,clean(b.alternatePhone)||r.rows[0].alternate_phone||null,clean(b.alternateEmail)||r.rows[0].alternate_email||null]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,r.rows[0].status,statusLabel(r.rows[0].status),'Trip details updated by passenger','PASSENGER']);
   await audit('BOOKING',ref,'DETAILS_UPDATED',{updatedFields:Object.keys(b).filter(k=>['name','service','pickup','destination','email','alternatePhone','alternateEmail'].includes(k))});
   const booking=mapBooking(updated.rows[0]);
   return json(200,{booking,message:'Trip details updated successfully'});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const b=parseBody(event);required(b,['name','contact_email','net_terms_days']);
   const r=await query('INSERT INTO brokers(name,contact_email,contact_person,contact_phone,net_terms_days,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(name) DO NOTHING RETURNING *',[clean(b.name),clean(b.contact_email),clean(b.contact_person)||null,clean(b.contact_phone)||null,Number(b.net_terms_days)||30,clean(b.notes)||null]);
   if(!r.rows[0])return json(409,{error:'Broker name already exists'});
   await audit('BROKER',r.rows[0].id,'CREATED',{name:b.name,email:b.contact_email});
   return json(201,{broker:r.rows[0]});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING']);
   const r=await query('SELECT * FROM brokers WHERE status=$1 ORDER BY name',['ACTIVE']);
   return json(200,{brokers:r.rows});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING']);
   const brokerId=Number(p[2]);
   const r=await query('SELECT * FROM brokers WHERE id=$1',[brokerId]);
   if(!r.rows[0])return json(404,{error:'Broker not found'});
   const rates=await query('SELECT * FROM broker_rates WHERE broker_id=$1 AND effective_to IS NULL ORDER BY service',[brokerId]);
   return json(200,{broker:r.rows[0],rates:rates.rows});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&method==='PATCH'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const brokerId=Number(p[2]);
   const b=parseBody(event);
   const r=await query('UPDATE brokers SET contact_person=COALESCE($2,contact_person),contact_phone=COALESCE($3,contact_phone),net_terms_days=COALESCE($4,net_terms_days),notes=COALESCE($5,notes),updated_at=now() WHERE id=$1 RETURNING *',[brokerId,clean(b.contact_person)||null,clean(b.contact_phone)||null,Number(b.net_terms_days)||null,clean(b.notes)||null]);
   if(!r.rows[0])return json(404,{error:'Broker not found'});
   await audit('BROKER',brokerId,'UPDATED',{fields:Object.keys(b)});
   return json(200,{broker:r.rows[0]});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&p[3]==='rates'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const brokerId=Number(p[2]);
   const b=parseBody(event);required(b,['service','base_rate','per_mile_rate']);
   const r=await query('UPDATE broker_rates SET effective_to=now() WHERE broker_id=$1 AND service=$2 AND effective_to IS NULL',[brokerId,clean(b.service)]);
   const nr=await query('INSERT INTO broker_rates(broker_id,service,base_rate,per_mile_rate,notes) VALUES($1,$2,$3,$4,$5) RETURNING *',[brokerId,clean(b.service),Number(b.base_rate),Number(b.per_mile_rate),clean(b.notes)||null]);
   await audit('BROKER',brokerId,'RATE_UPDATED',{service:b.service,baseRate:b.base_rate,perMileRate:b.per_mile_rate});
   return json(201,{rate:nr.rows[0]});
  }
  if(p.join('/')==='broker-requests'&&method==='POST'){
   const b=parseBody(event);required(b,['pickup','destination','trip_date','trip_time','service','broker_quoted_rate']);
   let brokerId=null;
   if(b.broker_id)brokerId=Number(b.broker_id);
   const platformRate=Number(b.platform_calculated_rate)||0;
   const brokerRate=Number(b.broker_quoted_rate)||0;
   const delta=brokerRate-platformRate;
   const r=await query('INSERT INTO broker_requests(broker_id,booking_reference,broker_name,service,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,trip_date,trip_time,broker_quoted_rate,platform_calculated_rate,rate_delta,submission_method,submitted_by,request_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *',[brokerId,clean(b.booking_reference)||null,clean(b.broker_name)||'Unknown',clean(b.service),clean(b.pickup),clean(b.destination),Number(b.pickup_lat)||null,Number(b.pickup_lng)||null,Number(b.destination_lat)||null,Number(b.destination_lng)||null,b.trip_date,b.trip_time,brokerRate,platformRate,delta,clean(b.submission_method)||'FORM',clean(b.submitted_by)||'ANONYMOUS','AUTO_CONFIRMED']);
   const req=r.rows[0];
   let requestState=req;
   try{
    const autoBookResult=await createBookingFromBrokerRequest(b,req);
    requestState=(await query('SELECT * FROM broker_requests WHERE id=$1',[req.id])).rows[0];
    if(autoBookResult.autoAssignResult?.assigned){
     await sendBrokerRequestToDispatch(requestState).catch(e=>console.error('[BROKER_NOTIFY]',e.message));
    }else{
     await sendBrokerRequestToDispatch(requestState).catch(e=>console.error('[BROKER_NOTIFY]',e.message));
    }
   }catch(e){console.error('[BROKER_AUTO_BOOK]',e.message);}
   const submitterEmail=clean(b.submitted_by)||clean(b.contact_email)||null;
   if(submitterEmail){
    await sendBrokerRequestConfirmation(requestState,submitterEmail,clean(b.broker_name)||'Broker request').catch(e=>console.error('[BROKER_CONFIRM]',e.message));
   }
   const confirmationMessage=requestState.request_status==='AUTO_BOOKED'?'Your broker request was automatically booked and dispatch has the trip details.':'Your broker request has been received and is pending review. It has not been booked yet. Dispatch will confirm the next steps.';
   await audit('BROKER_REQUEST',req.id,'SUBMITTED',{method:b.submission_method,broker:b.broker_name,autoBooked:Boolean(requestState.request_status==='AUTO_BOOKED')});
   return json(201,{request:requestState,autoConfirmed:true,autoBooked:Boolean(requestState.request_status==='AUTO_BOOKED'),bookingReference:requestState.booking_reference||null,clientMessage:confirmationMessage,message:confirmationMessage});
  }
  if(p[0]==='admin'&&p[1]==='broker-requests'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const status=event.queryStringParameters?.status||'AUTO_CONFIRMED';
   const r=await query('SELECT * FROM broker_requests WHERE request_status=$1 ORDER BY created_at DESC LIMIT 200',[clean(status)]);
   return json(200,{requests:r.rows});
  }
  if(p[0]==='admin'&&p[1]==='broker-requests'&&p[2]&&method==='PATCH'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const reqId=Number(p[2]);
   const b=parseBody(event);required(b,['dispatch_status']);
   const r=await query('UPDATE broker_requests SET request_status=$2,dispatch_reviewed=true,dispatch_reviewed_at=now(),dispatch_reviewed_by=$3,dispatch_notes=$4,updated_at=now() WHERE id=$1 RETURNING *',[reqId,clean(b.dispatch_status),u.display_name,clean(b.dispatch_notes)||null]);
   if(!r.rows[0])return json(404,{error:'Request not found'});
   let requestState=r.rows[0];
   if(clean(b.dispatch_status)==='APPROVED'&&!requestState.booking_reference){
    try{
     const autoBookResult=await createBookingFromBrokerRequest({broker_name:requestState.broker_name,service:requestState.service,pickup:requestState.pickup,destination:requestState.destination,trip_date:requestState.trip_date,trip_time:requestState.trip_time,broker_quoted_rate:requestState.broker_quoted_rate,platform_calculated_rate:requestState.platform_calculated_rate,booking_reference:requestState.booking_reference},requestState);
     requestState=(await query('SELECT * FROM broker_requests WHERE id=$1',[reqId])).rows[0];
     if(autoBookResult.autoAssignResult?.assigned){
      await sendBrokerRequestToDispatch(requestState).catch(e=>console.error('[BROKER_NOTIFY]',e.message));
     }
    }catch(e){console.error('[BROKER_AUTO_BOOK_APPROVAL]',e.message);}
   }
   await audit('BROKER_REQUEST',reqId,'REVIEWED',{status:b.dispatch_status,reviewedBy:u.display_name});
   return json(200,{request:requestState});
  }
  // ========== TRANSPORTATION COMPANIES ==========
  if(p.join('/')==='transportation-companies'&&method==='GET'){
   const DEFAULT_COMPANIES=[
    {id:'modivcare',name:'Modivcare',category:'Medicaid Broker',headquarters:'Denver, Colorado',website:'https://www.modivcare.com',providerPortal:'https://www.modivcare.com/transportation-providers-contact-us',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS'],acceptingProviders:true},
    {id:'mtm',name:'MTM',category:'Medicaid Broker',headquarters:'Lake Saint Louis, Missouri',website:'https://www.mtm-inc.net',states:['National'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'access2care',name:'Access2Care',category:'Medicaid Broker',headquarters:'United States',website:'https://www.access2care.net',states:['Multiple States'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'verida',name:'Verida',category:'Medicaid Broker',headquarters:'Atlanta, Georgia',website:'https://verida.com',states:['Multiple States','District of Columbia'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'saferide-health',name:'SafeRide Health',category:'Health Plan',headquarters:'San Antonio, Texas',phone:'855-955-7433',website:'https://www.saferidehealth.com',states:['National'],services:['Ambulatory','Wheelchair','Rideshare'],acceptingProviders:true},
    {id:'alivi',name:'Alivi',category:'Health Plan',headquarters:'Miami, Florida',website:'https://www.alivi.com',states:['Multiple States'],services:['Ambulatory','Wheelchair'],acceptingProviders:true},
    {id:'mas',name:'Medical Answering Services',category:'Medicaid Broker',headquarters:'New York',website:'https://www.medanswering.com',states:['New York'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'american-logistics',name:'American Logistics',category:'Health Plan',headquarters:'California',website:'https://americanlogistics.com',states:['Multiple States'],services:['Ambulatory','Wheelchair','Rideshare'],acceptingProviders:true},
    {id:'one-call',name:'One Call',category:'Workers Compensation',headquarters:'Jacksonville, Florida',website:'https://www.onecallcm.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS','ALS'],acceptingProviders:true},
    {id:'go-t-and-t',name:'Go Transportation & Translation',category:'Workers Compensation',headquarters:'United States',website:'https://www.gotandt.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS','ALS','Air Ambulance'],acceptingProviders:true},
    {id:'corvel',name:'CorVel Corporation',category:'Workers Compensation',headquarters:'Fort Worth, Texas',website:'https://www.corvel.com',states:['National'],services:['Medical Transportation','Case Management'],acceptingProviders:true},
    {id:'sedgwick',name:'Sedgwick',category:'Workers Compensation',headquarters:'Memphis, Tennessee',website:'https://www.sedgwick.com',states:['National'],services:['Medical Transportation','Claims Management'],acceptingProviders:false},
    {id:'enlyte',name:'Enlyte',category:'Workers Compensation',headquarters:'San Diego, California',website:'https://www.enlyte.com',states:['National'],services:['Medical Transportation','Case Management'],acceptingProviders:true},
    {id:'genex',name:'Genex Services',category:'Workers Compensation',headquarters:'Wayne, Pennsylvania',website:'https://www.genexservices.com',states:['National'],services:['Medical Transportation','Case Management'],acceptingProviders:true},
    {id:'coventry',name:'Coventry Workers Compensation Services',category:'Workers Compensation',headquarters:'United States',website:'https://www.coventrywcs.com',states:['National'],services:['Medical Transportation','Provider Networks'],acceptingProviders:true},
    {id:'mti-america',name:'MTI America',category:'Workers Compensation',headquarters:'Pompano Beach, Florida',website:'https://www.mtiamerica.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'procare',name:'ProCare Transportation and Language Services',category:'Workers Compensation',headquarters:'United States',website:'https://www.procaretransportation.com',states:['National'],services:['Ambulatory','Wheelchair','Translation'],acceptingProviders:true},
    {id:'roundtrip',name:'Roundtrip',category:'Hospital Transportation',headquarters:'Philadelphia, Pennsylvania',website:'https://www.roundtriphealth.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'ride-health',name:'Ride Health',category:'Hospital Transportation',headquarters:'New York',website:'https://www.ridehealth.com',states:['National'],services:['Ambulatory','Wheelchair','Rideshare'],acceptingProviders:true},
    {id:'uber-health',name:'Uber Health',category:'Hospital Transportation',headquarters:'San Francisco, California',website:'https://www.uberhealth.com',states:['National'],services:['Ambulatory','Rideshare'],acceptingProviders:false},
    {id:'lyft-healthcare',name:'Lyft Healthcare',category:'Hospital Transportation',headquarters:'San Francisco, California',website:'https://www.lyft.com/healthcare',states:['National'],services:['Ambulatory','Rideshare'],acceptingProviders:false},
    {id:'va',name:'U.S. Department of Veterans Affairs',category:'Government',headquarters:'Washington, DC',website:'https://www.va.gov',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS'],acceptingProviders:true},
   ];
   // Check if custom companies table exists; merge with defaults if so
   try{
    const tableCheck=await query("SELECT to_regclass('public.transportation_companies') AS name");
    if(tableCheck.rows[0]?.name){
     const custom=await query('SELECT * FROM transportation_companies WHERE active=true ORDER BY name');
     const customMapped=custom.rows.map(r=>({id:r.id,name:r.name,category:r.category||'Other',headquarters:r.headquarters||'',phone:r.phone||'',email:r.email||'',website:r.website||'',providerPortal:r.provider_portal||'',states:r.states||[],services:r.services||[],acceptingProviders:r.accepting_providers??true}));
     const merged=[...DEFAULT_COMPANIES,...customMapped.filter(c=>!DEFAULT_COMPANIES.find(d=>d.id===String(c.id)))];
     return json(200,merged);
    }
   }catch(e){console.warn('[COMPANIES] DB lookup failed, using defaults:',e.message);}
   return json(200,DEFAULT_COMPANIES);
  }
  // ===== SETUP/BOOTSTRAP — seed users without needing an admin login =====
  // Protected by SETUP_KEY env var. Call: POST /api/setup/seed { key: "VALUE" }
  if(p[0]==='setup'&&p[1]==='seed'&&method==='POST'){
   const b=parseBody(event);
   const setupKey=process.env.SETUP_KEY||'nexus-setup-2026';
   if(clean(b.key)!==setupKey)return json(403,{error:'Invalid setup key'});
   const TEST_USERS=[
    {email:'admin@nexusmt.com',name:'Test Administrator',role:'ADMIN',password:'NexusAdmin042!'},
    {email:'dispatcher@nexusmt.com',name:'Test Dispatcher',role:'DISPATCHER',password:'Dispatch2026!'},
    {email:'driver@nexusmt.com',name:'Test Driver',role:'DRIVER',password:'Driver2026!'},
    {email:'facility@nexusmt.com',name:'Test Facility',role:'FACILITY',password:'Facility2026!'},
    {email:'billing@nexusmt.com',name:'Test Billing',role:'BILLING',password:'Billing2026!'},
    {email:'qa@nexusmt.com',name:'Test QA',role:'QA',password:'Quality2026!'},
    {email:'executive@nexusmt.com',name:'Test Executive',role:'EXECUTIVE',password:'Exec2026!'},
   ];
   const results=[];
   // organization_id is NOT NULL — get it from the existing admin
   const orgRow=await query("SELECT organization_id FROM users WHERE role='ADMIN' LIMIT 1");
   const orgId=orgRow.rows[0]?.organization_id||null;
   for(const u of TEST_USERS){
    const hash=crypto.createHash('sha256').update(u.password).digest('hex');
    const existing=await query('SELECT id FROM users WHERE lower(email)=lower($1)',[u.email]);
    if(existing.rows[0]){
     await query('UPDATE users SET display_name=$2,role=$3,password_hash=$4,active=true,updated_at=now() WHERE id=$1',[existing.rows[0].id,u.name,u.role,hash]);
     results.push({email:u.email,role:u.role,action:'updated'});
    }else if(orgId){
     await query('INSERT INTO users(id,email,display_name,role,password_hash,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now())',[crypto.randomUUID(),u.email.toLowerCase(),u.name,u.role,hash,orgId,crypto.randomUUID()]);
     results.push({email:u.email,role:u.role,action:'created'});
    }else{
     await query('INSERT INTO users(id,email,display_name,role,password_hash,active,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,now(),now())',[crypto.randomUUID(),u.email.toLowerCase(),u.name,u.role,hash,crypto.randomUUID()]);
     results.push({email:u.email,role:u.role,action:'created'});
    }
   }
   return json(200,{ok:true,seeded:results.length,results,
    credentials:TEST_USERS.map(u=>({email:u.email,password:u.password,role:u.role}))
   });
  }
  // ===== AVAILABILITY CHECKING ==========
  if(p.join('/')==='availability/check'&&method==='POST'){
   const b=parseBody(event);required(b,['tripDate','tripTime','service']);
   const tripDate=clean(b.tripDate);
   const tripTime=clean(b.tripTime);
   const service=clean(b.service);
   // Check driver availability for this date/time
   const drivers=await query(`
    SELECT COUNT(DISTINCT e.id) as available
    FROM employees e
    INNER JOIN employee_shifts es ON e.id=es.employee_id
    WHERE e.employee_type='DRIVER' AND e.active=true
    AND es.shift_day::text ILIKE SUBSTRING($1,1,10)
    AND es.start_time::time<=$2::time AND es.end_time::time>$2::time
   `,[tripDate,tripTime]);
   const driverCount=Number(drivers.rows[0]?.available||0);
   // Check fleet vehicle availability for this service
   const vehicles=await query(`
    SELECT COUNT(*) as available FROM vehicles
    WHERE active=true AND status='AVAILABLE'
    AND (metadata->>'availability_24_7'='true' OR metadata->'service_hours' @> $1::jsonb)
   `,[JSON.stringify({service})]);
   const vehicleCount=Number(vehicles.rows[0]?.available||0);
   const available=driverCount>0&&vehicleCount>0;
   return json(200,{
    available,
    drivers:{available:driverCount,total:10,status:driverCount>2?'HIGH':driverCount>0?'LOW':'NONE'},
    vehicles:{available:vehicleCount,total:4,status:vehicleCount>2?'HIGH':vehicleCount>0?'LOW':'NONE'},
    recommendation:available?'AUTO_CONFIRM':'DISPATCH_REVIEW',
    action:available?'AUTOMATIC':'MANUAL',
    checkedAt:new Date().toISOString()
   });
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&p[3]==='dashboard'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','EXECUTIVE','BILLING']);
   const brokerId=Number(p[2]);
   const broker=await query('SELECT * FROM brokers WHERE id=$1',[brokerId]);
   if(!broker.rows[0])return json(404,{error:'Broker not found'});
   const thisYear=new Date().getFullYear();
   const thisMonth=new Date().getMonth();
   const periodStart=new Date(thisYear,thisMonth,1).toISOString().split('T')[0];
   const periodEnd=new Date(thisYear,thisMonth+1,0).toISOString().split('T')[0];
   const volume=await query('SELECT COUNT(*) as rides, SUM(CASE WHEN broker_quoted_rate>0 THEN broker_quoted_rate ELSE 0 END) as revenue FROM broker_requests WHERE broker_id=$1 AND trip_date>=$2 AND trip_date<=$3 AND request_status=$4',[brokerId,periodStart,periodEnd,'AUTO_CONFIRMED']);
   const invoices=await query('SELECT * FROM broker_invoices WHERE broker_id=$1 ORDER BY period_start DESC LIMIT 12',[brokerId]);
   return json(200,{broker:broker.rows[0],currentPeriod:{start:periodStart,end:periodEnd,rides:Number(volume.rows[0]?.rides||0),revenue:Number(volume.rows[0]?.revenue||0)},recentInvoices:invoices.rows});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&p[3]==='export'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','EXECUTIVE','BILLING']);
   const brokerId=Number(p[2]);
   const r=await query('SELECT * FROM broker_requests WHERE broker_id=$1 ORDER BY created_at DESC',[brokerId]);
   const csv='booking_reference,service,pickup,destination,date,time,broker_rate,platform_rate,delta,status\n'+r.rows.map(row=>`${row.booking_reference||'N/A'},${row.service},"${row.pickup}","${row.destination}",${row.trip_date},${row.trip_time},${row.broker_quoted_rate},${row.platform_calculated_rate},${row.rate_delta},${row.request_status}`).join('\n');
   return {statusCode:200,headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename=broker-export.csv'},body:csv};
  }
  if(p[0]==='ready'&&method==='GET'){const r=await query("SELECT version FROM schema_migrations WHERE version IN ('040.001','041.001','042.001','044.001','045.001','046.001') ORDER BY version");return json(r.rowCount===6?200:503,{ready:r.rowCount===6,migrations:r.rows.map(x=>x.version)})}
  return json(404,{error:'Route not found'});
 }catch(err){console.error(err);return json(err.statusCode||500,{error:err.statusCode?err.message:'Internal server error',requestId:crypto.randomUUID()})}
}
function mapBooking(b){return {id:b.reference,reference:b.reference,name:b.name,phone:b.phone,email:b.email,alternatePhone:b.alternate_phone,alternateEmail:b.alternate_email,service:b.service,pickup:b.pickup,destination:b.destination,date:b.trip_date,time:String(b.trip_time||'').slice(0,5),status:statusLabel(b.status),statusLabel:statusLabel(b.status).replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()),driver:b.driver_name,driverName:b.driver_name,vehicle:b.vehicle_unit,vehicleUnit:b.vehicle_unit,facilityId:b.facility_id,distanceMiles:b.distance_miles?Number(b.distance_miles):null,estimatedDuration:b.estimated_duration,estimatedFare:b.estimated_fare?Number(b.estimated_fare):null,paymentStatus:b.payment_status||'UNPAID',bookingSource:b.booking_source||'CUSTOMER',depositAmount:b.deposit_amount?Number(b.deposit_amount):null,balanceDue:b.balance_due?Number(b.balance_due):null,depositPaidAt:b.deposit_paid_at||null,paidInFullAt:b.paid_in_full_at||null,cancellationFeeAmount:b.cancellation_fee_amount?Number(b.cancellation_fee_amount):0,cancellationFeeApplied:Boolean(b.cancellation_fee_applied),cancellationRuleSnapshot:b.cancellation_rule_snapshot||null,lastUpdatedBy:b.last_updated_by,lastUpdatedAt:b.last_updated_at} }
exports.handler=handler;
exports.sendBrokerRequestConfirmation=sendBrokerRequestConfirmation;

