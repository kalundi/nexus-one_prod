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
  const facilities=(await query(`SELECT facility_code AS id,name,address FROM facilities WHERE active=true${isManager?' AND facility_code=$1':''} ORDER BY name`,isManager?[user.scope_id]:[])).rows;
  if(isManager&&!facilities.length)throw error('Your assigned facility is inactive or unavailable. Contact Nexus.',409);
  if(p[1]==='context'&&method==='GET')return json(200,{facilities,manager:isManager,today:easternDate()});
  const id=isManager?clean(user.scope_id):clean(params.facility);
  if(isManager&&params.facility&&params.facility!==id)throw error('This facility is outside your account.',403);
  const facility=facilities.find(f=>f.id===id);
  if(!facility)throw error(isManager?'Your assigned facility is inactive or unavailable.':'Select an active facility.',409);
  const base={facility,bookingUrl:'/booking-app.html?facility='+encodeURIComponent(id)};
  if(p[1]==='trips'&&method==='GET'){
   const date=clean(params.date)||easternDate(),page=Number(params.page||0);
   if(!validDate(date)||!Number.isInteger(page)||page<0||page>10000)throw error('Choose a valid service day and page.');
   const rows=(await query(`SELECT b.reference,b.name,b.service,b.pickup,b.destination,b.trip_date,b.trip_time,booking_appointment_time(b.notes) AS appointment_time,b.status,b.payment_status,b.driver_name,b.vehicle_unit,b.trip_type,b.return_trip_date,b.return_trip_time,b.updated_at,
    (SELECT count(*)::int FROM facility_portal_messages m WHERE m.facility_id=$1 AND m.booking_reference=b.reference AND m.author_id<>$4::uuid AND m.created_at>COALESCE((SELECT r.read_at FROM facility_portal_reads r WHERE r.user_id=$4::uuid AND r.booking_reference=b.reference),'-infinity'::timestamptz)) AS unread
    FROM bookings b WHERE b.facility_id=$1 AND ${realBooking} AND (b.trip_date=$2::date OR b.return_trip_date=$2::date) ORDER BY b.trip_time,b.reference LIMIT 101 OFFSET $3`,[id,date,page*100,user.id])).rows;
   return json(200,{...base,date,page,hasMore:rows.length>100,trips:rows.slice(0,100),updatedAt:new Date().toISOString()});
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
