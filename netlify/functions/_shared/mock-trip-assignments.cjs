const isMock=booking=>[booking?.booking_source,booking?.bookingSource,booking?.status].some(value=>String(value||'').toUpperCase()==='MOCK');
function createHandler({getPool,requireUser,audit,json,parseBody,bearer}){
 return async(event,p,method)=>{
  if(p.join('/')!=='admin/mock-trip-assignments'||method!=='POST')return null;
  const actor=await requireUser(bearer(event),['ADMIN','DISPATCHER']),body=parseBody(event);
  const userCode=String(body.driverUserCode||'').trim().toUpperCase(),refs=body.references;
  if(!/^N\d{4,}$/.test(userCode)||!Array.isArray(refs)||!refs.length||refs.length>500||refs.some(ref=>typeof ref!=='string'||!ref||ref.length>100)||new Set(refs).size!==refs.length)return json(400,{error:'Supply a valid driver user code and 1–500 unique mock trip references.'});
  const client=await getPool().connect();let driver,rows;
  try{
   await client.query('BEGIN');
   driver=(await client.query("SELECT u.* FROM users u WHERE u.user_code=$1 AND u.active=true AND (u.role IN ('DRIVER','ADMIN') OR EXISTS(SELECT 1 FROM user_role_requests rr WHERE rr.user_id=u.id AND rr.role IN ('DRIVER','ADMIN') AND rr.status='APPROVED')) FOR UPDATE OF u",[userCode])).rows[0];
   if(!driver){await client.query('ROLLBACK');return json(404,{error:'An active account with approved Driver access was not found.'});}
   rows=(await client.query('SELECT * FROM bookings WHERE reference=ANY($1::text[]) ORDER BY reference FOR UPDATE',[refs])).rows;
   if(rows.length!==refs.length||rows.some(row=>!isMock(row)||row.duplicate_of)){await client.query('ROLLBACK');return json(409,{error:'Every selected trip must be an existing, non-duplicate MOCK trip. No assignments changed.'});}
   // The legacy name/scope trigger may resolve a different identity. Set the
   // verified immutable user key separately inside the same transaction.
   await client.query('UPDATE bookings SET driver_name=$2,driver_scope_id=$3,updated_at=now() WHERE reference=ANY($1::text[])',[refs,driver.display_name||driver.email,driver.scope_id||null]);
   await client.query('UPDATE bookings SET driver_user_id=$2 WHERE reference=ANY($1::text[])',[refs,driver.id]);
   const verified=(await client.query('SELECT reference,driver_user_id FROM bookings WHERE reference=ANY($1::text[])',[refs])).rows;
   if(verified.length!==refs.length||verified.some(row=>String(row.driver_user_id)!==String(driver.id)))throw Error('Mock driver assignment verification failed.');
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  await audit('MOCK_TRIPS',userCode,'DRIVER_ASSIGNED',{by:actor.user_code||actor.id,driverUserId:String(driver.id),references:refs,previous:rows.map(row=>({reference:row.reference,driverUserId:row.driver_user_id||null,driverName:row.driver_name||null}))});
  return json(200,{assigned:refs.length,driver:{id:String(driver.id),userCode:driver.user_code,name:driver.display_name||driver.email},references:refs,mockOnly:true,notifications:'No external messages sent.'});
 };
}
module.exports={isMock,createHandler};
