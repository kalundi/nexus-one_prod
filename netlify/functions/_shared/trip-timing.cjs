const Timing=require('../../../nexus-trip-timing.js');
const Fare=require('../../../nexus-fare.js');
const FacilityIdentity=require('./facility-identification.cjs');
const terminal=new Set(['CANCELLED','COMPLETED','NO_SHOW','MISSED','DUPLICATE']);
function collectObservations(rows){
 const result={};
 for(const row of rows){
 const source=String(row.booking_source||'').toUpperCase();
  if(source==='MOCK'||/^(MOCK|DEMO|TEST)[-_]/i.test(row.reference||'')||/MOCK TRIP|DEMO TRIP|PRICING TEST/i.test(row.notes||''))continue;
  const destinations=String(row.destination||'').split(/\s*→\s*/);
  const history=(row.history||[]).filter(e=>Number.isFinite(Date.parse(e.createdAt||e.created_at))).sort((a,b)=>Date.parse(a.createdAt||a.created_at)-Date.parse(b.createdAt||b.created_at));
  let pickupAt=null,destinationAt=null,leg=0;
  for(const event of history){
   const at=Date.parse(event.createdAt||event.created_at),status=String(event.status).toUpperCase();
   if(status==='DELIVERED'&&/auto.confirmed destination stop|auto.confirmed.*handoff/i.test(event.note||'')){destinationAt=null;leg++;continue;}
   if(status==='ARRIVED_PICKUP')pickupAt=at;
   if(status==='ARRIVED_DESTINATION')destinationAt=at;
   const add=(address,role,start)=>{
    const minutes=(at-start)/60000;if(!(minutes>=1&&minutes<=180))return;
    const key=Timing.addressKey(address);(result[key]||(result[key]=[])).push({service:row.service,role,minutes,bucket:Timing.bucket(start)});
   };
   if(status==='DEPARTED'&&pickupAt!=null){if(!leg||destinations.length===1)add(leg?row.destination:row.pickup,'PICKUP',pickupAt);pickupAt=null;}
   if(['DELIVERED','COMPLETED'].includes(status)&&destinationAt!=null){if(destinations.length===1)add(leg?row.pickup:row.destination,'DROPOFF',destinationAt);destinationAt=null;leg++;}
  }
 }
 return result;
}
function publicProfile(row,observations=[]){return {address:row.address,name:row.name,facilityType:row.facility_type,pickupExtraMinutes:Number(row.pickup_extra_minutes)||0,handoffExtraMinutes:Number(row.handoff_extra_minutes)||0,serviceOverrides:row.service_overrides||{},peakWindows:row.peak_windows||[],receivingHours:row.receiving_hours||[],observations};}
function publicContext(context){
 return {locations:Object.fromEntries(Object.entries(context.locations||{}).map(([key,profile])=>{
  const {observations=[],...safe}=profile,groups=new Map();
  for(const row of observations)for(const bucket of ['*',row.bucket]){const id=[row.service,row.role,bucket].join('|'),group=groups.get(id)||{service:row.service,role:row.role,bucket,values:[]};group.values.push(Number(row.minutes));groups.set(id,group);}
  const historyEstimates=[...groups.values()].map(({values,...group})=>({...group,sampleCount:values.length,percentiles:values.length>=5?Object.fromEntries(Array.from({length:11},(_,i)=>[80+i,Timing.percentile(values,80+i)])):null}));
  return [key,{...safe,historyEstimates}];
 }))};
}
async function loadInstructions(bookings,query){
 const addresses=bookings.flatMap(b=>[b.pickup,...String(b.destination||'').split(/\s*→\s*/)]),keys=[...new Set(addresses.map(Timing.addressKey).filter(Boolean))];
 if(!keys.length)return bookings;
 const result=await query("SELECT address_key,address,access_instructions FROM facility_timing_profiles WHERE address_key=ANY($1::text[]) AND access_instructions<>''",[keys]);
 return bookings.map(b=>{const selected=[b.pickup,...String(b.destination||'').split(/\s*→\s*/)].map(Timing.addressKey);return {...b,locationInstructions:result.rows.filter(r=>selected.includes(r.address_key)).map(r=>({address:r.address,instructions:r.access_instructions}))};});
}
async function contextFor(addresses,query,places=[],{lookupExternal=true}={}){
 const keys=[...new Set(addresses.map(Timing.addressKey).filter(Boolean))].slice(0,24);
 if(!keys.length)return {locations:{}};
 const [profiles,history,cached]=await Promise.all([
  query('SELECT * FROM facility_timing_profiles WHERE address_key=ANY($1::text[])',[keys]),
  query(`SELECT b.reference,b.service,b.pickup,b.destination,b.booking_source,b.notes,
   (SELECT jsonb_agg(jsonb_build_object('status',h.status,'createdAt',h.created_at,'note',h.note) ORDER BY h.created_at) FROM trip_status_history h WHERE h.booking_reference=b.reference) AS history
   FROM bookings b WHERE b.status='COMPLETED' AND b.trip_date>=CURRENT_DATE-180 AND b.booking_source IS DISTINCT FROM 'MOCK'
    AND (trim(regexp_replace(lower(b.pickup),'[^a-z0-9]+',' ','g'))=ANY($1::text[]) OR trim(regexp_replace(lower(b.destination),'[^a-z0-9]+',' ','g'))=ANY($1::text[]))
   ORDER BY b.trip_date DESC LIMIT 1000`,[keys]),
  query('SELECT address_key,identity FROM facility_identity_cache WHERE address_key=ANY($1::text[]) AND expires_at>now()',[keys])
 ]);
 const observed=collectObservations(history.rows),map=new Map(profiles.rows.map(r=>[r.address_key,r]));
 const locations=Object.fromEntries(keys.map(key=>[key,map.has(key)?{...publicProfile(map.get(key),observed[key]||[]),identificationSource:'NEXUS_FACILITY_PROFILE',identificationConfidence:'HIGH'}:{observations:observed[key]||[]}]));
 const identities=new Map(cached.rows.map(r=>[r.address_key,r.identity]));for(const [key,identity] of identities)if(locations[key]&&!map.has(key))Object.assign(locations[key],identity);
 const hints=new Map(places.map(p=>[Timing.addressKey(p.address),p]));
 const missing=lookupExternal?addresses.filter(a=>locations[Timing.addressKey(a)]&&!map.has(Timing.addressKey(a))&&!identities.has(Timing.addressKey(a))):[];
 for(let i=0;i<missing.length;i+=3)await Promise.all(missing.slice(i,i+3).map(async address=>{const key=Timing.addressKey(address),identity=await FacilityIdentity.identify(address,hints.get(key)||{});Object.assign(locations[key],identity);if(['CMS_CARE_COMPARE','NPPES_NPI_REGISTRY'].includes(identity.identificationSource))await query("INSERT INTO facility_identity_cache(address_key,identity,expires_at) VALUES($1,$2::jsonb,now()+interval '1 day') ON CONFLICT(address_key) DO UPDATE SET identity=EXCLUDED.identity,expires_at=EXCLUDED.expires_at",[key,JSON.stringify(identity)]);}));
 for(const [key,place] of hints)if(locations[key]&&!map.has(key)&&!identities.has(key)&&!locations[key].identificationSource)Object.assign(locations[key],FacilityIdentity.classify(place));
 return {locations};
}
async function hydrate(bookings,settings,query){
 if(!settings.fareRules?.smartTiming?.enabled)return bookings;
 const addresses=bookings.flatMap(b=>[b.pickup,...String(b.destination||'').split(/\s*→\s*/)]);
 const unique=[...new Set(addresses.filter(Boolean))],locations={};
 const places=bookings.flatMap(b=>Fare.resolveBookingInputs(b,settings).facilityPlaces||[]);
 for(let i=0;i<unique.length;i+=24)Object.assign(locations,(await contextFor(unique.slice(i,i+24),query,places.filter(p=>unique.slice(i,i+24).includes(p.address)),{lookupExternal:false})).locations);
 const refs=bookings.map(b=>b.reference).filter(Boolean);
 const history=refs.length?await query(`SELECT h.booking_reference,h.status,h.created_at FROM unnest($1::text[]) ref(reference) CROSS JOIN LATERAL (SELECT booking_reference,status,created_at FROM trip_status_history WHERE booking_reference=ref.reference ORDER BY created_at DESC LIMIT 30) h`,[refs]):{rows:[]};
 const histories=new Map();for(const h of history.rows){const events=histories.get(h.booking_reference)||[];events.push({status:h.status,createdAt:h.created_at});histories.set(h.booking_reference,events);}
 return bookings.map(b=>{
  const milestones=(histories.get(b.reference)||[]).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const arrival=milestones.findLastIndex(e=>e.status==='ARRIVED_PICKUP'),ready=milestones.slice(Math.max(0,arrival)).find(e=>e.status==='PATIENT_READY');
  return {...b,timingContext:{locations},timingMilestones:milestones,patientReadyAt:ready?.createdAt||null};
 });
}
function planFor(booking,settings){
 const inputs=Fare.resolveBookingInputs(booking,settings);
 // Existing scheduled pickup is an operational commitment. Show recommendations without moving it.
 return Timing.plan({...booking,...Fare.resolveTripSchedule(booking)},{...inputs,scheduleBasis:'PICKUP'},settings);
}
async function persist(booking,settings,query){
 const hydrated=(await hydrate([booking],settings,query))[0],plan=planFor(hydrated,settings);
 if(plan)await query('UPDATE bookings SET timing_plan=COALESCE(timing_plan,\'{}\'::jsonb)||$2::jsonb,appointment_date=COALESCE($3::date,appointment_date) WHERE reference=$1',[booking.reference,JSON.stringify(plan),booking.appointmentDate||null]);
 return plan;
}
async function occupancy(booking,settings,query){
 const planned=(await hydrate([booking],settings,query))[0],plan=planFor(planned,settings);
 if(!plan)return {plan:null,trips:[]};
 const from=Timing.localParts(plan.crewArrivalAt-86400000).date,to=Timing.localParts(plan.vehicleAvailableAt+86400000).date;
 const rows=await query(`SELECT reference,driver_user_id,driver_name,driver_scope_id,vehicle_unit,status,service,pickup,destination,trip_date,trip_time,appointment_date,trip_type,return_trip_date,return_trip_time,route_fare_inputs,distance_miles,estimated_duration,notes FROM bookings WHERE reference<>$1 AND trip_date BETWEEN $2::date AND $3::date AND status NOT IN ('CANCELLED','COMPLETED','NO_SHOW','MISSED','DUPLICATE') AND booking_source IS DISTINCT FROM 'MOCK' ORDER BY trip_date,trip_time LIMIT 500`,[booking.reference||'',from,to]);
 const trips=rows.rows.map(r=>({reference:r.reference,driverUserId:r.driver_user_id,driver:r.driver_name,driverScopeId:r.driver_scope_id,vehicle:r.vehicle_unit,status:r.status,service:r.service,pickup:r.pickup,destination:r.destination,date:String(r.trip_date instanceof Date?r.trip_date.toISOString():r.trip_date).slice(0,10),time:String(r.trip_time).slice(0,5),appointmentDate:r.appointment_date?String(r.appointment_date instanceof Date?r.appointment_date.toISOString():r.appointment_date).slice(0,10):null,tripType:r.trip_type,returnTripDate:r.return_trip_date?String(r.return_trip_date instanceof Date?r.return_trip_date.toISOString():r.return_trip_date).slice(0,10):null,returnTripTime:r.return_trip_time?String(r.return_trip_time).slice(0,5):null,routeFareInputs:r.route_fare_inputs,distanceMiles:r.distance_miles,estimatedDuration:r.estimated_duration,notes:r.notes}));
 const enriched=await hydrate(trips,settings,query);
 return {plan,trips:enriched.map(t=>{const timingPlan=planFor(t,settings),prediction=Timing.predict(timingPlan,t.timingMilestones||[]);return {...t,timingPlan:timingPlan&&{...timingPlan,vehicleAvailableAt:Math.max(timingPlan.vehicleAvailableAt,prediction?.predictedVehicleAvailableAt||0)}};}).filter(t=>t.timingPlan)};
}
function conflicts(plan,trips,driver,vehicle){
 const own={start:plan.crewArrivalAt,end:plan.vehicleAvailableAt};
 const sameDriver=t=>typeof driver==='object'&&driver?(driver.user_id&&t.driverUserId?driver.user_id===t.driverUserId:driver.scope_id&&t.driverScopeId?driver.scope_id===t.driverScopeId:t.driver===driver.display_name):driver&&t.driver===driver;
 return trips.filter(t=>!terminal.has(t.status)&&(sameDriver(t)||(vehicle&&t.vehicle===vehicle))&&Timing.overlaps(own,{start:t.timingPlan.crewArrivalAt,end:t.timingPlan.vehicleAvailableAt}));
}
function validateProfile(body){
 const address=String(body.address||'').trim();if(address.length<5||address.length>500)throw Object.assign(Error('Enter a facility address.'),{statusCode:400});
 const num=v=>{const n=Number(v||0);if(!Number.isFinite(n)||n<0||n>120)throw Object.assign(Error('Facility allowances must be between 0 and 120 minutes.'),{statusCode:400});return n;};
 const type=String(body.facilityType||'UNKNOWN').toUpperCase();if(!['UNKNOWN','RESIDENCE','REHAB','HOSPITAL','DIALYSIS','NURSING','CLINIC'].includes(type))throw Object.assign(Error('Choose a supported facility type.'),{statusCode:400});
 const windowsFor=items=>(Array.isArray(items)?items:[]).slice(0,14).map(w=>{if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(w.start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(w.end)||w.start>=w.end)throw Object.assign(Error('Facility windows require valid start and end times.'),{statusCode:400});return {start:w.start,end:w.end,weekdays:(w.weekdays||[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=6),extraMinutes:num(w.extraMinutes)};});
 return {address,name:String(body.name||'').trim().slice(0,200),type,pickup:num(body.pickupExtraMinutes),handoff:num(body.handoffExtraMinutes),windows:windowsFor(body.peakWindows),receivingHours:windowsFor(body.receivingHours),instructions:String(body.accessInstructions||'').trim().slice(0,2000)};
}
module.exports={collectObservations,contextFor,hydrate,planFor,persist,occupancy,conflicts,validateProfile,publicProfile,publicContext,loadInstructions};
