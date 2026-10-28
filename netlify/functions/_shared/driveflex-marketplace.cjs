const crypto=require('node:crypto');
const {json,parseBody,bearer}=require('./http.cjs');
const {requirements,summarize}=require('./driveflex-checklist.cjs');
const clean=v=>String(v??'').trim();
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=(statusCode,message)=>{throw Object.assign(new Error(message),{statusCode});};
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const escape=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function documentKey(){const k=Buffer.from(process.env.DRIVEFLEX_DOCUMENT_KEY||'','base64');if(k.length!==32)fail(503,'Secure uploads are temporarily unavailable. Please try again later.');return k;}
function encryptFile(data,context){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',documentKey(),iv);cipher.setAAD(Buffer.from(context));return {data:Buffer.concat([cipher.update(data),cipher.final()]),iv,tag:cipher.getAuthTag()};}
function decryptFile(row,context){const decipher=crypto.createDecipheriv('aes-256-gcm',documentKey(),row.file_iv);decipher.setAAD(Buffer.from(context));decipher.setAuthTag(row.file_tag);return Buffer.concat([decipher.update(row.encrypted_data),decipher.final()]);}
function validateUpload(b){
 const name=clean(b.name).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120),encoded=clean(b.dataBase64);
 if(!name||!encoded||encoded.length>5600000||! /^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail(400,'Choose a PDF, JPG, or PNG file up to 4 MB.');
 const data=Buffer.from(encoded,'base64');if(!data.length||data.length>4*1024*1024)fail(400,'Choose a file up to 4 MB.');
 const type=data.subarray(0,5).toString()==='%PDF-'?'application/pdf':data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':data[0]===255&&data[1]===216&&data[2]===255?'image/jpeg':null;
 if(!type||type!==b.mimeType)fail(400,'The file contents must match a PDF, JPG, or PNG file.');
 return {name,data,type};
}
const metadata='requirement_key,status,file_name,expires_on,review_note,updated_at';
const publicTrip='t.id,t.pickup_area,t.destination_area,t.service_level,t.start_at,t.end_at,t.payout_cents,t.status';
function createDriveflexMarketplace({query,getPool,requireUser,audit,sendEmail,siteBase}){
 async function transaction(fn){const client=await getPool().connect();try{await client.query('BEGIN');const value=await fn(client.query.bind(client));await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 async function createAccess(applicationId){
  const token=crypto.randomBytes(32).toString('hex');
  await query("INSERT INTO driveflex_applicant_access(token_hash,application_id,expires_at) VALUES($1,$2,now()+interval '30 days')",[hash(token),applicationId]);
  await query('INSERT INTO driveflex_onboarding(application_id) VALUES($1) ON CONFLICT DO NOTHING',[applicationId]);
  return `${siteBase()}/driveflex/apply#access=${token}`;
 }
 async function applicant(event){const token=bearer(event);if(!/^[a-f0-9]{64}$/.test(token))fail(401,'Open your private application link or request a new one.');
  const r=await query(`SELECT a.id,a.first_name,a.position,o.status AS onboarding_status FROM driveflex_applicant_access x JOIN career_applications a ON a.id=x.application_id JOIN driveflex_onboarding o ON o.application_id=a.id WHERE x.token_hash=$1 AND x.expires_at>now() AND a.status NOT IN ('DECLINED','ARCHIVED')`,[hash(token)]);
  if(!r.rows[0])fail(401,'Your application link has expired. Request a new one.');return r.rows[0];
 }
 async function activeDriver(q,u){
  if(u.role!=='DRIVER')fail(403,'Sign in with your approved driver experience to request a trip.');
  const active=await q("SELECT 1 FROM employees e JOIN users u ON u.id=e.user_id WHERE e.user_id=$1 AND e.active=true AND e.role='DRIVER' AND u.active=true",[u.id]);
  if(!active.rows.length)fail(403,'Your driver account is not ready for trips yet. Contact Nexus to finish onboarding.');
  const linked=await q('SELECT application_id,status FROM driveflex_onboarding WHERE driver_id=$1',[u.id]);
  for(const a of linked.rows){const records=await q(`SELECT ${metadata} FROM driveflex_credentials WHERE application_id=$1`,[a.application_id]);if(a.status!=='APPROVED'||!summarize(records.rows).ready)fail(403,'Your onboarding checklist needs review before you can request trips.');}
 }
 async function handle(event,p,method){
  if(p[0]!=='driveflex'||!['trips','applicant','access','checklist','manage'].includes(p[1]))return null;
  const b=['POST','PATCH','PUT'].includes(method)?parseBody(event):{};
  if(p[1]==='checklist'&&method==='GET')return json(200,{requirements});
  if(p[1]==='access'&&method==='POST'){
   const email=clean(b.email).toLowerCase(),id=clean(b.applicationId),ip=event.headers?.['x-nf-client-connection-ip']||event.headers?.['client-ip']||'unknown';
   const rate=await query(`INSERT INTO driveflex_access_rate(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN driveflex_access_rate.window_start<now()-interval '1 hour' THEN 1 ELSE driveflex_access_rate.attempts+1 END,window_start=CASE WHEN driveflex_access_rate.window_start<now()-interval '1 hour' THEN now() ELSE driveflex_access_rate.window_start END RETURNING attempts`,[hash(ip)]);
   if(rate.rows[0].attempts>10)fail(429,'Please wait before requesting another link.');
   const generic=()=>json(200,{message:'If those details match an application, a private return link will be sent to its email address.'});
   if(!uuid(id)||!email)return generic();
   const found=await query("SELECT id,email FROM career_applications WHERE id=$1 AND lower(email)=$2 AND position='driveflex-driver' AND status NOT IN ('DECLINED','ARCHIVED')",[id,email]);
   if(found.rows.length){const recent=await query("SELECT count(*)::int AS count FROM driveflex_applicant_access WHERE application_id=$1 AND created_at>now()-interval '1 hour'",[id]);
    if(recent.rows[0].count<5){const url=await createAccess(id);await sendEmail([found.rows[0].email],'Continue your Nexus DriveFlex application',`<h2>Your next step toward meaningful work</h2><p>Your progress is saved. Upload one item today, or ask Nexus to arrange training.</p><p><a href="${escape(url)}">Continue my application securely</a></p><p>This private link expires in 30 days. Keep it private. Never email identity or screening documents.</p>`);}
   }return generic();
  }
  if(p[1]==='applicant'){
   const a=await applicant(event);
   if(method==='GET'&&p.length===2){const r=await query(`SELECT ${metadata} FROM driveflex_credentials WHERE application_id=$1`,[a.id]);return json(200,{application:{id:a.id,firstName:a.first_name,status:a.onboarding_status},...summarize(r.rows)});}
   const requirement=requirements.find(r=>r.key===p[2]);if(p[2]&&p[2]!=='submit'&&!requirement)fail(404,'Checklist item not found.');
   if(method==='POST'&&p[2]==='submit'){
    return transaction(async q=>{await q('SELECT application_id FROM driveflex_onboarding WHERE application_id=$1 FOR UPDATE',[a.id]);const records=await q(`SELECT ${metadata} FROM driveflex_credentials WHERE application_id=$1`,[a.id]);if(!summarize(records.rows).readyForReview)fail(400,'Add the missing documents or finish your requested training before submitting for final review.');
     await q("UPDATE driveflex_onboarding SET status=CASE WHEN status='APPROVED' THEN status ELSE 'READY_FOR_REVIEW' END,updated_at=now() WHERE application_id=$1",[a.id]);return json(200,{message:'Your checklist is ready for the Nexus team. We will review your documents and next steps.'});});
   }
   if(method==='POST'&&requirement){
    const training=b.action==='training';if(training&&!requirement.training)fail(400,'Training is not available for this item.');
    const file=training?null:validateUpload(b),encrypted=file?encryptFile(file.data,`${a.id}:${requirement.key}`):null;
    await transaction(async q=>{await q('SELECT application_id FROM driveflex_onboarding WHERE application_id=$1 FOR UPDATE',[a.id]);
     const previous=await q('SELECT status FROM driveflex_credentials WHERE application_id=$1 AND requirement_key=$2',[a.id,requirement.key]);
     if(training&&['APPROVED','EXEMPT','PENDING'].includes(previous.rows[0]?.status))fail(409,'This item already has a document or review. Contact Nexus if you need to replace it.');
     await q(`INSERT INTO driveflex_credentials(application_id,requirement_key,status,file_name,mime_type,file_size,encrypted_data,file_iv,file_tag)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(application_id,requirement_key) DO UPDATE SET status=EXCLUDED.status,file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_size=EXCLUDED.file_size,encrypted_data=EXCLUDED.encrypted_data,file_iv=EXCLUDED.file_iv,file_tag=EXCLUDED.file_tag,expires_on=NULL,review_note=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=now()`,
      [a.id,requirement.key,training?'TRAINING_REQUESTED':'PENDING',file?.name||null,file?.type||null,file?.data.length||null,encrypted?.data||null,encrypted?.iv||null,encrypted?.tag||null]);
     await q("UPDATE driveflex_onboarding SET status='IN_PROGRESS',updated_at=now() WHERE application_id=$1",[a.id]);});
    await audit('DRIVEFLEX_APPLICATION',a.id,training?'TRAINING_REQUESTED':'DOCUMENT_UPLOADED',{requirement:requirement.key});
    return json(200,{message:training?'Nexus training requested. Keep working on your other items while the team arranges your next step.':'Saved securely to your application. Nexus will review this document.'});
   }
   fail(404,'Not found');
  }
  if(p[1]==='trips'){
   if(method==='GET'&&p.length===2){const r=await query(`SELECT ${publicTrip} FROM driveflex_trips t JOIN bookings b ON b.reference=t.booking_reference WHERE t.status='OPEN' AND t.start_at>now() AND upper(replace(b.status,'-','_')) NOT IN ('CANCELLED','CANCELED','COMPLETED') ORDER BY t.start_at LIMIT 100`);return json(200,{trips:r.rows});}
   const u=await requireUser(bearer(event),['DRIVER']);await activeDriver(query,u);
   if(method==='GET'&&p[2]==='mine'){const r=await query(`SELECT ${publicTrip},r.id AS request_id,r.status AS request_status,r.payout_cents AS agreed_payout_cents,r.paid_at FROM driveflex_trip_requests r JOIN driveflex_trips t ON t.id=r.trip_id WHERE r.driver_id=$1 ORDER BY t.start_at DESC LIMIT 100`,[u.id]);return json(200,{requests:r.rows});}
   if(!uuid(p[2]||''))fail(400,'Choose a valid trip.');
   if(method==='POST'&&p[3]==='request'){
    return transaction(async q=>{const trips=await q("SELECT t.* FROM driveflex_trips t JOIN bookings b ON b.reference=t.booking_reference WHERE t.id=$1 AND t.status='OPEN' AND t.start_at>now() AND upper(replace(b.status,'-','_')) NOT IN ('CANCELLED','CANCELED','COMPLETED') FOR UPDATE OF t",[p[2]]);const trip=trips.rows[0];if(!trip)fail(409,'This trip is no longer available.');
     const r=await q("INSERT INTO driveflex_trip_requests(trip_id,driver_id,payout_cents) VALUES($1,$2,$3) ON CONFLICT(trip_id,driver_id) DO UPDATE SET status='REQUESTED',created_at=now() WHERE driveflex_trip_requests.status='WITHDRAWN' RETURNING id",[trip.id,u.id,trip.payout_cents]);if(!r.rows.length)fail(409,'You have already requested this trip.');
     await audit('DRIVEFLEX_TRIP',trip.id,'REQUESTED',{driverId:u.id});return json(201,{message:'Request received. Dispatch will review it. Wait for your confirmed assignment before travelling.'});});
   }
   if(method==='POST'&&p[3]==='withdraw'){const r=await query("UPDATE driveflex_trip_requests SET status='WITHDRAWN' WHERE trip_id=$1 AND driver_id=$2 AND status='REQUESTED' RETURNING id",[p[2],u.id]);if(!r.rows.length)fail(409,'Only a pending request can be withdrawn. Contact dispatch for a selected trip.');return json(200,{message:'Request withdrawn.'});}
   fail(404,'Not found');
  }
  if(p[1]==='manage'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   if(p[2]==='applications'){
    if(u.role!=='ADMIN')fail(403,'Only hiring administrators can review private applicant records.');
    if(method==='GET'&&p.length===3){const r=await query(`SELECT a.id,a.first_name,a.last_name,a.email,a.created_at,o.status,o.driver_id FROM career_applications a JOIN driveflex_onboarding o ON o.application_id=a.id WHERE a.position='driveflex-driver' ORDER BY a.created_at DESC LIMIT 200`);return json(200,{applications:r.rows});}
    const id=p[3];if(!uuid(id||''))fail(400,'Choose an application.');
    const exists=await query('SELECT application_id FROM driveflex_onboarding WHERE application_id=$1',[id]);if(!exists.rows.length)fail(404,'Application not found.');
    if(method==='GET'&&p.length===4){const records=await query(`SELECT ${metadata} FROM driveflex_credentials WHERE application_id=$1`,[id]);return json(200,summarize(records.rows));}
    if(method==='GET'&&p[5]==='file'){
     const r=await query('SELECT * FROM driveflex_credentials WHERE application_id=$1 AND requirement_key=$2',[id,p[4]]),row=r.rows[0];if(!row?.encrypted_data)fail(404,'No document uploaded.');
     const file=decryptFile(row,`${id}:${p[4]}`);await audit('DRIVEFLEX_APPLICATION',id,'DOCUMENT_DOWNLOADED',{requirement:p[4],reviewer:u.id});
     return {statusCode:200,isBase64Encoded:true,headers:{'content-type':row.mime_type,'content-disposition':`attachment; filename="${row.file_name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'cache-control':'no-store, private','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'"},body:file.toString('base64')};
    }
    if(method==='POST'&&p[4]==='approve'){
     return transaction(async q=>{await q('SELECT application_id FROM driveflex_onboarding WHERE application_id=$1 FOR UPDATE',[id]);const r=await q(`SELECT ${metadata} FROM driveflex_credentials WHERE application_id=$1`,[id]);if(!summarize(r.rows).ready)fail(409,'All 15 items must be reviewed and current before onboarding can be approved.');
      if(!uuid(clean(b.driverId)))fail(400,'Enter the approved driver account ID from user management.');
      const driver=await q("SELECT u.id FROM users u JOIN employees e ON e.user_id=u.id JOIN career_applications a ON lower(a.email)=lower(u.email) WHERE a.id=$1 AND u.id=$2 AND u.active=true AND e.active=true AND e.role='DRIVER'",[id,b.driverId]);if(!driver.rows.length)fail(400,'Use the active driver employee account with the same email as this application. Create or activate it in user management first.');
      await q("UPDATE driveflex_onboarding SET status='APPROVED',driver_id=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE application_id=$1",[id,b.driverId,u.id]);await audit('DRIVEFLEX_APPLICATION',id,'ONBOARDING_APPROVED',{driverId:b.driverId,reviewer:u.id});return json(200,{message:'Onboarding approved and linked to the driver account.'});});
    }
    if(method==='PATCH'&&p[4]){
     if(!requirements.some(r=>r.key===p[4])||!['APPROVED','CHANGES_NEEDED','EXEMPT'].includes(b.status))fail(400,'Choose a valid checklist review.');
     const note=clean(b.note).slice(0,1000);if(['CHANGES_NEEDED','EXEMPT'].includes(b.status)&&!note)fail(400,'Explain the correction or approved exception.');
     const expiry=clean(b.expiresOn)||null;if(expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(Date.parse(expiry))||expiry<new Date().toISOString().slice(0,10)))fail(400,'Use a valid current expiry date.');
     return transaction(async q=>{await q('SELECT application_id FROM driveflex_onboarding WHERE application_id=$1 FOR UPDATE',[id]);
      const old=(await q('SELECT status,encrypted_data,updated_at FROM driveflex_credentials WHERE application_id=$1 AND requirement_key=$2 FOR UPDATE',[id,p[4]])).rows[0];
      if(b.status==='APPROVED'&&!old?.encrypted_data)fail(400,'A completion document must be uploaded before approval. A training request is not completion evidence.');
      if(old&&(!b.updatedAt||new Date(b.updatedAt).getTime()!==new Date(old.updated_at).getTime()))fail(409,'This item changed. Refresh before reviewing it.');
      await q(`INSERT INTO driveflex_credentials(application_id,requirement_key,status,expires_on,review_note,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(application_id,requirement_key) DO UPDATE SET status=EXCLUDED.status,expires_on=EXCLUDED.expires_on,review_note=EXCLUDED.review_note,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now(),updated_at=now()`,[id,p[4],b.status,expiry,note,u.id]);
      if(b.status==='CHANGES_NEEDED')await q("UPDATE driveflex_onboarding SET status='IN_PROGRESS',updated_at=now() WHERE application_id=$1",[id]);
      await audit('DRIVEFLEX_APPLICATION',id,'DOCUMENT_REVIEWED',{requirement:p[4],status:b.status,reviewer:u.id});return json(200,{message:'Review saved.'});});
    }
   }
   if(p[2]==='trips'){
    if(method==='GET'&&p.length===3){const trips=await query(`SELECT ${publicTrip},t.booking_reference FROM driveflex_trips t ORDER BY t.start_at DESC LIMIT 100`);const requests=await query(`SELECT r.id,r.trip_id,r.driver_id,r.status,r.payout_cents,r.paid_at,u.display_name,u.email FROM driveflex_trip_requests r JOIN users u ON u.id=r.driver_id JOIN driveflex_trips t ON t.id=r.trip_id WHERE t.start_at>now()-interval '90 days' ORDER BY r.created_at DESC LIMIT 500`);return json(200,{trips:trips.rows,requests:requests.rows});}
    if(method==='POST'&&p.length===3){
     const start=new Date(b.startAt),end=new Date(b.endAt),amount=Number(b.payout);if(!Number.isFinite(amount)||amount<=0||amount>10000||!Number.isInteger(Math.round(amount*100))||Math.abs(amount*100-Math.round(amount*100))>0.0001)fail(400,'Enter a positive driver payout with at most two decimal places.');
     if(!Number.isFinite(start.valueOf())||!Number.isFinite(end.valueOf())||start<=new Date()||end<=start||end-start>86400000)fail(400,'Choose a future trip window no longer than 24 hours.');
     if(!['AMBULATORY','WHEELCHAIR','EMT'].includes(b.serviceLevel))fail(400,'Choose a service type.');
     const areas=[clean(b.pickupArea),clean(b.destinationArea)];if(areas.some(a=>!a||a.length>80||/[0-9@]/.test(a)))fail(400,'Use city or county names only, without street numbers, rider details, or contact information.');
     const booking=await query("SELECT reference FROM bookings WHERE reference=$1 AND upper(replace(status,'-','_')) NOT IN ('CANCELLED','CANCELED','COMPLETED')",[clean(b.bookingReference)]);if(!booking.rows.length)fail(400,'Use an existing active booking reference.');
     const r=await query(`INSERT INTO driveflex_trips(booking_reference,pickup_area,destination_area,service_level,start_at,end_at,payout_cents,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(booking_reference) DO NOTHING RETURNING id`,[clean(b.bookingReference),...areas,b.serviceLevel,start.toISOString(),end.toISOString(),Math.round(amount*100),u.id]);if(!r.rows.length)fail(409,'That booking is already listed.');await audit('DRIVEFLEX_TRIP',r.rows[0].id,'PUBLISHED',{payoutCents:Math.round(amount*100),by:u.id});return json(201,{message:'Trip published with the fixed driver payout.'});
    }
    if(method==='POST'&&p[4]==='close'){if(!uuid(p[3]||''))fail(400,'Choose a trip.');await transaction(async q=>{const trip=(await q('SELECT id,status FROM driveflex_trips WHERE id=$1 FOR UPDATE',[p[3]])).rows[0];if(!trip)fail(404,'Trip not found.');if(trip.status!=='OPEN')fail(409,'Only an open opportunity can be closed. Manage confirmed assignments in dispatch.');await q("UPDATE driveflex_trips SET status='CLOSED' WHERE id=$1",[p[3]]);await q("UPDATE driveflex_trip_requests SET status='REJECTED',reviewed_by=$2,reviewed_at=now() WHERE trip_id=$1 AND status='REQUESTED'",[p[3],u.id]);});return json(200,{message:'Trip closed to new requests. Existing selections remain on record; manage any confirmed assignment in dispatch.'});}
   }
   if(p[2]==='requests'&&method==='POST'&&uuid(p[3]||'')){
    return transaction(async q=>{
     const found=(await q('SELECT trip_id,driver_id FROM driveflex_trip_requests WHERE id=$1',[p[3]])).rows[0];if(!found)fail(404,'Request not found.');
     await q("SELECT pg_advisory_xact_lock(hashtextextended($1,2027))",[found.driver_id]);
     const trip=(await q('SELECT * FROM driveflex_trips WHERE id=$1 FOR UPDATE',[found.trip_id])).rows[0];
     const request=(await q('SELECT * FROM driveflex_trip_requests WHERE id=$1 FOR UPDATE',[p[3]])).rows[0];
     if(b.action==='paid'){
      if(u.role!=='ADMIN')fail(403,'Only an administrator can record an issued payment.');if(request.status!=='SELECTED'||request.paid_at)fail(409,'Payment is already recorded or this driver was not selected.');
      const booking=(await q('SELECT status FROM bookings WHERE reference=$1',[trip.booking_reference])).rows[0];if(String(booking?.status).toUpperCase()!=='COMPLETED')fail(409,'Complete the trip in dispatch before recording payment.');
      const reference=clean(b.paymentReference);if(reference.length<3||reference.length>100)fail(400,'Enter the issued payment reference; do not enter bank or card details.');
      await q('UPDATE driveflex_trip_requests SET paid_at=now(),payment_reference=$2,paid_by=$3 WHERE id=$1',[request.id,reference,u.id]);await audit('DRIVEFLEX_TRIP',trip.id,'PAYMENT_RECORDED',{requestId:request.id,by:u.id});return json(200,{message:'Payment recorded. This action does not send funds.'});
     }
     if(!['select','reject'].includes(b.action)||request.status!=='REQUESTED'||trip.status!=='OPEN'||new Date(trip.start_at)<=new Date())fail(409,'This request is no longer open for review.');
     if(b.action==='select'){
      await activeDriver(q,{id:request.driver_id,role:'DRIVER'});
      const booking=(await q('SELECT status FROM bookings WHERE reference=$1',[trip.booking_reference])).rows[0];if(['CANCELLED','CANCELED','COMPLETED'].includes(String(booking?.status).toUpperCase()))fail(409,'This booking is no longer open.');
      const overlap=await q("SELECT r.id FROM driveflex_trip_requests r JOIN driveflex_trips t ON t.id=r.trip_id WHERE r.driver_id=$1 AND r.status='SELECTED' AND t.status<>'CLOSED' AND t.start_at<$3 AND t.end_at>$2",[request.driver_id,trip.start_at,trip.end_at]);if(overlap.rows.length)fail(409,'This driver is already selected for an overlapping trip.');
      if(b.confirmChecks!==true)fail(400,'Confirm credential, vehicle, and schedule checks before selecting this driver.');
      await q("UPDATE driveflex_trips SET status='SELECTED' WHERE id=$1",[trip.id]);
      await q("UPDATE driveflex_trip_requests SET status=CASE WHEN id=$2 THEN 'SELECTED' ELSE 'REJECTED' END,reviewed_by=$3,reviewed_at=now() WHERE trip_id=$1 AND status='REQUESTED'",[trip.id,request.id,u.id]);
     }else await q("UPDATE driveflex_trip_requests SET status='REJECTED',reviewed_by=$2,reviewed_at=now() WHERE id=$1",[request.id,u.id]);
     await audit('DRIVEFLEX_TRIP',trip.id,b.action.toUpperCase(),{requestId:request.id,by:u.id});return json(200,{message:b.action==='select'?'Driver selected at the posted payout. Finalize the assignment in dispatch before the driver begins.':'Request declined.'});
    });
   }
   fail(404,'Not found');
  }
  fail(404,'Not found');
 }
 return {handle,createAccess};
}
module.exports={createDriveflexMarketplace,validateUpload,encryptFile,decryptFile};
