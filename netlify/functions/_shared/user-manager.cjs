const {json,parseBody,bearer}=require('./http.cjs');
const {normalizeE164}=require('./phone.cjs');
const DemoAccount=require('./facility-demo-account.cjs');
const {requireActiveFacility}=require('./facility-access.cjs');
const MockDriverPractice=require('./mock-driver-practice.cjs');
const ROLES=['ADMIN','DISPATCHER','DRIVER','FACILITY','STAFF','BILLING','QA','EXECUTIVE','PATIENT','CARETAKER'];
const FUNCTIONS={ADMINISTRATION:'Administration',DISPATCH:'Dispatch',DRIVING:'Driving',PATIENT_CARE:'Patient care',FACILITY_COORDINATION:'Facility coordination',BILLING:'Billing',QUALITY_REVIEW:'Quality review',OPERATIONS:'Operations',CARE_SUPPORT:'Care support'};
const clean=v=>String(v??'').trim();
const dateValue=v=>v instanceof Date?v.toISOString().slice(0,10):clean(v).slice(0,10);
function operatingClock(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const date=`${parts.year}-${parts.month}-${parts.day}`,time=`${parts.hour}:${parts.minute}`;
 return {date,time,weekday:new Date(`${date}T12:00:00Z`).getUTCDay()||7};
}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(`${v}T12:00:00Z`))&&new Date(`${v}T12:00:00Z`).toISOString().slice(0,10)===v;}
function parseSchedule(body){
 const startTime=clean(body.startTime),endTime=clean(body.endTime),effectiveStartDate=clean(body.effectiveStartDate)||operatingClock().date,effectiveEndDate=clean(body.effectiveEndDate)||null;
 const weekdays=Array.isArray(body.weekdays)?[...new Set(body.weekdays.map(Number))].sort((a,b)=>a-b):[];
 const fail=message=>{throw Object.assign(new Error(message),{statusCode:400});};
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||endTime<=startTime)fail('Choose valid shift times; end time must be later on the same day.');
 if(!validDate(effectiveStartDate)||(effectiveEndDate&&(!validDate(effectiveEndDate)||effectiveEndDate<effectiveStartDate)))fail('Choose valid effective dates; the end date must be on or after the start date.');
 if(!weekdays.length||weekdays.some(day=>!Number.isInteger(day)||day<1||day>7))fail('Select at least one valid weekday.');
 return {startTime,endTime,effectiveStartDate,effectiveEndDate,weekdays};
}
function mapUser(u){const demoOnly=DemoAccount.isDemoUser(u),roles=demoOnly?['FACILITY']:[...new Set([u.role,...(u.approved_roles||[]),'PATIENT'])];return {id:String(u.id),userCode:u.user_code,email:u.email,name:u.display_name,phone:u.phone||'',role:u.role,scopeId:u.scope_id||'',demoOnly,loginUrl:demoOnly?'/facility-demo.html':null,functions:u.functions||[],roles:roles.includes('ADMIN')?ROLES:roles,active:u.active,employeeActive:u.employee_active??null,createdAt:u.created_at};}
function createUserManager({query,getPool,requireUser,audit}){
 async function transaction(work){
  const client=await getPool().connect();
  try{await client.query('BEGIN');const result=await work(client.query.bind(client));await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function findUser(q,key,lock=false){return (await q(`SELECT * FROM users WHERE id::text=$1 OR user_code=upper($1) OR lower(email)=lower($1) ${lock?'FOR UPDATE':''}`,[key])).rows[0];}
 async function ensureEmployee(q,user){
  const found=await q('SELECT * FROM employees WHERE user_id=$1 OR lower(email)=lower($2) ORDER BY user_id NULLS LAST,created_at LIMIT 1 FOR UPDATE',[user.id,user.email]);
  if(found.rows[0]){
   const employee=found.rows[0];
   if(employee.user_id&&String(employee.user_id)!==String(user.id))throw Object.assign(new Error('This workforce profile belongs to another account.'),{statusCode:409});
   return (await q(`UPDATE employees SET user_id=$2,role='DRIVER',display_name=$3,email=$4,phone=$5,updated_at=now() WHERE id=$1 RETURNING *`,[employee.id,user.id,user.display_name,user.email,user.phone])).rows[0];
  }
  return (await q(`INSERT INTO employees(user_id,employee_code,role,display_name,email,phone,active,timezone) VALUES($1,$2,'DRIVER',$3,$4,$5,true,'America/New_York') RETURNING *`,[user.id,user.user_code,user.display_name,user.email,user.phone])).rows[0];
 }
 async function schedules(event){
  const params=event.queryStringParameters||{},key=clean(params.driverId||params.driverEmail),activeOnly=params.activeOnly!=='false';
  const rows=await query(`SELECT e.id AS employee_id,e.employee_code,e.display_name,e.email,e.role,u.id AS user_id,u.user_code,
   (e.active AND COALESCE(u.active,false)) AS account_active,es.id AS shift_id,es.assignment_role,es.weekday_iso,
   es.start_time::text,es.end_time::text,es.effective_start_date,es.effective_end_date,es.active,es.notes,es.updated_at
   FROM employees e JOIN employee_shifts es ON es.employee_id=e.id LEFT JOIN users u ON e.user_id=u.id
   WHERE es.assignment_role='DRIVER' AND ($1='' OR u.id::text=$1 OR u.user_code=upper($1) OR lower(e.email)=lower($1))
   AND (NOT $2::boolean OR (es.active=true AND (es.effective_end_date IS NULL OR es.effective_end_date >= $3::date)))
   ORDER BY e.display_name,es.effective_start_date DESC,es.weekday_iso,es.start_time LIMIT 2000`,[key,activeOnly,operatingClock().date]);
  return json(200,{schedules:rows.rows.map(r=>({...r,effective_start_date:dateValue(r.effective_start_date),effective_end_date:r.effective_end_date?dateValue(r.effective_end_date):null}))});
 }
 async function saveSchedule(body,me){
  const key=clean(body.driverId||body.driverEmail),spec=parseSchedule(body),shiftIds=Array.isArray(body.shiftIds)?[...new Set(body.shiftIds.map(String))]:[];
  if(!key)return json(400,{error:'Select a driver.'});
  const saved=await transaction(async q=>{
   const user=await findUser(q,key,true);if(!user)throw Object.assign(new Error('Driver account not found.'),{statusCode:404});
   const driverAccess=user.role==='DRIVER'||(await q("SELECT 1 FROM user_role_requests WHERE user_id=$1 AND role='DRIVER' AND status='APPROVED'",[user.id])).rows.length>0;
   if(!driverAccess)throw Object.assign(new Error('This user does not have driver access.'),{statusCode:409});
   const employee=await ensureEmployee(q,user);
   if(shiftIds.length){
    const selected=await q("SELECT id FROM employee_shifts WHERE employee_id=$1 AND assignment_role='DRIVER' AND id::text=ANY($2::text[]) FOR UPDATE",[employee.id,shiftIds]);
    if(selected.rows.length!==shiftIds.length)throw Object.assign(new Error('The selected schedule has changed. Refresh and try again.'),{statusCode:409});
   }
   // Revise only the selected pattern; adding coverage preserves every existing schedule.
   if(shiftIds.length)await q(`UPDATE employee_shifts SET
    active=CASE WHEN effective_start_date >= $2::date THEN false ELSE active END,
    effective_end_date=CASE WHEN effective_start_date < $2::date THEN LEAST(COALESCE(effective_end_date,$2::date-1),$2::date-1) ELSE effective_end_date END,updated_at=now()
    WHERE employee_id=$1 AND assignment_role='DRIVER' AND active=true
    AND id::text=ANY($3::text[]) AND (effective_end_date IS NULL OR effective_end_date >= $2::date)`,[employee.id,spec.effectiveStartDate,shiftIds]);
   const overlaps=await q(`SELECT 1 FROM employee_shifts WHERE employee_id=$1 AND assignment_role='DRIVER' AND active=true
    AND weekday_iso=ANY($2::int[]) AND start_time < $4::time AND end_time > $3::time
    AND effective_start_date <= COALESCE($6::date,'infinity'::date) AND COALESCE(effective_end_date,'infinity'::date) >= $5::date LIMIT 1`,[employee.id,spec.weekdays,spec.startTime,spec.endTime,spec.effectiveStartDate,spec.effectiveEndDate]);
   if(overlaps.rows.length)throw Object.assign(new Error('This shift overlaps another active schedule. Edit that schedule or choose another time.'),{statusCode:409});
   const created=[];
   for(const day of spec.weekdays){created.push((await q(`INSERT INTO employee_shifts(employee_id,assignment_role,weekday_iso,start_time,end_time,effective_start_date,effective_end_date,active,notes)
    VALUES($1,'DRIVER',$2,$3::time,$4::time,$5::date,$6::date,true,$7)
    ON CONFLICT(employee_id,assignment_role,weekday_iso,start_time,end_time,effective_start_date)
    DO UPDATE SET active=true,effective_end_date=EXCLUDED.effective_end_date,notes=EXCLUDED.notes,updated_at=now() RETURNING *`,[employee.id,day,spec.startTime,spec.endTime,spec.effectiveStartDate,spec.effectiveEndDate,`Updated by ${me.user_code||me.email}`])).rows[0]);}
   return {driver:mapUser(user),schedule:{...spec,created}};
  });
  await audit('USER',saved.driver.id,'SCHEDULE_UPDATED',{userCode:saved.driver.userCode,...spec,by:me.user_code||me.email});
  return json(200,{ok:true,...saved});
 }
 async function toggleSchedule(body,me){
  const ids=Array.isArray(body.shiftIds)?[...new Set(body.shiftIds.map(String))]:[];
  if(!ids.length||ids.length>7||typeof body.active!=='boolean')return json(400,{error:'Select a schedule and its active status.'});
  const result=await transaction(async q=>{
   const first=await q('SELECT employee_id FROM employee_shifts WHERE id::text=$1',[ids[0]]);
   if(!first.rows.length)throw Object.assign(new Error('Schedule not found.'),{statusCode:404});
   const employeeId=first.rows[0].employee_id;
   await q('SELECT id FROM employees WHERE id=$1 FOR UPDATE',[employeeId]);
   const found=await q("SELECT * FROM employee_shifts WHERE employee_id=$1 AND assignment_role='DRIVER' AND id::text=ANY($2::text[]) FOR UPDATE",[employeeId,ids]);
   if(found.rows.length!==ids.length)throw Object.assign(new Error('Select shifts from the same driver.'),{statusCode:400});
   if(body.active){
    if(found.rows.some(r=>r.effective_end_date&&dateValue(r.effective_end_date)<operatingClock().date))throw Object.assign(new Error('This schedule has ended. Edit its effective dates to use it again.'),{statusCode:409});
    const conflicts=await q(`SELECT 1 FROM employee_shifts other JOIN employee_shifts selected ON selected.employee_id=other.employee_id
     AND selected.weekday_iso=other.weekday_iso AND selected.start_time<other.end_time AND selected.end_time>other.start_time
     AND selected.effective_start_date<=COALESCE(other.effective_end_date,'infinity'::date) AND COALESCE(selected.effective_end_date,'infinity'::date)>=other.effective_start_date
     WHERE selected.id::text=ANY($1::text[]) AND other.active=true AND other.id::text<>ALL($1::text[]) LIMIT 1`,[ids]);
    if(conflicts.rows.length)throw Object.assign(new Error('Another active schedule covers these times. Edit or deactivate it first.'),{statusCode:409});
   }
   await q('UPDATE employee_shifts SET active=$2,updated_at=now() WHERE id::text=ANY($1::text[])',[ids,body.active]);
   return {employeeId,shiftIds:ids,active:body.active};
  });
  await audit('EMPLOYEE',result.employeeId,body.active?'SCHEDULE_ACTIVATED':'SCHEDULE_DEACTIVATED',{...result,by:me.user_code||me.email});
  return json(200,{ok:true,...result});
 }
 async function updateUser(key,body,me){
  const allowed=['name','phone','role','scopeId','functions','active'];
  if(!allowed.some(k=>Object.hasOwn(body,k)))return json(400,{error:'No account changes supplied.'});
  if(Object.hasOwn(body,'active')&&typeof body.active!=='boolean')return json(400,{error:'Active status must be true or false.'});
  if(Object.hasOwn(body,'name')&&(!clean(body.name)||clean(body.name).length>160))return json(400,{error:'Enter a name of up to 160 characters.'});
  if(Object.hasOwn(body,'phone')&&!normalizeE164(body.phone))return json(400,{error:'Enter a valid international phone number.'});
  if(Object.hasOwn(body,'role')&&!ROLES.includes(body.role))return json(400,{error:'Choose a valid role.'});
  if(Object.hasOwn(body,'functions')&&(!Array.isArray(body.functions)||body.functions.some(f=>!Object.hasOwn(FUNCTIONS,f))))return json(400,{error:'Choose valid operational functions.'});
  const user=await transaction(async q=>{
   const current=await findUser(q,key,true);if(!current)throw Object.assign(new Error('User not found.'),{statusCode:404});
   if(DemoAccount.isDemoUser(current)&&((body.role&&body.role!=='FACILITY')||(Object.hasOwn(body,'scopeId')&&body.scopeId!==DemoAccount.SCOPE)))throw Object.assign(Error('This presentation account must retain its demo-only facility role and scope.'),{statusCode:400});
   if(String(current.id)===String(me.id)&&(body.active===false||(body.role&&body.role!==current.role)))throw Object.assign(new Error('Use another administrator account to change your own access.'),{statusCode:409});
   const next={...current,display_name:Object.hasOwn(body,'name')?clean(body.name):current.display_name,phone:Object.hasOwn(body,'phone')?normalizeE164(body.phone):current.phone,role:body.role||current.role,
    scope_id:Object.hasOwn(body,'scopeId')?clean(body.scopeId)||null:current.scope_id,functions:body.functions?[...new Set(body.functions)]:current.functions,active:body.active??current.active};
   if(next.role==='DRIVER'&&!next.scope_id)next.scope_id=(await q("SELECT scope_id FROM user_role_requests WHERE user_id=$1 AND role='DRIVER' AND status='APPROVED' LIMIT 1",[current.id])).rows[0]?.scope_id||current.user_code;
   if(next.role==='FACILITY'&&next.active&&!DemoAccount.isDemoUser(current))await requireActiveFacility(q,next.scope_id);
   const changed=(await q('UPDATE users SET display_name=$2,phone=$3,role=$4,scope_id=$5,functions=$6,active=$7,updated_at=now() WHERE id=$1 RETURNING *',[current.id,next.display_name,next.phone,next.role,next.scope_id,next.functions,next.active])).rows[0];
   // Also update approved scopes and every live session's access on its next request.
   if(next.role===current.role&&next.scope_id!==current.scope_id)await q("UPDATE user_role_requests SET scope_id=$3 WHERE user_id=$1 AND role=$2 AND status='APPROVED'",[current.id,next.role,next.scope_id]);
   if(!next.active)await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[current.id]);
   if(DemoAccount.isDemoUser(current)&&Object.hasOwn(body,'active'))await DemoAccount.revokeDemoSessions(q);
   if(Object.hasOwn(body,'active'))await q('UPDATE employees SET active=$2,updated_at=now() WHERE user_id=$1',[current.id,next.active]);
   if(next.role!==current.role&&current.role!=='PATIENT')await q("UPDATE user_role_requests SET status='REJECTED',reviewed_at=now() WHERE user_id=$1 AND role=$2 AND status='APPROVED'",[current.id,current.role]);
   await q('UPDATE employees SET display_name=$2,email=$3,phone=$4,updated_at=now() WHERE user_id=$1',[current.id,next.display_name,next.email,next.phone]);
   if(next.role==='DRIVER')await ensureEmployee(q,changed);
   return mapUser(changed);
  });
  await audit('USER',user.id,Object.hasOwn(body,'active')?(user.active?'ACTIVATED':'DEACTIVATED'):'PROFILE_UPDATED',{userCode:user.userCode,changes:body,by:me.user_code||me.email});
  return json(200,{user});
 }
 return async function handle(event,p,method){
  if(p[0]==='driver'&&p[1]==='schedule'&&method==='GET'){
   const me=await requireUser(bearer(event),['DRIVER','ADMIN']);
   const clock=operatingClock();
   const coverage=await query(`SELECT es.*,e.active AS employee_active FROM employees e JOIN employee_shifts es ON es.employee_id=e.id
    WHERE e.user_id=$1 AND e.role='DRIVER' AND es.assignment_role='DRIVER' AND es.active=true
    AND es.weekday_iso=$2 AND es.start_time<=$3::time AND es.end_time>$3::time AND es.effective_start_date<=$4::date
    AND (es.effective_end_date IS NULL OR es.effective_end_date>=$4::date) ORDER BY es.start_time LIMIT 1`,[me.id,clock.weekday,clock.time,clock.date]);
   const shift=coverage.rows[0];
   let mockPracticeAvailable=false;
   if(MockDriverPractice.canPractice(me)){
    const assignedMock=await query(`SELECT EXISTS(SELECT 1 FROM bookings WHERE driver_user_id=$1 AND (upper(booking_source)='MOCK' OR upper(status)='MOCK')) AS available`,[me.id]);
    mockPracticeAvailable=assignedMock.rows[0]?.available===true;
   }
   return json(200,{userCode:me.user_code,available:!!shift?.employee_active,mockPracticeAvailable,...(mockPracticeAvailable?{mockPracticeLabel:'Mock troubleshooting available anytime'}:{}),date:clock.date,time:clock.time,timezone:'America/New_York',shift:shift?{startTime:String(shift.start_time).slice(0,5),endTime:String(shift.end_time).slice(0,5)}:null});
  }
  if(p[0]!=='admin')return null;
  if(p[1]==='users'&&p.length===4&&p[3]==='demo-password'&&method==='POST'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const issued=await transaction(q=>DemoAccount.issuePassword(q,decodeURIComponent(p[2])));
   await audit('USER',p[2],'CREDENTIALS_REISSUED',{email:issued.email,demoOnly:true,by:me.user_code||me.email});
   return json(200,issued);
  }
  if(p[1]==='driver-schedule'&&p.length===2){
   const me=await requireUser(bearer(event),method==='GET'?['ADMIN','DISPATCHER']:['ADMIN']);
   if(method==='GET')return schedules(event);
   if(method==='POST')return saveSchedule(parseBody(event),me);
   if(method==='PATCH')return toggleSchedule(parseBody(event),me);
  }
  if(p[1]==='users'&&method==='GET'&&p.length===2){
   await requireUser(bearer(event),['ADMIN']);
   const r=await query(`SELECT u.*,(SELECT e.active FROM employees e WHERE e.user_id=u.id) AS employee_active,COALESCE((SELECT array_agg(rr.role ORDER BY rr.role) FROM user_role_requests rr WHERE rr.user_id=u.id AND rr.status='APPROVED'),'{}') AS approved_roles FROM users u ORDER BY u.display_name,u.created_at LIMIT 5000`);
   return json(200,{users:r.rows.map(mapUser),functions:FUNCTIONS});
  }
  if(p[1]==='users'&&p.length===3&&method==='PATCH')return updateUser(decodeURIComponent(p[2]),parseBody(event),await requireUser(bearer(event),['ADMIN']));
  return null;
 };
}
module.exports={createUserManager,parseSchedule,operatingClock,FUNCTIONS,ROLES};
