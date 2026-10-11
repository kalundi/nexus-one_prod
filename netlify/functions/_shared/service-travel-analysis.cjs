const Fare=require('../../../nexus-fare.js');
const MAX_TRIPS=1000;
const MIN_TRIPS=30;
const CARE_FOCUS={ambulatory:'Boarding assistance and seatbelt checks',wheelchair:'Lift or ramp access, wheelchair securement and occupant restraints',broda:'Chair-specific transfer and transport setup',stretcher:'Loading, restraints, smooth travel and patient handoff',bariatric:'Crew and equipment setup, assisted loading and handoff',facility_transfer:'The rider’s mobility needs and facility handoff',facility_transfer_critical:'Clinical preparation, smooth travel and care handoff',bls:'Clinical preparation, monitoring and handoff',als1:'Clinical preparation, monitoring and handoff',als2:'Clinical preparation, monitoring and handoff'};
const normal=value=>String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
const minutes=(start,end)=>Math.max(0,(end-start)/60000);
const median=values=>{const sorted=values.filter(value=>value!=null&&Number.isFinite(value)).sort((a,b)=>a-b);return sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2:null;};
const rounded=value=>value==null?null:Math.round(value*10)/10;

function drivingWindows(bookings,start,end){
 const windows=[];
 for(const booking of bookings){
  if(normal(booking.status)!=='COMPLETED'||['MOCK','DEMO','TEST'].includes(normal(booking.booking_source))||/^(MOCK|DEMO|TEST)[-_]/i.test(booking.reference||''))continue;
  const history=(booking.history||[]).map(event=>({status:normal(event.status),at:Date.parse(event.at)})).filter(event=>Number.isFinite(event.at)&&event.at>=start&&event.at<=end).sort((a,b)=>a.at-b.at);
  let arrived=null,departed=null,lastWindow=null;
  for(const event of history){
   if(event.status==='ARRIVED_PICKUP'){if(departed==null&&arrived==null)arrived=event.at;}
   if(event.status==='DEPARTED'&&departed==null)departed=event.at;
   if(event.status==='ARRIVED_DESTINATION'&&departed!=null){
    const duration=minutes(departed,event.at);
    if(duration>=1&&duration<=1440){
     lastWindow={id:windows.length,ref:booking.reference,unit:booking.vehicle_unit||'',service:String(booking.service||'').toLowerCase(),start_at:new Date(departed).toISOString(),end_at:new Date(event.at).toISOString(),drivingMinutes:duration,boardingMinutes:arrived!=null?minutes(arrived,departed):null,handoffMinutes:null};
     windows.push(lastWindow);
    }else lastWindow=null;
    arrived=null;departed=null;
   }
   if(event.status==='DELIVERED'&&lastWindow&&lastWindow.handoffMinutes==null)lastWindow.handoffMinutes=minutes(Date.parse(lastWindow.end_at),event.at);
  }
 }
 return windows;
}

function summarize(windows,tracks,settings,{start,end,days,truncated=false,candidateTrips=0}={}){
 const trackMap=new Map(tracks.map(track=>[Number(track.id),track]));
 const groups=new Map(Object.keys(settings.pricing||{}).map(service=>[service,{service,trips:new Set(),legs:[],boarding:[],handoff:[]}]));
 let excludedLegs=0;
 for(const window of windows){
  const track=trackMap.get(window.id),startAt=Date.parse(window.start_at),endAt=Date.parse(window.end_at);
  const first=Date.parse(track?.first_at),last=Date.parse(track?.last_at),elapsed=(endAt-startAt)/1000;
  const distance=Number(track?.miles),coverage=(last-first)/1000/elapsed;
  const valid=Number(track?.points)>=3&&Number(track?.bad_segments)===0&&Number(track?.max_gap_seconds)<=180&&Number.isFinite(distance)&&distance>=.1&&distance/window.drivingMinutes*60<=80&&coverage>=.9&&first>=startAt&&last<=endAt&&(first-startAt)/1000<=120&&(endAt-last)/1000<=120;
  if(!valid){excludedLegs++;continue;}
  if(!groups.has(window.service))groups.set(window.service,{service:window.service,trips:new Set(),legs:[],boarding:[],handoff:[]});
  const group=groups.get(window.service);
  group.trips.add(window.ref);group.legs.push({miles:distance,minutes:window.drivingMinutes});
  if(window.boardingMinutes!=null&&window.boardingMinutes<=240)group.boarding.push(window.boardingMinutes);
  if(window.handoffMinutes!=null&&window.handoffMinutes<=240)group.handoff.push(window.handoffMinutes);
 }
 const services=[...groups.values()].map(group=>{
  const miles=group.legs.reduce((sum,leg)=>sum+leg.miles,0),duration=group.legs.reduce((sum,leg)=>sum+leg.minutes,0);
  const policy=Fare.travelPolicy(group.service,settings.fareRules||{});
  return {service:group.service,label:settings.pricing?.[group.service]?.label||group.service,careFocus:CARE_FOCUS[group.service]||'Patient assistance, transport setup and handoff',speedReductionMph:policy.speedReductionMph,tripCount:group.trips.size,legCount:group.legs.length,observedAverageMph:duration?rounded(miles/duration*60):null,boardingMedianMinutes:rounded(median(group.boarding)),boardingSamples:group.boarding.length,handoffMedianMinutes:rounded(median(group.handoff)),handoffSamples:group.handoff.length,evidenceStatus:group.trips.size>=MIN_TRIPS?'REVIEW_READY':group.legs.length?'LIMITED_SAMPLE':'NO_DATA'};
 });
 return {generatedAt:new Date(end).toISOString(),periodStart:new Date(start).toISOString(),days,minimumTrips:MIN_TRIPS,candidateTrips,verifiedLegs:windows.length-excludedLegs,excludedLegs,truncated,services,method:'GPS distance divided by DEPARTED-to-ARRIVED_DESTINATION time; traffic stops are included. Boarding and handoff are measured separately. No speed or fare setting is changed.'};
}

