const crypto=require('crypto');
const {query,getPool}=require('./_shared/db.cjs');
const {json,parseBody,bearer,routePath}=require('./_shared/http.cjs');
const {digest,safeUser,requireUser,audit}=require('./_shared/auth.cjs');
const STATUS_FLOW={SUBMITTED:'SCHEDULED',REQUESTED:'SCHEDULED',SCHEDULED:'ASSIGNED',ASSIGNED:'EN_ROUTE',EN_ROUTE:'ARRIVED',ARRIVED:'IN_TRANSIT',IN_TRANSIT:'COMPLETED'};
const statusLabel=s=>String(s||'SUBMITTED').toLowerCase().replaceAll('_','-');
const envEnabled=name=>Boolean(process.env[name]);
const clean=v=>String(v??'').trim();
const required=(body,fields)=>{for(const f of fields)if(!clean(body[f]))throw Object.assign(new Error(`${f} is required`),{statusCode:400})};
const reference=()=>`NMT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomInt(1000,9999)}`;

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
function setupLink(token){
  const base=String(process.env.SITE_URL||process.env.URL||process.env.DEPLOY_PRIME_URL||'https://nexusmt.com').replace(/\/$/,'');
  return `${base}/set-password.html?token=${encodeURIComponent(token)}`;
}
async function notifyBooking(b){
 const text=`Nexus Medical Transit request ${b.reference} received for ${b.date} at ${b.time}. This request is pending confirmation.`;
 const results=await Promise.allSettled([sendSms(b.phone,text),sendEmail(b.email,`Nexus ride request ${b.reference}`,`<h1>Transportation request received</h1><p>Reference: <strong>${b.reference}</strong></p><p>${b.pickup} → ${b.destination}</p><p>${b.date} at ${b.time}</p><p>Nexus will contact you after availability is reviewed.</p>`)]);
 return {sms:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message},email:results[1].status==='fulfilled'?results[1].value:{status:'failed',error:results[1].reason?.message}};
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
 form.set('line_items[0][price_data][product_data][name]',`Nexus Medical Transit Booking ${bookingReference}`);
 form.set('line_items[0][price_data][unit_amount]',String(amountCents));
 form.set('line_items[0][quantity]','1');
 for(const [k,v] of Object.entries(metadata||{}))if(v!=null)form.set(`metadata[${k}]`,String(v).slice(0,500));
 const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded','idempotency-key':`checkout-${bookingReference}`},body:form});
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
  if(p.join('/')==='integrations/config'&&method==='GET')return json(200,{build:'042',googleMapsEnabled:envEnabled('GOOGLE_MAPS_BROWSER_KEY'),googleMapsBrowserKey:process.env.GOOGLE_MAPS_BROWSER_KEY||'',stripeEnabled:envEnabled('STRIPE_PUBLISHABLE_KEY')&&envEnabled('STRIPE_SECRET_KEY'),stripePublishableKey:process.env.STRIPE_PUBLISHABLE_KEY||'',squareEnabled:envEnabled('SQUARE_ACCESS_TOKEN')&&envEnabled('SQUARE_LOCATION_ID')});
  if(p.join('/')==='integrations/health'&&method==='GET')return json(200,{googleMaps:envEnabled('GOOGLE_MAPS_BROWSER_KEY')?'configured':'not-configured',twilio:envEnabled('TWILIO_ACCOUNT_SID')&&envEnabled('TWILIO_AUTH_TOKEN')&&envEnabled('TWILIO_PHONE_NUMBER')?'configured':'not-configured',sendGrid:envEnabled('SENDGRID_API_KEY')&&envEnabled('SENDGRID_FROM_EMAIL')?'configured':'not-configured',stripe:envEnabled('STRIPE_SECRET_KEY')&&envEnabled('STRIPE_PUBLISHABLE_KEY')?'configured':'not-configured',square:envEnabled('SQUARE_ACCESS_TOKEN')&&envEnabled('SQUARE_LOCATION_ID')?'configured':'not-configured',gps:'enabled',checkedAt:new Date().toISOString()});
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
   const ref=reference();
   const r=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_miles,estimated_duration,estimated_fare,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUBMITTED',$10,$11,$12,$13,$14,$15,$16,$17,now(),now()) RETURNING *`,[ref,clean(b.name),clean(b.phone),clean(b.email)||null,clean(b.service),clean(b.pickup),clean(b.destination),b.date,b.time,clean(b.notes)||null,b.pickupLat||null,b.pickupLng||null,b.destinationLat||null,b.destinationLng||null,b.distanceMiles||null,clean(b.estimatedDuration)||null,b.estimatedFare||null]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,'SUBMITTED','submitted','Online transportation request received','PUBLIC']);
   await audit('BOOKING',ref,'CREATED',{source:'UNIFIED_BOOKING',service:b.service});
   const booking=mapBooking(r.rows[0]);const notifications=await notifyBooking(booking);
   await query('UPDATE bookings SET notification_status=$2::jsonb WHERE reference=$1',[ref,JSON.stringify(notifications)]).catch(()=>{});
   return json(201,{booking:{...booking,notifications}});
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
   const r=await query('SELECT reference,email,estimated_fare,payment_status FROM bookings WHERE reference=$1',[b.bookingReference]);
   if(!r.rows[0])return json(404,{error:'Booking not found'});
   const amount=Math.round(Number(b.amount||r.rows[0].estimated_fare||0)*100);if(amount<50)return json(400,{error:'A valid payment amount is required'});
   const session=await createStripeCheckoutSession(amount,{bookingReference:r.rows[0].reference,email:r.rows[0].email||undefined});
   await query('UPDATE bookings SET stripe_checkout_session_id=$2,payment_status=$3,updated_at=now() WHERE reference=$1',[r.rows[0].reference,session.id,'PENDING']);
   return json(200,{provider:'stripe',url:session.url,sessionId:session.id,amount});
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
   await query(`UPDATE vehicles SET latitude=$2,longitude=$3,heading=$4,speed_mph=$5,last_seen_at=now(),updated_at=now() WHERE unit_number=$1`,[b.vehicleUnit,lat,lng,b.heading||null,b.speedMph||null]);return json(202,{accepted:true});
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
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);const b=parseBody(event),ref=decodeURIComponent(p[2]);const hasEstimatedFare=Object.prototype.hasOwnProperty.call(b,'estimatedFare');const estimatedFareRaw=hasEstimatedFare?Number(b.estimatedFare):null;if(hasEstimatedFare&&!Number.isFinite(estimatedFareRaw))return json(400,{error:'estimatedFare must be a valid number'});if(hasEstimatedFare&&estimatedFareRaw<0)return json(400,{error:'estimatedFare must be 0 or greater'});if(hasEstimatedFare&&u.role!=='ADMIN')return json(403,{error:'Only Admin can adjust fares'});const r=await query(`UPDATE bookings SET status=COALESCE($2,status),driver_name=COALESCE($3,driver_name),vehicle_unit=COALESCE($4,vehicle_unit),estimated_fare=CASE WHEN $5 THEN $6 ELSE estimated_fare END,updated_at=now() WHERE reference=$1 RETURNING *`,[ref,b.status?String(b.status).toUpperCase().replaceAll('-','_'):null,b.driverName||null,b.vehicleUnit||null,hasEstimatedFare,hasEstimatedFare?estimatedFareRaw:null]);if(!r.rows[0])return json(404,{error:'Booking not found'});await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,r.rows[0].status,statusLabel(r.rows[0].status),b.note||null,u.display_name]);await audit('BOOKING',ref,'UPDATED',{status:r.rows[0].status,estimatedFare:hasEstimatedFare?estimatedFareRaw:undefined});return json(200,{booking:mapBooking(r.rows[0])});
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&p[3]==='advance'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);const ref=decodeURIComponent(p[2]);const current=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);if(!current.rows[0])return json(404,{error:'Booking not found'});const next=STATUS_FLOW[current.rows[0].status]||current.rows[0].status;const r=await query('UPDATE bookings SET status=$2,updated_at=now() WHERE reference=$1 RETURNING *',[ref,next]);await query('INSERT INTO trip_status_history(booking_reference,status,status_label,actor) VALUES($1,$2,$3,$4)',[ref,next,statusLabel(next),u.display_name]);await audit('BOOKING',ref,'STATUS_ADVANCED',{from:current.rows[0].status,to:next});return json(200,{booking:mapBooking(r.rows[0])});
  }
  if(p[0]==='fleet'&&p[1]==='live'&&method==='GET'){
   let u=null;try{if(bearer(event))u=await requireUser(bearer(event))}catch{}const r=await query(`SELECT unit_number,vehicle_type,status,latitude,longitude,heading,speed_mph,last_seen_at FROM vehicles WHERE last_seen_at IS NULL OR last_seen_at>now()-interval '24 hours' ORDER BY unit_number`);return json(200,{generatedAt:new Date().toISOString(),role:u?.role||'PUBLIC',vehicles:r.rows.map(v=>({id:v.unit_number,unit:v.unit_number,type:v.vehicle_type,status:v.status,lat:Number(v.latitude),lng:Number(v.longitude),heading:Number(v.heading||0),speed:Number(v.speed_mph||0),lastSeen:v.last_seen_at}))});
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
   await query(`INSERT INTO users(id,email,display_name,role,password_hash,active,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,now(),now())`,[userId,clean(b.email).toLowerCase(),clean(b.name),String(b.role).toUpperCase(),passwordHash]);
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
  if(p[0]==='ready'&&method==='GET'){const r=await query("SELECT version FROM schema_migrations WHERE version IN ('040.001','041.001','042.001','044.001','045.001','046.001') ORDER BY version");return json(r.rowCount===6?200:503,{ready:r.rowCount===6,migrations:r.rows.map(x=>x.version)})}
  return json(404,{error:'Route not found'});
 }catch(err){console.error(err);return json(err.statusCode||500,{error:err.statusCode?err.message:'Internal server error',requestId:crypto.randomUUID()})}
}
function mapBooking(b){return {id:b.reference,reference:b.reference,name:b.name,phone:b.phone,email:b.email,alternatePhone:b.alternate_phone,alternateEmail:b.alternate_email,service:b.service,pickup:b.pickup,destination:b.destination,date:b.trip_date,time:String(b.trip_time||'').slice(0,5),status:statusLabel(b.status),statusLabel:statusLabel(b.status).replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()),driver:b.driver_name,driverName:b.driver_name,vehicle:b.vehicle_unit,vehicleUnit:b.vehicle_unit,facilityId:b.facility_id,distanceMiles:b.distance_miles?Number(b.distance_miles):null,estimatedDuration:b.estimated_duration,estimatedFare:b.estimated_fare?Number(b.estimated_fare):null,paymentStatus:b.payment_status||'UNPAID',cancellationFeeAmount:b.cancellation_fee_amount?Number(b.cancellation_fee_amount):0,cancellationFeeApplied:Boolean(b.cancellation_fee_applied),cancellationRuleSnapshot:b.cancellation_rule_snapshot||null,lastUpdatedBy:b.last_updated_by,lastUpdatedAt:b.last_updated_at} }
exports.handler=handler;
