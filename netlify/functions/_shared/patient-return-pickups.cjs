function createHandler({query,requireUser,bearer,json,audit}){
 const project=row=>row?{reference:row.booking_reference,requestedAt:row.requested_at,acknowledgedAt:row.acknowledged_at||null,status:row.acknowledged_at?'ACKNOWLEDGED':'REQUESTED'}:null;
 return async function handle(event,p,method){
  const patient=p[0]==='patient'&&p[1]==='trips'&&p[2]&&p[3]==='return-pickup'&&p.length===4;
  const dispatch=p[0]==='dispatch'&&p[1]==='return-pickups'&&p.length<=3;
  if(!patient&&!dispatch)return null;
  if(patient){
   if(!['GET','POST'].includes(method))return json(405,{error:'Method not allowed'});
   const u=await requireUser(bearer(event),['PATIENT']);
   const ref=decodeURIComponent(p[2]);
   // Explicit ownership required for mutations; legacy contact matching is not sufficient.
   const booking=await query('SELECT reference FROM bookings WHERE reference=$1 AND patient_user_id=$2::uuid AND duplicate_of IS NULL',[ref,u.id]);
   if(!booking.rows[0])return json(404,{error:'Ride not found'});
   if(method==='POST'){
    const created=await query(`INSERT INTO patient_return_pickups(booking_reference,requested_by)
      SELECT reference,$2::uuid FROM bookings WHERE reference=$1 AND patient_user_id=$2::uuid AND duplicate_of IS NULL
      AND upper(trip_type)='ROUND_TRIP' AND return_trip_time IS NULL
      AND COALESCE(return_trip_date,trip_date)=(now() AT TIME ZONE 'America/New_York')::date
      AND upper(status) IN ('ARRIVED','IN_TRANSIT','COMPLETED','DELIVERED')
      ON CONFLICT(booking_reference) DO NOTHING RETURNING *`,[ref,u.id]);
    if(created.rows[0]){
     await audit('BOOKING',ref,'RETURN_PICKUP_REQUESTED',{actor:u.id});
     return json(201,{request:project(created.rows[0])});
    }
   }
   const existing=await query('SELECT r.* FROM patient_return_pickups r JOIN bookings b ON b.reference=r.booking_reference WHERE r.booking_reference=$1 AND b.patient_user_id=$2::uuid',[ref,u.id]);
   if(method==='POST'&&!existing.rows[0])return json(409,{error:'This ride is not eligible for a will-call pickup. Please contact dispatch.'});
   return json(200,{request:project(existing.rows[0])});
  }
  const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);
  if(method==='GET'&&p.length===2){
   const result=await query(`SELECT r.* FROM patient_return_pickups r JOIN bookings b ON b.reference=r.booking_reference
    WHERE r.acknowledged_at IS NULL AND upper(b.status) NOT IN ('CANCELLED','NO_SHOW') ORDER BY r.requested_at ASC LIMIT 500`);
   return json(200,{requests:result.rows.map(project)});
  }
  if(method==='PATCH'&&p.length===3){
   const ref=decodeURIComponent(p[2]);
   const result=await query(`UPDATE patient_return_pickups r SET acknowledged_at=now(),acknowledged_by=$2::uuid
    FROM bookings b WHERE r.booking_reference=$1 AND b.reference=r.booking_reference AND r.acknowledged_at IS NULL
    AND upper(b.status) NOT IN ('CANCELLED','NO_SHOW') RETURNING r.*`,[ref,u.id]);
   if(result.rows[0]){await audit('BOOKING',ref,'RETURN_PICKUP_ACKNOWLEDGED',{actor:u.id});return json(200,{request:project(result.rows[0])});}
   const existing=await query('SELECT * FROM patient_return_pickups WHERE booking_reference=$1',[ref]);
   if(existing.rows[0]?.acknowledged_at)return json(200,{request:project(existing.rows[0])});
   return json(409,{error:'No actionable pickup request found'});
  }
  return json(405,{error:'Method not allowed'});
 };
}
module.exports={createHandler};
