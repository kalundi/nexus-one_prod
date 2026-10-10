import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {chromium} from '@playwright/test';
import Fare from '../nexus-fare.js';
import Routes from '../nexus-route.js';
import Cache from '../netlify/functions/_shared/route-fares.cjs';
const apply=process.argv.includes('--apply');
const patientIndex=process.argv.indexOf('--confirmed-round-trip-patient');
const roundTripPatient=patientIndex>=0?process.argv[patientIndex+1]:null;
const referencesIndex=process.argv.indexOf('--references');
const references=referencesIndex>=0?process.argv[referencesIndex+1].split(','):null;
const canonicalIndex=process.argv.indexOf('--canonical-reference');
const canonicalReference=canonicalIndex>=0?process.argv[canonicalIndex+1]:null;
const restoreIndex=process.argv.indexOf('--restore-schedule-from');
const restoreSnapshot=restoreIndex>=0?JSON.parse(fs.readFileSync(process.argv[restoreIndex+1],'utf8')):null;
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||process.env.NETLIFY_DB_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
let browser;
try{
 const snapshot=(await pool.query('SELECT * FROM bookings ORDER BY trip_date,trip_time')).rows;
 if(!apply){console.log(JSON.stringify({mode:'preview',bookings:snapshot.length,real:snapshot.filter(row=>row.booking_source!=='MOCK').length,confirmedRoundTripPatient:roundTripPatient},null,2));process.exitCode=0;}
 else{
  fs.mkdirSync('output',{recursive:true});
  const snapshotPath=`output/booking-route-duplicate-repair-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  fs.writeFileSync(snapshotPath,JSON.stringify(snapshot,null,2));
  for(const file of ['083.001_booking_route_fares.sql','084.001_patient_schedule_duplicates.sql']){
   const version=file.split('_')[0];
   if(!(await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rowCount)await pool.query(fs.readFileSync('database/migrations/'+file,'utf8'));
  }
  if(canonicalReference){
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const current=(await client.query('SELECT reference,duplicate_of FROM bookings WHERE reference=$1 FOR UPDATE',[canonicalReference])).rows[0];
    if(!current)throw Error('Canonical reference not found.');
    if(current.duplicate_of){
     await client.query('UPDATE bookings SET duplicate_of=$2 WHERE reference=$1 OR duplicate_of=$1',[current.duplicate_of,canonicalReference]);
     await client.query('UPDATE bookings SET duplicate_of=NULL WHERE reference=$1',[canonicalReference]);
    }
    const original=restoreSnapshot?.find(row=>row.reference===canonicalReference);
    if(original)await client.query('UPDATE bookings SET trip_type=$2,trip_date=$3,trip_time=$4,return_trip_date=$5,return_trip_time=$6,notes=$7,pickup_time=$8,updated_at=now() WHERE reference=$1',[canonicalReference,original.trip_type,original.trip_date,original.trip_time,original.return_trip_date,original.return_trip_time,original.notes,original.pickup_time]);
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  if(roundTripPatient)await pool.query("UPDATE bookings SET trip_type='ROUND_TRIP',return_trip_date=COALESCE(return_trip_date,trip_date),updated_at=now() WHERE lower(trim(name))=lower(trim($1)) AND booking_source='BROKER' AND duplicate_of IS NULL AND trip_type IS DISTINCT FROM 'ROUND_TRIP'",[roundTripPatient]);
  const duplicates=(await pool.query('SELECT reference,duplicate_of,trip_date::text FROM bookings WHERE duplicate_of IS NOT NULL ORDER BY trip_date,reference')).rows;
  for(const row of duplicates)if(!snapshot.find(before=>before.reference===row.reference)?.duplicate_of)await pool.query(`INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) SELECT reference,status,lower(replace(status,'_',' ')),$2,'ADMIN' FROM bookings WHERE reference=$1`,[row.reference,'Duplicate booking retained for history; operational booking: '+row.duplicate_of]);
  const settings=await fetch('https://nexusmt.com/api/settings/public').then(response=>response.json());
  const yard=settings.organization?.yardAddress;
  if(!yard)throw Error('Company yard is not configured.');
  const rows=(await pool.query(`SELECT b.*,b.trip_date::text AS ride_date,b.return_trip_date::text AS return_date,(SELECT parsed_payload FROM broker_requests br WHERE br.booking_reference=b.reference ORDER BY br.created_at DESC LIMIT 1) AS intake FROM bookings b WHERE b.duplicate_of IS NULL AND upper(b.booking_source)<>'MOCK' AND ($1::text[] IS NULL OR b.reference=ANY($1::text[])) ORDER BY b.trip_date,b.trip_time`,[references])).rows;
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto('https://nexusmt.com/robots.txt',{waitUntil:'domcontentloaded'});
  await page.addScriptTag({path:path.resolve('nexus-route.js')});
  await page.evaluate(async()=>{
   const config=await fetch('/api/integrations/config').then(response=>response.json());
   if(!config.googleMapsEnabled||!config.googleMapsBrowserKey)throw Error('Maps is not configured.');
   await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(config.googleMapsBrowserKey)+'&libraries=places';script.onload=resolve;script.onerror=()=>reject(Error('Maps could not load.'));document.head.appendChild(script);});
  });
  const cache=new Map(),repaired=[],failures=[];
  for(const row of rows){
   try{
    const appointment=row.notes?.match(/Appointment time:\s*([^|\n]+)/i)?.[1]?.trim()||row.intake?.trip_time;
    let saved={};try{saved=JSON.parse(row.notes?.match(/Fare inputs: (\{[^\n|]*\})/)?.[1]||'{}');}catch{}
    const booking={reference:row.reference,name:row.name,pickup:row.pickup,destination:row.destination,service:row.service,date:row.ride_date,time:row.trip_time,pickupTime:row.intake?.pickup_time||saved.pickupTime||row.trip_time,appointmentTime:appointment,tripType:row.trip_type,returnTripDate:row.return_date,returnTripTime:row.return_trip_time,createdAt:row.created_at,bookingSource:row.booking_source,notes:row.notes,distanceMiles:Number(row.distance_miles),intakePayload:row.intake||{}};
    const key=Cache.cacheKey(booking,yard);
    if(!cache.has(key))cache.set(key,await page.evaluate(async({booking,yard})=>NexusRoute.measure(booking,yard,NexusRoute.googleProvider(google.maps,booking)),{booking:{...booking,time:String(booking.time).slice(0,5),pickupTime:String(booking.pickupTime).slice(0,5),returnTripTime:String(booking.returnTripTime||'').slice(0,5)},yard}));
    const inputs=cache.get(key);
    Routes.validate(inputs,booking,yard);
    const fare=Fare.calculateEstimate({...booking,routeFareInputs:inputs},settings);
    const client=await pool.connect();
    try{
     await client.query('BEGIN');
     const current=(await client.query('SELECT pickup,destination,trip_type,duplicate_of FROM bookings WHERE reference=$1 FOR UPDATE',[row.reference])).rows[0];
     if(!current||current.duplicate_of||!Routes.matches(inputs,{...current,tripType:current.trip_type},yard))throw Error('Booking changed during route repair: '+JSON.stringify({savedType:current?.trip_type,measuredType:inputs.routeAddresses.tripType,pickupMatches:current?.pickup===inputs.routeAddresses.pickup,destinationMatches:current?.destination===inputs.routeAddresses.destinations.join(' → ')}));
     await client.query(`INSERT INTO fare_route_cache(route_key,inputs) VALUES($1,$2::jsonb) ON CONFLICT(route_key) DO UPDATE SET inputs=EXCLUDED.inputs,updated_at=now()`,[key,JSON.stringify(inputs)]);
     await client.query('UPDATE bookings SET route_fare_inputs=$2::jsonb,distance_miles=$3,estimated_duration=$4,updated_at=now() WHERE reference=$1',[row.reference,JSON.stringify(inputs),inputs.miles,Math.ceil(inputs.durationMinutes)+' min']);
     await client.query(`INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) SELECT reference,status,lower(replace(status,'_',' ')),$2,'ADMIN' FROM bookings WHERE reference=$1`,[row.reference,'Driving route fare inputs verified: '+fare.passengerMilesTotal.toFixed(2)+' passenger miles; '+inputs.deadheadSegments.reduce((sum,value)=>sum+value,0).toFixed(2)+' empty miles. Current estimate $'+fare.discountedTotal.toFixed(2)+'.']);
     await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    repaired.push({reference:row.reference,passengerMiles:fare.passengerMilesTotal,emptyMiles:inputs.deadheadSegments,estimate:fare.discountedTotal});
   }catch(error){failures.push({reference:row.reference,error:error.message});}
  }
  console.log(JSON.stringify({mode:'applied',snapshot:snapshotPath,duplicateRecordsLinked:duplicates,measuredTrips:repaired.length,uniqueRoutes:cache.size,repaired,failures},null,2));
  if(failures.length)process.exitCode=1;
 }
}finally{if(browser)await browser.close();await pool.end();}
