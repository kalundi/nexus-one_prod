const {json,parseBody}=require('./http.cjs');
const {evidenceStatus,dueDate,isoDay}=require('./contract-evidence.cjs');
const catalog=require('./mtm-requirements.cjs');
const clean=(v,max=2000)=>String(v??'').trim().slice(0,max);
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode})};
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v||'');
const validDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v))&&isoDay(new Date(v))===v;
module.exports=async function contract({query,me,event,p,method}){
 if(me.role!=='ADMIN')fail('Administrator access required',403);
 if(p[2]==='contract'&&method==='GET'&&p.length===3){
  const subjects=(await query('SELECT * FROM training_contract_subjects ORDER BY market,scope,name')).rows;
  const history=(await query(`SELECT e.*,u.display_name AS reviewer_name FROM training_contract_evidence e JOIN users u ON u.id=e.reviewed_by ORDER BY e.reviewed_at DESC,e.id DESC`)).rows;
  const checks=subjects.flatMap(subject=>catalog.requirements.filter(r=>catalog.applies(r,subject)).map(requirement=>{
   const record=history.find(e=>e.subject_id===subject.id&&e.requirement_key===requirement.key);
   const sourceChanged=record&&record.source_version!==requirement.sourceVersion;
   return {subjectId:subject.id,name:subject.name,scope:subject.scope,market:subject.market,levels:subject.levels,requirement,record:record||null,
    status:sourceChanged?'SOURCE_CHANGED':evidenceStatus(requirement,record,subject.credentialed_on),dueOn:dueDate(requirement,record,subject.credentialed_on)};
  }));
  return json(200,{catalog,subjects,checks,history});
 }
 if(p[2]==='contract-subjects'&&method==='POST'&&p.length===3){
  const b=parseBody(event),name=clean(b.name,200),levels=Array.isArray(b.levels)?[...new Set(b.levels)]:[];
  if(!name||!['ORGANIZATION','DRIVER','ATTENDANT','VEHICLE'].includes(b.scope)||!['DC','MD','VA'].includes(b.market)||!Array.isArray(b.levels)||!levels.length||!levels.every(l=>['AMBULATORY','WHEELCHAIR','STRETCHER','AMBULANCE'].includes(l)))fail('Enter a name, level, market and service types');
  if(b.credentialedOn&&(!validDay(b.credentialedOn)||b.credentialedOn>isoDay(new Date())))fail('Use a valid credentialing date');
  const saved=await query(`INSERT INTO training_contract_subjects(name,scope,market,levels,credentialed_on,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[name,b.scope,b.market,levels,b.credentialedOn||null,me.id]);
  return json(201,{subject:saved.rows[0]});
 }
 if(p[2]==='contract-date'&&method==='POST'&&p.length===3){
  const b=parseBody(event);if(!uuid(b.subjectId)||!validDay(b.credentialedOn)||b.credentialedOn>isoDay(new Date())||!clean(b.notes))fail('Provide a valid credentialing date and correction notes');
  const result=await query(`WITH prior AS (SELECT id,credentialed_on FROM training_contract_subjects WHERE id=$1 FOR UPDATE),
   changed AS (UPDATE training_contract_subjects s SET credentialed_on=$2 FROM prior WHERE s.id=prior.id RETURNING s.id,prior.credentialed_on AS old_date)
   INSERT INTO training_contract_date_history(subject_id,old_date,new_date,notes,changed_by) SELECT id,old_date,$2,$3,$4 FROM changed RETURNING subject_id`,[b.subjectId,b.credentialedOn,clean(b.notes),me.id]);
  if(!result.rows.length)fail('Profile not found',404);return json(200,{saved:true});
 }
 if(p[2]==='contract-evidence'&&method==='POST'&&p.length===3){
  const b=parseBody(event),r=catalog.requirements.find(r=>r.key===b.requirementKey),notes=clean(b.notes),reference=clean(b.evidenceReference,1000),confirmation=clean(b.confirmationReference,1000);
  if(!r||!uuid(b.subjectId)||!['VERIFIED','MISSING','NOT_APPLICABLE'].includes(b.decision)||!notes)fail('Choose a requirement, decision and review notes');
  const subject=(await query('SELECT * FROM training_contract_subjects WHERE id=$1',[b.subjectId])).rows[0];
  if(!subject||!catalog.applies(r,subject))fail('Requirement does not apply to this profile',400);
  if(b.decision==='NOT_APPLICABLE'&&(!r.conditional||!confirmation))fail('Non-applicability requires an eligible requirement and written approval reference');
  for(const day of [b.completedOn,b.expiresOn])if(day&&!validDay(day))fail('Use valid dates');
  if(b.decision==='VERIFIED'&&(!b.completedOn||b.completedOn>isoDay(new Date())||!reference||(r.expiryRequired&&!b.expiresOn)||(r.confirmation&&!confirmation)))fail('Verified evidence requires a completion date, evidence reference, applicable expiration and any required written confirmation');
  if(b.completedOn&&b.expiresOn&&b.expiresOn<b.completedOn)fail('Expiration cannot precede completion');
  const saved=await query(`INSERT INTO training_contract_evidence(subject_id,requirement_key,decision,completed_on,expires_on,evidence_reference,notes,reviewed_by,confirmation_reference,source_version)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[b.subjectId,r.key,b.decision,b.completedOn||null,b.expiresOn||null,reference,notes,me.id,confirmation,r.sourceVersion]);
  return json(201,{record:saved.rows[0]});
 }
 return json(404,{error:'Contract endpoint not found'});
};
