const clean=value=>String(value??'').trim();
const error=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
const realBooking="upper(COALESCE(b.booking_source,'CUSTOMER')) NOT IN ('MOCK','DEMO') AND upper(COALESCE(b.status,''))<>'MOCK'";
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function easternDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function createHandler({query,requireUser,bearer,json,parseBody}){
 return async(event,p,method)=>{
  if(p[0]!=='facility-portal')return null;
  const user=await requireUser(bearer(event),['FACILITY','ADMIN','DISPATCHER']);
  const params=event.queryStringParameters||{},isManager=user.role==='FACILITY';
  if(isManager&&!clean(user.scope_id))throw error('Your manager account needs an assigned facility. Contact Nexus.',409);
  if(isManager&&params.facility&&params.facility!==clean(user.scope_id))throw error('This facility is outside your account.',403);
  const facilities=(await query(`SELECT facility_code AS id,name,address FROM facilities WHERE active=true${isManager?' AND facility_code=$1':''} ORDER BY name`,isManager?[user.scope_id]:[])).rows;
  if(isManager&&!facilities.length)throw error('Your assigned facility is inactive or unavailable. Contact Nexus.',409);
  if(p[1]==='context'&&method==='GET')return json(200,{facilities,manager:isManager,today:easternDate()});
  const id=isManager?clean(user.scope_id):clean(params.facility);
  if(isManager&&params.facility&&params.facility!==id)throw error('This facility is outside your account.',403);
  const facility=facilities.find(f=>f.id===id);
  if(!facility)throw error(isManager?'Your assigned facility is inactive or unavailable.':'Select an active facility.',409);
  const base={facility,bookingUrl:'/booking-app.html?facility='+encodeURIComponent(id)};
  if(p[1]==='trips'&&method==='GET'){
   const page=Number(params.page||0),rangesParam=clean(params.ranges);
   // Three request modes share one matching engine. `dates` (the portal's
   // multi-select calendar) wins when present: a comma-separated set of
   // single days, deduplicated, sorted and capped at 62, carried through
   // as one-day blocks. Otherwise `ranges` carries 1–12 inclusive
   // from..to blocks resolved by the client, and legacy `date` /
   // `from`+`to` requests map to exactly one block, so their behavior is
   // unchanged. A booking row matches once when its outbound OR return
   // date falls in ANY block.
   let blocks=null,selectedDates=null;
   if(params.dates!==undefined){
    const parts=clean(params.dates).split(',').map(part=>part.trim());
    if(parts.some(part=>!/^\d{4}-\d{2}-\d{2}$/.test(part)||!validDate(part)))throw error('Choose valid service dates and page.');
    selectedDates=[...new Set(parts)].sort();
    if(!selectedDates.length||selectedDates.length>62)throw error('Choose valid service dates and page.');
    blocks=selectedDates.map(day=>({from:day,to:day}));
   }else if(rangesParam){
    blocks=[];
    for(const pair of rangesParam.split(',')){
     const match=/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(pair);
     if(!match){blocks=null;break;}
     blocks.push({from:match[1],to:match[2]});
    }
    if(blocks&&(blocks.length>12||blocks.some(block=>!validDate(block.from)||!validDate(block.to)||block.from>block.to||(Date.parse(block.to+'T12:00:00Z')-Date.parse(block.from+'T12:00:00Z'))/86400000>366)))blocks=null;
    if(!blocks)throw error('Choose valid service dates and page.');
   }else{
    const fromParam=clean(params.from),toParam=clean(params.to);
    let from,to;
    if(fromParam||toParam){from=fromParam;to=toParam;}
    else{from=to=clean(params.date)||easternDate();}
    if(!validDate(from)||!validDate(to)||from>to||(Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000>366)throw error('Choose valid service dates and page.');
    blocks=[{from,to}];
   }
   if(!Number.isInteger(page)||page<0||page>10000)throw error('Choose valid service dates and page.');
   const from=blocks.reduce((min,block)=>block.from<min?block.from:min,blocks[0].from),to=blocks.reduce((max,block)=>block.to>max?block.to:max,blocks[0].to);
   const union=blocks.map((block,index)=>`(b.trip_date BETWEEN $${2+index*2}::date AND $${3+index*2}::date OR b.return_trip_date BETWEEN $${2+index*2}::date AND $${3+index*2}::date)`).join(' OR ');
   const rangeTrips=`b.facility_id=$1 AND ${realBooking} AND (${union})`;
   const rangeArgs=blocks.flatMap(block=>[block.from,block.to]),offsetParam=2+blocks.length*2,userParam=offsetParam+1;
   const [rows,summaryRows]=await Promise.all([
    query(`SELECT b.reference,b.name,b.service,b.pickup,b.destination,b.trip_date,b.trip_time,booking_appointment_time(b.notes) AS appointment_time,b.status,b.payment_status,b.driver_name,b.vehicle_unit,b.trip_type,b.return_trip_date,b.return_trip_time,b.updated_at,
    (SELECT count(*)::int FROM facility_portal_messages m WHERE m.facility_id=$1 AND m.booking_reference=b.reference AND m.author_id<>$${userParam}::uuid AND m.created_at>COALESCE((SELECT r.read_at FROM facility_portal_reads r WHERE r.user_id=$${userParam}::uuid AND r.booking_reference=b.reference),'-infinity'::timestamptz)) AS unread
    FROM bookings b WHERE ${rangeTrips} ORDER BY b.trip_date,b.trip_time,b.reference LIMIT 101 OFFSET $${offsetParam}`,[id,...rangeArgs,page*100,user.id]),
    query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE upper(COALESCE(b.status,'')) IN ('COMPLETED','DELIVERED','BILLED','PAID'))::int AS complete,
    count(*) FILTER (WHERE upper(COALESCE(b.status,'')) IN ('CANCELLED','NO_SHOW','MISSED','DENIED'))::int AS cancelled,
    count(*) FILTER (WHERE upper(COALESCE(b.status,'')) IN ('EN_ROUTE','ARRIVED','ARRIVED_PICKUP','PATIENT_ON_BOARD','IN_TRANSIT','DEPARTED','ARRIVED_DESTINATION'))::int AS active
    FROM bookings b WHERE ${rangeTrips}`,[id,...rangeArgs])
   ]);
   const counts=summaryRows.rows[0]||{total:0,complete:0,cancelled:0,active:0};
   const summary={total:counts.total,pending:counts.total-counts.complete-counts.cancelled-counts.active,active:counts.active,complete:counts.complete};
   return json(200,{...base,date:from,from,to,ranges:blocks,...(selectedDates?{dates:selectedDates}:{}),page,hasMore:rows.rows.length>100,trips:rows.rows.slice(0,100),summary,updatedAt:new Date().toISOString()});
  }
  if(p[1]==='reports'&&method==='GET'){
   // Aggregates only: counts and series for the caller's own facility,
   // never per-trip rows, passenger names or street addresses. The scope
   // is the same `id` the trips endpoint uses (the manager's session
   // scope, or the facility staff selected above), and the endpoint
   // accepts no facility of its own beyond that shared resolution, so a
   // manager naming another facility has already been rejected with 403
   // before this branch runs. Range validation mirrors the trips
   // endpoint: real calendar dates, from <= to, span at most 366 days,
   // with the legacy `date` and today fallbacks.
   const fromParam=clean(params.from),toParam=clean(params.to);
   let from,to;
   if(fromParam||toParam){from=fromParam;to=toParam;}
   else{from=to=clean(params.date)||easternDate();}
   if(!validDate(from)||!validDate(to)||from>to||(Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000>366)throw error('Choose valid reporting dates.');
   // A booking matches when its outbound OR return date falls in range,
   // exactly like the trip board. It is counted once, on its outbound
   // date when that is in range and otherwise on its return date, so
   // every series below partitions the same matched set and the daily
   // counts sum to the headline total.
   const matched=`SELECT b.status,b.service,b.destination,b.trip_date,b.created_at,
    CASE WHEN b.trip_date BETWEEN $2::date AND $3::date THEN b.trip_date ELSE b.return_trip_date END AS counted_date,
    CASE WHEN b.trip_date BETWEEN $2::date AND $3::date THEN b.trip_time ELSE COALESCE(b.return_trip_time,b.trip_time) END AS counted_time
    FROM bookings b WHERE b.facility_id=$1 AND ${realBooking}
    AND (b.trip_date BETWEEN $2::date AND $3::date OR b.return_trip_date BETWEEN $2::date AND $3::date)`;
   const args=[id,from,to];
   const ownAddress=clean(facility.address).toLowerCase().replace(/\s+/g,' ');
   const [totalsRows,dailyRows,statusRows,serviceRows,dowRows,hourRows,destinationRows,leadRows]=await Promise.all([
    query(`WITH matched AS (${matched}) SELECT count(*)::int AS total,
    count(*) FILTER (WHERE upper(COALESCE(status,'')) IN ('COMPLETED','DELIVERED','BILLED','PAID'))::int AS complete,
    count(*) FILTER (WHERE upper(COALESCE(status,'')) IN ('CANCELLED','NO_SHOW','MISSED','DENIED'))::int AS cancelled,
    count(*) FILTER (WHERE upper(COALESCE(status,'')) IN ('EN_ROUTE','ARRIVED','ARRIVED_PICKUP','PATIENT_ON_BOARD','IN_TRANSIT','DEPARTED','ARRIVED_DESTINATION'))::int AS active
    FROM matched`,args),
    query(`WITH matched AS (${matched}) SELECT counted_date AS day,count(*)::int AS count FROM matched GROUP BY counted_date ORDER BY counted_date`,args),
    query(`WITH matched AS (${matched}) SELECT upper(COALESCE(NULLIF(trim(status),''),'UNSPECIFIED')) AS status,count(*)::int AS count FROM matched GROUP BY 1 ORDER BY count DESC,status`,args),
    query(`WITH matched AS (${matched}) SELECT COALESCE(NULLIF(trim(service),''),'Unspecified') AS service,count(*)::int AS count FROM matched GROUP BY 1 ORDER BY count DESC,service LIMIT 12`,args),
    query(`WITH matched AS (${matched}) SELECT EXTRACT(DOW FROM counted_date)::int AS day,count(*)::int AS count FROM matched GROUP BY 1 ORDER BY 1`,args),
    query(`WITH matched AS (${matched}) SELECT EXTRACT(HOUR FROM counted_time)::int AS hour,count(*)::int AS count FROM matched WHERE counted_time IS NOT NULL GROUP BY 1 ORDER BY 1`,args),
    query(`WITH matched AS (${matched}) SELECT COALESCE(substring(destination from ',\\s*([^,]+),\\s*[A-Z]{2}(?:\\s+\\d{5})?\\s*$'),'Unspecified area') AS name,count(*)::int AS count FROM matched
    WHERE trim(COALESCE(destination,''))<>'' AND ($4::text IS NULL OR lower(regexp_replace(trim(destination),'\\s+',' ','g'))<>$4)
    GROUP BY 1 ORDER BY count DESC,name LIMIT 8`,[...args,ownAddress||null]),
    query(`WITH matched AS (${matched}) SELECT CASE WHEN days<=0 THEN '0' WHEN days=1 THEN '1' WHEN days=2 THEN '2' WHEN days BETWEEN 3 AND 7 THEN '3-7' WHEN days BETWEEN 8 AND 14 THEN '8-14' ELSE '15+' END AS bucket,count(*)::int AS count
    FROM (SELECT (trip_date-(created_at AT TIME ZONE 'America/New_York')::date) AS days FROM matched WHERE created_at IS NOT NULL) lead GROUP BY 1`,args)
   ]);
   const counts=totalsRows.rows[0]||{total:0,complete:0,cancelled:0,active:0};
   const total=counts.total,rate=value=>total?Math.round(value/total*1000)/10:0;
   const dayKey=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
   const byDay=new Map(dailyRows.rows.map(row=>[dayKey(row.day),Number(row.count)]));
   const daily=[];for(let cursor=Date.parse(from+'T12:00:00Z'),end=Date.parse(to+'T12:00:00Z');cursor<=end;cursor+=86400000){const day=new Date(cursor).toISOString().slice(0,10);daily.push({date:day,count:byDay.get(day)||0});}
   const fill=(rows,key,size)=>{const map=new Map(rows.map(row=>[Number(row[key]),Number(row.count)]));return Array.from({length:size},(_,index)=>({[key]:index,count:map.get(index)||0}));};
   const leadOrder=['0','1','2','3-7','8-14','15+'],leadMap=new Map(leadRows.rows.map(row=>[row.bucket,Number(row.count)]));
   return json(200,{...base,from,to,
    totals:{trips:total,completed:counts.complete,cancelled:counts.cancelled,pending:total-counts.complete-counts.cancelled-counts.active,active:counts.active,completionRate:rate(counts.complete),cancellationRate:rate(counts.cancelled)},
    daily,
    byStatus:statusRows.rows.map(row=>({status:row.status,count:Number(row.count)})),
    byServiceType:serviceRows.rows.map(row=>({service:row.service,count:Number(row.count)})),
    byDayOfWeek:fill(dowRows.rows,'day',7),
    byHourOfDay:fill(hourRows.rows,'hour',24),
    topDestinations:destinationRows.rows.map(row=>({name:row.name,count:Number(row.count)})),
    leadTimeDays:leadOrder.map(bucket=>({bucket,count:leadMap.get(bucket)||0})),
    updatedAt:new Date().toISOString()});
  }
  if(p[1]==='locations'&&method==='GET'){
   const locations=(await query(`WITH stops AS (
    SELECT b.reference,b.trip_date,trim(s.address) AS address,lower(regexp_replace(trim(s.address),'\\s+',' ','g')) AS address_key
    FROM bookings b CROSS JOIN LATERAL (VALUES(b.pickup),(b.destination)) s(address)
    WHERE b.facility_id=$1 AND ${realBooking} AND upper(b.status) IN ('COMPLETED','DELIVERED','BILLED','PAID') AND b.trip_date<=CURRENT_DATE AND trim(COALESCE(s.address,''))<>''
   ) SELECT min(address) AS address,count(DISTINCT reference)::int AS visits,max(trip_date) AS last_visit
   FROM stops WHERE address_key<>lower(regexp_replace(trim($2),'\\s+',' ','g'))
   GROUP BY address_key ORDER BY visits DESC,last_visit DESC,address LIMIT 50`,[id,facility.address||''])).rows;
   return json(200,{...base,locations,basis:'Completed transportation bookings, all time. Each location counts once per booking; the facility address is excluded.'});
  }
  const reference=clean(p[2]);
  if(!reference||reference.length>100)throw error('Choose a trip.');
  const booking=(await query(`SELECT b.reference,b.name,b.status FROM bookings b WHERE b.facility_id=$1 AND b.reference=$2 AND ${realBooking}`,[id,reference])).rows[0];
  if(!booking)throw error('Trip not found for this facility.',404);
  if(p[1]==='communications'&&method==='GET'){
   const through=new Date().toISOString();
   const [messages,activity]=await Promise.all([
    query('SELECT id,author_name,author_role,body,created_at FROM facility_portal_messages WHERE facility_id=$1 AND booking_reference=$2 ORDER BY created_at DESC,id DESC LIMIT 100',[id,reference]),
    query('SELECT id,status,status_label,created_at FROM trip_status_history WHERE booking_reference=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[reference])
   ]);
   return json(200,{booking,messages:messages.rows,activity:activity.rows,through});
  }
  if(p[1]==='communications'&&method==='POST'){
   const body=parseBody(event),text=clean(body.message),requestId=clean(body.requestId);
   if(!text||text.length>2000)throw error('Enter a message of 1–2,000 characters.');
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))throw error('A valid message request ID is required.');
   await query(`INSERT INTO facility_portal_messages(facility_id,booking_reference,author_id,author_name,author_role,body,request_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(author_id,request_id) DO NOTHING`,[id,reference,user.id,clean(user.display_name)||user.role,user.role,text,requestId]);
   const saved=(await query('SELECT id,facility_id,booking_reference,body FROM facility_portal_messages WHERE author_id=$1 AND request_id=$2',[user.id,requestId])).rows[0];
   if(saved?.facility_id!==id||saved?.booking_reference!==reference||saved?.body!==text)throw error('This request ID was already used for a different message.',409);
   return json(201,{id:saved.id,message:'Message saved to the shared facility and dispatch inbox.'});
  }
  if(p[1]==='read'&&method==='POST'){
   const through=clean(parseBody(event).through);
   if(!through||!Number.isFinite(Date.parse(through))||Date.parse(through)>Date.now()+1000)throw error('A valid inbox timestamp is required.');
   await query(`INSERT INTO facility_portal_reads(user_id,booking_reference,read_at) VALUES($1,$2,LEAST($3::timestamptz,now())) ON CONFLICT(user_id,booking_reference) DO UPDATE SET read_at=GREATEST(facility_portal_reads.read_at,EXCLUDED.read_at)`,[user.id,reference,through]);
   return json(200,{read:true});
  }
  return json(404,{error:'Facility operation not found.'});
 };
}
module.exports={createHandler,validDate};