async function readAnalysis(query,settings,{days=90,now=Date.now()}={}){
 days=[30,90,180].includes(Number(days))?Number(days):90;
 const start=now-days*86400000;
 const candidates=await query(`
  SELECT b.reference,b.service,b.status,b.booking_source,b.vehicle_unit,
    COALESCE(h.history,'[]'::jsonb) AS history
  FROM (
    SELECT reference,service,status,booking_source,vehicle_unit,trip_date
    FROM bookings
    WHERE trip_date BETWEEN ($1::timestamptz AT TIME ZONE 'America/New_York')::date AND ($2::timestamptz AT TIME ZONE 'America/New_York')::date
      AND upper(status)='COMPLETED' AND upper(COALESCE(booking_source,'')) NOT IN ('MOCK','DEMO','TEST')
      AND reference !~* '^(MOCK|DEMO|TEST)[-_]' AND upper(COALESCE(notes,'')) NOT LIKE '%MOCK TRIP%'
    ORDER BY trip_date DESC,reference LIMIT 1001
  ) b
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('status',status,'at',created_at) ORDER BY created_at) AS history
    FROM trip_status_history WHERE booking_reference=b.reference AND created_at BETWEEN $1::timestamptz AND $2::timestamptz
      AND upper(replace(status,'-','_')) IN ('ARRIVED_PICKUP','DEPARTED','ARRIVED_DESTINATION','DELIVERED')
  ) h ON true`,[new Date(start).toISOString(),new Date(now).toISOString()]);
 const windows=drivingWindows(candidates.rows.slice(0,MAX_TRIPS),start,now);
 let tracks=[];
 if(windows.length){
  // The vehicle/time predicate uses the existing GPS index; only loaded windows are read.
  const result=await query(`
   SELECT w.id,g.points,g.first_at,g.last_at,g.max_gap_seconds,g.bad_segments,g.miles
   FROM jsonb_to_recordset($1::jsonb) AS w(id int,ref text,unit text,start_at timestamptz,end_at timestamptz)
   CROSS JOIN LATERAL (
    SELECT count(*) AS points,min(recorded_at) AS first_at,max(recorded_at) AS last_at,max(gap) AS max_gap_seconds,
      count(*) FILTER(WHERE gap>0 AND distance*3600/nullif(gap,0)>80) AS bad_segments,
      COALESCE(sum(CASE WHEN gap>0 AND distance>=.003 AND distance*3600/nullif(gap,0)<=80 THEN distance ELSE 0 END),0) AS miles
    FROM (
     SELECT recorded_at,gap,CASE WHEN prev_lat IS NULL THEN NULL ELSE 2*3958.7613*asin(sqrt(least(1.0,
       power(sin(radians(latitude-prev_lat)/2),2)+cos(radians(latitude))*cos(radians(prev_lat))*power(sin(radians(longitude-prev_lng)/2),2)))) END AS distance
     FROM (
      SELECT recorded_at,latitude,longitude,lag(latitude) OVER gps_order AS prev_lat,lag(longitude) OVER gps_order AS prev_lng,
        extract(epoch FROM recorded_at-lag(recorded_at) OVER gps_order) AS gap
      FROM (
       SELECT DISTINCT ON(recorded_at) recorded_at,latitude::double precision,longitude::double precision
       FROM gps_positions
       WHERE vehicle_unit=w.unit AND booking_reference=w.ref AND recorded_at BETWEEN w.start_at AND w.end_at
         AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND (accuracy_m IS NULL OR accuracy_m<=50)
       ORDER BY recorded_at,id DESC
      ) points WINDOW gps_order AS(ORDER BY recorded_at)
     ) previous
    ) distances
   ) g`,[JSON.stringify(windows.map(({id,ref,unit,start_at,end_at})=>({id,ref,unit,start_at,end_at})))]);
  tracks=result.rows;
 }
 return summarize(windows,tracks,settings,{start,end:now,days,truncated:candidates.rows.length>MAX_TRIPS,candidateTrips:Math.min(candidates.rows.length,MAX_TRIPS)});
}
module.exports={drivingWindows,summarize,readAnalysis};
