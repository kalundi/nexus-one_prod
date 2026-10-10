const {query}=require('./db.cjs');
const {requireUser}=require('./auth.cjs');
const {json,bearer,parseBody}=require('./http.cjs');
const error=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
// Linked rides use explicit patient approval. Profiles created by the caretaker
// confer access only to bookings actually created for that profile.
const patientMatch=`(b.caretaker_subject_id=u.id OR (b.caretaker_subject_id IS NULL AND (lower(b.email)=lower(u.email) OR (length(regexp_replace(coalesce(u.phone,''),'\\D','','g'))>=10 AND right(regexp_replace(b.phone,'\\D','','g'),10)=right(regexp_replace(u.phone,'\\D','','g'),10)))))`;
const accessWhere=`((b.caretaker_owner_id=$1 AND b.caretaker_subject_id IS NULL) OR EXISTS(SELECT 1 FROM caretaker_access a JOIN users u ON u.id=a.patient_id WHERE a.caretaker_id=$1 AND a.status='APPROVED' AND u.active=true AND ${patientMatch}))`;
async function listTrips(userId,run=query){return (await run(`SELECT b.* FROM bookings b WHERE b.duplicate_of IS NULL AND ${accessWhere} ORDER BY b.trip_date DESC,b.trip_time DESC LIMIT 250`,[userId])).rows;}
async function getTrip(userId,reference,run=query){const row=(await run(`SELECT b.* FROM bookings b WHERE b.reference=$2 AND ${accessWhere}`,[userId,reference])).rows[0];if(!row)throw error(404,'Trip not found or patient access has been revoked');return row;}
async function bookingSubject(user,body,run=query){
 if(!body.caretakerPatientId&&!body.caretakerSubjectId)return null;
 if(!user)throw error(401,'Sign in to book for a patient');
 if(body.caretakerSubjectId){
  const patient=(await run("SELECT u.* FROM caretaker_access a JOIN users u ON u.id=a.patient_id WHERE a.caretaker_id=$1 AND a.patient_id=$2 AND a.status='APPROVED' AND u.active=true",[user.id,body.caretakerSubjectId])).rows[0];
  if(!patient)throw error(403,'Patient access is not approved');
  body.name=patient.display_name;body.phone=patient.phone;body.email=patient.email;
  return {ownerId:user.id,subjectId:patient.id,profileId:null};
 }
 const patient=(await run('SELECT * FROM caretaker_patients WHERE id=$1 AND owner_id=$2',[body.caretakerPatientId,user.id])).rows[0];
 if(!patient)throw error(403,'Patient profile not found');
 body.name=patient.name;body.phone=patient.phone;
 return {ownerId:user.id,profileId:patient.id,subjectId:null};
}
async function alertRecipients(reference,run=query){return (await run(`SELECT DISTINCT u.email,u.phone FROM bookings b JOIN caretaker_patients p ON p.id=b.caretaker_patient_id JOIN users u ON u.id=b.caretaker_owner_id WHERE b.reference=$1 AND b.caretaker_subject_id IS NULL AND p.alerts_enabled=true AND u.active=true
 UNION SELECT DISTINCT c.email,c.phone FROM bookings b JOIN caretaker_access a ON a.status='APPROVED' AND a.alerts_enabled=true JOIN users u ON u.id=a.patient_id JOIN users c ON c.id=a.caretaker_id WHERE b.reference=$1 AND u.active=true AND c.active=true AND ${patientMatch}`,[reference])).rows;}
async function accessRoutes(event,p){
 const me=await requireUser(bearer(event)),method=event.httpMethod;
 if(p[1]==='access'&&method==='GET'){
  const records=await query(`SELECT a.id,a.status,a.alerts_enabled,a.patient_id,u.display_name AS name,CASE WHEN a.status='APPROVED' THEN u.phone ELSE NULL END AS phone,CASE WHEN a.status='APPROVED' THEN u.email ELSE NULL END AS email FROM caretaker_access a JOIN users u ON u.id=a.patient_id WHERE a.caretaker_id=$1`,[me.id]);return json(200,{patients:records.rows});
 }
 if(p[1]==='access'&&method==='POST'){
  const b=parseBody(event);if(typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email))throw error(400,'Enter the patient account email');
  await query(`INSERT INTO caretaker_access(caretaker_id,patient_id) SELECT $1,id FROM users WHERE lower(email)=lower($2) AND id<>$1 AND active=true ON CONFLICT(caretaker_id,patient_id) DO NOTHING`,[me.id,b.email.trim()]);
  return json(200,{message:'If the patient has an account, they can review your request in LiveCare.'});
 }
 if(p[1]==='permissions'&&method==='GET')return json(200,{requests:(await query('SELECT a.*,u.display_name AS name,u.email FROM caretaker_access a JOIN users u ON u.id=a.caretaker_id WHERE a.patient_id=$1 ORDER BY a.created_at DESC',[me.id])).rows});
 if(p[1]==='permissions'&&p[2]&&method==='PATCH'){
  const b=parseBody(event);if(!['APPROVED','REVOKED'].includes(b.status))throw error(400,'Choose approve or revoke');
  const result=await query('UPDATE caretaker_access SET status=$3,alerts_enabled=$4,updated_at=now() WHERE id=$1 AND patient_id=$2 RETURNING id',[p[2],me.id,b.status,b.status==='APPROVED'&&b.alertsEnabled===true]);return result.rows[0]?json(200,{ok:true}):json(404,{error:'Request not found'});
 }
 if(p[1]==='alerts'&&p[2]&&method==='PATCH'){
  const b=parseBody(event);const result=await query('UPDATE caretaker_patients SET alerts_enabled=$3 WHERE id=$1 AND owner_id=$2 RETURNING id',[p[2],me.id,b.enabled===true]);return result.rows[0]?json(200,{ok:true}):json(404,{error:'Patient not found'});
 }
 return json(404,{error:'Not found'});
}
module.exports={accessWhere,listTrips,getTrip,bookingSubject,alertRecipients,accessRoutes};
