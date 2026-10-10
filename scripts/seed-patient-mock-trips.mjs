import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import NexusFare from '../nexus-fare.js';

process.env.TZ='America/New_York';
const email='patient@nexusmt.com';
const batch='MOCK-20261010';
const apply=process.argv.includes('--apply');
const offline=process.argv.includes('--offline');
if(offline && apply)throw Error('Offline preview cannot insert trips.');
let connectionString=process.env.DATABASE_URL||process.env.NETLIFY_DB_URL;
for(const key of ['DATABASE_URL','NETLIFY_DB_URL']){
  if(offline)break;
  if(connectionString)break;
  const result=spawnSync('netlify.cmd',['env:get',key,'--context','production'],{shell:true,encoding:'utf8',windowsHide:true});
  const output=String(result.stdout||'').replace(/\x1b\[[0-9;]*m/g,'').trim();
  connectionString=output.match(/postgres(?:ql)?:\/\/[^\s]+/)?.[0];
}
if(!connectionString && !offline){
  const result=spawnSync('netlify.cmd',['env:list','--context','production','--scope','functions','--json'],{shell:true,encoding:'utf8',windowsHide:true});
  try{
    const variables=JSON.parse(result.stdout);
    for(const key of ['DATABASE_URL','NETLIFY_DB_URL']){
      const entry=variables[key];
      const value=typeof entry==='string'?entry:entry?.value||entry?.values?.find(item=>item.context==='production')?.value||entry?.values?.find(item=>item.context==='all')?.value;
      if(!value && entry) console.log(JSON.stringify({databaseEntryKeys:Object.keys(entry),valueShapes:Array.isArray(entry.values)?entry.values.map(item=>Object.keys(item)):null}));
      const candidate=String(value||'').match(/postgres(?:ql)?:\/\/[^\s"']+/)?.[0];
      if(candidate){connectionString=candidate;break;}
      if(value) console.log(JSON.stringify({key,type:typeof value,length:String(value).length,scheme:String(value).match(/^[a-z]+:/)?.[0]||null,redacted:/redact|secret|mask|\*\*|••/i.test(String(value))}));
    }
  }catch{console.log('Could not resolve production database environment.');}
}
if(!connectionString && !offline)throw Error('Database credential is unavailable or redacted. Set DATABASE_URL locally to seed, or use --offline for preview. No trips inserted.');
const pool=offline?null:new pg.Pool({connectionString,ssl:/localhost|127\.0\.0\.1/.test(connectionString)?false:{rejectUnauthorized:false}});
try{
  const user=offline?{email,role:'PATIENT'}:(await pool.query('SELECT id,email,display_name,phone,role FROM users WHERE lower(email)=lower($1) AND active=true',[email])).rows[0];
  if(!user)throw Error('Active patient account not found. No trips inserted.');
  const columns=offline?[]:(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings'")).rows.map(row=>row.column_name);
  if(process.argv.includes('--inspect')){
    console.log(JSON.stringify({accountFound:true,role:user.role,columns},null,2));
  }else{
    const settings=offline?{}:(await pool.query("SELECT value FROM system_settings WHERE key='platform' LIMIT 1")).rows[0]?.value||{};
    const source=fs.readFileSync('booking-app.js','utf8');
    const pricingCode=source.slice(source.indexOf('  const FALLBACK_PRICING ='),source.indexOf('  const DEFAULT_FARE_RULES'));
    const pricingContext=vm.createContext({});
    vm.runInContext(pricingCode+';globalThis.rates=FALLBACK_PRICING;',pricingContext);
    const pricing=Object.fromEntries(Object.entries(pricingContext.rates).map(([service,rate])=>[service,{...rate,...settings.pricing?.[service]}]));
    const fareCode=source.slice(source.indexOf('  function calculateFareBreakdown('),source.indexOf('  function calculateFare(service,'));
    const plans=[
      ['10-11','09:00','ambulatory',4,'Olney, MD',6,4],
      ['10-14','05:30','wheelchair',12,'Bethesda, MD',12,10],
      ['10-17','13:15','wheelchair',28,'Rockville, MD',9,18],
      ['10-20','10:00','ambulatory',7,'Gaithersburg, MD',3,6],
      ['10-23','20:30','stretcher',45,'Baltimore, MD',14,38],
      ['10-26','07:00','wheelchair',8,'Germantown, MD',8,8],
      ['10-29','16:00','bariatric',65,'Annapolis, MD',18,56],
      ['11-01','23:15','ambulatory',18,'Silver Spring, MD',10,14],
      ['11-04','11:00','wheelchair',20,'Bethesda, MD',12,10],
      ['11-07','14:00','broda',95,'Hagerstown, MD',20,80],
      ['11-11','09:30','wheelchair',35,'Frederick, MD',11,25],
      ['11-14','18:50','ambulatory',22,'Columbia, MD',12,17],
      ['11-17','08:00','stretcher',145,'Cumberland, MD',15,130],
      ['11-20','12:00','wheelchair',130,'Hershey, PA',14,120],
      ['11-23','06:00','bariatric',48,'Baltimore, MD',16,40],
      ['11-26','10:00','ambulatory',15,'Olney, MD',9,13],
      ['11-29','21:00','bls',165,'Morgantown, WV',20,150],
      ['12-02','13:30','wheelchair',175,'Ocean City, MD',12,160],
      ['12-05','02:00','stretcher',55,'Annapolis, MD',16,45],
      ['12-08','17:30','ambulatory',6,'Germantown, MD',2,5]
    ];
    const trips=plans.map(([day,time,service,miles,city,toPickup,after],index)=>{
      const date=`2026-${day}`;
      const duration=Math.max(15,Math.round(miles/35*60));
      // Two controlled short-notice cases exercise the 30% base surcharge.
      const shortNotice=[1,8].includes(index);
      const created=new Date(new Date(`${date}T${time}:00`).getTime()-(shortNotice?18:72)*3600000);
      const context=vm.createContext({NexusFare,getPricing:svc=>pricing[svc],getServicePolicy:svc=>settings.fareRules?.servicePolicies?.[svc]||{},fareRules:{...settings.fareRules},CARD_PROCESSING_FEE_PCT:3,getWaitingCharge:()=>({waitCharge:0}),deadheadRouteMiles:{toPickup,fromDestination:after,fromReturn:0},tripType:{value:'ONE_WAY'},returnTripDate:{value:''},returnTripTime:{value:''}});
      vm.runInContext(fareCode,context);
      const breakdown=context.calculateFareBreakdown(service,miles,date,time,{durationMinutes:duration,trafficDurationMinutes:duration,bookingTime:created.getTime()});
      const fare=NexusFare.applySavings(breakdown.total,5).total;
      return {reference:`${batch}-${String(index+1).padStart(2,'0')}`,date,time,service,miles,destination:`MOCK TRIP destination — ${city}`,duration,created:created.toISOString(),shortNotice,fare,breakdown};
    });
    fs.mkdirSync('output',{recursive:true});
    fs.writeFileSync('output/patient-mock-trips-20261010.json',JSON.stringify({email,batch,pricingSource:offline?'Local default rates; recalculated from production settings when inserted':'Production pricing settings',mileage:'Simulated test distances, not measured routes',trips},null,2));
    fs.writeFileSync('output/patient-mock-trips-20261010.csv',['Reference,Date,Pickup time,Service,Passenger miles,Destination,Deadhead charge,Short notice charge,Schedule premium,Fare after member savings',...trips.map(t=>[t.reference,t.date,t.time,t.service,t.miles,t.destination,t.breakdown.deadheadCharge.toFixed(2),t.breakdown.shortNoticeCharge.toFixed(2),t.breakdown.premiumRateReason,t.fare.toFixed(2)].map(value=>`"${String(value).replaceAll('"','""')}"`).join(','))].join('\n'));
    console.log(JSON.stringify({email,count:trips.length,outOfState:trips.filter(t=>/PA|WV/.test(t.destination)).length,shortNoticeCases:trips.filter(t=>t.shortNotice).length,range:[trips[0].date,trips.at(-1).date],mode:apply?'apply':'preview'},null,2));
    if(apply){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        for(const trip of trips){
          const notes=`MOCK TRIP — PRICING TEST ONLY. Not a real transport request. Batch ${batch}. Simulated mileage; no notifications, driver assignment, calendar sync, or payment collection. Fare breakdown: ${JSON.stringify(trip.breakdown)}. Member savings: 5%. Pricing booking timestamp: ${trip.created} (simulated test clock).`;
          const result=await client.query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,distance_miles,estimated_duration,estimated_fare,booking_source,trip_type,payer_type,requires_deposit,deposit_amount,balance_due,payment_status,reminder_sent,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'MOCK',$10,$11,$12,$13,'MOCK','ONE_WAY','SELF_PAY',false,0,0,'MOCK',true,now(),now()) ON CONFLICT(reference) DO NOTHING RETURNING reference`,[trip.reference,'MOCK TRIP — Patient Pricing Test',user.phone||'(240) 555-0199',email,trip.service,'MOCK TRIP pickup — Clarksburg, MD',trip.destination,trip.date,trip.time,notes,trip.miles,`${trip.duration} min (MOCK estimate)`,trip.fare]);
          if(result.rowCount)await client.query("INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,'MOCK','MOCK TRIP','Pricing test only; do not dispatch','MOCK_SEED')",[trip.reference]);
        }
        const check=(await client.query('SELECT count(*)::int AS count FROM bookings WHERE email=$1 AND reference LIKE $2 AND status=\'MOCK\'',[email,`${batch}-%`])).rows[0];
        if(check.count!==20)throw Error('Mock batch verification failed; rolling back.');
        await client.query('COMMIT');
        console.log('Verified: 20 MOCK TRIP bookings stored for patient@nexusmt.com.');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
  }
}catch(error){console.error(`Mock trip operation failed: ${error.code||error.message}`);process.exitCode=1;}finally{await pool?.end();}
