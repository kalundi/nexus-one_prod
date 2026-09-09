const {query}=require('./db.cjs');
const {requireUser}=require('./auth.cjs');
const {json,parseBody,bearer}=require('./http.cjs');
const fail=message=>{throw Object.assign(new Error(message),{statusCode:400})};
function field(body,key,max=500){const value=typeof body[key]==='string'?body[key].trim():'';if(!value||value.length>max)fail(`Enter a valid ${key} (up to ${max} characters)`);return value;}
function service(body){const value=field(body,'service');if(!['AMBULATORY','WHEELCHAIR','STRETCHER'].includes(value))fail('Select a valid transportation service');return value;}
function notes(body){const value=String(body.notes||'').trim();if(value.length>2000)fail('Notes must be 2,000 characters or fewer');return value;}
function date(body){const value=field(body,'date',10);const parsed=new Date(`${value}T12:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value||value<new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()))fail('Choose today or a future date');return value;}
function time(body,key){const value=field(body,key,5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail('Enter a valid time');return value;}
function createCaretakerHandler(deps={query,requireUser}){return async(event,p)=>{
 const me=await deps.requireUser(bearer(event));
 const method=event.httpMethod;
 if(p.length===1&&method==='GET'){
  const patients=await deps.query('SELECT * FROM caretaker_patients WHERE owner_id=$1 ORDER BY name,id',[me.id]);
  const plans=await deps.query("SELECT p.*,to_char(p.trip_date,'YYYY-MM-DD') AS date,c.name,c.phone FROM caretaker_plans p JOIN caretaker_patients c ON c.id=p.patient_id AND c.owner_id=p.owner_id WHERE p.owner_id=$1 ORDER BY p.trip_date,p.trip_time,p.id",[me.id]);
  return json(200,{patients:patients.rows,plans:plans.rows});
 }
 if(p.length===2&&p[1]==='patients'&&method==='POST'){
  const b=parseBody(event);if(b.consent!==true)fail('Confirm that you are authorized to arrange transportation for this patient');
  const name=field(b,'name',120),phone=field(b,'phone',30);if(!/^\+?[\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<10)fail('Enter a valid contact phone number');
  const result=await deps.query('INSERT INTO caretaker_patients(owner_id,name,phone,relationship,pickup,service,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[me.id,name,phone,field(b,'relationship',100),field(b,'pickup'),service(b),notes(b)]);
  return json(201,{patient:result.rows[0]});
 }
 if(p.length===2&&p[1]==='plans'&&method==='POST'){
  const b=parseBody(event),patientId=field(b,'patientId',36);if(!/^[0-9a-f-]{36}$/i.test(patientId))fail('Select a patient');
  const values=[me.id,patientId,field(b,'pickup'),field(b,'destination'),date(b),time(b,'time'),time(b,'appointmentTime'),service(b),notes(b)];
  if(values[6]<values[5])fail('Appointment time must be at or after pickup time');
  const result=await deps.query(`INSERT INTO caretaker_plans(owner_id,patient_id,pickup,destination,trip_date,trip_time,appointment_time,service,notes)
   SELECT $1,id,$3,$4,$5,$6,$7,$8,$9 FROM caretaker_patients WHERE id=$2 AND owner_id=$1 RETURNING *`,values);
  return result.rows[0]?json(201,{plan:result.rows[0]}):json(404,{error:'Patient not found'});
 }
 if(p.length===3&&['patients','plans'].includes(p[1])&&method==='DELETE'){
  if(!/^[0-9a-f-]{36}$/i.test(p[2]))fail('Invalid record');
  const table=p[1]==='patients'?'caretaker_patients':'caretaker_plans';
  const result=await deps.query(`DELETE FROM ${table} WHERE id=$1 AND owner_id=$2 RETURNING id`,[p[2],me.id]);
  return result.rows[0]?json(200,{ok:true}):json(404,{error:'Record not found'});
 }
 return json(404,{error:'Not found'});
};}
module.exports={createCaretakerHandler,handleCaretaker:createCaretakerHandler()};
