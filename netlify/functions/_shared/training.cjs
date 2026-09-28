const crypto=require('crypto');
const {json,parseBody,bearer}=require('./http.cjs');
const handleContract=require('./training-contract.cjs');
const STAFF=['STAFF','ADMIN','DRIVER','DISPATCHER','BILLING','QA','EXECUTIVE'];
const ACK='I acknowledge that I have read or watched this assigned material, understand my responsibilities, and will ask my supervisor about anything unclear. This acknowledgment does not replace required practical training or supervisor approval.';
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})};
const clean=(value,max=200)=>String(value??'').trim().slice(0,max);
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
function materialInput(body){
 const title=clean(body.title),policyKey=clean(body.policyKey,100),version=clean(body.version,80),kind=body.kind;
 if(!title||!policyKey||!version||!['POLICY','TRAINING'].includes(kind))fail('Title, policy key, version and material type are required');
 let file=null,url=null;
 if(body.dataBase64){
  if(typeof body.dataBase64!=='string'||body.dataBase64.length>5600000)fail('PDF must be at most 4 MB');
  file=Buffer.from(body.dataBase64,'base64');
  if(file.length>4*1024*1024||file.subarray(0,5).toString()!=='%PDF-')fail('Upload a valid PDF up to 4 MB');
 }
 if(body.resourceUrl){
  try{const parsed=new URL(body.resourceUrl);if(parsed.protocol!=='https:'||parsed.username||parsed.password)fail('Use an HTTPS training link');url=parsed.href;}catch{fail('Use an HTTPS training link')}
 }
 if(Boolean(file)===Boolean(url))fail('Provide either a PDF or an HTTPS training link');
 return {title,policyKey,version,kind,description:clean(body.description,2000),file,url,external:body.requiresExternalEvidence===true,hash:crypto.createHash('sha256').update(file||url).digest('hex')};
}
function createTrainingHandler({query,requireUser}){
 return async function training(event,p,method){
  const me=await requireUser(bearer(event),STAFF);
  const admin=p[1]==='admin';
  if(admin&&me.role!=='ADMIN')fail('Administrator access required',403);
  if(admin&&String(p[2]||'').startsWith('contract'))return handleContract({query,me,event,p,method});
  if(p.length===1&&method==='GET'){
   // Enroll drivers on access, including accounts with an approved driver role.
   // Keep existing cycles and signed records; concurrent loads cannot duplicate enrollment.
   await query(`INSERT INTO training_assignments(user_id,material_id,cycle,due_at,assigned_by,requires_verification)
    SELECT u.id,m.id,'Driver onboarding',now()+interval '30 days',u.id,true
    FROM users u CROSS JOIN training_materials m WHERE u.id=$1 AND u.active=true
    AND (u.role='DRIVER' OR EXISTS(SELECT 1 FROM user_role_requests r WHERE r.user_id=u.id AND r.role='DRIVER' AND r.status='APPROVED'))
    AND NOT EXISTS(SELECT 1 FROM training_assignments a WHERE a.user_id=u.id AND a.material_id=m.id)
    ON CONFLICT(user_id,material_id,cycle) DO NOTHING`,[me.id]);
   await query(`UPDATE training_assignments a SET requires_verification=true FROM users u
    WHERE a.user_id=u.id AND u.id=$1 AND a.verified_at IS NULL AND a.requires_verification=false
    AND (u.role='DRIVER' OR EXISTS(SELECT 1 FROM user_role_requests r WHERE r.user_id=u.id AND r.role='DRIVER' AND r.status='APPROVED'))`,[me.id]);
   const result=await query(`SELECT a.*,m.title,m.description,m.kind,m.version,m.policy_key,m.content_hash,
    CASE WHEN a.acknowledged_at IS NOT NULL AND (NOT a.requires_verification OR a.verified_at IS NOT NULL) THEN 'COMPLETE'
     WHEN a.acknowledged_at IS NOT NULL THEN 'AWAITING_VERIFICATION' WHEN a.due_at<now() THEN 'OVERDUE' ELSE 'ASSIGNED' END AS status
    FROM training_assignments a JOIN training_materials m ON m.id=a.material_id WHERE a.user_id=$1 ORDER BY a.due_at,m.title`,[me.id]);
   return json(200,{assignments:result.rows,acknowledgment:ACK,isAdmin:me.role==='ADMIN'});
  }
  if(admin&&p[2]==='materials'&&p.length===3&&method==='GET')return json(200,{materials:(await query('SELECT id,policy_key,version,title,description,kind,content_hash,requires_external_evidence,created_at FROM training_materials ORDER BY title,created_at DESC')).rows});
  if(admin&&p[2]==='materials'&&p.length===3&&method==='POST'){
   const m=materialInput(parseBody(event));
   const result=await query(`INSERT INTO training_materials(policy_key,version,title,description,kind,file_data,resource_url,content_hash,created_by,requires_external_evidence)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(policy_key,version) DO NOTHING RETURNING id`,[m.policyKey,m.version,m.title,m.description,m.kind,m.file,m.url,m.hash,me.id,m.external]);
   if(!result.rows.length)fail('This policy version already exists. Use a new version to preserve acknowledgment history.',409);
   return json(201,{material:result.rows[0]});
  }
  if(admin&&p[2]==='staff'&&method==='GET'&&p.length===3){
   return json(200,{staff:(await query(`SELECT id,display_name,email,role FROM users WHERE active=true AND
    (role=ANY($1::text[]) OR EXISTS(SELECT 1 FROM user_role_requests r WHERE r.user_id=users.id AND r.status='APPROVED' AND r.role=ANY($1::text[]))) ORDER BY display_name,email`,[STAFF])).rows});
  }
  if(admin&&p[2]==='assignments'&&p.length===3&&method==='POST'){
   const b=parseBody(event),cycle=clean(b.cycle,100),date=new Date(b.dueAt);
   if(!uuid(b.materialId)||!cycle||!Number.isFinite(date.getTime())||!Array.isArray(b.userIds)||!b.userIds.length||b.userIds.length>1000||!b.userIds.every(uuid)||typeof b.requiresVerification!=='boolean')fail('Choose a material, staff, cycle, due date and verification requirement');
   const result=await query(`INSERT INTO training_assignments(user_id,material_id,cycle,due_at,assigned_by,requires_verification)
    SELECT u.id,m.id,$3,$4,$5,($6 OR m.requires_external_evidence OR u.role='DRIVER'
     OR EXISTS(SELECT 1 FROM user_role_requests r WHERE r.user_id=u.id AND r.role='DRIVER' AND r.status='APPROVED')) FROM users u CROSS JOIN training_materials m
    WHERE m.id=$1 AND u.id=ANY($2::uuid[]) AND u.active=true AND
    (u.role=ANY($7::text[]) OR EXISTS(SELECT 1 FROM user_role_requests r WHERE r.user_id=u.id AND r.status='APPROVED' AND r.role=ANY($7::text[])))
    ON CONFLICT(user_id,material_id,cycle) DO NOTHING RETURNING id`,[b.materialId,b.userIds,cycle,date.toISOString(),me.id,b.requiresVerification,STAFF]);
   return json(201,{assigned:result.rows.length});
  }
  if(admin&&p[2]==='report'&&p.length===3&&method==='GET'){
   const result=await query(`SELECT a.*,u.display_name,u.email,u.role,u.active,m.title,m.version,m.policy_key,m.content_hash,v.display_name AS verified_by_name,
    CASE WHEN a.acknowledged_at IS NOT NULL AND (NOT a.requires_verification OR a.verified_at IS NOT NULL) THEN 'COMPLETE'
     WHEN a.acknowledged_at IS NOT NULL THEN 'AWAITING_VERIFICATION' WHEN a.due_at<now() THEN 'OVERDUE' ELSE 'ASSIGNED' END AS status
    FROM training_assignments a JOIN users u ON u.id=a.user_id JOIN training_materials m ON m.id=a.material_id LEFT JOIN users v ON v.id=a.verified_by
    ORDER BY a.due_at,u.display_name,m.title`);
   return json(200,{records:result.rows});
  }
  if(admin&&p[2]==='verify'&&p.length===4&&method==='POST'){
   if(!uuid(p[3]))fail('Invalid assignment');
   const notes=clean(parseBody(event).notes,2000);if(!notes)fail('Record the observed competency or evidence used for verification');
   const result=await query(`UPDATE training_assignments SET verified_at=now(),verified_by=$2,verification_notes=$3
    WHERE id=$1 AND user_id<>$2 AND requires_verification=true AND acknowledged_at IS NOT NULL AND verified_at IS NULL RETURNING id`,[p[3],me.id,notes]);
   if(!result.rows.length)fail('Assignment cannot be verified. It must be acknowledged, awaiting verification and belong to another staff member.',409);
   return json(200,{verified:true});
  }
  if(p[1]==='assignments'&&p.length===4&&uuid(p[2])){
   if(p[3]==='open'&&method==='POST'){
    const result=await query(`UPDATE training_assignments a SET opened_at=COALESCE(a.opened_at,now()) FROM training_materials m
     WHERE a.id=$1 AND a.user_id=$2 AND m.id=a.material_id RETURNING a.id,m.resource_url`,[p[2],me.id]);
    if(!result.rows.length)fail('Assignment not found',404);
    return json(200,{resourceUrl:result.rows[0].resource_url,fileUrl:result.rows[0].resource_url?null:`/api/training/assignments/${p[2]}/file`});
   }
   if(p[3]==='file'&&method==='GET'){
    const result=await query('SELECT m.file_data FROM training_assignments a JOIN training_materials m ON m.id=a.material_id WHERE a.id=$1 AND a.user_id=$2',[p[2],me.id]);
    const file=result.rows[0]?.file_data;if(!file)fail('Document not found',404);
    return {statusCode:200,isBase64Encoded:true,headers:{'content-type':'application/pdf','cache-control':'private, no-store','content-disposition':'inline; filename="training.pdf"','x-content-type-options':'nosniff'},body:file.toString('base64')};
   }
   if(p[3]==='acknowledge'&&method==='POST'){
    const b=parseBody(event),name=clean(b.name,160);if(b.accepted!==true||!name)fail('Enter your name and confirm the acknowledgment');
    const result=await query(`UPDATE training_assignments SET acknowledged_at=now(),acknowledged_name=$3,acknowledgment_text=$4
     WHERE id=$1 AND user_id=$2 AND opened_at IS NOT NULL AND acknowledged_at IS NULL RETURNING id,acknowledged_at`,[p[2],me.id,name,ACK]);
    if(!result.rows.length)fail('Open the assigned material before acknowledging. A recorded acknowledgment cannot be changed.',409);
    return json(200,{acknowledgment:result.rows[0]});
   }
  }
  return json(404,{error:'Training endpoint not found'});
 };
}
module.exports={createTrainingHandler,materialInput,STAFF,ACK};
