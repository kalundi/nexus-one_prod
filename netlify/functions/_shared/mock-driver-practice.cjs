const {isMock}=require('./mock-trip-assignments.cjs');
const STEPS=['MOCK','ACCEPTED','EN_ROUTE','ARRIVED_PICKUP','PATIENT_READY','PATIENT_ON_BOARD','DEPARTED','ARRIVED_DESTINATION','DELIVERED','COMPLETED'];
function canPractice(user){return String(user?.user_code||user?.userCode||'').toUpperCase()==='N5289'&&user?.active!==false&&(user?.role==='ADMIN'||(user?.available_roles||user?.roles||[]).includes('ADMIN'));}
function createHandler({getPool,requireUser,audit,json,parseBody,bearer}){
 return async(event,p,method)=>{
  if(!(p.length===4&&p[0]==='driver'&&p[1]==='mock-trips'&&p[3]==='workflow'))return null;
  if(method!=='POST')return json(405,{error:'Use POST for mock workflow actions.'});
  const user=await requireUser(bearer(event),['DRIVER','ADMIN']);
  if(!canPractice(user))return json(403,{error:'Mock troubleshooting access is not enabled for this account.'});
  const body=parseBody(event),status=String(body.status||'').toUpperCase(),expected=String(body.expectedStatus||'').toUpperCase();
  if(![...STEPS,'RESET','NO_SHOW'].includes(status)||![...STEPS,'NO_SHOW'].includes(expected))return json(400,{error:'Supply a supported mock action and its expected current status.'});
  const reference=decodeURIComponent(p[2]),client=await getPool().connect();let workflow,changed=false;
  try{
   await client.query('BEGIN');
   const booking=(await client.query('SELECT * FROM bookings WHERE reference=$1 FOR UPDATE',[reference])).rows[0];
   if(!booking){await client.query('ROLLBACK');return json(404,{error:'Mock assignment not found.'});}
   if(!isMock(booking)||String(booking.driver_user_id)!==String(user.id)){await client.query('ROLLBACK');return json(403,{error:'Only your assigned MOCK trips can use this workflow.'});}
   const saved=booking.timing_plan?.mockDriverWorkflow,current=saved?.status||'MOCK';
   workflow=saved||{status:'MOCK',history:[]};
   if(expected!==current&&status!==current){await client.query('ROLLBACK');return json(409,{error:'Mock progress changed. Refresh the trip before continuing.',workflow});}
   if(status!==current){
    const currentIndex=STEPS.indexOf(current);
    const valid=status==='RESET'||(status==='NO_SHOW'&&['ARRIVED_PICKUP','PATIENT_READY'].includes(current))||(currentIndex>=0&&STEPS[currentIndex+1]===status);
    if(!valid){await client.query('ROLLBACK');return json(409,{error:'Complete the current mock workflow step first.',workflow});}
    const at=new Date().toISOString(),next=status==='RESET'?'MOCK':status;
    workflow={status:next,updatedAt:at,simulated:true,actorUserCode:user.user_code||user.userCode,history:[...(saved?.history||[]).slice(-49),{from:current,to:next,at,action:status}],...(status!=='RESET'&&saved?.patientReadyAt?{patientReadyAt:saved.patientReadyAt}:{}),...(status==='PATIENT_READY'?{patientReadyAt:at}:{})};
    await client.query("UPDATE bookings SET timing_plan=jsonb_set(COALESCE(timing_plan,'{}'::jsonb),'{mockDriverWorkflow}',$2::jsonb),updated_at=now() WHERE reference=$1",[reference,JSON.stringify(workflow)]);
    changed=true;
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  if(changed)await audit('MOCK_TRIP',reference,'PRACTICE_STEP',{by:user.user_code||user.id,status:workflow.status});
  return json(200,{workflow,mockOnly:true,message:'Mock progress saved. No live trip messages, payments or billing were triggered.'});
 };
}
module.exports={canPractice,createHandler,STEPS};
