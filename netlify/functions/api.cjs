const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {query,getPool}=require('./_shared/db.cjs');
const {json,parseBody,bearer,routePath}=require('./_shared/http.cjs');
const {digest,safeUser,requireUser,audit}=require('./_shared/auth.cjs');
const {buildBrokerBookingPayload,getBrokerAutoBookStatus,resolveBrokerRequestStatus}=require('./_shared/broker-auto-book.cjs');
const {canAdvanceBookingForAvailability}=require('./_shared/dispatch-approval.cjs');
const {buildEmailRecipients,buildSmsRecipients}=require('./_shared/notification-routing.cjs');
const {normalizeE164}=require('./_shared/phone.cjs');
const {resolveAssignedStatus}=require('./_shared/assignment-status.cjs');
const {isDriverAssignableStatus, normalizeDriverAcceptanceStatus}=require('./_shared/driver-assignments.cjs');
const {hashPassword, verifyPassword}=require('./_shared/password.cjs');
const {ensureDefaultTestUsers, ensureDefaultUserForEmail}=require('./_shared/default-users.cjs');
const {buildDriverEmployeeLookupSql, buildDriverAvailabilitySql}=require('./_shared/employee-driver-lookup.cjs');
const {getFallbackUser, createFallbackSession, getFallbackSession, revokeFallbackSession, getFallbackAssignments, acceptFallbackAssignment, updateFallbackAssignmentStatus}=require('./_shared/fallback-auth.cjs');
const {parseChannels,isDryRunValue,previewSocialSelection,runSocialPublish}=require('./_shared/social-engine.cjs');
const {mapFhirAppointment,parseHl7,verifyIntegrationRequest,payloadDigest}=require('./_shared/keymark-connectors.cjs');
const {testConnection:testKeymarkFhirConnection}=require('./_shared/keymark-fhir-client.cjs');
const {bookingPaymentPolicy,requiresFullPaymentBeforeBoarding}=require('./_shared/payment-policy.cjs');
const {getSecureDocument,listSecureDocuments}=require('./_shared/secure-document-registry.cjs');
const {sendSms}=require('./_shared/sms-consent.cjs');
const {canPatientSeeDriverLocation,distanceMiles}=require('./_shared/patient-driver-location.cjs');
const STATUS_FLOW={SUBMITTED:'SCHEDULED',REQUESTED:'SCHEDULED',PENDING_APPROVAL:'SCHEDULED',PENDING_DISPATCH_CONFIRMATION:'SCHEDULED',SCHEDULED:'ASSIGNED',ASSIGNED:'EN_ROUTE',EN_ROUTE:'ARRIVED',ARRIVED:'IN_TRANSIT',IN_TRANSIT:'COMPLETED'};
const statusLabel=s=>String(s||'SUBMITTED').toLowerCase().replaceAll('_','-');
const envEnabled=name=>Boolean(process.env[name]);
const clean=v=>String(v??'').trim();
const isTestMode=()=>String(process.env.NEXUS_TEST_MODE||'').toLowerCase()==='true';
let multiRoleSchemaPromise=null;
function ensureMultiRoleSchema(){
 if(multiRoleSchemaPromise)return multiRoleSchemaPromise;
 multiRoleSchemaPromise=(async()=>{
  await query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_role text');
  await query(`CREATE TABLE IF NOT EXISTS user_role_requests (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   role text NOT NULL CHECK (role IN ('PATIENT','DRIVER','FACILITY','DISPATCHER','BILLING','QA','EXECUTIVE','ADMIN')),
   status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
   requested_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
   scope_id text,notes text,UNIQUE(user_id,role))`);
  await query('CREATE INDEX IF NOT EXISTS idx_user_role_requests_status ON user_role_requests(status,requested_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_user_role_requests_user ON user_role_requests(user_id,status)');
  await query('ALTER TABLE user_role_requests ENABLE ROW LEVEL SECURITY');
  await query('REVOKE ALL ON TABLE user_role_requests FROM anon, authenticated').catch(()=>{});
 })().catch(error=>{multiRoleSchemaPromise=null;throw error});
 return multiRoleSchemaPromise;
}
let patientPreferencesSchemaPromise=null;
function ensurePatientPreferencesSchema(){
 if(patientPreferencesSchemaPromise)return patientPreferencesSchemaPromise;
 patientPreferencesSchemaPromise=query(`CREATE TABLE IF NOT EXISTS patient_transport_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mobility_type text NOT NULL DEFAULT 'AMBULATORY' CHECK (mobility_type IN ('AMBULATORY','WHEELCHAIR','BRODA','STRETCHER','BARIATRIC')),
  remains_in_wheelchair boolean NOT NULL DEFAULT false,transfer_assistance boolean NOT NULL DEFAULT false,oxygen_required boolean NOT NULL DEFAULT false,
  preferred_language text,communication_preference text NOT NULL DEFAULT 'SMS' CHECK (communication_preference IN ('SMS','VOICE','EMAIL')),
  default_pickup text,accessibility_notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`)
  .then(()=>query('ALTER TABLE patient_transport_preferences ENABLE ROW LEVEL SECURITY'))
  .then(()=>query('REVOKE ALL ON TABLE patient_transport_preferences FROM anon, authenticated').catch(()=>{}))
  .catch(error=>{patientPreferencesSchemaPromise=null;throw error});
 return patientPreferencesSchemaPromise;
}
let careerApplicationsSchemaPromise=null;
function ensureCareerApplicationsSchema(){
 if(careerApplicationsSchemaPromise)return careerApplicationsSchemaPromise;
 careerApplicationsSchemaPromise=query(`CREATE TABLE IF NOT EXISTS career_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),first_name text NOT NULL,last_name text NOT NULL,email text NOT NULL,phone text NOT NULL,
  city text NOT NULL,state text NOT NULL,position text NOT NULL,employment_preference text NOT NULL,available_start_date date,preferred_shift text,
  authorized_to_work boolean NOT NULL DEFAULT false,reliable_transportation boolean NOT NULL DEFAULT false,experience_years text NOT NULL,
  license_state text,certifications text,interest text NOT NULL,additional_information text,resume_name text,resume_mime_type text,resume_data bytea,
  status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','REVIEWING','INTERVIEW','OFFERED','HIRED','DECLINED','ARCHIVED')),
  internal_notes text,applicant_response text,notification_status jsonb NOT NULL DEFAULT '{}'::jsonb,reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,responded_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`)
  .then(()=>query('CREATE INDEX IF NOT EXISTS idx_career_applications_status_created ON career_applications(status,created_at DESC)'))
  .then(()=>query('ALTER TABLE career_applications ENABLE ROW LEVEL SECURITY'))
  .then(()=>query('REVOKE ALL ON TABLE career_applications FROM anon, authenticated').catch(()=>{}))
  .catch(error=>{careerApplicationsSchemaPromise=null;throw error});
 return careerApplicationsSchemaPromise;
}
const DEMO_SOURCES=new Set(['DEMO','LOCAL','MOCK','TEST']);
const required=(body,fields)=>{for(const f of fields)if(!clean(body[f]))throw Object.assign(new Error(`${f} is required`),{statusCode:400})};
const secureDocumentSlug=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,56)||'document';
async function listUploadedSecureDocuments(){
 const result=await query(`SELECT document_key,title,description,original_name,mime_type,file_size,created_at
   FROM secure_documents WHERE active=true ORDER BY created_at DESC`).catch(error=>{
    if(error?.code==='42P01')return {rows:[]};
    throw error;
   });
 return result.rows.map(row=>({key:row.document_key,title:row.title,description:row.description||'',originalName:row.original_name,mimeType:row.mime_type,fileSize:Number(row.file_size)||0,createdAt:row.created_at,uploaded:true,links:[],calculator:null}));
}
async function listAllSecureDocuments(){return [...listSecureDocuments(),...await listUploadedSecureDocuments()]}
async function findSecureDocument(key){
 const builtIn=getSecureDocument(key);if(builtIn)return {...builtIn,uploaded:false};
 const result=await query(`SELECT document_key,title,description,original_name,mime_type,file_size,created_at
   FROM secure_documents WHERE document_key=$1 AND active=true LIMIT 1`,[clean(key)]).catch(error=>error?.code==='42P01'?{rows:[]}:Promise.reject(error));
 const row=result.rows[0];return row?{key:row.document_key,title:row.title,description:row.description||'',originalName:row.original_name,mimeType:row.mime_type,fileSize:Number(row.file_size)||0,createdAt:row.created_at,uploaded:true,links:[],calculator:null}:null;
}
const reference=()=>`NMT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomInt(1000,9999)}`;
const TEMP_PASSWORD_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
function generateTempPassword(length=14){
 let out='';
 for(let i=0;i<length;i++)out+=TEMP_PASSWORD_ALPHABET[crypto.randomInt(0,TEMP_PASSWORD_ALPHABET.length)];
 return out;
}
function isDemoReference(value){
 const ref=clean(value).toUpperCase();
 return /^NMT(?:-DRV)?-DEMO-/.test(ref) || ref.includes('-DEMO-');
}
function normalizeBookingSource(value){
 const source=clean(value).toUpperCase()||'CUSTOMER';
 return DEMO_SOURCES.has(source)?'CUSTOMER':source;
}
function tripStartWindowHours(distanceMiles){return Number(distanceMiles)>=30?2:1;}
function normalizeTripDate(value){
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
 const raw=clean(value);
 if(!raw)return '';
 const isoMatch=raw.match(/^(\d{4}-\d{2}-\d{2})/);
 if(isoMatch)return isoMatch[1];
 const parsed=new Date(raw);
 if(!Number.isNaN(parsed.getTime()))return parsed.toISOString().slice(0,10);
 return raw;
}
function normalizeTripTime(value){
 const raw=clean(value||'00:00');
 const hhmm=raw.match(/^(\d{2}:\d{2})/);
 return hhmm?hhmm[1]:raw;
}
function normalizeOptionalTripTime(value){
 const raw=clean(value||'');
 if(!raw) return '';
 const ampm=raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
 if(ampm){
  let h=Number(ampm[1]);
  const m=Number(ampm[2]);
  const meridiem=String(ampm[3]||'').toUpperCase();
  if(!Number.isFinite(h)||!Number.isFinite(m)||h<1||h>12||m<0||m>59) return '';
  if(meridiem==='AM'&&h===12) h=0;
  if(meridiem==='PM'&&h!==12) h+=12;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
 }
 const hhmm=raw.match(/^(\d{1,2}):(\d{2})/);
 if(!hhmm) return '';
 const h=Number(hhmm[1]);
 const m=Number(hhmm[2]);
 if(!Number.isFinite(h)||!Number.isFinite(m)||h<0||h>23||m<0||m>59) return '';
 return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function extractAppointmentTimeFromNotes(notes){
 const text=clean(notes||'');
 const match=text.match(/(?:Appointment\s*time|Appointment|Appt\s*time|Appt):\s*([0-2]?\d:[0-5]\d(?:\s*(?:AM|PM))?)/i);
 return match?normalizeOptionalTripTime(String(match[1])):'';
}
function appointmentNoteLabel(timeHHMM){
 const normalized=normalizeOptionalTripTime(timeHHMM);
 if(!normalized) return '';
 const [h,m]=normalized.split(':').map(Number);
 const meridiem=h>=12?'PM':'AM';
 const hour12=h%12===0?12:h%12;
 return `${hour12}:${String(m).padStart(2,'0')} ${meridiem}`;
}
function upsertAppointmentNote(notes,appointmentTime){
 const normalized=normalizeOptionalTripTime(appointmentTime);
 if(!normalized) return clean(notes||'')||null;
 const label=appointmentNoteLabel(normalized);
 const base=String(notes||'').replace(/(?:Appointment\s*time|Appointment|Appt\s*time|Appt):\s*[0-2]?\d:[0-5]\d(?:\s*(?:AM|PM))?/ig,'').replace(/\s*\|\s*\|\s*/g,' | ').trim();
 const appointmentLine=`Appointment time: ${label}`;
 if(!base) return appointmentLine;
 if(base.includes('\n')) return `${base}\n${appointmentLine}`;
 return `${base} | ${appointmentLine}`;
}
function extractCheckInTimeFromNotes(notes){
 const text=clean(notes||'');
 const match=text.match(/(?:Check-?in\s*time|Driver\s+yard\s+report\s+time):\s*([0-2]?\d:[0-5]\d(?:\s*(?:AM|PM))?)/i);
 return match?normalizeOptionalTripTime(String(match[1])):'';
}
function upsertCheckInNote(notes,checkInTime){
 const normalized=normalizeOptionalTripTime(checkInTime);
 if(!normalized) return clean(notes||'')||null;
 const label=appointmentNoteLabel(normalized);
 const base=String(notes||'')
  .replace(/(?:Check-?in\s*time|Driver\s+yard\s+report\s+time):\s*[0-2]?\d:[0-5]\d(?:\s*(?:AM|PM))?/ig,'')
  .replace(/\s*\|\s*\|\s*/g,' | ')
  .trim();
 const checkInLine=`Check-in time: ${label}`;
 if(!base) return checkInLine;
 if(base.includes('\n')) return `${base}\n${checkInLine}`;
 return `${base} | ${checkInLine}`;
}
function getSubmittedAppointmentTime(row){
 const explicitAppointment=normalizeOptionalTripTime(row?.appointment_time||row?.appointmentTime||extractAppointmentTimeFromNotes(row?.notes||''));
 if(explicitAppointment) return explicitAppointment;
 const bookingSource=clean(row?.booking_source||row?.bookingSource).toUpperCase();
 if(bookingSource.includes('BROKER')) return normalizeOptionalTripTime(row?.trip_time||row?.time||'');
 return '';
}
function getCheckInTime(row){
 return normalizeOptionalTripTime(row?.check_in_time||row?.checkInTime||extractCheckInTimeFromNotes(row?.notes||''));
}
function formatHistoryValue(value){
 const text=clean(value);
 return text||'—';
}
function collectBookingFieldHistoryEntries(beforeRow,afterRow){
 const before=mapBooking(beforeRow||{});
 const after=mapBooking(afterRow||{});
 const normalizeStatus=value=>String(value||'').trim().toUpperCase().replaceAll('-','_').replaceAll(' ','_');
 const normalizeMoney=value=>{
  if(value===null||value===undefined||clean(value)==='') return '';
  const num=Number(value);
  return Number.isFinite(num)?num.toFixed(2):clean(value);
 };
 const fields=[
  {label:'Status',before:normalizeStatus(before.status),after:normalizeStatus(after.status),displayBefore:before.statusLabel||before.status,displayAfter:after.statusLabel||after.status},
  {label:'Service',before:clean(before.service),after:clean(after.service)},
  {label:'Pickup location type',before:clean(before.pickupLocation||before.pickup_location),after:clean(after.pickupLocation||after.pickup_location)},
  {label:'Pickup',before:clean(before.pickup),after:clean(after.pickup)},
  {label:'Destination location type',before:clean(before.destinationLocation||before.dropoff_location),after:clean(after.destinationLocation||after.dropoff_location)},
  {label:'Destination',before:clean(before.destination),after:clean(after.destination)},
  {label:'Trip date',before:clean(before.date),after:clean(after.date)},
  {label:'Pickup time',before:clean(before.time),after:clean(after.time)},
  {label:'Appointment time',before:clean(before.submittedAppointmentTime),after:clean(after.submittedAppointmentTime)},
  {label:'Check-in time',before:clean(before.checkInTime),after:clean(after.checkInTime)},
  {label:'Driver',before:clean(before.driverName),after:clean(after.driverName)},
  {label:'Vehicle',before:clean(before.vehicleUnit),after:clean(after.vehicleUnit)},
  {label:'Booking source',before:clean(before.bookingSource).toUpperCase(),after:clean(after.bookingSource).toUpperCase()},
  {label:'Submitter login',before:clean(before.submitterEntity),after:clean(after.submitterEntity)},
  {label:'Broker company',before:clean(before.brokerCompanyName),after:clean(after.brokerCompanyName)},
  {label:'Driver confirmed rate',before:normalizeMoney(before.brokerAcceptedRate),after:normalizeMoney(after.brokerAcceptedRate)},
  {label:'Patient name',before:clean(before.name),after:clean(after.name)},
  {label:'Patient phone',before:clean(before.phone),after:clean(after.phone)},
  {label:'Patient email',before:clean(before.email),after:clean(after.email)},
  {label:'Trip notes',before:clean(before.notes),after:clean(after.notes)},
  {label:'Estimated fare',before:normalizeMoney(before.estimatedFare),after:normalizeMoney(after.estimatedFare)}
 ];
 const entries=[];
 for(const field of fields){
  if(field.before===field.after) continue;
  const fromValue=formatHistoryValue(field.displayBefore!=null?field.displayBefore:field.before);
  const toValue=formatHistoryValue(field.displayAfter!=null?field.displayAfter:field.after);
  entries.push(`${field.label} changed: ${fromValue} -> ${toValue}`);
 }
 return entries;
}
function parseTripDateTime(booking){
 const tripDate=normalizeTripDate(booking?.trip_date||booking?.date||'');
 const tripTime=normalizeTripTime(booking?.trip_time||booking?.time||'00:00');
 const parsed=new Date(`${tripDate}T${tripTime.length===5?`${tripTime}:00`:tripTime}`);
 return {tripDate,tripTime,parsed};
}
function getTripStartPolicy(booking,earlyPickupReason=''){
 const {tripDate,tripTime,parsed}=parseTripDateTime(booking);
 const miles=Number(booking?.distance_miles??booking?.distanceMiles);
 const windowHours=tripStartWindowHours(Number.isFinite(miles)?miles:0);
 const windowStart=new Date(parsed.getTime()-windowHours*3600000);
 const reason=clean(earlyPickupReason);
 if(reason){
  return {allowed:true,reason,windowHours,tripDate,tripTime,windowStart};
 }
 if(!tripDate||Number.isNaN(parsed.getTime())){
  return {allowed:true,windowHours,tripDate,tripTime,windowStart};
 }
 const todayIso=new Date().toISOString().slice(0,10);
 if(todayIso!==tripDate){
  return {allowed:false,windowHours,tripDate,tripTime,windowStart,message:`This trip can only start on ${tripDate}. Enter an early pickup reason if the patient requested an earlier pickup.`};
 }
 if(Date.now()>=windowStart.getTime()){
  return {allowed:true,windowHours,tripDate,tripTime,windowStart};
 }
 const readableTime=windowStart.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
 return {allowed:false,windowHours,tripDate,tripTime,windowStart,message:`This trip cannot start yet. It unlocks ${windowHours} hour${windowHours===1?'':'s'} before pickup (${readableTime}). Enter an early pickup reason if the patient requested an earlier pickup.`};
}

// Service → preferred vehicle unit prefixes (ordered by preference)
const SERVICE_VEHICLE_PREFS={
 ambulatory:     ['SE-254-01','SUV-254-01','SH-254-01'],
 wheelchair:     ['WV-254-01','SH-254-01'],
 stretcher:      ['ST-254-01'],
 bls:            ['AMB-254-01'],
 als1:           ['AMB-254-02','AMB-254-01'],
 als2:           ['AMB-254-02'],
 facility_transfer:         ['WV-254-01','SH-254-01','SE-254-01','SUV-254-01'],
 facility_transfer_critical:['AMB-254-02','AMB-254-01'],
 bariatric:      ['WV-254-01'],
 broda:          ['WV-254-01','SH-254-01'],
 hospital_discharge:        ['SE-254-01','SUV-254-01','WV-254-01'],
};
async function autoAssign(booking){
 try{
  const svc=(booking.service||'').toLowerCase().replace(/-/g,'_');
  const prefs=SERVICE_VEHICLE_PREFS[svc]||SERVICE_VEHICLE_PREFS.ambulatory;
  // Find first AVAILABLE vehicle from preference list
  const vRows=await query(`SELECT unit_number FROM vehicles WHERE unit_number=ANY($1) AND status='AVAILABLE' ORDER BY array_position($1,unit_number) LIMIT 1`,[prefs]);
  const vehicleUnit=vRows.rows[0]?.unit_number||null;
  // Find available driver (on shift for the trip date, not on an active trip today)
  const tripDate=booking.trip_date||new Date().toISOString().slice(0,10);
  const tripTime=booking.trip_time||'08:00';
  const weekday=new Date(tripDate+'T12:00:00').getDay()||7;
  const driverLookup=buildDriverEmployeeLookupSql();
  const dRows=await query(`
   SELECT ${driverLookup.select} FROM employees e
   INNER JOIN employee_shifts es ON e.id=es.employee_id
   ${driverLookup.join}
   WHERE e.role='DRIVER' AND e.active=true AND es.active=true
     AND es.weekday_iso=$1
     AND es.start_time::time<=$2::time AND es.end_time::time>$2::time
     AND es.effective_start_date<=$3::date
     AND (es.effective_end_date IS NULL OR es.effective_end_date>=$3::date)
   ORDER BY e.display_name LIMIT 5
  `,[weekday,tripTime,tripDate]);
  // Pick driver not already on an active trip at the same time
  let driverName=null;let driverScopeId=null;let driverEmail=null;let driverPhone=null;
  for(const d of dRows.rows){
   const busy=await query(`SELECT 1 FROM bookings WHERE driver_name=$1 AND trip_date=$2 AND status NOT IN ('CANCELLED','COMPLETED','DELIVERED') LIMIT 1`,[d.display_name,tripDate]);
   if(!busy.rows[0]){driverName=d.display_name;driverScopeId=d.scope_id||null;driverEmail=d.email||null;driverPhone=d.phone||null;break;}
  }
  if(!driverName&&dRows.rows[0]){driverName=dRows.rows[0].display_name;driverScopeId=dRows.rows[0].scope_id||null;driverEmail=dRows.rows[0].email||null;driverPhone=dRows.rows[0].phone||null;} // fallback: take first on shift
  if(!vehicleUnit&&!driverName)return {assigned:false,message:'No available vehicle or driver found for this service type.'};
  const nextStatus=resolveAssignedStatus(booking.status);
  // Update booking
  await query(`UPDATE bookings SET driver_name=COALESCE($1,driver_name),driver_scope_id=COALESCE($2,driver_scope_id),vehicle_unit=COALESCE($3,vehicle_unit),status=$5,updated_at=now() WHERE reference=$4`,[driverName,driverScopeId,vehicleUnit,nextStatus,booking.reference]);
  const updatedBookingResult=await query('SELECT * FROM bookings WHERE reference=$1',[booking.reference]);
  const updatedBooking=updatedBookingResult.rows[0];
  await notifyAssignedDriver(updatedBooking,{driverName,driverScopeId,driverEmail,driverPhone,vehicleUnit}).catch(e=>console.error('[ASSIGNMENT_NOTIFY]',e.message));
  return {assigned:true,driverName,vehicleUnit,status:nextStatus,message:`Assigned to ${driverName||'—'} / ${vehicleUnit||'—'}`};
 }catch(e){console.error('[AUTO-ASSIGN]',e.message);return {assigned:false,message:'Auto-assign error: '+e.message};}
}

async function createBookingFromBrokerRequest(requestBody,requestRow){
 const requestedReference=clean(requestBody?.booking_reference||requestRow?.booking_reference||reference());
 const bookingReference=isDemoReference(requestedReference)?reference():requestedReference;
 const payload=buildBrokerBookingPayload(requestRow||{},requestBody||{},bookingReference);
 payload.booking_source=normalizeBookingSource(payload.booking_source);
 const brokerNotes=upsertAppointmentNote(payload.notes||'',payload.trip_time||'');
 const bookingResult=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_miles,estimated_duration,estimated_fare,booking_source,submitter_entity,broker_company_name,broker_accepted_rate,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUBMITTED',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),now()) RETURNING *`,[payload.reference,payload.name,payload.phone,payload.email,payload.service,payload.pickup,payload.destination,payload.trip_date,payload.trip_time,brokerNotes,payload.pickup_lat,payload.pickup_lng,payload.destination_lat,payload.destination_lng,null,null,payload.estimated_fare||null,payload.booking_source,clean(requestBody?.submitted_by||requestRow?.submitted_by||payload.email||'')||null,clean(requestBody?.broker_name||requestRow?.broker_name||'')||null,payload.estimated_fare||null]);
 const booking=bookingResult.rows[0];
 const teamsNotification=await sendBookingTeamsAlert(booking,'🚐 New Broker Trip Booked — Admin_NMT','New Broker Trip Booked');
 await query('UPDATE bookings SET notification_status=$2::jsonb WHERE reference=$1',[booking.reference,JSON.stringify({teams:teamsNotification})]).catch(()=>{});
 await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[booking.reference,'SUBMITTED','submitted','Broker request materialized into a booking','DISPATCH']);
 const autoAssignResult=await autoAssign(booking);
 const requestStatus=resolveBrokerRequestStatus({bookingCreated:true,autoAssigned:autoAssignResult.assigned});
 await query('UPDATE broker_requests SET booking_reference=$2,request_status=$3,updated_at=now() WHERE id=$1',[requestRow.id,booking.reference,requestStatus]);
 return {booking,requestStatus,autoAssignResult};
}

const DEFAULT_PRICING={
 wheelchair:{label:'Wheelchair Transportation',base:98,includedMiles:8,perMile:4.1,waitPer15:18.75},
 ambulatory:{label:'Ambulatory Transportation',base:75,includedMiles:5,perMile:3.55,waitPer15:12.5},
 facility_transfer:{label:'Facility-to-Facility Transfer (Routine IFT)',base:165,includedMiles:8,perMile:5.25,waitPer15:30},
 facility_transfer_critical:{label:'Facility-to-Facility Transfer (High-Acuity IFT)',base:340,includedMiles:8,perMile:8.75,waitPer15:45},
 broda:{label:'Broda Chair Transportation',base:165,includedMiles:8,perMile:5.5,waitPer15:25},
 stretcher:{label:'Stretcher Transportation',base:455,includedMiles:8,perMile:7.95,waitPer15:36.25},
 bariatric:{label:'Bariatric Transportation',base:430,includedMiles:8,perMile:9.95,waitPer15:45},
 bls:{label:'BLS Ambulance',base:1125,includedMiles:0,perMile:18.5,waitPer15:50},
 als1:{label:'ALS I Ambulance',base:1395,includedMiles:0,perMile:21.5,waitPer15:62.5},
 als2:{label:'ALS II Ambulance',base:1450,includedMiles:0,perMile:24.5,waitPer15:75}
};

const DEFAULT_SERVICE_POLICIES={
 wheelchair:{cancellationFee:40,noShowFee:60,trafficOverageFeePerHour:25,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 ambulatory:{cancellationFee:35,noShowFee:50,trafficOverageFeePerHour:20,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 facility_transfer:{cancellationFee:85,noShowFee:115,trafficOverageFeePerHour:42,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 facility_transfer_critical:{cancellationFee:180,noShowFee:240,trafficOverageFeePerHour:75,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 broda:{cancellationFee:75,noShowFee:95,trafficOverageFeePerHour:35,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 stretcher:{cancellationFee:120,noShowFee:150,trafficOverageFeePerHour:50,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 bariatric:{cancellationFee:160,noShowFee:200,trafficOverageFeePerHour:65,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 bls:{cancellationFee:200,noShowFee:260,trafficOverageFeePerHour:85,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 als1:{cancellationFee:250,noShowFee:325,trafficOverageFeePerHour:95,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
 als2:{cancellationFee:300,noShowFee:390,trafficOverageFeePerHour:110,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30}
};

const DEFAULT_PLATFORM_SETTINGS={
 pricing:DEFAULT_PRICING,
 fareRules:{
  minimumFare:0,
  fuelSurchargePerMile:0,
  fuelPricingMode:'MANUAL',
  fuelIndexSource:'EIA',
  fuelIndexSeriesId:'PET.EMM_EPM0_PTE_SUS_DPG.W',
  fuelIndexPricePerGallon:0,
  fuelBaselinePricePerGallon:3.25,
  fuelEfficiencyMpg:10,
  fuelOperationalBufferPct:20,
  tollCostPerTrip:0,
  maintenanceCostPerMile:0,
  insuranceCostPerTrip:0,
  dispatchOverheadPerTrip:0,
  cleaningCostPerTrip:0,
  complianceCostPerTrip:0,
  otherVariableCostPerTrip:0,
  fuelLastUpdatedAt:null,
 afterHoursSurchargePct:30,
 weekendSurchargePct:30,
 holidaySurchargePct:30,
  cancellationFee:30,
  cancellationWindowHours:24,
  cancellationLeadHours:72,
  noShowFee:50,
  freeWaitMinutes:120,
  mileageRoundingRule:'TENTH_MILE',
  telemetryRefreshSeconds:20,
  maxBookingDistanceMiles:125,
  returnMilesThreshold:10,
  returnMilesInclusionPct:100,
  trafficOverageFeePerHour:0,
  trafficOverageGraceMinutes:0,
  servicePolicies:DEFAULT_SERVICE_POLICIES
 },
 organization:{
  name:'Nexus Medical Transit',
  phone:'(888) 760-4990',
  email:'contact@nexusmt.com',
  website:'https://nexusmt.com',
  yardAddress:'22505 Gateway Center Dr, Clarksburg MD 20871',
  preTripInspectionMinutes:45
 },
 activeServices:['AMBULANCE','WHEELCHAIR','STRETCHER','HOSPITAL_DISCHARGE','FACILITY_TRANSFER','FACILITY_TRANSFER_CRITICAL']
};

async function ensureSettingsTable(){
 await query(`CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
 )`);
}

const n=(v,d=0)=>{const x=Number(v);return Number.isFinite(x)?x:d};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const PAYMENT_COMPLETE_STATUSES=new Set(['DEPOSIT_PAID','PAID_IN_FULL']);

function toIsoDate(value){
 const raw=clean(value);
 if(!raw)return '';
 const match=raw.match(/^(\d{4}-\d{2}-\d{2})$/);
 if(match)return match[1];
 const parsed=new Date(raw);
 return Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,10);
}

function startOfMonth(date=new Date()){
 return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)).toISOString().slice(0,10);
}

function endOfMonth(date=new Date()){
 return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
}

function parseAnalyticsRange(event){
 const qs=event.queryStringParameters||{};
 const today=new Date();
 const start=toIsoDate(qs.start)||startOfMonth(today);
 const end=toIsoDate(qs.end)||endOfMonth(today);
 const groupBy=['day','week','month'].includes(clean(qs.groupBy).toLowerCase())?clean(qs.groupBy).toLowerCase():'day';
 return {start,end,groupBy};
}

function analyticsBucketSql(groupBy){
 if(groupBy==='month')return `to_char(date_trunc('month', trip_date::timestamp), 'YYYY-MM')`;
 if(groupBy==='week')return `to_char(date_trunc('week', trip_date::timestamp), 'YYYY-MM-DD')`;
 return `to_char(trip_date::date, 'YYYY-MM-DD')`;
}

async function getRevenueAnalytics(start,end,groupBy){
 const seriesBucket=analyticsBucketSql(groupBy);
 const summaryResult=await query(`
  SELECT
   COUNT(*)::int AS bookings,
   COALESCE(SUM(COALESCE(estimated_fare,0)),0)::numeric(12,2) AS estimated_revenue,
   COALESCE(SUM(CASE WHEN payment_status='PAID_IN_FULL' THEN COALESCE(estimated_fare,0) WHEN payment_status='DEPOSIT_PAID' THEN COALESCE(deposit_amount,0) ELSE 0 END),0)::numeric(12,2) AS cash_collected,
   COALESCE(SUM(COALESCE(balance_due,0)),0)::numeric(12,2) AS outstanding_balance,
   COALESCE(SUM(COALESCE(deposit_amount,0)),0)::numeric(12,2) AS deposits_captured,
   COALESCE(SUM(CASE WHEN cancellation_fee_applied THEN COALESCE(cancellation_fee_amount,0) ELSE 0 END),0)::numeric(12,2) AS cancellation_fees,
   COUNT(*) FILTER (WHERE status='COMPLETED')::int AS completed_trips,
   COUNT(*) FILTER (WHERE payment_status='PAID_IN_FULL')::int AS paid_in_full_trips,
   COUNT(*) FILTER (WHERE payment_status='DEPOSIT_PAID')::int AS deposit_trips
  FROM bookings
  WHERE trip_date >= $1 AND trip_date <= $2
 `,[start,end]);
 const summary=summaryResult.rows[0]||{};

 const seriesResult=await query(`
  SELECT
   ${seriesBucket} AS bucket,
   COUNT(*)::int AS bookings,
   COALESCE(SUM(COALESCE(estimated_fare,0)),0)::numeric(12,2) AS estimated_revenue,
   COALESCE(SUM(CASE WHEN payment_status='PAID_IN_FULL' THEN COALESCE(estimated_fare,0) WHEN payment_status='DEPOSIT_PAID' THEN COALESCE(deposit_amount,0) ELSE 0 END),0)::numeric(12,2) AS cash_collected,
   COUNT(*) FILTER (WHERE status='COMPLETED')::int AS completed_trips
  FROM bookings
  WHERE trip_date >= $1 AND trip_date <= $2
  GROUP BY 1
  ORDER BY 1
 `,[start,end]);

 const serviceResult=await query(`
  SELECT
   COALESCE(NULLIF(service,''),'unknown') AS service,
   COUNT(*)::int AS bookings,
   COALESCE(SUM(COALESCE(estimated_fare,0)),0)::numeric(12,2) AS estimated_revenue,
   COALESCE(AVG(NULLIF(estimated_fare,0)),0)::numeric(12,2) AS average_fare
  FROM bookings
  WHERE trip_date >= $1 AND trip_date <= $2
  GROUP BY 1
  ORDER BY estimated_revenue DESC, bookings DESC
 `,[start,end]);

 const statusResult=await query(`
  SELECT
   COALESCE(NULLIF(status,''),'UNKNOWN') AS status,
   COUNT(*)::int AS bookings,
   COALESCE(SUM(COALESCE(estimated_fare,0)),0)::numeric(12,2) AS estimated_revenue
  FROM bookings
  WHERE trip_date >= $1 AND trip_date <= $2
  GROUP BY 1
  ORDER BY bookings DESC
 `,[start,end]);

 const paymentStatusResult=await query(`
  SELECT
   COALESCE(NULLIF(payment_status,''),'UNPAID') AS payment_status,
   COUNT(*)::int AS bookings,
   COALESCE(SUM(COALESCE(estimated_fare,0)),0)::numeric(12,2) AS estimated_revenue,
   COALESCE(SUM(COALESCE(balance_due,0)),0)::numeric(12,2) AS outstanding_balance
  FROM bookings
  WHERE trip_date >= $1 AND trip_date <= $2
  GROUP BY 1
  ORDER BY bookings DESC
 `,[start,end]);

 const sourceResult=await query(`
  SELECT
   COALESCE(NULLIF(booking_source,''),'CUSTOMER') AS booking_source,
   COUNT(*)::int AS bookings,
   COALESCE(SUM(COALESCE(estimated_fare,0)),0)::numeric(12,2) AS estimated_revenue
  FROM bookings
  WHERE trip_date >= $1 AND trip_date <= $2
  GROUP BY 1
  ORDER BY estimated_revenue DESC, bookings DESC
 `,[start,end]);

 const rangeStart=new Date(`${start}T00:00:00Z`);
 const rangeEnd=new Date(`${end}T00:00:00Z`);
 const daySpan=Math.max(1,Math.round((rangeEnd-rangeStart)/86400000)+1);
 const today=new Date();
 const periodIsCurrentMonth=start===startOfMonth(today)&&end===endOfMonth(today);
 const elapsedDays=periodIsCurrentMonth?Math.max(1,today.getUTCDate()):daySpan;
 const estimatedRevenue=n(summary.estimated_revenue);
 const projectedMonthRevenue=periodIsCurrentMonth?Number(((estimatedRevenue/elapsedDays)*new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+1,0)).getUTCDate()).toFixed(2)):estimatedRevenue;
 const completedTrips=n(summary.completed_trips);
 const bookings=n(summary.bookings);

 return {
  period:{start,end,groupBy,days:daySpan,isCurrentMonth:periodIsCurrentMonth},
  summary:{
   bookings,
   completedTrips,
   completionRate:bookings?Number(((completedTrips/bookings)*100).toFixed(2)):0,
   estimatedRevenue:Number(estimatedRevenue.toFixed(2)),
   cashCollected:Number(n(summary.cash_collected).toFixed(2)),
   outstandingBalance:Number(n(summary.outstanding_balance).toFixed(2)),
   depositsCaptured:Number(n(summary.deposits_captured).toFixed(2)),
   cancellationFees:Number(n(summary.cancellation_fees).toFixed(2)),
   averageTicket:bookings?Number((estimatedRevenue/bookings).toFixed(2)):0,
   projectedPeriodRevenue:projectedMonthRevenue,
   paidInFullTrips:n(summary.paid_in_full_trips),
   depositTrips:n(summary.deposit_trips)
  },
  series:seriesResult.rows.map((row)=>(
   {bucket:row.bucket,bookings:Number(row.bookings||0),estimatedRevenue:Number(row.estimated_revenue||0),cashCollected:Number(row.cash_collected||0),completedTrips:Number(row.completed_trips||0)}
  )),
  breakdowns:{
   byService:serviceResult.rows.map((row)=>({service:row.service,bookings:Number(row.bookings||0),estimatedRevenue:Number(row.estimated_revenue||0),averageFare:Number(row.average_fare||0)})),
   byStatus:statusResult.rows.map((row)=>({status:statusLabel(row.status),bookings:Number(row.bookings||0),estimatedRevenue:Number(row.estimated_revenue||0)})),
   byPaymentStatus:paymentStatusResult.rows.map((row)=>({paymentStatus:row.payment_status,bookings:Number(row.bookings||0),estimatedRevenue:Number(row.estimated_revenue||0),outstandingBalance:Number(row.outstanding_balance||0)})),
   bySource:sourceResult.rows.map((row)=>({bookingSource:row.booking_source,bookings:Number(row.bookings||0),estimatedRevenue:Number(row.estimated_revenue||0)}))
  },
  governance:{
   piiIncluded:false,
   intendedRoles:['ADMIN','EXECUTIVE','BILLING'],
   sourceTables:['bookings','trip_status_history','audit_log']
  }
 };
}

  const DRIVER_PAY_RATES={ambulatory:20,wheelchair:25,stretcher:30,ambulance:40};

  function resolveCostBand(service){
   const raw=String(service||'').trim().toLowerCase();
   if(!raw)return 'ambulatory';
   if(raw.includes('wheel')||raw.includes('broda'))return 'wheelchair';
   if(raw.includes('stretcher')||raw.includes('bariatric'))return 'stretcher';
   if(raw.includes('ambulance')||raw.includes('bls')||raw.includes('als')||raw.includes('critical')||raw.includes('cct'))return 'ambulance';
   if(raw.includes('facility_transfer_critical'))return 'ambulance';
   return 'ambulatory';
  }

  function parseCostAnalyzerRange(event){
   const qs=event.queryStringParameters||{};
   const {start,end,groupBy}=parseAnalyticsRange(event);
   const limit=Math.min(5000,Math.max(50,Number(qs.limit||500)||500));
   return {
    start,
    end,
    groupBy,
    limit,
    driver:clean(qs.driver),
    vehicle:clean(qs.vehicle),
    service:clean(qs.service),
    source:clean(qs.source).toUpperCase(),
    status:clean(qs.status).toUpperCase(),
    includeCancelled:String(qs.includeCancelled||'false').toLowerCase()==='true'
   };
  }

  function costBucketLabel(dateValue,groupBy){
   const dateText=String(dateValue||'').slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText))return dateText||'unknown';
   if(groupBy==='day')return dateText;
   const dt=new Date(`${dateText}T00:00:00Z`);
   if(Number.isNaN(dt.getTime()))return dateText;
   if(groupBy==='month')return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`;
   const day=dt.getUTCDay()||7;
   dt.setUTCDate(dt.getUTCDate()-(day-1));
   return dt.toISOString().slice(0,10);
  }

  function sumCostBucket(map,key,cost,revenue,profit,trips){
   if(!map[key])map[key]={bucket:key,trips:0,totalCost:0,totalRevenue:0,totalProfit:0};
   map[key].trips+=trips;
   map[key].totalCost+=cost;
   map[key].totalRevenue+=revenue;
   map[key].totalProfit+=profit;
  }

  function rankBreakdown(map,labelKey){
   return Object.values(map).sort((a,b)=>b.totalCost-a.totalCost||b.trips-a.trips).map((item)=>({
    [labelKey]:item[labelKey],
    trips:item.trips,
    totalCost:Number(item.totalCost.toFixed(2)),
    totalRevenue:Number(item.totalRevenue.toFixed(2)),
    totalProfit:Number(item.totalProfit.toFixed(2)),
    averageCostPerTrip:item.trips?Number((item.totalCost/item.trips).toFixed(2)):0
   }));
  }

  function toCostAnalyzerCsv(rows){
    const header=['reference','trip_date','trip_time','service','driver_name','vehicle_unit','distance_miles','estimated_fare','cost_band','driver_pay','fuel_price_per_gallon','mpg_used','fuel_cost','toll_cost','maintenance_cost','insurance_cost','dispatch_overhead_cost','cleaning_cost','compliance_cost','other_variable_cost','other_cost_total','trip_cost','profit'];
   const escape=(value)=>{const str=String(value??'');return /[",\n]/.test(str)?`"${str.replaceAll('"','""')}"`:str;};
   return [header.join(','),...rows.map((row)=>header.map((key)=>escape(row[key])).join(','))].join('\n');
  }

    function sortTextOptions(values=[]){
    return Array.from(new Set(values.map((value)=>clean(value)).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    }

    async function getCostAnalyzerFilterOptions(options){
    const where=['trip_date >= $1','trip_date <= $2'];
    const params=[options.start,options.end];
    if(!options.includeCancelled)where.push(`COALESCE(status,'') <> 'CANCELLED'`);
    const sqlWhere=where.join(' AND ');
    const [drivers,vehicles,services,sources,statuses]=await Promise.all([
     query(`SELECT DISTINCT COALESCE(NULLIF(trim(driver_name),''),'Unassigned') AS value FROM bookings WHERE ${sqlWhere} ORDER BY 1`,params),
     query(`SELECT DISTINCT COALESCE(NULLIF(trim(vehicle_unit),''),'Unassigned') AS value FROM bookings WHERE ${sqlWhere} ORDER BY 1`,params),
     query(`SELECT DISTINCT COALESCE(NULLIF(trim(service),''),'unknown') AS value FROM bookings WHERE ${sqlWhere} ORDER BY 1`,params),
     query(`SELECT DISTINCT COALESCE(NULLIF(trim(booking_source),''),'CUSTOMER') AS value FROM bookings WHERE ${sqlWhere} ORDER BY 1`,params),
     query(`SELECT DISTINCT COALESCE(NULLIF(trim(status),''),'SUBMITTED') AS value FROM bookings WHERE ${sqlWhere} ORDER BY 1`,params)
    ]);
    return {
     drivers:sortTextOptions((drivers.rows||[]).map((row)=>row.value)),
     vehicles:sortTextOptions((vehicles.rows||[]).map((row)=>row.value)),
     services:sortTextOptions((services.rows||[]).map((row)=>row.value)),
     sources:sortTextOptions((sources.rows||[]).map((row)=>String(row.value||'').toUpperCase())),
     statuses:sortTextOptions((statuses.rows||[]).map((row)=>String(row.value||'').toUpperCase()))
    };
    }

  async function getCostAnalyzerAnalytics(options){
   const settings=await readPlatformSettings();
   const fareRules=settings.fareRules||{};
   const fuelIndexPrice=n(fareRules.fuelIndexPricePerGallon,0);
   const fuelPricePerGallon=fuelIndexPrice>0?fuelIndexPrice:n(fareRules.fuelBaselinePricePerGallon,3.25);
   const defaultMpg=clamp(n(fareRules.fuelEfficiencyMpg,10),1,100);
   const fuelBufferPct=clamp(n(fareRules.fuelOperationalBufferPct,0),0,300);
    const tollCostPerTrip=clamp(n(fareRules.tollCostPerTrip,0),0,1000);
    const maintenanceCostPerMile=clamp(n(fareRules.maintenanceCostPerMile,0),0,100);
    const insuranceCostPerTrip=clamp(n(fareRules.insuranceCostPerTrip,0),0,1000);
    const dispatchOverheadPerTrip=clamp(n(fareRules.dispatchOverheadPerTrip,0),0,1000);
    const cleaningCostPerTrip=clamp(n(fareRules.cleaningCostPerTrip,0),0,1000);
    const complianceCostPerTrip=clamp(n(fareRules.complianceCostPerTrip,0),0,1000);
    const otherVariableCostPerTrip=clamp(n(fareRules.otherVariableCostPerTrip,0),0,1000);

   const where=['b.trip_date >= $1','b.trip_date <= $2'];
   const params=[options.start,options.end];
   let idx=3;
   if(options.driver){where.push(`COALESCE(b.driver_name,'') ILIKE $${idx++}`);params.push(`%${options.driver}%`);}
   if(options.vehicle){where.push(`COALESCE(b.vehicle_unit,'') ILIKE $${idx++}`);params.push(`%${options.vehicle}%`);}
   if(options.service){where.push(`COALESCE(b.service,'') ILIKE $${idx++}`);params.push(`%${options.service}%`);}
   if(options.source){where.push(`COALESCE(b.booking_source,'CUSTOMER') = $${idx++}`);params.push(options.source);}
   if(options.status){where.push(`COALESCE(b.status,'SUBMITTED') = $${idx++}`);params.push(options.status);}
   if(!options.includeCancelled){where.push(`COALESCE(b.status,'') <> 'CANCELLED'`);}
   params.push(options.limit);

   const bookings=await query(`
    SELECT
     b.reference,b.trip_date,b.trip_time,b.service,b.status,b.booking_source,
     b.driver_name,b.vehicle_unit,
     COALESCE(b.distance_miles,0)::numeric(12,2) AS distance_miles,
     COALESCE(b.estimated_fare,0)::numeric(12,2) AS estimated_fare,
     v.vehicle_type,
     v.fuel_efficiency_mpg,
     COALESCE(NULLIF(v.metadata->>'mpg_rating',''),'0')::numeric(12,2) AS vehicle_metadata_mpg
    FROM bookings b
    LEFT JOIN vehicles v ON v.unit_number=b.vehicle_unit
    WHERE ${where.join(' AND ')}
    ORDER BY b.trip_date DESC,b.trip_time DESC,b.reference DESC
    LIMIT $${idx}
   `,params);

   const seriesMap={};
   const byDriver={};
   const byVehicle={};
   const byService={};
   const bySource={};
   const byStatus={};
   const tripRows=[];

  let totalTrips=0;let totalRevenue=0;let totalCost=0;let totalDriverPay=0;let totalFuelCost=0;
  let totalTollCost=0;let totalMaintenanceCost=0;let totalInsuranceCost=0;let totalDispatchOverheadCost=0;let totalCleaningCost=0;let totalComplianceCost=0;let totalOtherVariableCost=0;

   for(const row of bookings.rows||[]){
    const distance=n(row.distance_miles,0);
    const estimatedFare=n(row.estimated_fare,0);
    const band=resolveCostBand(row.service);
    const driverPay=n(DRIVER_PAY_RATES[band],20);
    const mpgCandidate=n(row.fuel_efficiency_mpg,0)>0?n(row.fuel_efficiency_mpg,0):n(row.vehicle_metadata_mpg,0);
    const mpgUsed=mpgCandidate>0?mpgCandidate:defaultMpg;
    const gallonsUsed=distance>0?distance/mpgUsed:0;
    const fuelCostRaw=gallonsUsed*fuelPricePerGallon;
    const fuelCost=fuelCostRaw*(1+(fuelBufferPct/100));
    const tollCost=tollCostPerTrip;
    const maintenanceCost=distance*maintenanceCostPerMile;
    const insuranceCost=insuranceCostPerTrip;
    const dispatchOverheadCost=dispatchOverheadPerTrip;
    const cleaningCost=cleaningCostPerTrip;
    const complianceCost=complianceCostPerTrip;
    const otherVariableCost=otherVariableCostPerTrip;
    const otherCostTotal=tollCost+maintenanceCost+insuranceCost+dispatchOverheadCost+cleaningCost+complianceCost+otherVariableCost;
    const tripCost=driverPay+fuelCost+otherCostTotal;
    const profit=estimatedFare-tripCost;
    const bucket=costBucketLabel(row.trip_date,options.groupBy);

    totalTrips+=1;
    totalRevenue+=estimatedFare;
    totalCost+=tripCost;
    totalDriverPay+=driverPay;
    totalFuelCost+=fuelCost;
    totalTollCost+=tollCost;
    totalMaintenanceCost+=maintenanceCost;
    totalInsuranceCost+=insuranceCost;
    totalDispatchOverheadCost+=dispatchOverheadCost;
    totalCleaningCost+=cleaningCost;
    totalComplianceCost+=complianceCost;
    totalOtherVariableCost+=otherVariableCost;

    sumCostBucket(seriesMap,bucket,tripCost,estimatedFare,profit,1);

    const driverKey=clean(row.driver_name)||'Unassigned';
    if(!byDriver[driverKey])byDriver[driverKey]={driver:driverKey,trips:0,totalCost:0,totalRevenue:0,totalProfit:0};
    byDriver[driverKey].trips+=1;byDriver[driverKey].totalCost+=tripCost;byDriver[driverKey].totalRevenue+=estimatedFare;byDriver[driverKey].totalProfit+=profit;

    const vehicleKey=clean(row.vehicle_unit)||'Unassigned';
    if(!byVehicle[vehicleKey])byVehicle[vehicleKey]={vehicleUnit:vehicleKey,vehicleType:clean(row.vehicle_type)||'Unknown',trips:0,totalCost:0,totalRevenue:0,totalProfit:0,driverPayCost:0,fuelCost:0,tollCost:0,maintenanceCost:0,insuranceCost:0,dispatchOverheadCost:0,cleaningCost:0,complianceCost:0,otherVariableCost:0};
    byVehicle[vehicleKey].trips+=1;byVehicle[vehicleKey].totalCost+=tripCost;byVehicle[vehicleKey].totalRevenue+=estimatedFare;byVehicle[vehicleKey].totalProfit+=profit;
    byVehicle[vehicleKey].driverPayCost+=driverPay;byVehicle[vehicleKey].fuelCost+=fuelCost;byVehicle[vehicleKey].tollCost+=tollCost;byVehicle[vehicleKey].maintenanceCost+=maintenanceCost;byVehicle[vehicleKey].insuranceCost+=insuranceCost;byVehicle[vehicleKey].dispatchOverheadCost+=dispatchOverheadCost;byVehicle[vehicleKey].cleaningCost+=cleaningCost;byVehicle[vehicleKey].complianceCost+=complianceCost;byVehicle[vehicleKey].otherVariableCost+=otherVariableCost;

    const serviceKey=clean(row.service)||'unknown';
    if(!byService[serviceKey])byService[serviceKey]={service:serviceKey,trips:0,totalCost:0,totalRevenue:0,totalProfit:0};
    byService[serviceKey].trips+=1;byService[serviceKey].totalCost+=tripCost;byService[serviceKey].totalRevenue+=estimatedFare;byService[serviceKey].totalProfit+=profit;

    const sourceKey=clean(row.booking_source)||'CUSTOMER';
    if(!bySource[sourceKey])bySource[sourceKey]={bookingSource:sourceKey,trips:0,totalCost:0,totalRevenue:0,totalProfit:0};
    bySource[sourceKey].trips+=1;bySource[sourceKey].totalCost+=tripCost;bySource[sourceKey].totalRevenue+=estimatedFare;bySource[sourceKey].totalProfit+=profit;

    const statusKey=clean(row.status)||'SUBMITTED';
    if(!byStatus[statusKey])byStatus[statusKey]={status:statusKey,trips:0,totalCost:0,totalRevenue:0,totalProfit:0};
    byStatus[statusKey].trips+=1;byStatus[statusKey].totalCost+=tripCost;byStatus[statusKey].totalRevenue+=estimatedFare;byStatus[statusKey].totalProfit+=profit;

    tripRows.push({
     reference:clean(row.reference),
     trip_date:String(row.trip_date||''),
     trip_time:clean(row.trip_time||''),
     service:serviceKey,
     driver_name:driverKey,
     vehicle_unit:vehicleKey,
     distance_miles:Number(distance.toFixed(2)),
     estimated_fare:Number(estimatedFare.toFixed(2)),
     cost_band:band,
     driver_pay:Number(driverPay.toFixed(2)),
     fuel_price_per_gallon:Number(fuelPricePerGallon.toFixed(3)),
     mpg_used:Number(mpgUsed.toFixed(2)),
     fuel_cost:Number(fuelCost.toFixed(2)),
    toll_cost:Number(tollCost.toFixed(2)),
    maintenance_cost:Number(maintenanceCost.toFixed(2)),
    insurance_cost:Number(insuranceCost.toFixed(2)),
    dispatch_overhead_cost:Number(dispatchOverheadCost.toFixed(2)),
    cleaning_cost:Number(cleaningCost.toFixed(2)),
    compliance_cost:Number(complianceCost.toFixed(2)),
    other_variable_cost:Number(otherVariableCost.toFixed(2)),
    other_cost_total:Number(otherCostTotal.toFixed(2)),
     trip_cost:Number(tripCost.toFixed(2)),
     profit:Number(profit.toFixed(2))
    });
   }

   const summary={
    trips:totalTrips,
    totalCost:Number(totalCost.toFixed(2)),
    totalRevenue:Number(totalRevenue.toFixed(2)),
    totalProfit:Number((totalRevenue-totalCost).toFixed(2)),
    averageCostPerTrip:totalTrips?Number((totalCost/totalTrips).toFixed(2)):0,
    averageRevenuePerTrip:totalTrips?Number((totalRevenue/totalTrips).toFixed(2)):0,
    averageProfitPerTrip:totalTrips?Number(((totalRevenue-totalCost)/totalTrips).toFixed(2)):0,
    driverLaborCost:Number(totalDriverPay.toFixed(2)),
    fuelCost:Number(totalFuelCost.toFixed(2)),
    tollCost:Number(totalTollCost.toFixed(2)),
    maintenanceCost:Number(totalMaintenanceCost.toFixed(2)),
    insuranceCost:Number(totalInsuranceCost.toFixed(2)),
    dispatchOverheadCost:Number(totalDispatchOverheadCost.toFixed(2)),
    cleaningCost:Number(totalCleaningCost.toFixed(2)),
    complianceCost:Number(totalComplianceCost.toFixed(2)),
    otherVariableCost:Number(totalOtherVariableCost.toFixed(2)),
    nonFuelVariableCost:Number((totalTollCost+totalMaintenanceCost+totalInsuranceCost+totalDispatchOverheadCost+totalCleaningCost+totalComplianceCost+totalOtherVariableCost).toFixed(2))
   };

     const filters=await getCostAnalyzerFilterOptions(options);

   return {
    period:{start:options.start,end:options.end,groupBy:options.groupBy,limit:options.limit,includeCancelled:options.includeCancelled},
    assumptions:{
     fuelPricePerGallon:Number(fuelPricePerGallon.toFixed(3)),
     fuelSource:fuelIndexPrice>0?'platform_fuel_index':'platform_fuel_baseline',
     defaultMpg,
     fuelOperationalBufferPct:Number(fuelBufferPct.toFixed(2)),
    tollCostPerTrip:Number(tollCostPerTrip.toFixed(2)),
    maintenanceCostPerMile:Number(maintenanceCostPerMile.toFixed(4)),
    insuranceCostPerTrip:Number(insuranceCostPerTrip.toFixed(2)),
    dispatchOverheadPerTrip:Number(dispatchOverheadPerTrip.toFixed(2)),
    cleaningCostPerTrip:Number(cleaningCostPerTrip.toFixed(2)),
    complianceCostPerTrip:Number(complianceCostPerTrip.toFixed(2)),
    otherVariableCostPerTrip:Number(otherVariableCostPerTrip.toFixed(2)),
     driverPayRates:DRIVER_PAY_RATES
    },
      filters,
    summary,
    series:Object.values(seriesMap).sort((a,b)=>String(a.bucket).localeCompare(String(b.bucket))).map((item)=>({bucket:item.bucket,trips:item.trips,totalCost:Number(item.totalCost.toFixed(2)),totalRevenue:Number(item.totalRevenue.toFixed(2)),totalProfit:Number(item.totalProfit.toFixed(2))})),
    breakdowns:{
     byDriver:rankBreakdown(byDriver,'driver'),
    byVehicle:Object.values(byVehicle).sort((a,b)=>b.totalCost-a.totalCost||b.trips-a.trips).map((item)=>({vehicleUnit:item.vehicleUnit,vehicleType:item.vehicleType,trips:item.trips,totalCost:Number(item.totalCost.toFixed(2)),totalRevenue:Number(item.totalRevenue.toFixed(2)),totalProfit:Number(item.totalProfit.toFixed(2)),averageCostPerTrip:item.trips?Number((item.totalCost/item.trips).toFixed(2)):0,driverPayCost:Number(item.driverPayCost.toFixed(2)),fuelCost:Number(item.fuelCost.toFixed(2)),tollCost:Number(item.tollCost.toFixed(2)),maintenanceCost:Number(item.maintenanceCost.toFixed(2)),insuranceCost:Number(item.insuranceCost.toFixed(2)),dispatchOverheadCost:Number(item.dispatchOverheadCost.toFixed(2)),cleaningCost:Number(item.cleaningCost.toFixed(2)),complianceCost:Number(item.complianceCost.toFixed(2)),otherVariableCost:Number(item.otherVariableCost.toFixed(2))})),
     byService:rankBreakdown(byService,'service'),
     bySource:rankBreakdown(bySource,'bookingSource'),
     byStatus:rankBreakdown(byStatus,'status')
    },
    trips:tripRows
   };
  }

  async function listAdminEmails(){
   const rowset=await query(`SELECT DISTINCT lower(trim(email)) AS email FROM users WHERE role='ADMIN' AND active=true AND email IS NOT NULL AND trim(email)<>''`).catch(()=>({rows:[]}));
   const emails=new Set((rowset.rows||[]).map((row)=>clean(row.email).toLowerCase()).filter(Boolean));
   if(clean(process.env.NEXUS_ADMIN_EMAIL))emails.add(clean(process.env.NEXUS_ADMIN_EMAIL).toLowerCase());
   emails.add('admin@nexusmt.com');
   return Array.from(emails);
  }

  async function sendCostAnalyzerReport(analytics,requestedBy='Admin'){
   const summary=analytics.summary||{};
   const period=analytics.period||{};
   const topVehicle=analytics.breakdowns?.byVehicle?.[0];
   const topDriver=analytics.breakdowns?.byDriver?.[0];
   const title=`📊 Cost Analyzer Report — ${period.start} to ${period.end}`;
   const teamsText=[
    `**Cost Analyzer** (${period.start} → ${period.end})`,
    `- **Trips:** ${summary.trips||0}`,
    `- **Total Cost:** $${Number(summary.totalCost||0).toFixed(2)}`,
    `- **Total Revenue:** $${Number(summary.totalRevenue||0).toFixed(2)}`,
    `- **Total Profit:** $${Number(summary.totalProfit||0).toFixed(2)}`,
      `- **Driver Labor:** $${Number(summary.driverLaborCost||0).toFixed(2)}`,
      `- **Fuel:** $${Number(summary.fuelCost||0).toFixed(2)}`,
      `- **Tolls:** $${Number(summary.tollCost||0).toFixed(2)}`,
      `- **Other Variable Costs:** $${Number(summary.nonFuelVariableCost||0).toFixed(2)}`,
    topVehicle?`- **Highest Cost Vehicle:** ${topVehicle.vehicleUnit} ($${Number(topVehicle.totalCost||0).toFixed(2)})`:null,
    topDriver?`- **Highest Cost Driver:** ${topDriver.driver} ($${Number(topDriver.totalCost||0).toFixed(2)})`:null,
    `- **Requested by:** ${requestedBy}`
   ].filter(Boolean).join('\n');
  const html=`<h2 style="color:#082f49">Cost Analyzer Report</h2><p><strong>Period:</strong> ${period.start} to ${period.end}</p><table style="width:100%;border-collapse:collapse;margin:12px 0"><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Trips</td><td style="padding:8px;border:1px solid #dbe5ed">${summary.trips||0}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Total Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.totalCost||0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Total Revenue</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.totalRevenue||0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Total Profit</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.totalProfit||0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Driver Labor Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.driverLaborCost||0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Fuel Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.fuelCost||0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Toll Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.tollCost||0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Other Variable Costs</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.nonFuelVariableCost||0).toFixed(2)}</td></tr></table><p><strong>Top vehicle by cost:</strong> ${topVehicle?`${topVehicle.vehicleUnit} ($${Number(topVehicle.totalCost||0).toFixed(2)})`:'N/A'}</p><p><strong>Top driver by cost:</strong> ${topDriver?`${topDriver.driver} ($${Number(topDriver.totalCost||0).toFixed(2)})`:'N/A'}</p><p style="color:#62758a">Generated by ${requestedBy}</p>`;

   const emails=await listAdminEmails();
   const [emailResult,teamsResult]=await Promise.allSettled([
    sendEmail(emails,`Nexus Cost Analyzer Report — ${period.start} to ${period.end}`,html),
    sendTeamsAlert(teamsText,title)
   ]);
   return {
    recipients:emails,
    email:emailResult.status==='fulfilled'?emailResult.value:{status:'failed',error:emailResult.reason?.message},
    teams:teamsResult.status==='fulfilled'?teamsResult.value:{status:'failed',error:teamsResult.reason?.message}
   };
  }

function toRevenueExportCsv(rows){
 const header=['reference','trip_date','trip_time','service','booking_source','status','payment_status','estimated_fare','deposit_amount','balance_due','cancellation_fee_amount','driver_name','vehicle_unit'];
 const escape=(value)=>{
  const str=String(value??'');
  return /[",\n]/.test(str)?`"${str.replaceAll('"','""')}"`:str;
 };
 return [header.join(','),...rows.map((row)=>header.map((key)=>escape(row[key])).join(','))].join('\n');
}

function mergePricing(input){
 const base=JSON.parse(JSON.stringify(DEFAULT_PRICING));
 if(!input||typeof input!=='object')return base;
 for(const key of Object.keys(base)){
  const src=input[key]||{};
  base[key]={
   label:clean(src.label)||base[key].label,
   base:n(src.base,base[key].base),
   includedMiles:n(src.includedMiles,base[key].includedMiles),
   perMile:n(src.perMile,base[key].perMile),
   waitPer15:n(src.waitPer15,base[key].waitPer15)
  };
 }
 return base;
}

function mergeServicePolicies(input){
 const base=JSON.parse(JSON.stringify(DEFAULT_SERVICE_POLICIES));
 if(!input||typeof input!=='object')return base;
 for(const key of Object.keys(base)){
  const src=input[key]||{};
  base[key]={
   cancellationFee:clamp(n(src.cancellationFee,base[key].cancellationFee),0,10000),
   noShowFee:clamp(n(src.noShowFee,base[key].noShowFee),0,10000),
   trafficOverageFeePerHour:clamp(n(src.trafficOverageFeePerHour,base[key].trafficOverageFeePerHour),0,1000),
   returnMilesInclusionPct:clamp(n(src.returnMilesInclusionPct,base[key].returnMilesInclusionPct),0,100),
   afterHoursSurchargePct:clamp(n(src.afterHoursSurchargePct,base[key].afterHoursSurchargePct),0,100),
   weekendSurchargePct:clamp(n(src.weekendSurchargePct,base[key].weekendSurchargePct),0,100),
   holidaySurchargePct:clamp(n(src.holidaySurchargePct,base[key].holidaySurchargePct),0,100)
  };
 }
 return base;
}

function resolveServicePolicyKey(service){
 const raw=String(service||'').trim().toLowerCase();
 if(!raw)return 'ambulatory';
 if(DEFAULT_SERVICE_POLICIES[raw])return raw;
 if(raw==='cct'||raw.includes('critical')||raw.includes('high-acuity')||raw.includes('high acuity')||raw.includes('icu'))return 'facility_transfer_critical';
 if(raw.includes('interfacility')&&(raw.includes('als')||raw.includes('critical')||raw.includes('icu')||raw.includes('cct')))return 'facility_transfer_critical';
 if(raw.includes('facility')&&raw.includes('transfer'))return 'facility_transfer';
 if(raw.includes('interfacility')||raw==='ift')return 'facility_transfer';
 if(raw.includes('wheel'))return 'wheelchair';
 if(raw.includes('ambul'))return 'ambulatory';
 if(raw.includes('broda'))return 'broda';
 if(raw.includes('stretcher'))return 'stretcher';
 if(raw.includes('bariatric'))return 'bariatric';
 if(raw.includes('als ii')||raw.includes('als2'))return 'als2';
 if(raw.includes('als i')||raw.includes('als1'))return 'als1';
 if(raw.includes('bls'))return 'bls';
 return 'ambulatory';
}

function mergePlatformSettings(raw){
 const src=raw&&typeof raw==='object'?raw:{};
 const fareSrc=src.fareRules&&typeof src.fareRules==='object'?src.fareRules:{};
 const orgSrc=src.organization&&typeof src.organization==='object'?src.organization:{};
 const services=Array.isArray(src.activeServices)?src.activeServices:DEFAULT_PLATFORM_SETTINGS.activeServices;
 const normalizedServices=services.map(x=>String(x||'').toUpperCase()).filter(Boolean);
 if(!normalizedServices.includes('FACILITY_TRANSFER')) normalizedServices.push('FACILITY_TRANSFER');
 if(!normalizedServices.includes('FACILITY_TRANSFER_CRITICAL')) normalizedServices.push('FACILITY_TRANSFER_CRITICAL');
 return {
  pricing:mergePricing(src.pricing),
  fareRules:{
   minimumFare:clamp(n(fareSrc.minimumFare,DEFAULT_PLATFORM_SETTINGS.fareRules.minimumFare),0,10000),
    fuelSurchargePerMile:clamp(n(fareSrc.fuelSurchargePerMile,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelSurchargePerMile),0,25),
    fuelPricingMode:String(fareSrc.fuelPricingMode||DEFAULT_PLATFORM_SETTINGS.fareRules.fuelPricingMode).toUpperCase()==='AUTO'?'AUTO':'MANUAL',
    fuelIndexSource:clean(fareSrc.fuelIndexSource)||DEFAULT_PLATFORM_SETTINGS.fareRules.fuelIndexSource,
    fuelIndexSeriesId:clean(fareSrc.fuelIndexSeriesId)||DEFAULT_PLATFORM_SETTINGS.fareRules.fuelIndexSeriesId,
    fuelIndexPricePerGallon:clamp(n(fareSrc.fuelIndexPricePerGallon,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelIndexPricePerGallon),0,25),
    fuelBaselinePricePerGallon:clamp(n(fareSrc.fuelBaselinePricePerGallon,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelBaselinePricePerGallon),0,25),
    fuelEfficiencyMpg:clamp(n(fareSrc.fuelEfficiencyMpg,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelEfficiencyMpg),1,50),
    fuelOperationalBufferPct:clamp(n(fareSrc.fuelOperationalBufferPct,DEFAULT_PLATFORM_SETTINGS.fareRules.fuelOperationalBufferPct),0,200),
    tollCostPerTrip:clamp(n(fareSrc.tollCostPerTrip,DEFAULT_PLATFORM_SETTINGS.fareRules.tollCostPerTrip),0,1000),
    maintenanceCostPerMile:clamp(n(fareSrc.maintenanceCostPerMile,DEFAULT_PLATFORM_SETTINGS.fareRules.maintenanceCostPerMile),0,100),
    insuranceCostPerTrip:clamp(n(fareSrc.insuranceCostPerTrip,DEFAULT_PLATFORM_SETTINGS.fareRules.insuranceCostPerTrip),0,1000),
    dispatchOverheadPerTrip:clamp(n(fareSrc.dispatchOverheadPerTrip,DEFAULT_PLATFORM_SETTINGS.fareRules.dispatchOverheadPerTrip),0,1000),
    cleaningCostPerTrip:clamp(n(fareSrc.cleaningCostPerTrip,DEFAULT_PLATFORM_SETTINGS.fareRules.cleaningCostPerTrip),0,1000),
    complianceCostPerTrip:clamp(n(fareSrc.complianceCostPerTrip,DEFAULT_PLATFORM_SETTINGS.fareRules.complianceCostPerTrip),0,1000),
    otherVariableCostPerTrip:clamp(n(fareSrc.otherVariableCostPerTrip,DEFAULT_PLATFORM_SETTINGS.fareRules.otherVariableCostPerTrip),0,1000),
    fuelLastUpdatedAt:fareSrc.fuelLastUpdatedAt?String(fareSrc.fuelLastUpdatedAt):null,
   afterHoursSurchargePct:clamp(n(fareSrc.afterHoursSurchargePct,DEFAULT_PLATFORM_SETTINGS.fareRules.afterHoursSurchargePct),0,100),
   weekendSurchargePct:clamp(n(fareSrc.weekendSurchargePct,DEFAULT_PLATFORM_SETTINGS.fareRules.weekendSurchargePct),0,100),
   holidaySurchargePct:clamp(n(fareSrc.holidaySurchargePct,DEFAULT_PLATFORM_SETTINGS.fareRules.holidaySurchargePct),0,100),
   cancellationFee:clamp(n(fareSrc.cancellationFee,DEFAULT_PLATFORM_SETTINGS.fareRules.cancellationFee),0,10000),
  cancellationWindowHours:clamp(n(fareSrc.cancellationWindowHours,DEFAULT_PLATFORM_SETTINGS.fareRules.cancellationWindowHours),0,240),
  cancellationLeadHours:clamp(n(fareSrc.cancellationLeadHours,DEFAULT_PLATFORM_SETTINGS.fareRules.cancellationLeadHours),0,720),
   noShowFee:clamp(n(fareSrc.noShowFee,DEFAULT_PLATFORM_SETTINGS.fareRules.noShowFee),0,10000),
   freeWaitMinutes:clamp(n(fareSrc.freeWaitMinutes,DEFAULT_PLATFORM_SETTINGS.fareRules.freeWaitMinutes),0,180),
   mileageRoundingRule:['EXACT','TENTH_MILE','WHOLE_MILE'].includes(String(fareSrc.mileageRoundingRule||''))?String(fareSrc.mileageRoundingRule):DEFAULT_PLATFORM_SETTINGS.fareRules.mileageRoundingRule,
   telemetryRefreshSeconds:clamp(n(fareSrc.telemetryRefreshSeconds,DEFAULT_PLATFORM_SETTINGS.fareRules.telemetryRefreshSeconds),5,120),
  maxBookingDistanceMiles:clamp(n(fareSrc.maxBookingDistanceMiles,DEFAULT_PLATFORM_SETTINGS.fareRules.maxBookingDistanceMiles),5,500),
  returnMilesThreshold:clamp(n(fareSrc.returnMilesThreshold,DEFAULT_PLATFORM_SETTINGS.fareRules.returnMilesThreshold),0,500),
  returnMilesInclusionPct:clamp(n(fareSrc.returnMilesInclusionPct,DEFAULT_PLATFORM_SETTINGS.fareRules.returnMilesInclusionPct),0,100),
  trafficOverageFeePerHour:clamp(n(fareSrc.trafficOverageFeePerHour,DEFAULT_PLATFORM_SETTINGS.fareRules.trafficOverageFeePerHour),0,1000),
  trafficOverageGraceMinutes:clamp(n(fareSrc.trafficOverageGraceMinutes,DEFAULT_PLATFORM_SETTINGS.fareRules.trafficOverageGraceMinutes),0,180),
  servicePolicies:mergeServicePolicies(fareSrc.servicePolicies)
  },
  organization:{
   name:clean(orgSrc.name)||DEFAULT_PLATFORM_SETTINGS.organization.name,
   phone:clean(orgSrc.phone)||DEFAULT_PLATFORM_SETTINGS.organization.phone,
   email:clean(orgSrc.email)||DEFAULT_PLATFORM_SETTINGS.organization.email,
    website:clean(orgSrc.website)||DEFAULT_PLATFORM_SETTINGS.organization.website,
    yardAddress:clean(orgSrc.yardAddress)||DEFAULT_PLATFORM_SETTINGS.organization.yardAddress,
    preTripInspectionMinutes:clamp(n(orgSrc.preTripInspectionMinutes,DEFAULT_PLATFORM_SETTINGS.organization.preTripInspectionMinutes),0,180)
  },
  activeServices:normalizedServices
 };
}

async function readPlatformSettings(){
 await ensureSettingsTable();
 const r=await query(`SELECT value FROM system_settings WHERE key='platform' LIMIT 1`);
 if(!r.rows[0]){
  const merged=mergePlatformSettings(DEFAULT_PLATFORM_SETTINGS);
  await query(`INSERT INTO system_settings(key,value) VALUES('platform',$1::jsonb)`,[JSON.stringify(merged)]);
  return merged;
 }
 return mergePlatformSettings(r.rows[0].value);
}

async function writePlatformSettings(payload,userId){
 const merged=mergePlatformSettings(payload);
 await ensureSettingsTable();
 await query(`INSERT INTO system_settings(key,value,updated_by,updated_at) VALUES('platform',$1::jsonb,$2,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`,[JSON.stringify(merged),userId||null]);
 return merged;
}

async function sendEmail(to,subject,html){
 const recipients=Array.isArray(to)?to:buildEmailRecipients(to);
 if(!envEnabled('SENDGRID_API_KEY')||!envEnabled('SENDGRID_FROM_EMAIL')||recipients.length===0)return {status:'skipped'};
 const r=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({personalizations:[{to:recipients.map(email=>({email}))}],from:{email:process.env.SENDGRID_FROM_EMAIL,name:'Nexus Medical Transit'},subject,content:[{type:'text/html',value:html}]})});
 if(!r.ok)throw new Error(`SendGrid request failed (${r.status})`);return {status:'sent'};
}
async function ensurePasswordResetColumns(){
 await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false').catch(()=>{});
 await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token text').catch(()=>{});
 await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires timestamptz').catch(()=>{});
 await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_used boolean DEFAULT false').catch(()=>{});
 await query('CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL').catch(()=>{});
}
async function resolveDriverContacts({driverName='',driverScopeId='',driverEmail='',driverPhone=''}){
 if(clean(driverEmail)||clean(driverPhone))return {driverEmail:clean(driverEmail),driverPhone:clean(driverPhone)};
 const name=clean(driverName);
 const scopeId=clean(driverScopeId);
 if(!name&&!scopeId)return {driverEmail:'',driverPhone:''};
 const result=await query(
  `SELECT email, phone
   FROM users
   WHERE active=true
     AND (
       (NULLIF($1,'') IS NOT NULL AND lower(trim(display_name))=lower(trim($1)))
       OR (NULLIF($2,'') IS NOT NULL AND scope_id=$2)
       OR (NULLIF($3,'') IS NOT NULL AND lower(trim(email))=lower(trim($3)))
     )
   ORDER BY updated_at DESC
   LIMIT 1`,
  [name, scopeId, clean(driverEmail)]
 ).catch(()=>({rows:[]}));
 const row=result.rows?.[0]||{};
 return {driverEmail:clean(driverEmail||row.email||''),driverPhone:clean(driverPhone||row.phone||'')};
}
async function notifyAssignedDriver(booking,options={}){
 const driverName=clean(options.driverName||booking?.driver_name||booking?.driverName||'');
 const driverScopeId=clean(options.driverScopeId||booking?.driver_scope_id||booking?.driverScopeId||'');
 let driverEmail=clean(options.driverEmail||booking?.driver_email||booking?.driverEmail||'');
 let driverPhone=clean(options.driverPhone||booking?.driver_phone||booking?.driverPhone||'');
 const vehicleUnit=clean(options.vehicleUnit||booking?.vehicle_unit||booking?.vehicleUnit||'');
 const tripDate=clean(booking?.trip_date||booking?.date||'');
 const tripTime=clean(booking?.trip_time||booking?.time||'');
 const pickupTime=clean(booking?.pickup_time||booking?.pickupTime||booking?.submittedAppointmentTime||booking?.appointmentTime||tripTime||'');
 const checkInTime=clean(booking?.check_in_time||booking?.checkInTime||'');
 const pickup=clean(booking?.pickup||'');
 const destination=clean(booking?.destination||'');
 const driverConfirmedRate=Number(booking?.broker_accepted_rate??booking?.brokerAcceptedRate);
 const driverConfirmedRateText=Number.isFinite(driverConfirmedRate)&&driverConfirmedRate>0?` Driver confirmed rate: $${driverConfirmedRate.toFixed(2)}.`:'';
 const reference=clean(booking?.reference||'');
 const resolved=await resolveDriverContacts({driverName,driverScopeId,driverEmail,driverPhone});
 driverEmail=resolved.driverEmail;
 driverPhone=resolved.driverPhone;
 if(!driverName||(!driverEmail&&!driverPhone))return {sms:{status:'skipped'},email:{status:'skipped'}};
 const smsBody=`Nexus Medical Transit: You have been assigned to trip ${reference}${tripDate?` on ${tripDate}`:''}${tripTime?` at ${tripTime}`:''}. Pickup: ${pickup || 'See dispatch'}. Pickup/appointment time: ${pickupTime || 'See dispatch'}. Check-in time: ${checkInTime || 'See dispatch'}. Destination: ${destination || 'See dispatch'}. Vehicle: ${vehicleUnit || 'TBD'}.${driverConfirmedRateText}`;
 const html=`<h2 style="color:#082f49">Trip assigned — ${reference}</h2><p><strong>Driver:</strong> ${driverName}</p><p><strong>Date:</strong> ${tripDate || '—'}</p><p><strong>Time:</strong> ${tripTime || '—'}</p><p><strong>Pickup:</strong> ${pickup || '—'}</p><p><strong>Pickup/appointment time:</strong> ${pickupTime || '—'}</p><p><strong>Check-in time:</strong> ${checkInTime || '—'}</p><p><strong>Destination:</strong> ${destination || '—'}</p><p><strong>Vehicle:</strong> ${vehicleUnit || 'TBD'}</p>${driverConfirmedRateText?`<p><strong>Driver confirmed rate:</strong> $${driverConfirmedRate.toFixed(2)}</p>`:''}<p>Please confirm your availability with dispatch.</p>`;
 const results=await Promise.allSettled([
  driverPhone?sendSms(driverPhone,smsBody):Promise.resolve({status:'skipped-no-driver-phone'}),
  driverEmail?sendEmail(driverEmail,`Trip assigned — ${reference}`,html):Promise.resolve({status:'skipped-no-driver-email'})
 ]);
 return {sms:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message},email:results[1].status==='fulfilled'?results[1].value:{status:'failed',error:results[1].reason?.message}};
}
async function sendTeamsAlert(text,title='Nexus Medical Transit'){
 // Teams Incoming Webhook — set TEAMS_WEBHOOK_URL in Netlify env vars
 // To add: Teams → Admin_NMT channel → ... → Connectors → Incoming Webhook → copy URL
 const webhookUrl=process.env.TEAMS_WEBHOOK_URL;
 if(!webhookUrl)return {status:'skipped'};
 const normalizedWebhook=String(webhookUrl||'').trim();
 const looksLikePlaceholder=/^https:\/\/(?:outlook|.*\.office)\.office\.com\/webhook\/?$/i.test(normalizedWebhook);
 if(looksLikePlaceholder)return {status:'failed',error:'Invalid Teams webhook URL: placeholder endpoint configured'};
 const isPowerAutomateWebhook=/environment\.api\.powerplatform\.com|\/powerautomate\/automations\/direct\//i.test(webhookUrl);
 const body=isPowerAutomateWebhook
  ?{
    type:'message',
    attachments:[{
     contentType:'application/vnd.microsoft.card.adaptive',
     content:{
      '$schema':'http://adaptivecards.io/schemas/adaptive-card.json',
      type:'AdaptiveCard',
      version:'1.4',
      body:[
       {type:'TextBlock',size:'Medium',weight:'Bolder',text:String(title||'Nexus Medical Transit')},
       {type:'TextBlock',text:String(text||''),wrap:true}
      ]
     }
    }]
   }
  :{
    '@type':'MessageCard','@context':'https://schema.org/extensions',
    themeColor:'#082f49',summary:title,title,text
   };
 try{
  const r=await fetch(normalizedWebhook,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return r.ok?{status:'sent'}:{status:'failed',code:r.status};
 }catch(e){return {status:'failed',error:e.message};}
}
function buildBookingTeamsMessage(booking,label='New Trip Booked'){
 const b=booking||{};
 const reference=clean(b.reference||b.bookingReference||'—');
 const patient=clean(b.name||b.passenger_name||b.passengerName||'—');
 const pickup=clean(b.pickup||b.pickup_address||b.pickupAddress||'—');
 const destination=clean(b.destination||b.dropoff||b.dropoff_address||b.dropoffAddress||'—');
 const date=clean(b.date||b.trip_date||b.requested_date||'—');
 const time=clean(b.pickupTime||b.time||b.trip_time||b.requested_time||'—');
 const status=clean(b.status||'');
 const source=clean(b.bookingSource||b.booking_source||'');
 const driver=clean(b.driverName||b.driver_name||'');
 const details=[
  `**${label}** | Ref: ${reference}`,
  `- **Patient:** ${patient}`,
  `- **Pickup:** ${pickup}`,
  `- **Destination:** ${destination}`,
  `- **Date/Time:** ${date} at ${time}`
 ];
 if(status)details.push(`- **Status:** ${status}`);
 if(source)details.push(`- **Source:** ${source}`);
 if(driver)details.push(`- **Driver:** ${driver}`);
 return details.join('\n');
}
async function sendBookingTeamsAlert(booking,title='🚐 New Trip Booked — Admin_NMT',label='New Trip Booked'){
 const message=buildBookingTeamsMessage(booking,label);
 return sendTeamsAlert(message,title);
}

async function ensureBookingAttachmentsTable(){
 await query(`CREATE TABLE IF NOT EXISTS booking_attachments (
  id bigserial PRIMARY KEY,
  booking_reference text NOT NULL REFERENCES bookings(reference) ON DELETE CASCADE,
  broker_request_id bigint REFERENCES broker_requests(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  mime_type text,
  content_base64 text NOT NULL,
  source text NOT NULL DEFAULT 'BROKER_EMAIL',
  created_at timestamptz NOT NULL DEFAULT now()
 )`).catch(()=>{});
 await query(`CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking ON booking_attachments(booking_reference,created_at DESC)`).catch(()=>{});
}
function setupLink(token){
  const base=String(process.env.SITE_URL||process.env.URL||process.env.DEPLOY_PRIME_URL||'https://nexusmt.com').replace(/\/$/,'');
  return `${base}/set-password.html?token=${encodeURIComponent(token)}`;
}
async function notifyBooking(b){
 const driverLine=b.driverName?`\nDriver: ${b.driverName}`:'';
 const pickupLine=b.pickupTime||b.time;
 const text=`Nexus Medical Transit: Your trip ${b.reference} is confirmed for ${b.date} at ${pickupLine}.${driverLine} Questions? Call (888) 760-4990. Msg & data rates may apply. Reply HELP for help or STOP to opt out.`;
 const html=`<h2 style="color:#082f49">Trip Confirmed — ${b.reference}</h2><table style="width:100%;border-collapse:collapse;margin:16px 0">${b.driverName?`<tr><td style="padding:8px;font-weight:600;color:#62758a">Driver</td><td style="padding:8px"><strong>${b.driverName}</strong></td></tr>`:''}<tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Pickup Time</td><td style="padding:8px"><strong>${pickupLine}</strong></td></tr><tr><td style="padding:8px;font-weight:600;color:#62758a">Date</td><td style="padding:8px">${b.date}</td></tr><tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Pickup</td><td style="padding:8px">${b.pickup}</td></tr><tr><td style="padding:8px;font-weight:600;color:#62758a">Destination</td><td style="padding:8px">${b.destination}</td></tr><tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Service</td><td style="padding:8px">${b.service||'—'}</td></tr></table><p>Questions? Call <strong>(888) 760-4990</strong></p>`;
 const recipients=await resolveBookingIntakeRecipients(b);
 const smsRecipients=recipients.sms;
 const emailRecipients=recipients.email;
 const results=await Promise.allSettled([Promise.all(smsRecipients.map(phone=>sendSms(phone,text))).then(()=>({status:'sent'})),sendEmail(emailRecipients,`Trip confirmed — ${b.reference}`,html),sendBookingTeamsAlert({...b,pickupTime:pickupLine},'🚐 New Trip Booked — Admin_NMT','New Trip Booked')]);
 return {sms:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message},email:results[1].status==='fulfilled'?results[1].value:{status:'failed',error:results[1].reason?.message},teams:results[2].status==='fulfilled'?results[2].value:{status:'failed',error:results[2].reason?.message}};
}
async function sendInvoice(b){
 const fare=Number(b.estimatedFare||b.estimated_fare||0);
 const fareText=fare>0?` Estimated fare: $${fare.toFixed(2)}.`:'';
 const pickupLine=clean(b.pickupTime||b.time);
 const text=`Nexus Medical Transit: Booking ${b.reference} created for ${b.date} at ${pickupLine}.${fareText} An invoice will follow. Questions? Call (888) 760-4990.`;
 const html=`<h2>Nexus Medical Transit Invoice</h2><p>Reference: <strong>${b.reference}</strong></p><p>${b.pickup} → ${b.destination}</p><p>${b.date} at ${pickupLine}</p>${fare>0?`<p>Estimated fare: <strong>$${fare.toFixed(2)}</strong></p>`:''}<p>Payment may be made by ACH, card, check, or wire. Contact billing@nexusmt.com or call (888) 760-4990.</p>`;
 const smsRecipients=buildSmsRecipients(b.phone||b.phone);
 const emailRecipients=buildEmailRecipients(b.email);
 const results=await Promise.allSettled([Promise.all(smsRecipients.map(phone=>sendSms(phone,text))).then(()=>({status:'sent'})),sendEmail(emailRecipients,`Invoice — Nexus booking ${b.reference}`,html)]);
 return {sms:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message},email:results[1].status==='fulfilled'?results[1].value:{status:'failed',error:results[1].reason?.message}};
}

async function resolveBookingIntakeRecipients(b){
 const ops=await query("SELECT email,phone FROM users WHERE role IN ('ADMIN','DISPATCHER') AND active=true").catch(()=>({rows:[]}));
 const opsEmails=(ops.rows||[]).map(row=>clean(row.email)).filter(Boolean);
 const opsPhones=(ops.rows||[]).map(row=>clean(row.phone)).filter(Boolean);
 if(clean(process.env.COMPANY_EMAIL))opsEmails.push(clean(process.env.COMPANY_EMAIL));
 if(clean(process.env.NEXUS_ADMIN_EMAIL))opsEmails.push(clean(process.env.NEXUS_ADMIN_EMAIL));
 return {
  email:[...new Set(buildEmailRecipients([b.email,...opsEmails]).filter(Boolean))],
  sms:[...new Set(buildSmsRecipients([b.phone,...opsPhones]).filter(Boolean))]
 };
}

async function notifyBookingPending(b,{subject,statusText,detail}){
 const recipients=await resolveBookingIntakeRecipients(b);
 const pickupLine=clean(b.pickupTime||b.time);
 const sms=`Nexus Medical Transit: Booking ${b.reference} ${statusText}. ${detail} Questions? Call (888) 760-4990.`;
 const html=`<h2>Booking ${statusText} — ${b.reference}</h2><p>${detail}</p><p><strong>Passenger:</strong> ${b.name||'—'}</p><p><strong>Date/time:</strong> ${b.date||'—'} at ${pickupLine||'—'}</p><p><strong>Route:</strong> ${b.pickup||'—'} → ${b.destination||'—'}</p><p><strong>Service:</strong> ${b.service||'—'}</p>`;
 const results=await Promise.allSettled([Promise.all(recipients.sms.map(phone=>sendSms(phone,sms))),sendEmail(recipients.email,subject,html)]);
 return {sms:results[0].status==='fulfilled'?{status:'sent'}:{status:'failed',error:results[0].reason?.message},email:results[1].status==='fulfilled'?results[1].value:{status:'failed',error:results[1].reason?.message}};
}

async function issueFacilityCompletionInvoice(row){
 if(clean(row.booking_source).toUpperCase()!=='FACILITY'||row.facility_invoice_sent_at)return null;
 const fare=Number(row.estimated_fare||0),facilityCode=clean(row.facility_id)||null;
 const managers=facilityCode?await query("SELECT email FROM users WHERE role='FACILITY' AND scope_id=$1 AND active=true",[facilityCode]).catch(()=>({rows:[]})):{rows:[]};
 const recipients=[...new Set(managers.rows.map(x=>clean(x.email)).filter(Boolean))];
 if(!recipients.length&&clean(row.email))recipients.push(clean(row.email));
 const invoiceNumber=`INV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${clean(row.reference).replace(/^NMT-/,'')}`;
 const lineItems=[{description:`Completed ${clean(row.service)||'medical transportation'} trip`,quantity:1,amount:fare,tripDate:row.trip_date,pickup:row.pickup,destination:row.destination}];
 await query(`INSERT INTO invoices(invoice_number,booking_reference,facility_code,amount,status,due_date,recipient_email,line_items,sent_at) VALUES($1,$2,$3,$4,'SENT',CURRENT_DATE+30,$5,$6::jsonb,now()) ON CONFLICT(invoice_number) DO NOTHING`,[invoiceNumber,row.reference,facilityCode,fare,recipients.join(','),JSON.stringify(lineItems)]);
 const result=await sendInvoice({...mapBooking(row),email:recipients,estimatedFare:fare});
 await query("UPDATE bookings SET payment_status='INVOICED',facility_invoice_sent_at=now(),updated_at=now() WHERE reference=$1",[row.reference]);
 await audit('BOOKING',row.reference,'FACILITY_INVOICE_SENT',{invoiceNumber,facilityCode,amount:fare,recipients});
 return result;
}

async function sendDriverReferralIncentiveAlert(b,driverEmail){
 const adminEmail='admin@nexusmt.com';
 const referralDriver=clean(driverEmail||b.requestedByUser||'');
 const html=`<h2>Driver Referral Incentive</h2><p>A driver-created booking qualifies for a $10 referral incentive.</p><p><strong>Booking:</strong> ${b.reference}</p><p><strong>Driver:</strong> ${referralDriver||'Unknown'}</p><p><strong>Patient:</strong> ${b.name||'—'} (${b.phone||'—'})</p><p><strong>Trip:</strong> ${b.date||'—'} at ${b.pickupTime||b.time||'—'}</p><p><strong>Route:</strong> ${b.pickup||'—'} → ${b.destination||'—'}</p><p>Please follow up for payout processing.</p>`;
 const subject=`Driver referral incentive: $10 for ${b.reference}`;
 const result=await Promise.allSettled([sendEmail([adminEmail],subject,html)]);
 return {email:result[0].status==='fulfilled'?result[0].value:{status:'failed',error:result[0].reason?.message}};
}
async function sendBalanceDueReminder(b,balanceDue){
 const base=siteBase();
 const payLink=`${base}/booking-app.html?payBalance=1&bookingReference=${encodeURIComponent(b.reference)}`;
 const dueText=balanceDue>0?` Remaining balance: $${Number(balanceDue).toFixed(2)}.`:'';
 const text=`Nexus Medical Transit: Your driver is on the way for booking ${b.reference}.${dueText} Complete payment before pickup: ${payLink}`;
 const html=`<h2>Complete your payment — booking ${b.reference}</h2><p>Your driver is en route.${dueText}</p><p><a href="${payLink}">Pay remaining balance now</a></p><p>Questions? Call (888) 760-4990.</p>`;
 const smsRecipients=buildSmsRecipients(b.phone);
 const emailRecipients=buildEmailRecipients(b.email);
 await Promise.allSettled([Promise.all(smsRecipients.map(phone=>sendSms(phone,text))).then(()=>({status:'sent'})),sendEmail(emailRecipients,`Balance due — ${b.reference}`,html)]);
}

async function sendTripStakeholderUpdate(beforeRow,afterRow,actor,editNote=''){
 try{
  const before=mapBooking(beforeRow||{});
  const after=mapBooking(afterRow||{});
  const reference=clean(after.reference||before.reference||'');
  if(!reference)return {status:'skipped'};

  const actorLabel=clean(actor?.display_name||actor?.email||actor?.role||'Dispatch');
  const changeParts=[];
  if(clean(before.status)!==clean(after.status))changeParts.push(`Status: ${after.statusLabel||after.status}`);
  if(clean(before.date)!==clean(after.date)||clean(before.time)!==clean(after.time))changeParts.push(`Schedule: ${after.date||'—'} ${after.time||'—'}`);
  if(clean(before.pickupTime)!==clean(after.pickupTime))changeParts.push(`Pickup time: ${after.pickupTime||'—'}`);
  if(clean(before.submittedAppointmentTime)!==clean(after.submittedAppointmentTime))changeParts.push(`Pickup/appointment time: ${after.submittedAppointmentTime||'—'}`);
  if(clean(before.checkInTime)!==clean(after.checkInTime))changeParts.push(`Check-in time: ${after.checkInTime||'—'}`);
  if(clean(before.driverName)!==clean(after.driverName))changeParts.push(`Driver: ${after.driverName||'Unassigned'}`);
  if(clean(before.vehicleUnit)!==clean(after.vehicleUnit))changeParts.push(`Vehicle: ${after.vehicleUnit||'Unassigned'}`);
  if(clean(before.pickup)!==clean(after.pickup)||clean(before.destination)!==clean(after.destination))changeParts.push('Route updated');
  if(clean(before.service)!==clean(after.service))changeParts.push(`Service: ${after.service||'—'}`);
  if(clean(before.name)!==clean(after.name)||clean(before.phone)!==clean(after.phone)||clean(before.email)!==clean(after.email))changeParts.push('Patient contact updated');
  if(clean(before.notes)!==clean(after.notes))changeParts.push('Trip notes updated');
  if(clean(before.submitterEntity)!==clean(after.submitterEntity)||clean(before.bookingSource)!==clean(after.bookingSource))changeParts.push('Submitter/payment owner updated');
  const beforeDriverConfirmedRate=Number(before.brokerAcceptedRate);
  const afterDriverConfirmedRate=Number(after.brokerAcceptedRate);
  const hasDriverConfirmedRate=Number.isFinite(afterDriverConfirmedRate)&&afterDriverConfirmedRate>0;
  if(clean(before.brokerCompanyName)!==clean(after.brokerCompanyName)||String(before.brokerAcceptedRate??'')!==String(after.brokerAcceptedRate??''))changeParts.push('Driver confirmed rate or broker terms updated');
  const isNowScheduled=clean(before.status)!==clean(after.status)&&String(after.status||'').toUpperCase()==='SCHEDULED';
  if(isNowScheduled&&hasDriverConfirmedRate)changeParts.push(`Driver confirmed rate: $${afterDriverConfirmedRate.toFixed(2)}`);
  if(!changeParts.length&&editNote)changeParts.push('Trip details updated');
  if(!changeParts.length)return {status:'skipped-no-diff'};

  let driverEmail=clean(afterRow?.driver_email||'');
  let driverPhone=clean(afterRow?.driver_phone||'');
  const resolvedDriver=await resolveDriverContacts({
   driverName:after.driverName,
   driverScopeId:after.driverScopeId,
   driverEmail,
   driverPhone
  });
  driverEmail=resolvedDriver.driverEmail;
  driverPhone=resolvedDriver.driverPhone;

  const facilityEmails=[];
  if(clean(after.facilityId)){
   const facilityUsers=await query(`SELECT email FROM users WHERE role='FACILITY' AND active=true AND scope_id=$1`,[after.facilityId]).catch(()=>({rows:[]}));
   for(const row of facilityUsers.rows||[])if(clean(row.email))facilityEmails.push(clean(row.email));
  }

  const adminEmails=[];
  const opsUsers=await query(`SELECT email FROM users WHERE role IN ('ADMIN','DISPATCHER','BILLING') AND active=true`).catch(()=>({rows:[]}));
  for(const row of opsUsers.rows||[])if(clean(row.email))adminEmails.push(clean(row.email));
  if(clean(process.env.COMPANY_EMAIL))adminEmails.push(clean(process.env.COMPANY_EMAIL));
  adminEmails.push('admin@nexusmt.com');

  const smsTargets=new Set([...buildSmsRecipients(after.phone),...(driverPhone?[driverPhone]:[])]);
  const emailTargets=new Set([
   ...buildEmailRecipients(after.email),
   ...(driverEmail?[driverEmail]:[]),
   ...facilityEmails,
   ...adminEmails
  ].filter(Boolean));

  const summary=changeParts.join(' | ');
  const note=clean(editNote);
  const pickupTime=clean(after.pickupTime||after.submittedAppointmentTime||after.appointmentTime||after.time||'');
  const checkInTime=clean(after.checkInTime||'');
  const smsText=`Nexus update for trip ${reference}: ${summary}. Updated by ${actorLabel}.${note?` Note: ${note}`:''}`;
  const html=`<h2>Trip updated — ${reference}</h2><p><strong>Updated by:</strong> ${actorLabel}</p><p><strong>Summary:</strong> ${summary}</p>${note?`<p><strong>Note:</strong> ${note}</p>`:''}<p><strong>Patient:</strong> ${after.name||'—'} (${after.phone||'—'})</p><p><strong>Schedule:</strong> ${after.date||'—'} at ${after.time||'—'}</p><p><strong>Pickup/appointment time:</strong> ${pickupTime||'—'}</p><p><strong>Check-in time:</strong> ${checkInTime||'—'}</p><p><strong>Route:</strong> ${after.pickup||'—'} → ${after.destination||'—'}</p><p><strong>Driver:</strong> ${after.driverName||'Unassigned'} | <strong>Vehicle:</strong> ${after.vehicleUnit||'Unassigned'}</p>${hasDriverConfirmedRate?`<p><strong>Driver confirmed rate:</strong> $${afterDriverConfirmedRate.toFixed(2)}</p>`:''}<p><strong>Status:</strong> ${after.statusLabel||after.status||'—'}</p>`;

  const smsList=Array.from(smsTargets);
  const emailList=Array.from(emailTargets);
  const smsPerTarget=await Promise.allSettled(smsList.map((phone)=>sendSms(phone,smsText)));
  const smsSentCount=smsPerTarget.filter((item)=>item.status==='fulfilled'&&item.value?.status==='sent').length;
  const smsFailed=smsPerTarget.find((item)=>item.status==='rejected');
  const smsStatus=smsSentCount>0?'sent':(smsFailed?'failed':'skipped');
  const smsResult=smsFailed
    ? {status:'failed',error:smsFailed.reason?.message,sent:smsSentCount,total:smsList.length}
    : {status:smsStatus,sent:smsSentCount,total:smsList.length};

  let emailResult;
  try{
   emailResult=await sendEmail(emailList,`Trip update — ${reference}`,html);
  }catch(err){
   emailResult={status:'failed',error:err?.message||'Email send failed'};
  }
  const emailSentCount=emailResult?.status==='sent'?emailList.length:0;
  const anySent=smsSentCount>0||emailSentCount>0;
  const effectiveStatus=anySent?'sent':'skipped';

  return {
   status:effectiveStatus,
   sms:smsResult,
   email:emailResult,
   recipients:anySent?{sms:smsSentCount,email:emailSentCount}:undefined,
   targets:{sms:smsList.length,email:emailList.length}
  };
 }catch(error){
  console.error('[TRIP_UPDATE_NOTIFY]',error.message);
  return {status:'failed',error:error.message};
 }
}
function verifyStripeWebhookSignature(rawBody,signature){
 if(!envEnabled('STRIPE_WEBHOOK_SECRET'))throw Object.assign(new Error('Stripe webhook secret not configured'),{statusCode:500});
 const secret=process.env.STRIPE_WEBHOOK_SECRET;
 const parts={};
 for(const part of String(signature||'').split(',')){
  const eqIdx=part.indexOf('=');if(eqIdx<0)continue;
  const k=part.slice(0,eqIdx),v=part.slice(eqIdx+1);
  parts[k]=v;
 }
 const ts=parts['t'],sig=parts['v1'];
 if(!ts||!sig)throw Object.assign(new Error('Invalid Stripe signature format'),{statusCode:400});
 const now=Math.floor(Date.now()/1000);
 if(Math.abs(now-Number(ts))>300)throw Object.assign(new Error('Stripe webhook timestamp expired'),{statusCode:400});
 const hmac=crypto.createHmac('sha256',secret).update(`${ts}.${rawBody}`).digest('hex');
 if(hmac!==sig)throw Object.assign(new Error('Invalid Stripe webhook signature'),{statusCode:400});
 return JSON.parse(rawBody);
}
async function createStripeIntent(amountCents,metadata){
 if(!envEnabled('STRIPE_SECRET_KEY'))throw Object.assign(new Error('Stripe is not configured'),{statusCode:503});
 const form=new URLSearchParams();form.set('amount',String(amountCents));form.set('currency','usd');form.set('automatic_payment_methods[enabled]','true');
 for(const [k,v] of Object.entries(metadata||{}))if(v!=null)form.set(`metadata[${k}]`,String(v).slice(0,500));
 const r=await fetch('https://api.stripe.com/v1/payment_intents',{method:'POST',headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded','idempotency-key':metadata?.bookingReference||crypto.randomUUID()},body:form});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data.error?.message||'Stripe request failed'),{statusCode:502});return data;
}
function siteBase(){
 const previewBase=process.env.DEPLOY_PRIME_URL||process.env.DEPLOY_URL;
 return String((isTestMode()&&previewBase)||process.env.SITE_URL||process.env.URL||previewBase||'https://nexusmt.com').replace(/\/$/,'');
}
function xmlEscape(value){
 return String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&apos;');
}
function xmlResponse(statusCode,body){
 return {
  statusCode,
  headers:{
   'content-type':'text/xml; charset=utf-8',
   'cache-control':'no-store',
   'x-content-type-options':'nosniff'
  },
  body
 };
}
function parseWebhookBody(event){
 const headers=event?.headers||{};
 const contentType=String(headers['content-type']||headers['Content-Type']||'').toLowerCase();
 const raw=event?.isBase64Encoded?Buffer.from(String(event.body||''),'base64').toString('utf8'):String(event?.body||'');
 if(contentType.includes('application/x-www-form-urlencoded'))return Object.fromEntries(new URLSearchParams(raw));
 if(contentType.includes('application/json')){
  try{return raw?JSON.parse(raw):{};}catch{return {};}
 }
 if(raw.includes('=')&&raw.includes('&'))return Object.fromEntries(new URLSearchParams(raw));
 try{return raw?JSON.parse(raw):{};}catch{return {};}
}
function parseHmToMinutes(value,fallbackMinutes){
 const text=clean(value);
 if(!text)return fallbackMinutes;
 const match=text.match(/^(\d{1,2}):(\d{2})$/);
 if(!match)return fallbackMinutes;
 const h=Number(match[1]);
 const m=Number(match[2]);
 if(!Number.isFinite(h)||!Number.isFinite(m)||h<0||h>23||m<0||m>59)return fallbackMinutes;
 return h*60+m;
}
function parseBoundedInt(value,fallback,min,max){
 const n=Number(value);
 if(!Number.isFinite(n))return fallback;
 const rounded=Math.round(n);
 if(rounded<min||rounded>max)return fallback;
 return rounded;
}
function nowInTimeZone(tz){
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:tz,
  weekday:'short',
  hour:'2-digit',
  minute:'2-digit',
  hour12:false
 }).formatToParts(new Date());
 const out={weekday:'Mon',hour:0,minute:0};
 for(const part of parts){
  if(part.type==='weekday')out.weekday=part.value;
  if(part.type==='hour')out.hour=Number(part.value);
  if(part.type==='minute')out.minute=Number(part.value);
 }
 return out;
}
function isBusinessHoursOpen(config){
 const weekdayMap={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
 const tz=config.businessHoursTz;
 const now=nowInTimeZone(tz);
 const weekday=weekdayMap[now.weekday]||1;
 if(!config.businessDays.has(weekday))return false;
 const minutes=(now.hour*60)+now.minute;
 return minutes>=config.businessStartMinutes&&minutes<=config.businessEndMinutes;
}
function getVoiceConfig(){
 const tz=clean(process.env.BUSINESS_HOURS_TZ)||'America/New_York';
 const businessDaysRaw=clean(process.env.BUSINESS_HOURS_DAYS)||'1,2,3,4,5';
 const businessDays=new Set(businessDaysRaw.split(',').map((x)=>Number(x.trim())).filter((n)=>Number.isFinite(n)&&n>=1&&n<=7));
 const callerId=clean(process.env.DISPATCH_CALLER_ID)||'+18886395766';
 const primaryDispatch=clean(process.env.DISPATCH_PRIMARY_NUMBER||process.env.DISPATCH_PHONE||'');
 const secondaryDispatch=clean(process.env.DISPATCH_SECONDARY_NUMBER||'');
 const dispatchMdPrimary=clean(process.env.DISPATCH_MD_NUMBER||process.env.DISPATCH_REGIONAL_MD_NUMBER||'');
 const dispatchDcPrimary=clean(process.env.DISPATCH_DC_NUMBER||process.env.DISPATCH_REGIONAL_DC_NUMBER||'');
 const dispatchMdSecondary=clean(process.env.DISPATCH_MD_SECONDARY_NUMBER||'');
 const dispatchDcSecondary=clean(process.env.DISPATCH_DC_SECONDARY_NUMBER||'');
 const dispatchMdAreaCodes=new Set((clean(process.env.DISPATCH_MD_AREA_CODES)||'227,240,301,410,443,667').split(',').map((code)=>code.trim()).filter((code)=>/^\d{3}$/.test(code)));
 const dispatchDcAreaCodes=new Set((clean(process.env.DISPATCH_DC_AREA_CODES)||'202,771').split(',').map((code)=>code.trim()).filter((code)=>/^\d{3}$/.test(code)));
 const supportPhoneE164=clean(process.env.DISPATCH_PHONE||process.env.NEXUS_DISPATCH_PHONE||'+18887604990');
 const supportPhone=formatPhoneDisplay(supportPhoneE164);
 const afterHoursVoicemail=clean(process.env.AFTER_HOURS_VOICEMAIL_NUMBER||'');
 const streamUrl=clean(process.env.TWILIO_MEDIA_STREAM_URL||'');
 const voiceName=clean(process.env.TWILIO_VOICE_NAME||'Polly.Joanna-Neural');
 const voiceLanguage=clean(process.env.TWILIO_VOICE_LANGUAGE||'en-US');
 const voiceMenuInitialPrompt=clean(process.env.VOICE_MENU_INITIAL_PROMPT||'Please tell me what you need, or press 1 for dispatch.');
 const voiceMenuRetryPrompt=clean(process.env.VOICE_MENU_RETRY_PROMPT||'Sorry, I did not catch that. Please take your time and say your request after the tone.');
 const voiceMenuHelpPromptInitial=clean(process.env.VOICE_MENU_HELP_PROMPT_INITIAL||'You can say dispatch, representative, or human at any time.');
 const voiceMenuHelpPromptRetry=clean(process.env.VOICE_MENU_HELP_PROMPT_RETRY||'You can say dispatch, booking help, or service hours.');
 const voiceMenuKeypadPromptInitial=clean(process.env.VOICE_MENU_KEYPAD_PROMPT_INITIAL||'Or use the keypad. Press 1 for dispatch. Press 2 for transportation request help. Press 3 for service areas and business hours.');
 const voiceMenuKeypadPromptRetry=clean(process.env.VOICE_MENU_KEYPAD_PROMPT_RETRY||'Press 1 for dispatch. Press 2 for booking help. Press 3 for service areas and business hours.');
 const voiceMenuListenPrompt=clean(process.env.VOICE_MENU_LISTEN_PROMPT||'Take your time. I am listening.');
 const voiceMenuGatherTimeout=parseBoundedInt(process.env.VOICE_MENU_GATHER_TIMEOUT,10,4,20);
 const voiceMenuSpeechTimeout=parseBoundedInt(process.env.VOICE_MENU_SPEECH_TIMEOUT,5,2,12);
 const voiceMenuPreGatherPause=parseBoundedInt(process.env.VOICE_MENU_PRE_GATHER_PAUSE,2,0,5);
 const voiceMenuPostGatherPause=parseBoundedInt(process.env.VOICE_MENU_POST_GATHER_PAUSE,2,0,5);
 const nonPhiMode=String(process.env.NON_PHI_MODE||'true').toLowerCase()!=='false';
 const allowPhiIntake=String(process.env.ALLOW_PHI_INTAKE||'false').toLowerCase()==='true';
 return {
  callerId,
  primaryDispatch,
  secondaryDispatch,
  dispatchMdPrimary,
  dispatchDcPrimary,
  dispatchMdSecondary,
  dispatchDcSecondary,
  dispatchMdAreaCodes,
  dispatchDcAreaCodes,
  supportPhone,
  supportPhoneE164,
  afterHoursVoicemail,
  streamUrl,
  voiceName,
  voiceLanguage,
  voiceMenuInitialPrompt,
  voiceMenuRetryPrompt,
  voiceMenuHelpPromptInitial,
  voiceMenuHelpPromptRetry,
  voiceMenuKeypadPromptInitial,
  voiceMenuKeypadPromptRetry,
  voiceMenuListenPrompt,
  voiceMenuGatherTimeout,
  voiceMenuSpeechTimeout,
  voiceMenuPreGatherPause,
  voiceMenuPostGatherPause,
  nonPhiMode,
  allowPhiIntake,
  businessHoursTz:tz,
  businessDays,
  businessStartMinutes:parseHmToMinutes(process.env.BUSINESS_HOURS_START,8*60),
  businessEndMinutes:parseHmToMinutes(process.env.BUSINESS_HOURS_END,18*60),
 };
}
function formatPhoneDisplay(value){
 const digits=String(value||'').replace(/\D/g,'');
 const normalized=digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;
 if(normalized.length===10)return `(${normalized.slice(0,3)}) ${normalized.slice(3,6)}-${normalized.slice(6)}`;
 return clean(value)||'(888) 760-4990';
}
function sayTag(text,config){
 const voice=xmlEscape(config?.voiceName||'Polly.Joanna-Neural');
 const language=xmlEscape(config?.voiceLanguage||'en-US');
 return `<Say voice="${voice}" language="${language}">${xmlEscape(text)}</Say>`;
}
function toE164(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(digits.length===11&&digits.startsWith('1'))return `+${digits}`;
 if(digits.length===10)return `+1${digits}`;
 return clean(value);
}
function voiceRouteUrl(path,query=''){
 const base=`${siteBase()}/api/voice/${path}`;
 return query?`${base}?${query}`:base;
}
function callbackTokenHash(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex')}
async function createTwilioVoiceCall({to,from,url,statusCallback}){
 if(!process.env.TWILIO_ACCOUNT_SID||!process.env.TWILIO_AUTH_TOKEN)throw Object.assign(new Error('Twilio calling is not configured'),{statusCode:503});
 const form=new URLSearchParams({To:to,From:from,Url:url,Method:'POST'});
 if(statusCallback){
  form.set('StatusCallback',statusCallback);
  form.set('StatusCallbackMethod','POST');
  form.append('StatusCallbackEvent','initiated');
  form.append('StatusCallbackEvent','ringing');
  form.append('StatusCallbackEvent','answered');
  form.append('StatusCallbackEvent','completed');
 }
 const auth=Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
 const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`,{method:'POST',headers:{authorization:`Basic ${auth}`,'content-type':'application/x-www-form-urlencoded'},body:form});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(data.message||`Twilio call failed (${response.status})`),{statusCode:502});
 return data;
}
function callbackConnectTwiml(customerPhone,callerId,config){
 return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('Connecting you to the caller through the Nexus business line.',config)}\n  <Dial callerId="${xmlEscape(callerId)}" timeout="30">\n    <Number>${xmlEscape(customerPhone)}</Number>\n  </Dial>\n</Response>`;
}
function dispatchDialTwiml({message,targetNumber,callerId,attempt='primary',region=''}){
 const actionParams=new URLSearchParams({attempt:String(attempt||'primary')});
 if(region)actionParams.set('region',String(region));
 const actionUrl=xmlEscape(voiceRouteUrl('dispatch-fallback',actionParams.toString()));
 const dialNumber=xmlEscape(targetNumber);
 return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>${xmlEscape(message)}</Say>\n  <Dial callerId="${xmlEscape(callerId)}" timeout="20" action="${actionUrl}" method="POST">\n    ${dialNumber}\n  </Dial>\n</Response>`;
}
function getCallerAreaCode(value){
 const digits=String(value||'').replace(/\D/g,'');
 const normalized=digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;
 if(normalized.length!==10)return '';
 return normalized.slice(0,3);
}
function resolveDispatchRegionByCaller(value,config){
 const areaCode=getCallerAreaCode(value);
 if(!areaCode)return '';
 if(config.dispatchDcAreaCodes?.has(areaCode))return 'DC';
 if(config.dispatchMdAreaCodes?.has(areaCode))return 'MD';
 return '';
}
function getDispatchDialTargets(config,fromNumber,preferredRegion=''){
 const region=String(preferredRegion||resolveDispatchRegionByCaller(fromNumber,config)||'').toUpperCase();
 const mdPrimary=clean(config.dispatchMdPrimary||'');
 const dcPrimary=clean(config.dispatchDcPrimary||'');
 const mdSecondary=clean(config.dispatchMdSecondary||'');
 const dcSecondary=clean(config.dispatchDcSecondary||'');
 const primaryFallback=clean(config.primaryDispatch||'');
 const secondaryFallback=clean(config.secondaryDispatch||'');
 let primary='';
 let secondary='';
 if(region==='DC'){
  primary=dcPrimary||primaryFallback||mdPrimary;
  secondary=dcSecondary||secondaryFallback||(primary!==mdPrimary?mdPrimary:'')||mdSecondary;
 }else if(region==='MD'){
  primary=mdPrimary||primaryFallback||dcPrimary;
  secondary=mdSecondary||secondaryFallback||(primary!==dcPrimary?dcPrimary:'')||dcSecondary;
 }else{
  primary=primaryFallback||mdPrimary||dcPrimary;
  secondary=secondaryFallback||(primary!==mdPrimary?mdPrimary:'')||(primary!==dcPrimary?dcPrimary:'')||mdSecondary||dcSecondary;
 }
 if(secondary&&secondary===primary)secondary='';
 return {region,primary,secondary};
}
function voiceOpeningScript(config){
 return "Thank you for calling Nexus Medical Transit. You've reached the Nexus Virtual Receptionist. I'm here to help you schedule transportation, check the status of an existing trip, answer questions about our services, or connect you with the appropriate team. How may I assist you today?";
}
function buildVoiceAssistantInstructions(){
 return [
  'You are the Nexus Virtual Receptionist for Nexus Medical Transit.',
  '',
  'Begin every new call by saying exactly:',
  '"Thank you for calling Nexus Medical Transit. You\'ve reached the Nexus Virtual Receptionist. I\'m here to help you schedule transportation, check the status of an existing trip, answer questions about our services, or connect you with the appropriate team. How may I assist you today?"',
  '',
  'IDENTITY AND DISCLOSURE',
  '- Clearly identify yourself as an AI virtual receptionist.',
  '- Never claim to be a human dispatcher, nurse, EMT, physician, or case manager.',
  '',
  'EMERGENCIES',
  '- Nexus is not a substitute for 911.',
  '- If the caller reports chest pain, severe breathing difficulty, unconsciousness, uncontrolled bleeding, stroke symptoms, immediate danger, or another emergency, tell the caller to hang up and call 911 immediately.',
  '- Do not perform medical diagnosis or provide clinical advice.',
  '',
  'TRANSPORTATION REQUESTS',
  'Collect only the information needed:',
  '- Caller\'s name',
  '- Callback number',
  '- Passenger\'s name',
  '- Pickup location',
  '- Destination',
  '- Requested date',
  '- Appointment or requested pickup time',
  '- One-way or round-trip',
  '- Ambulatory, wheelchair, stretcher, or bariatric service',
  '- Facility or private-pay caller',
  '- Special assistance requirements',
  '',
  'Never guarantee:',
  '- Vehicle availability',
  '- An exact pickup time',
  '- Pricing',
  '- Insurance coverage',
  '- Medicaid or broker authorization',
  '',
  'Say that a Nexus representative must confirm the request.',
  '',
  'CALL TRANSFER',
  'Transfer to dispatch when:',
  '- The caller asks for a person',
  '- The caller has an active trip problem',
  '- The driver cannot be located',
  '- A hospital discharge is time-sensitive',
  '- The caller is upset',
  '- The request is outside your approved information',
  '- The caller repeats the same question twice without resolution',
  '',
  'PRIVACY',
  '- Do not repeat sensitive information unnecessarily.',
  '- Do not request Social Security numbers.',
  '- Do not request full credit-card numbers.',
  '- Do not expose information about another passenger without authorization.',
  '',
  'VOICE DELIVERY STYLE',
  '- Speak calmly and naturally.',
  '- Keep a moderate pace and use short pauses between key points.',
  '- Ask one clear question at a time.',
  '- Avoid rushing through menus or long lists.',
  '- Give detailed, helpful responses in short sections so callers can follow easily.',
  '- When explaining services or next steps, provide clear specifics and then confirm understanding.'
 ].join('\n');
}
function buildVoiceKnowledgePack(){
 return {
  services:[
   'Wheelchair transportation',
   'Stretcher transportation',
   'Bariatric transportation',
   'Ambulatory transportation',
   'Hospital discharges',
   'Dialysis transportation',
   'Nursing home transportation'
  ],
  operations:[
   'Facility partnerships',
   'Broker relationships',
   'Service areas',
   'Hours of operation',
   'Contact information',
   'Frequently asked questions'
  ],
  optionalTopics:[
   'Pricing (only if configured and approved for quoting)'
  ],
  routingExamples:[
   'Book a ride',
   'Check my trip',
   'I am calling from a hospital',
   'I would like to become a facility partner',
   'I need billing',
   'I want to speak with dispatch'
  ],
  futureEnhancements:[
   'Caller recognition for repeat customers',
   'Real-time trip status from dispatch integration',
   'SMS confirmations and reminders',
   'Support for multiple languages',
   'Voice analytics and call summaries',
   'Website-integrated appointment scheduling'
  ],
  brandPhone:'1-888-NEX-5766',
  brandPhoneDisplay:'(888) 639-5766',
  websiteDerived:{
    supportPhone:config.supportPhone,
    supportPhoneE164:config.supportPhoneE164,
   supportEmail:'contact@nexusmt.com',
   bookingUrl:'/booking-app.html',
   livecareUrl:'/livecare.html',
   dispatchUrl:'/dispatch.html',
   facilityUrl:'/facility.html',
   billingUrl:'/billing.html',
   customerBookingServices:[
    'Ambulatory',
    'Wheelchair',
    'Stretcher',
    'Bariatric',
    'IFT Routine',
    'IFT High-Acuity'
   ],
   livecareFilters:[
    'Wheelchair',
    'Stretcher',
    'Hospital discharge'
   ],
   audiencePortals:[
    'Patient',
    'Facility',
    'Dispatch',
    'Driver',
    'Executive'
   ],
   defaultOperationsHours:'Mon-Friday, 7 AM-7 PM'
  }
 };
}
function wantsHumanTransfer(text){
 const value=clean(text).toLowerCase();
 if(!value)return false;
 return /(dispatch|representative|human|agent|person|operator|someone)/.test(value);
}
function voiceMenuTwiml(config,retryCount=0,opts={}){
 const gatherAction=xmlEscape(voiceRouteUrl('menu-handle',`retry=${encodeURIComponent(String(retryCount))}`));
 const introMessage=clean(opts.intro||'');
 const sayIntro=retryCount>0
  ?clean(config?.voiceMenuRetryPrompt||'')
  :clean(config?.voiceMenuInitialPrompt||'');
 const helpPrompt=retryCount>0
  ?clean(config?.voiceMenuHelpPromptRetry||'')
  :clean(config?.voiceMenuHelpPromptInitial||'');
 const keypadPrompt=retryCount>0
  ?clean(config?.voiceMenuKeypadPromptRetry||'')
  :clean(config?.voiceMenuKeypadPromptInitial||'');
 const listenPrompt=clean(config?.voiceMenuListenPrompt||'Take your time. I am listening.');
 const prePause=Math.max(0,Number(config?.voiceMenuPreGatherPause||2));
 const postPause=Math.max(0,Number(config?.voiceMenuPostGatherPause||2));
 const gatherTimeout=Math.max(4,Number(config?.voiceMenuGatherTimeout||10));
 const speechTimeout=Math.max(2,Number(config?.voiceMenuSpeechTimeout||5));
 const introBlock=(introMessage&&retryCount===0)
  ?`${sayTag(introMessage,config)}\n  <Pause length="1" />\n  `
  :'';
 return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${introBlock}${sayTag(sayIntro,config)}\n  <Pause length="${prePause}" />\n  <Gather input="speech dtmf" numDigits="1" timeout="${gatherTimeout}" speechTimeout="${speechTimeout}" action="${gatherAction}" method="POST">\n    ${sayTag(helpPrompt,config)}\n    <Pause length="1" />\n    ${sayTag(keypadPrompt,config)}\n    <Pause length="1" />\n    ${sayTag(listenPrompt,config)}\n  </Gather>\n  <Pause length="${postPause}" />\n  <Redirect method="POST">${xmlEscape(voiceRouteUrl('menu-handle',`retry=${encodeURIComponent(String(retryCount+1))}`))}</Redirect>\n</Response>`;
}
async function createStripeCheckoutSession(amountCents,metadata){
 if(!envEnabled('STRIPE_SECRET_KEY'))throw Object.assign(new Error('Stripe is not configured'),{statusCode:503});
 const bookingReference=clean(metadata?.bookingReference)||crypto.randomUUID();
 const form=new URLSearchParams();
 form.set('mode','payment');
 form.set('success_url',`${siteBase()}/booking-app.html?payment=success&bookingReference=${encodeURIComponent(bookingReference)}`);
 form.set('cancel_url',`${siteBase()}/booking-app.html?payment=cancelled&bookingReference=${encodeURIComponent(bookingReference)}`);
 form.set('line_items[0][price_data][currency]','usd');
 const modeLabel=metadata?.paymentMode==='deposit'?'25% Deposit — ':'';
 form.set('line_items[0][price_data][product_data][name]',`${modeLabel}Nexus Medical Transit Booking ${bookingReference}`);
 form.set('line_items[0][price_data][unit_amount]',String(amountCents));
 form.set('line_items[0][quantity]','1');
 for(const [k,v] of Object.entries(metadata||{}))if(v!=null)form.set(`metadata[${k}]`,String(v).slice(0,500));
 const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded','idempotency-key':`checkout-${bookingReference}-${metadata?.paymentMode||'full'}`},body:form});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(data.error?.message||'Stripe checkout request failed'),{statusCode:502});
 return data;
}
async function createSquarePaymentLink(amountCents,metadata){
 if(!envEnabled('SQUARE_ACCESS_TOKEN')||!envEnabled('SQUARE_LOCATION_ID'))throw Object.assign(new Error('Square is not configured'),{statusCode:503});
 const bookingReference=clean(metadata?.bookingReference)||crypto.randomUUID();
 const body={
  idempotency_key:`square-${bookingReference}`,
  quick_pay:{
   name:`Nexus Medical Transit Booking ${bookingReference}`,
   price_money:{amount:amountCents,currency:'USD'},
   location_id:process.env.SQUARE_LOCATION_ID
  },
  checkout_options:{
   redirect_url:`${siteBase()}/booking-app.html?payment=success&provider=square&bookingReference=${encodeURIComponent(bookingReference)}`
  },
  pre_populated_data:{
   buyer_email:clean(metadata?.email)||undefined
  }
 };
 const r=await fetch('https://connect.squareup.com/v2/online-checkout/payment-links',{method:'POST',headers:{authorization:`Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,'content-type':'application/json','Square-Version':'2026-07-15'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(data?.errors?.[0]?.detail||'Square payment link request failed'),{statusCode:502});
 return data;
}
async function calculateBrokerRate(brokerId,service,miles){
 if(!brokerId)return null;
 const r=await query(`SELECT base_rate,per_mile_rate FROM broker_rates WHERE broker_id=$1 AND service=$2 AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now()) ORDER BY effective_from DESC LIMIT 1`,[brokerId,service]);
 if(!r.rows[0])return null;
 const rate=r.rows[0];
 return Number(rate.base_rate||0)+Number(miles||0)*Number(rate.per_mile_rate||0);
}
async function sendBrokerRequestToDispatch(br){
 const dispatchEmail=process.env.COMPANY_EMAIL||'dispatch@nexusmt.com';
 const statusLabel=br.request_status==='AUTO_BOOKED'?'AUTO-BOOKED':'PENDING DISPATCH CONFIRMATION';
 const variance=Number(br.variance ?? br.rate_delta ?? 0);
 const text=`Broker request: ${br.broker_name} - ${br.pickup} to ${br.destination} on ${br.trip_date} at ${br.trip_time}. Broker: $${Number(br.broker_quoted_rate||0).toFixed(2)} vs Platform: $${Number(br.platform_calculated_rate||0).toFixed(2)}. Variance: $${variance.toFixed(2)}. Status: ${statusLabel}`;
 const html=`<h2>Broker Request</h2><p><strong>Broker:</strong> ${br.broker_name}</p><p><strong>Route:</strong> ${br.pickup} to ${br.destination}</p><p><strong>Date/Time:</strong> ${br.trip_date} at ${br.trip_time}</p><p>Broker rate: $${Number(br.broker_quoted_rate||0).toFixed(2)} | Platform rate: $${Number(br.platform_calculated_rate||0).toFixed(2)} | Variance: $${variance.toFixed(2)}</p><p>Status: ${statusLabel}</p>`;
 await Promise.allSettled([sendSms(process.env.DISPATCH_PHONE,text),sendEmail(dispatchEmail,`Broker: ${br.broker_name}`,html)]).catch(()=>{});
}

async function sendBrokerRequestConfirmation(br,toEmail,brokerName){
 const subject=br.request_status==='AUTO_BOOKED'?
  `Nexus broker request auto-booked — ${br.broker_name || brokerName || 'Broker request'}`:
  `Nexus broker request received — ${br.broker_name || brokerName || 'Broker request'}`;
 const statusLabel=br.request_status==='AUTO_BOOKED'?'AUTO_BOOKED':'PENDING DISPATCH CONFIRMATION';
 const message=br.request_status==='AUTO_BOOKED'?'Your request has been automatically booked and dispatch has the trip details.':'Your request has been received and is pending dispatch confirmation. Dispatch will finalize the booking once ready.';
 const html=`<h2>${br.request_status==='AUTO_BOOKED'?'Broker request auto-booked':'Broker request received'}</h2><p>Your request for <strong>${br.pickup}</strong> to <strong>${br.destination}</strong> on <strong>${br.trip_date}</strong> at <strong>${br.trip_time}</strong> ${br.request_status==='AUTO_BOOKED'?'has been automatically booked':'has been received'}.</p><p>Status: <strong>${statusLabel}</strong></p><p>${message}</p>`;
 const results=await Promise.allSettled([sendEmail(toEmail,subject,html)]);
 return {email:results[0].status==='fulfilled'?results[0].value:{status:'failed',error:results[0].reason?.message}};
}

async function sendBrokerRequestDispatchNotifications(br,toEmail,brokerName){
 const dispatchEmail=process.env.COMPANY_EMAIL||'dispatch@nexusmt.com';
 const customerSubject=`Nexus broker request received — ${br.broker_name || brokerName || 'Broker request'}`;
 const dispatchSubject=`Broker request finalized — ${br.broker_name || brokerName || 'Broker request'}`;
 const customerHtml=`<h2>Broker request received</h2><p>Your request for <strong>${br.pickup}</strong> to <strong>${br.destination}</strong> on <strong>${br.trip_date}</strong> at <strong>${br.trip_time}</strong> has been received.</p><p>Status: <strong>PENDING DISPATCH CONFIRMATION</strong></p><p>Dispatch will finalize the booking once ready.</p>`;
 const dispatchHtml=`<h2>Broker request ready for dispatch</h2><p><strong>Broker:</strong> ${br.broker_name || brokerName || 'Unknown'}</p><p><strong>Route:</strong> ${br.pickup} → ${br.destination}</p><p><strong>Date/Time:</strong> ${br.trip_date} at ${br.trip_time}</p><p>Status: <strong>${clean(br.request_status || 'APPROVED')}</strong></p><p>Dispatch should complete the booking and notify the customer.</p>`;
 const customerResults=await Promise.allSettled([sendEmail(toEmail,customerSubject,customerHtml)]);
 const dispatchResults=await Promise.allSettled([sendEmail(dispatchEmail,dispatchSubject,dispatchHtml)]);
 return {customer:{email:customerResults[0].status==='fulfilled'?customerResults[0].value:{status:'failed',error:customerResults[0].reason?.message}},dispatch:{email:dispatchResults[0].status==='fulfilled'?dispatchResults[0].value:{status:'failed',error:dispatchResults[0].reason?.message}}};
}

async function handler(event){
 try{
  const p=routePath(event),method=event.httpMethod;
  if(isTestMode()){
   const route=p.join('/');
   if(route==='integrations/config'&&method==='GET')return json(200,{build:'test',testMode:true,googleMapsEnabled:false,googleMapsBrowserKey:'',stripeEnabled:true,stripePublishableKey:'',squareEnabled:false});
   if(route==='integrations/health'&&method==='GET')return json(200,{testMode:true,googleMaps:'simulated',twilio:'disabled',sendGrid:'disabled',stripe:'simulated',square:'disabled',gps:'simulated',checkedAt:new Date().toISOString()});
   if(route==='locations/search'&&method==='GET'){
    const q=clean(event.queryStringParameters?.q);
    return json(200,{locations:q.length<2?[]:[{id:`test-${crypto.createHash('sha1').update(q).digest('hex').slice(0,8)}`,name:q,address:q,type:'test'}]});
   }
   if(p[0]==='booking-drafts'&&method==='POST')return json(202,{saved:true,testMode:true,reminderInMinutes:0});
   if(p[0]==='bookings'&&method==='POST'&&p.length===1){
    const b=parseBody(event);required(b,['name','phone','service','pickup','destination','date','time','appointmentTime']);
    const ref=`TEST-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(100,999)}`;
    return json(201,{testMode:true,persisted:false,booking:{reference:ref,name:clean(b.name),service:clean(b.service),pickup:clean(b.pickup),destination:clean(b.destination),date:clean(b.date),time:clean(b.time),estimatedFare:Number(b.estimatedFare||0),status:'PENDING_PAYMENT'},requiresOnlinePayment:true,depositRequired:true,clientMessage:`Test booking created. Reference: ${ref}. No live booking was saved.`});
   }
   if(p[0]==='bookings'&&p[1]&&p[2]==='update'&&method==='POST'){
    const b=parseBody(event);required(b,['name','phone','service','pickup','destination','date','time','appointmentTime']);
    return json(200,{testMode:true,persisted:false,booking:{reference:decodeURIComponent(p[1]),name:clean(b.name),service:clean(b.service),pickup:clean(b.pickup),destination:clean(b.destination),date:clean(b.date),time:clean(b.time),estimatedFare:Number(b.estimatedFare||0),status:'PENDING_PAYMENT'},requiresOnlinePayment:true,depositRequired:true,clientMessage:`Test booking ${decodeURIComponent(p[1])} updated. No live booking was changed.`});
   }
   if((route==='payments/stripe/checkout'||route==='payments/square/checkout')&&method==='POST'){
    const b=parseBody(event);required(b,['bookingReference']);
    const provider=route.includes('/square/')?'square':'stripe';
    const paymentMode=['deposit','full'].includes(b.paymentMode)?b.paymentMode:'full';
    const amount=Math.max(0,Number(b.amount||0));
    const chargeAmount=paymentMode==='deposit'?Math.round(amount*.25*100):Math.round(amount*100);
    const requestHost=clean(event.headers?.host||event.headers?.Host);
    const testBase=requestHost?`https://${requestHost}`:siteBase();
    const url=`${testBase}/test-payment.html?provider=${provider}&mode=${paymentMode}&bookingReference=${encodeURIComponent(clean(b.bookingReference))}&amount=${chargeAmount}`;
    return json(200,{testMode:true,provider,url,sessionId:`test_${crypto.randomUUID()}`,amount:chargeAmount,paymentMode});
   }
  }
  if(p[0]==='careers'&&p[1]==='applications'&&method==='POST'){
   const b=parseBody(event);required(b,['firstName','lastName','email','phone','city','state','position','employmentPreference','experienceYears','interest']);
   if(clean(b.botField))return json(202,{received:true});
   const email=clean(b.email).toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{error:'Enter a valid email address'});
   if(b.authorizedToWork!==true||b.certification!==true)return json(400,{error:'Required employment certifications must be accepted'});
   const resume=b.resume||null,resumeBytes=resume?.dataBase64?Buffer.from(String(resume.dataBase64),'base64'):null;
   const allowedResumeTypes=new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
   if(resumeBytes&&(!allowedResumeTypes.has(clean(resume.mimeType))||resumeBytes.length>4*1024*1024))return json(400,{error:'Résumé must be a PDF, DOC, or DOCX file no larger than 4 MB'});
   await ensureCareerApplicationsSchema();
   const created=await query(`INSERT INTO career_applications(first_name,last_name,email,phone,city,state,position,employment_preference,available_start_date,preferred_shift,authorized_to_work,reliable_transportation,experience_years,license_state,certifications,interest,additional_information,resume_name,resume_mime_type,resume_data)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id,created_at`,[clean(b.firstName),clean(b.lastName),email,clean(b.phone),clean(b.city),clean(b.state),clean(b.position),clean(b.employmentPreference),clean(b.availableStartDate)||null,clean(b.preferredShift)||null,b.reliableTransportation===true,clean(b.experienceYears),clean(b.licenseState)||null,clean(b.certifications)||null,clean(b.interest),clean(b.additionalInformation)||null,resume?clean(resume.name)||null:null,resume?clean(resume.mimeType)||null:null,resumeBytes]);
   const applicationId=String(created.rows[0].id),name=`${clean(b.firstName)} ${clean(b.lastName)}`;
   const safe=value=>clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
   const applicantEmail=sendEmail([email],'We received your Nexus Medical Transit application',`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2 style="color:#082f49">Application received</h2><p>Hello ${safe(b.firstName)},</p><p>Thank you for applying to Nexus Medical Transit for <strong>${safe(b.position)}</strong>. Our hiring team will review your qualifications and contact you if your experience matches an available opportunity.</p><p><strong>Application reference:</strong> ${applicationId}</p><p>Do not send Social Security numbers or financial information by email.</p><p>Nexus Medical Transit<br>(888) 639-5766</p></div>`);
   const hiringRecipients=buildEmailRecipients(process.env.HIRING_EMAIL||process.env.COMPANY_EMAIL||'contact@nexusmt.com');
   const hiringEmail=sendEmail(hiringRecipients,`New Nexus applicant — ${name} — ${clean(b.position)}`,`<div style="font-family:Arial,sans-serif;max-width:680px"><h2>New career application</h2><p><strong>${safe(name)}</strong> applied for <strong>${safe(b.position)}</strong>.</p><p>Email: ${safe(email)}<br>Phone: ${safe(b.phone)}<br>Location: ${safe(b.city)}, ${safe(b.state)}<br>Experience: ${safe(b.experienceYears)}</p><p>Sign in to the Nexus Admin applicant workspace to review and respond.</p><p>Reference: ${applicationId}</p></div>`);
   const notificationResults=await Promise.allSettled([applicantEmail,hiringEmail]);
   const notificationStatus={applicant:notificationResults[0].status==='fulfilled'?notificationResults[0].value:{status:'failed'},hiring:notificationResults[1].status==='fulfilled'?notificationResults[1].value:{status:'failed'}};
   await query('UPDATE career_applications SET notification_status=$2::jsonb WHERE id=$1',[applicationId,JSON.stringify(notificationStatus)]);
   await audit('CAREER_APPLICATION',applicationId,'SUBMITTED',{position:clean(b.position),notifications:notificationStatus});
   const confirmationEmailSent=notificationStatus.applicant?.status==='sent';
   return json(201,{received:true,applicationId,confirmationEmailSent,message:confirmationEmailSent?'Your application has been received. A confirmation email has been sent.':'Your application has been received. Save your application reference.'});
  }
  if(p[0]==='admin'&&p[1]==='career-applications'){
   const me=await requireUser(bearer(event),['ADMIN']);await ensureCareerApplicationsSchema();
   if(method==='GET'&&p.length===2){const result=await query(`SELECT id,first_name,last_name,email,phone,city,state,position,employment_preference,available_start_date,preferred_shift,authorized_to_work,reliable_transportation,experience_years,license_state,certifications,interest,additional_information,resume_name,status,internal_notes,applicant_response,notification_status,reviewed_at,responded_at,created_at,updated_at FROM career_applications ORDER BY CASE status WHEN 'NEW' THEN 0 WHEN 'REVIEWING' THEN 1 ELSE 2 END,created_at DESC LIMIT 500`);return json(200,{applications:result.rows});}
   const id=decodeURIComponent(p[2]||'');if(!id)return json(404,{error:'Application not found'});
   if(method==='GET'&&p[3]==='resume'){const result=await query('SELECT resume_name,resume_mime_type,resume_data FROM career_applications WHERE id=$1',[id]),row=result.rows[0];if(!row?.resume_data)return json(404,{error:'Résumé not found'});return {statusCode:200,isBase64Encoded:true,headers:{'content-type':row.resume_mime_type||'application/octet-stream','content-disposition':`attachment; filename="${clean(row.resume_name).replace(/[^a-zA-Z0-9._-]/g,'_')}"`},body:Buffer.from(row.resume_data).toString('base64')};}
   const b=parseBody(event);
   if(method==='PATCH'&&p.length===3){const status=String(b.status||'').toUpperCase();if(!['NEW','REVIEWING','INTERVIEW','OFFERED','HIRED','DECLINED','ARCHIVED'].includes(status))return json(400,{error:'Select a valid application status'});const updated=await query('UPDATE career_applications SET status=$2,internal_notes=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *',[id,status,clean(b.internalNotes)||null,me.id]);await audit('CAREER_APPLICATION',id,'REVIEWED',{status,by:me.email});return json(200,{application:updated.rows[0]});}
   if(method==='POST'&&p[3]==='response'){required(b,['subject','message']);const found=await query('SELECT first_name,last_name,email FROM career_applications WHERE id=$1',[id]),applicant=found.rows[0];if(!applicant)return json(404,{error:'Application not found'});const result=await sendEmail([applicant.email],clean(b.subject),`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><p>Hello ${clean(applicant.first_name)},</p>${clean(b.message).split(/\n+/).map(line=>`<p>${line.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</p>`).join('')}<p>Nexus Medical Transit<br>(888) 639-5766</p></div>`);if(result.status!=='sent')return json(503,{error:'Applicant email service is not configured or did not accept the message',emailStatus:result});await query('UPDATE career_applications SET applicant_response=$2,responded_at=now(),reviewed_by=$3,updated_at=now() WHERE id=$1',[id,clean(b.message),me.id]);await audit('CAREER_APPLICATION',id,'APPLICANT_RESPONSE_SENT',{to:applicant.email,by:me.email,status:result.status});return json(200,{sent:true,emailStatus:result});}
  }
  if(p[0]==='keymark'){
   const upsertIntegratedAppointment=async(mapped,facilityId=null,organizationId=null)=>{
    const source=clean(mapped.sourceSystem).toUpperCase()||'FHIR';
    const r=await query(`INSERT INTO keymark_appointments(organization_id,facility_id,external_appointment_id,source_system,patient_external_id,patient_name,patient_phone,patient_email,appointment_at,department,appointment_type,arrival_risk_score,notes,integration_payload)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13)
     ON CONFLICT(source_system,external_appointment_id) DO UPDATE SET patient_external_id=EXCLUDED.patient_external_id,patient_name=EXCLUDED.patient_name,patient_phone=EXCLUDED.patient_phone,patient_email=EXCLUDED.patient_email,appointment_at=EXCLUDED.appointment_at,department=EXCLUDED.department,appointment_type=EXCLUDED.appointment_type,notes=EXCLUDED.notes,integration_payload=EXCLUDED.integration_payload,updated_at=now() RETURNING *`,[organizationId,facilityId,clean(mapped.externalAppointmentId),source,clean(mapped.patientExternalId)||null,clean(mapped.patientName),clean(mapped.patientPhone)||null,clean(mapped.patientEmail)||null,mapped.appointmentAt,clean(mapped.department)||null,clean(mapped.appointmentType)||null,clean(mapped.notes)||null,JSON.stringify(mapped.integrationPayload||{})]);
    return r.rows[0];
   };
   if(p[1]==='integrations'&&['fhir','hl7'].includes(p[2])&&method==='POST'){
    verifyIntegrationRequest(event);
    const protocol=p[2].toUpperCase(),sourceSystem=clean(event.headers?.['x-keymark-source-system']||protocol).toUpperCase();
    const facilityId=clean(event.headers?.['x-keymark-facility-id'])||null;
    const rawBody=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):String(event.body||'');
    const digestValue=payloadDigest(rawBody),existing=await query('SELECT appointment_id,status FROM keymark_integration_messages WHERE source_system=$1 AND payload_digest=$2',[sourceSystem,digestValue]);
    if(existing.rows[0])return json(200,{accepted:true,deduplicated:true,appointmentId:existing.rows[0].appointment_id,status:existing.rows[0].status});
    let mapped,externalMessageId='';
    try{
     if(protocol==='FHIR'){
      const body=JSON.parse(rawBody||'{}'),resource=body.resource||body;
      mapped=mapFhirAppointment(resource,{sourceSystem,patient:body.patient||{}});externalMessageId=clean(resource.id||mapped.externalAppointmentId);
     }else{mapped={...parseHl7(rawBody),sourceSystem};externalMessageId=clean(mapped.messageControlId||mapped.externalAppointmentId)}
     const row=await upsertIntegratedAppointment(mapped,facilityId,null);
     await query(`INSERT INTO keymark_integration_messages(direction,protocol,source_system,external_message_id,payload_digest,status,appointment_id,metadata,processed_at) VALUES('INBOUND',$1,$2,$3,$4,'PROCESSED',$5,$6,now())`,[protocol,sourceSystem,externalMessageId,digestValue,row.id,JSON.stringify({facilityId,resourceType:protocol==='FHIR'?'Appointment':'SIU'})]);
     await query('INSERT INTO keymark_events(appointment_id,event_type,event_status,actor_role,details) VALUES($1,$2,$3,$4,$5)',[row.id,'INTEGRATION_INGESTED','PROCESSED','SYSTEM',JSON.stringify({protocol,sourceSystem,externalMessageId})]);
     await audit('KEYMARK_INTEGRATION',String(row.id),'INGESTED',{protocol,sourceSystem,externalMessageId});
     return json(202,{accepted:true,deduplicated:false,appointmentId:String(row.id),externalAppointmentId:mapped.externalAppointmentId});
    }catch(error){
     await query(`INSERT INTO keymark_integration_messages(direction,protocol,source_system,external_message_id,payload_digest,status,error_code,error_message,metadata,processed_at) VALUES('INBOUND',$1,$2,$3,$4,'REJECTED','MAPPING_ERROR',$5,$6,now()) ON CONFLICT(source_system,payload_digest) DO NOTHING`,[protocol,sourceSystem,externalMessageId,digestValue,String(error.message).slice(0,500),JSON.stringify({facilityId})]).catch(()=>{});
     throw error;
    }
   }
   const allowedRoles=['ADMIN','DISPATCHER','EXECUTIVE','QA','FACILITY'];
   const u=await requireUser(bearer(event),allowedRoles);
   const facilityScope=u.role==='FACILITY'?clean(u.scope_id):'';
   const scopedWhere=(alias='a')=>facilityScope?{sql:` WHERE ${alias}.facility_id=$1`,params:[facilityScope]}:{sql:'',params:[]};
   const calculateRisk=(input)=>{
    const barriers=Array.isArray(input.barrierCodes)?input.barrierCodes.map(v=>clean(v).toUpperCase()).filter(Boolean):[];
    let score=0;
    if(input.eligibilityStatus==='PENDING'||input.eligibilityStatus==='INELIGIBLE')score+=20;
    if(input.consentStatus!=='GRANTED')score+=10;
    if(input.transportationRequired===true&&(!input.transportationMode||['NOT_ASSESSED','NEEDS_RIDE'].includes(input.transportationStatus)))score+=30;
    score+=Math.min(30,barriers.length*10);
    const hours=(new Date(input.appointmentAt).getTime()-Date.now())/3600000;
    if(Number.isFinite(hours)&&hours<=24)score+=10;
    return Math.max(0,Math.min(100,score));
   };
   const mapAppointment=row=>({
    id:String(row.id),externalAppointmentId:row.external_appointment_id,sourceSystem:row.source_system,
    facilityId:row.facility_id,patientExternalId:row.patient_external_id,patientName:row.patient_name,
    patientPhone:row.patient_phone,patientEmail:row.patient_email,appointmentAt:row.appointment_at,
    department:row.department,appointmentType:row.appointment_type,eligibilityStatus:row.eligibility_status,
    consentStatus:row.consent_status,barrierCodes:row.barrier_codes||[],outreachStatus:row.outreach_status,
    nextOutreachAt:row.next_outreach_at,transportationRequired:row.transportation_required,
    transportationMode:row.transportation_mode,transportationStatus:row.transportation_status,
    bookingReference:row.booking_reference,arrivalRiskScore:Number(row.arrival_risk_score||0),
    arrivalStatus:row.arrival_status,outcomeReasonCode:row.outcome_reason_code,notes:row.notes,
    createdAt:row.created_at,updatedAt:row.updated_at
   });
   if(p[1]==='appointments'&&!p[2]&&method==='GET'){
    const scope=scopedWhere('a');
    const r=await query(`SELECT a.* FROM keymark_appointments a${scope.sql} ORDER BY a.appointment_at ASC LIMIT 500`,scope.params);
    await audit('KEYMARK','appointments','VIEWED',{role:u.role,facilityScope:facilityScope||null,count:r.rowCount});
    return json(200,{appointments:r.rows.map(mapAppointment)});
   }
   if(p[1]==='appointments'&&!p[2]&&method==='POST'){
    if(u.role==='EXECUTIVE'||u.role==='QA')return json(403,{error:'This role has read-only KeyMark access'});
    const b=parseBody(event);required(b,['externalAppointmentId','patientName','appointmentAt']);
    const sourceSystem=clean(b.sourceSystem).toUpperCase()||'MANUAL';
    const facilityId=facilityScope||clean(b.facilityId)||null;
    const appointmentAt=new Date(b.appointmentAt);
    if(Number.isNaN(appointmentAt.getTime()))return json(400,{error:'appointmentAt must be a valid date and time'});
    const normalized={...b,appointmentAt:appointmentAt.toISOString(),eligibilityStatus:clean(b.eligibilityStatus).toUpperCase()||'PENDING',consentStatus:clean(b.consentStatus).toUpperCase()||'UNKNOWN',transportationStatus:clean(b.transportationStatus).toUpperCase()||'NOT_ASSESSED'};
    const risk=calculateRisk(normalized);
    const r=await query(`INSERT INTO keymark_appointments(organization_id,facility_id,external_appointment_id,source_system,patient_external_id,patient_name,patient_phone,patient_email,appointment_at,department,appointment_type,eligibility_status,consent_status,barrier_codes,outreach_status,next_outreach_at,transportation_required,transportation_mode,transportation_status,arrival_risk_score,notes,integration_payload,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT(source_system,external_appointment_id) DO UPDATE SET patient_name=EXCLUDED.patient_name,patient_phone=EXCLUDED.patient_phone,patient_email=EXCLUDED.patient_email,appointment_at=EXCLUDED.appointment_at,department=EXCLUDED.department,appointment_type=EXCLUDED.appointment_type,eligibility_status=EXCLUDED.eligibility_status,consent_status=EXCLUDED.consent_status,barrier_codes=EXCLUDED.barrier_codes,transportation_required=EXCLUDED.transportation_required,transportation_mode=EXCLUDED.transportation_mode,transportation_status=EXCLUDED.transportation_status,arrival_risk_score=EXCLUDED.arrival_risk_score,notes=EXCLUDED.notes,integration_payload=EXCLUDED.integration_payload,updated_at=now() RETURNING *`,[
      u.organization_id||null,facilityId,clean(b.externalAppointmentId),sourceSystem,clean(b.patientExternalId)||null,clean(b.patientName),clean(b.patientPhone)||null,clean(b.patientEmail)||null,appointmentAt.toISOString(),clean(b.department)||null,clean(b.appointmentType)||null,normalized.eligibilityStatus,normalized.consentStatus,Array.isArray(b.barrierCodes)?b.barrierCodes.map(v=>clean(v).toUpperCase()).filter(Boolean):[],clean(b.outreachStatus).toUpperCase()||'NOT_STARTED',b.nextOutreachAt||null,b.transportationRequired===true,clean(b.transportationMode).toUpperCase()||null,normalized.transportationStatus,risk,clean(b.notes)||null,JSON.stringify(b.integrationPayload||{}),u.id
     ]);
    const row=r.rows[0];
    await query('INSERT INTO keymark_events(appointment_id,event_type,event_status,actor_id,actor_role,details) VALUES($1,$2,$3,$4,$5,$6)',[row.id,'APPOINTMENT_INGESTED','ACCEPTED',u.id,u.role,JSON.stringify({sourceSystem,risk})]);
    await audit('KEYMARK_APPOINTMENT',String(row.id),'UPSERTED',{sourceSystem,externalAppointmentId:b.externalAppointmentId,risk,role:u.role});
    return json(201,{appointment:mapAppointment(row)});
   }
   if(p[1]==='appointments'&&p[2]&&method==='PATCH'){
    if(u.role==='EXECUTIVE'||u.role==='QA')return json(403,{error:'This role has read-only KeyMark access'});
    const b=parseBody(event),id=p[2];
    const found=await query(`SELECT * FROM keymark_appointments WHERE id=$1${facilityScope?' AND facility_id=$2':''}`,[id,...(facilityScope?[facilityScope]:[])]);
    if(!found.rows[0])return json(404,{error:'KeyMark appointment not found'});
    const current=mapAppointment(found.rows[0]);
    const next={...current,...b,eligibilityStatus:clean(b.eligibilityStatus||current.eligibilityStatus).toUpperCase(),consentStatus:clean(b.consentStatus||current.consentStatus).toUpperCase(),transportationStatus:clean(b.transportationStatus||current.transportationStatus).toUpperCase(),arrivalStatus:clean(b.arrivalStatus||current.arrivalStatus).toUpperCase()};
    const risk=calculateRisk(next);
    const r=await query(`UPDATE keymark_appointments SET eligibility_status=$2,consent_status=$3,barrier_codes=$4,outreach_status=$5,next_outreach_at=$6,transportation_required=$7,transportation_mode=$8,transportation_status=$9,booking_reference=$10,arrival_risk_score=$11,arrival_status=$12,outcome_reason_code=$13,notes=$14,updated_at=now() WHERE id=$1 RETURNING *`,[id,next.eligibilityStatus,next.consentStatus,Array.isArray(next.barrierCodes)?next.barrierCodes:[],clean(next.outreachStatus).toUpperCase()||'NOT_STARTED',next.nextOutreachAt||null,next.transportationRequired===true,clean(next.transportationMode).toUpperCase()||null,next.transportationStatus,clean(next.bookingReference)||null,risk,next.arrivalStatus,clean(next.outcomeReasonCode).toUpperCase()||null,clean(next.notes)||null]);
    const changed=Object.keys(b||{});
    await query('INSERT INTO keymark_events(appointment_id,event_type,event_status,channel,actor_id,actor_role,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,clean(b.eventType).toUpperCase()||'APPOINTMENT_UPDATED',clean(b.eventStatus).toUpperCase()||next.arrivalStatus,clean(b.channel).toUpperCase()||null,u.id,u.role,JSON.stringify({changed,risk})]);
    await audit('KEYMARK_APPOINTMENT',id,'UPDATED',{changed,risk,role:u.role});
    return json(200,{appointment:mapAppointment(r.rows[0])});
   }
   if(p[1]==='analytics'&&method==='GET'){
    const scope=scopedWhere('a');
    const r=await query(`SELECT count(*)::int AS monitored,count(*) FILTER (WHERE outreach_status IN ('CONFIRMED','COMPLETED'))::int AS contacted,count(*) FILTER (WHERE array_length(barrier_codes,1)>0)::int AS barriers_found,count(*) FILTER (WHERE transportation_status IN ('ARRANGED','SCHEDULED','DISPATCHED','ARRIVING','PICKED_UP','DELIVERED'))::int AS rides_arranged,count(*) FILTER (WHERE arrival_status='ARRIVED')::int AS arrived,count(*) FILTER (WHERE arrival_status='NO_SHOW')::int AS no_shows,round(avg(arrival_risk_score),1) AS average_risk FROM keymark_appointments a${scope.sql}`,scope.params);
    const reasons=await query(`SELECT COALESCE(outcome_reason_code,'UNSPECIFIED') AS reason,count(*)::int AS count FROM keymark_appointments a${scope.sql}${scope.sql?' AND':' WHERE'} arrival_status IN ('NO_SHOW','CANCELLED','LATE','TRANSPORT_FAILED') GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,scope.params);
    return json(200,{summary:r.rows[0]||{},failureReasons:reasons.rows});
   }
   if(p[1]==='connections'&&!p[2]&&method==='GET'){
    const scope=facilityScope?' WHERE facility_id=$1 OR facility_id IS NULL':'';
    const r=await query(`SELECT id,name,vendor,protocol,base_url,auth_type,status,configuration,last_success_at,last_error_at,last_error FROM keymark_connections${scope} ORDER BY name`,facilityScope?[facilityScope]:[]);
    return json(200,{connections:r.rows});
   }
   if(p[1]==='integration-health'&&method==='GET'){
    const counts=await query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='ACTIVE')::int AS active,count(*) FILTER(WHERE status='ERROR')::int AS errors FROM keymark_connections${facilityScope?' WHERE facility_id=$1 OR facility_id IS NULL':''}`,facilityScope?[facilityScope]:[]);
    const messages=await query(`SELECT count(*) FILTER(WHERE status='REJECTED' AND received_at>now()-interval '24 hours')::int AS rejected_24h,count(*) FILTER(WHERE status='PROCESSED' AND received_at>now()-interval '24 hours')::int AS processed_24h FROM keymark_integration_messages`);
    const queued=await query(`SELECT count(*) FILTER(WHERE status IN ('QUEUED','RETRY'))::int AS outreach,count(*) FILTER(WHERE status='BLOCKED_CONSENT')::int AS blocked_consent FROM keymark_communications`);
    const payer=await query(`SELECT count(*) FILTER(WHERE status='QUEUED')::int AS queued FROM keymark_payer_requests`);
    return json(200,{gateway:{configured:Boolean(process.env.KEYMARK_INTEGRATION_API_KEY)},ehr:{...(counts.rows[0]||{}),processed24h:messages.rows[0]?.processed_24h||0,rejected24h:messages.rows[0]?.rejected_24h||0},outreach:{twilioConfigured:Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_PHONE_NUMBER),queued:queued.rows[0]?.outreach||0,blockedConsent:queued.rows[0]?.blocked_consent||0},payer:{connectorConfigured:Boolean(process.env.KEYMARK_PAYER_ENDPOINT&&process.env.KEYMARK_PAYER_TOKEN),queued:payer.rows[0]?.queued||0},checkedAt:new Date().toISOString()});
   }
   if(p[1]==='connections'&&p[2]&&p[3]==='test'&&method==='POST'){
    if(u.role!=='ADMIN')return json(403,{error:'Only Admin can test KeyMark connections'});
    const found=await query('SELECT * FROM keymark_connections WHERE id=$1 AND organization_id=$2',[p[2],u.organization_id]);if(!found.rows[0])return json(404,{error:'KeyMark connection not found'});const connection=found.rows[0];if(connection.protocol!=='FHIR')return json(400,{error:'Automated connection testing currently supports FHIR connections'});
    try{const result=await testKeymarkFhirConnection(connection);await query(`UPDATE keymark_connections SET status='ACTIVE',last_success_at=now(),last_error=null,updated_at=now() WHERE id=$1`,[connection.id]);await audit('KEYMARK_CONNECTION',String(connection.id),'TEST_SUCCEEDED',result);return json(200,{ok:true,status:'ACTIVE',capability:result})}catch(error){await query(`UPDATE keymark_connections SET status='ERROR',last_error_at=now(),last_error=$2,updated_at=now() WHERE id=$1`,[connection.id,String(error.message).slice(0,500)]);await audit('KEYMARK_CONNECTION',String(connection.id),'TEST_FAILED',{error:error.message});return json(502,{ok:false,status:'ERROR',error:error.message})}
   }
   if(p[1]==='connections'&&!p[2]&&method==='POST'){
    if(u.role!=='ADMIN')return json(403,{error:'Only Admin can configure KeyMark connections'});
    const b=parseBody(event);required(b,['name','vendor','protocol']);
    const r=await query(`INSERT INTO keymark_connections(organization_id,facility_id,name,vendor,protocol,base_url,auth_type,status,configuration) VALUES($1,$2,$3,$4,$5,$6,$7,'CONFIGURATION_REQUIRED',$8) ON CONFLICT(organization_id,name) DO UPDATE SET vendor=EXCLUDED.vendor,protocol=EXCLUDED.protocol,base_url=EXCLUDED.base_url,auth_type=EXCLUDED.auth_type,configuration=EXCLUDED.configuration,updated_at=now() RETURNING id,name,vendor,protocol,base_url,auth_type,status,configuration`,[u.organization_id,clean(b.facilityId)||null,clean(b.name),clean(b.vendor).toUpperCase(),clean(b.protocol).toUpperCase(),clean(b.baseUrl)||null,clean(b.authType).toUpperCase()||'OAUTH2',JSON.stringify(b.configuration||{})]);
    await audit('KEYMARK_CONNECTION',String(r.rows[0].id),'CONFIGURED',{vendor:r.rows[0].vendor,protocol:r.rows[0].protocol});return json(201,{connection:r.rows[0]});
   }
   if(p[1]==='appointments'&&p[2]&&p[3]==='communications'&&method==='POST'){
    if(['EXECUTIVE','QA'].includes(u.role))return json(403,{error:'This role has read-only KeyMark access'});
    const b=parseBody(event);required(b,['channel','templateKey']);const found=await query(`SELECT id,patient_phone,patient_email,consent_status FROM keymark_appointments WHERE id=$1${facilityScope?' AND facility_id=$2':''}`,[p[2],...(facilityScope?[facilityScope]:[])]);const appointment=found.rows[0];if(!appointment)return json(404,{error:'KeyMark appointment not found'});if(appointment.consent_status!=='GRANTED')return json(409,{error:'Patient consent must be granted before SMS or voice outreach'});const channel=clean(b.channel).toUpperCase();if(!['SMS','VOICE'].includes(channel))return json(400,{error:'channel must be SMS or VOICE'});const destination=clean(b.destination||appointment.patient_phone);if(!destination)return json(400,{error:'A patient phone number is required'});const r=await query(`INSERT INTO keymark_communications(appointment_id,channel,template_key,destination,consent_verified,status,scheduled_at,created_by) VALUES($1,$2,$3,$4,true,'QUEUED',COALESCE($5::timestamptz,now()),$6) RETURNING *`,[p[2],channel,clean(b.templateKey),destination,b.scheduledAt||null,u.id]);await audit('KEYMARK_COMMUNICATION',String(r.rows[0].id),'QUEUED',{appointmentId:p[2],channel,templateKey:b.templateKey});return json(202,{communication:r.rows[0]});
   }
   if(p[1]==='appointments'&&p[2]&&p[3]==='payer-requests'&&method==='POST'){
    if(['EXECUTIVE','QA'].includes(u.role))return json(403,{error:'This role has read-only KeyMark access'});const b=parseBody(event);required(b,['payerName']);const found=await query(`SELECT id FROM keymark_appointments WHERE id=$1${facilityScope?' AND facility_id=$2':''}`,[p[2],...(facilityScope?[facilityScope]:[])]);if(!found.rows[0])return json(404,{error:'KeyMark appointment not found'});const r=await query(`INSERT INTO keymark_payer_requests(appointment_id,payer_name,request_type,status,created_by) VALUES($1,$2,$3,'QUEUED',$4) RETURNING *`,[p[2],clean(b.payerName),clean(b.requestType).toUpperCase()||'ELIGIBILITY',u.id]);await audit('KEYMARK_PAYER_REQUEST',String(r.rows[0].id),'QUEUED',{appointmentId:p[2],payerName:b.payerName});return json(202,{payerRequest:r.rows[0]});
   }
   return json(404,{error:'Unknown KeyMark endpoint'});
  }
  if(p[0]==='dispatch'&&p[1]==='calls'&&!p[2]&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const limit=Math.min(100,Math.max(1,Number(event.queryStringParameters?.limit)||40));
   const result=await query(`SELECT id,caller_phone,called_number,call_status,callback_twilio_sid,callback_requested_at,created_at,updated_at
    FROM dispatch_voice_calls ORDER BY created_at DESC LIMIT $1`,[limit]);
   return json(200,{businessNumber:formatPhoneDisplay(getVoiceConfig().callerId),calls:result.rows.map(row=>({id:row.id,callerPhone:formatPhoneDisplay(row.caller_phone),calledNumber:formatPhoneDisplay(row.called_number),status:row.call_status,callbackRequestedAt:row.callback_requested_at,createdAt:row.created_at,updatedAt:row.updated_at}))});
  }
  if(p[0]==='dispatch'&&p[1]==='calls'&&p[2]&&p[3]==='callback'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const config=getVoiceConfig();
   const dispatcherPhone=toE164(config.primaryDispatch);
   if(!dispatcherPhone)return json(409,{error:'Configure DISPATCH_PRIMARY_NUMBER before placing callbacks'});
   const found=await query('SELECT id,caller_phone FROM dispatch_voice_calls WHERE id=$1 LIMIT 1',[p[2]]);
   if(!found.rows[0])return json(404,{error:'Call record not found'});
   const customerPhone=toE164(found.rows[0].caller_phone);
   if(!customerPhone)return json(409,{error:'This call does not have a callback number'});
   const token=crypto.randomBytes(32).toString('base64url');
   const tokenHash=callbackTokenHash(token);
   await query(`UPDATE dispatch_voice_calls SET callback_token_hash=$2,callback_requested_by=$3,callback_requested_at=now(),call_status='CALLBACK_REQUESTED',updated_at=now() WHERE id=$1`,[p[2],tokenHash,u.id]);
   try{
    const voiceUrl=voiceRouteUrl('callback-connect',new URLSearchParams({token}).toString());
    const statusUrl=voiceRouteUrl('callback-status',new URLSearchParams({token}).toString());
    const call=await createTwilioVoiceCall({to:dispatcherPhone,from:toE164(config.callerId),url:voiceUrl,statusCallback:statusUrl});
    await query(`UPDATE dispatch_voice_calls SET callback_twilio_sid=$2,call_status='CALLBACK_RINGING',updated_at=now() WHERE id=$1`,[p[2],call.sid||null]);
    await audit('DISPATCH_CALL',String(p[2]),'CALLBACK_REQUESTED',{actorId:u.id,twilioCallSid:call.sid||null});
    return json(202,{ok:true,status:'CALLBACK_RINGING',message:'Twilio is ringing the dispatch line. Answer to connect the caller.'});
   }catch(error){
    await query(`UPDATE dispatch_voice_calls SET callback_token_hash=null,call_status='CALLBACK_FAILED',updated_at=now() WHERE id=$1`,[p[2]]).catch(()=>{});
    throw error;
   }
  }
  if(p[0]==='voice'&&p[1]==='callback-connect'&&method==='POST'){
   const token=clean(event.queryStringParameters?.token);
   if(!token)return xmlResponse(403,'<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>');
   const found=await query(`SELECT id,caller_phone FROM dispatch_voice_calls WHERE callback_token_hash=$1 AND callback_requested_at>now()-interval '15 minutes' LIMIT 1`,[callbackTokenHash(token)]);
   if(!found.rows[0])return xmlResponse(403,'<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>');
   const config=getVoiceConfig();
   await query(`UPDATE dispatch_voice_calls SET callback_token_hash=null,callback_connected_at=now(),call_status='CALLBACK_CONNECTING',updated_at=now() WHERE id=$1`,[found.rows[0].id]);
   return xmlResponse(200,callbackConnectTwiml(toE164(found.rows[0].caller_phone),toE164(config.callerId),config));
  }
  if(p[0]==='voice'&&p[1]==='callback-status'&&method==='POST'){
   const token=clean(event.queryStringParameters?.token);
   const params=parseWebhookBody(event);
   const status=clean(params.CallStatus||params.callStatus).toUpperCase();
   if(token&&status)await query(`UPDATE dispatch_voice_calls SET call_status=$2,updated_at=now() WHERE callback_token_hash=$1 OR callback_twilio_sid=$3`,[callbackTokenHash(token),`CALLBACK_${status}`,clean(params.CallSid||params.callSid)]).catch(()=>{});
   return xmlResponse(200,'<?xml version="1.0" encoding="UTF-8"?><Response />');
  }
  if(p[0]==='voice'&&p[1]==='incoming-call'&&(method==='POST'||method==='GET')){
   const config=getVoiceConfig();
    const params=parseWebhookBody(event);
    const callerFrom=clean(params.From||params.from||event.queryStringParameters?.From||event.queryStringParameters?.from||'');
   const calledNumber=clean(params.To||params.to||event.queryStringParameters?.To||event.queryStringParameters?.to||config.callerId);
   const callSid=clean(params.CallSid||params.callSid||'');
   if(callerFrom)await query(`INSERT INTO dispatch_voice_calls(twilio_call_sid,direction,caller_phone,called_number,call_status)
    VALUES(NULLIF($1,''),'INBOUND',$2,$3,'RECEIVED') ON CONFLICT(twilio_call_sid) DO UPDATE SET call_status='RECEIVED',updated_at=now()`,[callSid,toE164(callerFrom),toE164(calledNumber)]).catch(error=>console.error('Unable to record inbound voice call',error.message));
   const openNow=isBusinessHoursOpen(config);
   if(!openNow&&config.afterHoursVoicemail){
    const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('Thank you for calling Nexus Medical Transit. Our dispatch team is currently unavailable. Please leave a voicemail after the tone and we will return your call.',config)}\n  <Pause length="1" />\n  <Dial callerId="${xmlEscape(config.callerId)}">${xmlEscape(config.afterHoursVoicemail)}</Dial>\n</Response>`;
    return xmlResponse(200,body);
   }
  const opening=voiceOpeningScript(config);
   const nonPhiNotice=config.nonPhiMode?' For privacy, I can only collect general callback information until a Nexus representative joins the call.':'';
   if(!config.streamUrl){
    return xmlResponse(200,voiceMenuTwiml(config,0,{intro:opening}));
   }
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag(opening,config)}\n  <Pause length="1" />\n  ${nonPhiNotice?`${sayTag(nonPhiNotice,config)}\n  <Pause length="1" />\n  `:''}<Connect>\n    <Stream url="${xmlEscape(config.streamUrl)}" />\n  </Connect>\n  <Redirect method="POST">${xmlEscape(voiceRouteUrl('menu'))}</Redirect>\n</Response>`;
   return xmlResponse(200,body);
  }
  if(p[0]==='voice'&&p[1]==='assistant-instructions'&&method==='GET'){
  const knowledge=buildVoiceKnowledgePack();
  return json(200,{
   persona:'Nexus Virtual Receptionist',
   version:'2026-08-06',
   instructions:buildVoiceAssistantInstructions(),
   knowledge,
   callRouting:{
    bookRide:'Handle basic intake or route to dispatch for confirmation',
    facilityScheduling:'Route hospital/facility callers to dispatch/facility scheduling support',
    tripStatus:'Route active trip issues to dispatch immediately',
    billing:'Route billing questions to billing support',
    dispatch:'Transfer to dispatch immediately',
    hr:'Route careers/employment questions to HR support',
    emergencyScreening:'Direct life-threatening emergencies to 911 immediately'
   }
  });
  }
  if(p[0]==='voice'&&p[1]==='menu'&&(method==='POST'||method==='GET')){
   const config=getVoiceConfig();
   return xmlResponse(200,voiceMenuTwiml(config,0));
  }
  if(p[0]==='voice'&&p[1]==='menu-handle'&&(method==='POST'||method==='GET')){
   const config=getVoiceConfig();
   const params=parseWebhookBody(event);
   const retry=Math.max(0,Number(event.queryStringParameters?.retry||0)||0);
   const digits=clean(params.Digits||params.digits||'');
   const speech=clean(params.SpeechResult||params.speechResult||'');
   const callerFrom=clean(params.From||params.from||event.queryStringParameters?.From||event.queryStringParameters?.from||'');
   const intentText=`${digits} ${speech}`.trim();
   if(digits==='1'||wantsHumanTransfer(intentText)){
    const targets=getDispatchDialTargets(config,callerFrom);
    if(targets.primary){
     return xmlResponse(200,dispatchDialTwiml({
      message:'Please hold while I connect you with Nexus dispatch.',
      targetNumber:targets.primary,
      callerId:config.callerId,
      attempt:'primary',
      region:targets.region
     }));
    }
    if(config.afterHoursVoicemail){
       const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('Dispatch is temporarily unavailable. Please leave a voicemail and we will return your call.',config)}\n  <Pause length="1" />\n  <Dial callerId="${xmlEscape(config.callerId)}">${xmlEscape(config.afterHoursVoicemail)}</Dial>\n</Response>`;
     return xmlResponse(200,body);
    }
      return xmlResponse(200,`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag(`Dispatch is temporarily unavailable. Please call us at ${config.supportPhone}.`,config)}\n</Response>`);
   }
  if(/(trip\s*status|check\s*my\s*trip|where\s*is\s*my\s*ride|where\s*is\s*the\s*driver|eta)/i.test(intentText)){
   const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('I can help with trip status.',config)}\n  <Pause length="1" />\n  ${sayTag('For active trip issues or if a driver cannot be located, I will connect you with dispatch now.',config)}\n  <Pause length="1" />\n  <Redirect method="POST">${xmlEscape(voiceRouteUrl('transfer-dispatch'))}</Redirect>\n</Response>`;
   return xmlResponse(200,body);
  }
  if(/(hospital|discharge|facility|nursing\s*home|social\s*worker|case\s*manager|facility\s*partner|partnership)/i.test(intentText)){
   const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('Thank you. I can route facility and hospital scheduling requests to the appropriate Nexus team.',config)}\n  <Pause length="1" />\n  ${sayTag('Please hold while I connect you with dispatch for time-sensitive coordination.',config)}\n  <Pause length="1" />\n  <Redirect method="POST">${xmlEscape(voiceRouteUrl('transfer-dispatch'))}</Redirect>\n</Response>`;
   return xmlResponse(200,body);
  }
  if(/(billing|invoice|payment|balance|statement|claim)/i.test(intentText)){
   const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('I can help with billing questions.',config)}\n  <Pause length="1" />\n  ${sayTag('For account-specific billing support, I can connect you with a Nexus representative now.',config)}\n  <Pause length="1" />\n  <Redirect method="POST">${xmlEscape(voiceRouteUrl('transfer-dispatch'))}</Redirect>\n</Response>`;
   return xmlResponse(200,body);
  }
  if(digits==='2'||/(book|booking|ride|transport|request|schedule|dialysis|wheelchair|stretcher|bariatric|ambulatory)/i.test(intentText)){
      const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('I can submit a general callback request, or you can book online at nexusmt dot com slash booking.',config)}\n  <Pause length="1" />\n  ${sayTag('Please note that this is not a confirmed reservation until a Nexus representative confirms availability, pickup details, and pricing.',config)}\n  <Pause length="1" />\n  ${sayTag('If you would like to speak to dispatch now, say dispatch or press 1.',config)}\n  <Redirect method="POST">${xmlEscape(voiceRouteUrl('menu'))}</Redirect>\n</Response>`;
    return xmlResponse(200,body);
   }
   if(digits==='3'||/(hours|service|area|location|coverage)/i.test(intentText)){
      const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('Nexus Medical Transit provides ambulatory, wheelchair, stretcher, and bariatric transportation services.',config)}\n  <Pause length="1" />\n  ${sayTag('For current service areas and business hours, please visit nexusmt dot com. You can also say dispatch, representative, or human to speak with our team.',config)}\n  <Redirect method="POST">${xmlEscape(voiceRouteUrl('menu'))}</Redirect>\n</Response>`;
    return xmlResponse(200,body);
   }
   if(retry>=1){
    const targets=getDispatchDialTargets(config,callerFrom);
    if(targets.primary){
     return xmlResponse(200,dispatchDialTwiml({
      message:'I will connect you with Nexus dispatch for further assistance.',
      targetNumber:targets.primary,
      callerId:config.callerId,
      attempt:'primary',
      region:targets.region
     }));
    }
    if(config.afterHoursVoicemail){
      const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('I was unable to understand the request. Please leave a voicemail and we will return your call.',config)}\n  <Pause length="1" />\n  <Dial callerId="${xmlEscape(config.callerId)}">${xmlEscape(config.afterHoursVoicemail)}</Dial>\n</Response>`;
      return xmlResponse(200,body);
    }
    return xmlResponse(200,`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag('I was unable to understand the request. Please call back and say dispatch for a live representative.',config)}\n</Response>`);
   }
   return xmlResponse(200,voiceMenuTwiml(config,retry+1));
  }
  if(p[0]==='voice'&&p[1]==='transfer-dispatch'&&(method==='POST'||method==='GET')){
   const config=getVoiceConfig();
    const params=parseWebhookBody(event);
    const callerFrom=clean(params.From||params.from||event.queryStringParameters?.From||event.queryStringParameters?.from||'');
    const preferredRegion=clean(event.queryStringParameters?.region||params.region||'').toUpperCase();
    const targets=getDispatchDialTargets(config,callerFrom,preferredRegion);
    if(!targets.primary)return xmlResponse(200,'<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>Dispatch transfer is temporarily unavailable. Please call back shortly.</Say>\n</Response>');
    const regionalLabel=targets.region==='DC'?'the Washington D C regional dispatch center':targets.region==='MD'?'the Maryland regional dispatch center':'Nexus dispatch';
   const body=dispatchDialTwiml({
     message:`Please hold while I connect you with ${regionalLabel}.`,
     targetNumber:targets.primary,
    callerId:config.callerId,
     attempt:'primary',
     region:targets.region
   });
   return xmlResponse(200,body);
  }
  if(p[0]==='voice'&&p[1]==='dispatch-fallback'&&(method==='POST'||method==='GET')){
   const config=getVoiceConfig();
   const params=parseWebhookBody(event);
   const attempt=clean(event.queryStringParameters?.attempt||params.attempt||'primary').toLowerCase();
    const regionHint=clean(event.queryStringParameters?.region||params.region||'').toUpperCase();
   const dialStatus=clean(params.DialCallStatus||params.dialCallStatus||'').toLowerCase();
    const callerFrom=clean(params.From||params.from||event.queryStringParameters?.From||event.queryStringParameters?.from||'');
    const targets=getDispatchDialTargets(config,callerFrom,regionHint);
   if(dialStatus==='completed'){
    return xmlResponse(200,'<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Hangup />\n</Response>');
   }
    if(attempt!=='secondary'&&targets.secondary){
    const body=dispatchDialTwiml({
     message:'The primary dispatch line is unavailable. Please hold while I try our secondary dispatch line.',
      targetNumber:targets.secondary,
     callerId:config.callerId,
      attempt:'secondary',
      region:targets.region
    });
    return xmlResponse(200,body);
   }
   if(config.afterHoursVoicemail){
    const body=`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>We were unable to reach dispatch. Please leave a voicemail and we will return your call.</Say>\n  <Dial callerId="${xmlEscape(config.callerId)}">${xmlEscape(config.afterHoursVoicemail)}</Dial>\n</Response>`;
    return xmlResponse(200,body);
   }
  return xmlResponse(200,`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${sayTag(`We were unable to connect to dispatch. Please call us back at ${config.supportPhone}.`,config)}\n</Response>`);
  }
  if(p[0]==='voice'&&p[1]==='primary-webhook-failure'&&(method==='POST'||method==='GET')){
   const config=getVoiceConfig();
    const params=parseWebhookBody(event);
    const callerFrom=clean(params.From||params.from||event.queryStringParameters?.From||event.queryStringParameters?.from||'');
    const targets=getDispatchDialTargets(config,callerFrom);
    if(targets.primary){
    const body=dispatchDialTwiml({
     message:'Our automated system is unavailable. Please hold while I connect you with Nexus dispatch.',
      targetNumber:targets.primary,
     callerId:config.callerId,
      attempt:'primary',
      region:targets.region
    });
    return xmlResponse(200,body);
   }
   return xmlResponse(200,'<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>Our phone system is temporarily unavailable. Please call back shortly.</Say>\n</Response>');
  }
  if(p[0]==='voice'&&p[1]==='ride-request'&&method==='POST'){
   const config=getVoiceConfig();
   if(config.nonPhiMode&&!config.allowPhiIntake){
    return json(403,{
     error:'Voice patient intake is disabled in non-PHI mode',
     code:'PHI_INTAKE_DISABLED',
     message:'General assistance is available, but patient intake requires compliance approvals.'
    });
   }
   const b=parseBody(event);
   required(b,['caller_name','callback_number','passenger_name','pickup_address','destination','requested_date','requested_time','trip_type','service_type']);
   const tripType=clean(b.trip_type).toLowerCase();
   const serviceType=clean(b.service_type).toLowerCase();
   const serviceMap={ambulatory:'ambulatory',wheelchair:'wheelchair',stretcher:'stretcher',bariatric:'bariatric'};
   const normalizedService=serviceMap[serviceType]||'ambulatory';
   const requestedTimeRaw=clean(b.requested_time);
   const requestedTimeNormalized=normalizeOptionalTripTime(requestedTimeRaw)||'08:00';
   const callbackNumber=toE164(b.callback_number);
   const requestReference=reference();
   const intakeNotes=upsertAppointmentNote(
    `Voice intake pending dispatch review. Caller type: ${clean(b.caller_type||b.billing_type||'unspecified')}. Trip type: ${tripType||'one_way'}. Special assistance: ${clean(b.special_assistance||b.notes||'none')}. Caller: ${clean(b.caller_name)} (${callbackNumber}).`,
    requestedTimeRaw
   );
   const inserted=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,booking_source,submitter_entity,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'REQUESTED',$10,$11,$12,now(),now()) RETURNING *`,[
    requestReference,
    clean(b.passenger_name),
    callbackNumber,
    clean(b.callback_email||'')||null,
    normalizedService,
    clean(b.pickup_address),
    clean(b.destination),
    normalizeTripDate(b.requested_date),
    requestedTimeNormalized,
    intakeNotes,
    'VOICE_PENDING',
    clean(b.caller_name)||null
   ]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[requestReference,'REQUESTED','requested','Voice request submitted for dispatch review','NEXUS_VIRTUAL_RECEPTIONIST']);
   const dispatchPhone=clean(process.env.DISPATCH_PHONE||process.env.NEXUS_DISPATCH_PHONE||'');
   const dispatchEmail=clean(process.env.COMPANY_EMAIL||'dispatch@nexusmt.com');
   const smsMessage=`Nexus Voice Request ${requestReference}: ${clean(b.passenger_name)} ${normalizedService} ${clean(b.pickup_address)} to ${clean(b.destination)} on ${normalizeTripDate(b.requested_date)} ${requestedTimeRaw}. Callback: ${callbackNumber}.`;
   const emailHtml=`<h2>Voice ride request pending review</h2><p><strong>Reference:</strong> ${xmlEscape(requestReference)}</p><p><strong>Caller:</strong> ${xmlEscape(clean(b.caller_name))} (${xmlEscape(callbackNumber)})</p><p><strong>Passenger:</strong> ${xmlEscape(clean(b.passenger_name))}</p><p><strong>Route:</strong> ${xmlEscape(clean(b.pickup_address))} → ${xmlEscape(clean(b.destination))}</p><p><strong>Date/Time:</strong> ${xmlEscape(normalizeTripDate(b.requested_date))} at ${xmlEscape(requestedTimeRaw)}</p><p><strong>Trip type:</strong> ${xmlEscape(tripType||'one_way')}</p><p><strong>Service type:</strong> ${xmlEscape(normalizedService)}</p><p><strong>Special assistance:</strong> ${xmlEscape(clean(b.special_assistance||b.notes||'none'))}</p><p><strong>Status:</strong> pending_review</p>`;
   await Promise.allSettled([
    dispatchPhone?sendSms(dispatchPhone,smsMessage):Promise.resolve({status:'skipped'}),
    sendEmail(dispatchEmail,`Voice request pending review — ${requestReference}`,emailHtml),
    sendBookingTeamsAlert({
     reference:requestReference,
     name:clean(b.passenger_name),
     pickup:clean(b.pickup_address),
     destination:clean(b.destination),
     date:normalizeTripDate(b.requested_date),
     time:requestedTimeRaw,
     status:'REQUESTED',
     bookingSource:'VOICE_PENDING'
    },'☎️ New Voice Booking Request — Admin_NMT','New Voice Booking Request')
   ]).catch(()=>{});
   return json(201,{
    request:{
     status:'pending_review',
     reference:requestReference,
     caller_name:clean(b.caller_name),
     callback_number:callbackNumber,
     passenger_name:clean(b.passenger_name),
     pickup_address:clean(b.pickup_address),
     destination:clean(b.destination),
     requested_date:normalizeTripDate(b.requested_date),
     requested_time:requestedTimeRaw,
     trip_type:tripType,
     service_type:normalizedService,
     notes:clean(b.special_assistance||b.notes||'')
    },
    message:'I have submitted your transportation request for review. This is not yet a confirmed reservation. A Nexus representative will contact you to confirm availability, pickup details, and pricing.'
   });
  }
  if(p[0]==='health'){
   const r=await query('SELECT now() AS now, current_database() AS database');
    return json(200,{status:'ok',database:'connected',environment:process.env.CONTEXT||process.env.APP_ENV||'unknown',checkedAt:r.rows[0].now,build:'042',apiRevision:'admin-resend-credentials-2026-08-09-v1'});
  }
  if(p[0]==='debug'&&p[1]==='admin'&&method==='GET'){
   const r=await query(`SELECT id, email, display_name, role, active, password_hash, organization_id, created_at FROM users WHERE lower(email)=lower('admin@nexusmt.com') LIMIT 1`);
   if(!r.rows[0]) return json(404,{error:'Admin user not found'});
   const user=r.rows[0];
   const testPass='NexusAdmin042!';
   const testHash=crypto.createHash('sha256').update(testPass).digest('hex');
   return json(200,{
     user:{
       id:String(user.id),
       email:user.email,
       displayName:user.display_name,
       role:user.role,
       active:user.active,
       organizationId:String(user.organization_id||'null'),
       createdAt:user.created_at
     },
     passwordDebug:{
       storedHash:user.password_hash?user.password_hash.substring(0,16)+'...':'NULL',
       storedHashLength:user.password_hash?user.password_hash.length:'NULL',
       testPassword:testPass,
       testHash:testHash.substring(0,16)+'...',
       testHashLength:testHash.length,
       hashesMatch:user.password_hash===testHash
     }
   });
  }
  if(p.join('/')==='integrations/config'&&method==='GET')return json(200,{build:'042',googleMapsEnabled:envEnabled('GOOGLE_MAPS_BROWSER_KEY'),googleMapsBrowserKey:process.env.GOOGLE_MAPS_BROWSER_KEY||'',stripeEnabled:envEnabled('STRIPE_SECRET_KEY') || envEnabled('STRIPE_PUBLISHABLE_KEY'),stripePublishableKey:process.env.STRIPE_PUBLISHABLE_KEY||'',squareEnabled:envEnabled('SQUARE_ACCESS_TOKEN')&&envEnabled('SQUARE_LOCATION_ID')});
  if(p.join('/')==='integrations/health'&&method==='GET')return json(200,{googleMaps:envEnabled('GOOGLE_MAPS_BROWSER_KEY')?'configured':'not-configured',twilio:envEnabled('TWILIO_ACCOUNT_SID')&&envEnabled('TWILIO_AUTH_TOKEN')&&envEnabled('TWILIO_PHONE_NUMBER')?'configured':'not-configured',sendGrid:envEnabled('SENDGRID_API_KEY')&&envEnabled('SENDGRID_FROM_EMAIL')?'configured':'not-configured',stripe:envEnabled('STRIPE_SECRET_KEY')||envEnabled('STRIPE_PUBLISHABLE_KEY')?'configured':'not-configured',square:envEnabled('SQUARE_ACCESS_TOKEN')&&envEnabled('SQUARE_LOCATION_ID')?'configured':'not-configured',gps:'enabled',checkedAt:new Date().toISOString()});
  if(p[0]==='admin'&&p[1]==='social'&&p[2]==='preview'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
   const channels=parseChannels(event.queryStringParameters?.channels||process.env.SOCIAL_AUTOMATION_CHANNELS||'');
   const forcedPostId=clean(event.queryStringParameters?.postId||event.queryStringParameters?.forcedPostId||'');
   const preview=await previewSocialSelection({channels,forcedPostId});
   return json(200,{preview});
  }
  if(p[0]==='admin'&&p[1]==='social'&&p[2]==='publish'&&method==='POST'){
   await requireUser(bearer(event),['ADMIN']);
   const body=parseBody(event);
   const channels=parseChannels(body.channels||event.queryStringParameters?.channels||process.env.SOCIAL_AUTOMATION_CHANNELS||'');
   const dryRun=isDryRunValue(body.dryRun, isDryRunValue(process.env.SOCIAL_AUTOMATION_DRY_RUN,true));
   const forcedPostId=clean(body.postId||body.forcedPostId||'');
   const report=await runSocialPublish({channels,dryRun,forcedPostId});
   return json(200,{report});
  }
  if(p[0]==='admin'&&p[1]==='social'&&p[2]==='history'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
   const limit=Math.min(200,Math.max(1,Number(event.queryStringParameters?.limit||50)||50));
   const rows=await query(
    `SELECT run_date, channel, post_id, status, dry_run, payload, response, error_message, created_at
     FROM social_publish_history
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
   ).catch(()=>({rows:[]}));
   return json(200,{history:rows.rows||[]});
  }
  if(p[0]==='settings'&&p[1]==='public'&&method==='GET'){
   const settings=await readPlatformSettings();
   return json(200,{pricing:settings.pricing,fareRules:settings.fareRules,activeServices:settings.activeServices,organization:settings.organization});
  }
  if(p[0]==='admin'&&p[1]==='document-grants'&&method==='POST'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const body=parseBody(event);required(body,['email','documentKey','hours']);
   const document=await findSecureDocument(body.documentKey);
   if(!document)return json(400,{error:'Unknown document'});
   const hours=Math.min(720,Math.max(1,Number(body.hours)||0));
   const target=await query("SELECT id,email,scope_id FROM users WHERE lower(email)=lower($1) AND role='FACILITY' AND active=true LIMIT 1",[clean(body.email)]);
   if(!target.rows[0])return json(404,{error:'Active facility manager account not found'});
   const result=await query(`INSERT INTO secure_document_grants(user_id,facility_scope_id,document_key,granted_by,expires_at)
     VALUES($1,$2,$3,$4,now()+($5::text||' hours')::interval)
     RETURNING id,document_key,expires_at`,[target.rows[0].id,target.rows[0].scope_id||null,document.key,me.id,String(hours)]);
   const grant=result.rows[0];
   await audit('SECURE_DOCUMENT',String(grant.id),'ACCESS_GRANTED',{targetEmail:target.rows[0].email,documentKey:grant.document_key,expiresAt:grant.expires_at,by:me.email});
   return json(201,{grant:{id:grant.id,documentKey:grant.document_key,expiresAt:grant.expires_at}});
  }
  if(p[0]==='admin'&&p[1]==='document-grants'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
   const result=await query(`SELECT g.id,g.document_key,g.expires_at,g.revoked_at,g.created_at,u.email,u.display_name,u.scope_id
     FROM secure_document_grants g JOIN users u ON u.id=g.user_id ORDER BY g.created_at DESC LIMIT 250`);
   const titles=new Map((await listAllSecureDocuments()).map(document=>[document.key,document.title]));
   return json(200,{grants:result.rows.map(row=>({id:row.id,documentKey:row.document_key,documentTitle:titles.get(row.document_key)||row.document_key,email:row.email,name:row.display_name,facilityScopeId:row.scope_id,expiresAt:row.expires_at,revokedAt:row.revoked_at,createdAt:row.created_at,active:!row.revoked_at&&new Date(row.expires_at)>new Date()}))});
  }
  if(p[0]==='admin'&&p[1]==='document-grants'&&p[2]&&method==='PATCH'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const result=await query('UPDATE secure_document_grants SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 RETURNING id,document_key,revoked_at',[decodeURIComponent(p[2])]);
   if(!result.rows[0])return json(404,{error:'Document grant not found'});
   await audit('SECURE_DOCUMENT',String(result.rows[0].id),'ACCESS_REVOKED',{documentKey:result.rows[0].document_key,by:me.email});
   return json(200,{revoked:true,grant:result.rows[0]});
  }
  if(p[0]==='admin'&&p[1]==='secure-documents'&&method==='POST'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const body=parseBody(event);required(body,['title','fileName','mimeType','dataBase64']);
   const mimeType=clean(body.mimeType).toLowerCase();
   if(!['image/png','image/jpeg'].includes(mimeType))return json(400,{error:'Upload a PNG or JPG document display image'});
   let fileData;try{fileData=Buffer.from(clean(body.dataBase64),'base64')}catch{return json(400,{error:'The uploaded document could not be decoded'})}
   if(!fileData.length||fileData.length>4*1024*1024)return json(400,{error:'Document image must be between 1 byte and 4 MB'});
   const validSignature=mimeType==='image/png'?fileData.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):fileData[0]===255&&fileData[1]===216&&fileData[2]===255;
   if(!validSignature)return json(400,{error:'File contents do not match the selected image type'});
   const key=`${secureDocumentSlug(body.title)}-${crypto.randomBytes(3).toString('hex')}`;
   const result=await query(`INSERT INTO secure_documents(document_key,title,description,original_name,mime_type,file_size,file_data,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING document_key,title,description,original_name,mime_type,file_size,created_at`,
     [key,clean(body.title).slice(0,160),clean(body.description).slice(0,500),clean(body.fileName).slice(0,255),mimeType,fileData.length,fileData,me.id]);
   const row=result.rows[0];await audit('SECURE_DOCUMENT',key,'DOCUMENT_UPLOADED',{title:row.title,fileName:row.original_name,fileSize:row.file_size,by:me.email});
   return json(201,{document:{key:row.document_key,title:row.title,description:row.description,originalName:row.original_name,mimeType:row.mime_type,fileSize:row.file_size,createdAt:row.created_at,uploaded:true}});
  }
  if(p[0]==='admin'&&p[1]==='secure-documents'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
   return json(200,{documents:(await listAllSecureDocuments()).map(({links,calculator,...document})=>document)});
  }
  if(p[0]==='secure-documents'&&method==='GET'&&p.length===1){
   const me=await requireUser(bearer(event),['FACILITY','ADMIN']);
   if(me.role==='ADMIN'){
    await audit('SECURE_DOCUMENT','catalog','ADMIN_PREVIEWED',{by:me.email});
    return json(200,{documents:(await listAllSecureDocuments()).map(document=>({...document,expiresAt:null,adminPreview:true}))});
   }
   const result=await query(`SELECT DISTINCT ON (document_key) document_key,expires_at FROM secure_document_grants
     WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY document_key,expires_at DESC`,[me.id]);
   await audit('SECURE_DOCUMENT','catalog','VIEWED',{by:me.email,count:result.rowCount});
   const documents=await Promise.all(result.rows.map(async row=>{const document=await findSecureDocument(row.document_key);return document?{...document,expiresAt:row.expires_at}:null}));
   return json(200,{documents:documents.filter(Boolean)});
  }
  if(p[0]==='secure-documents'&&p[1]&&p[2]==='image'&&method==='GET'){
   const me=await requireUser(bearer(event),['FACILITY','ADMIN']);
   const document=await findSecureDocument(decodeURIComponent(p[1]));
   if(!document)return json(404,{error:'Document not found'});
   const grant=me.role==='ADMIN'?{rows:[{id:'admin-preview'}]}:await query(`SELECT id FROM secure_document_grants WHERE user_id=$1 AND document_key=$2 AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 1`,[me.id,document.key]);
   if(!grant.rows[0])return json(403,{error:'Document access is not active or has expired'});
   const stored=document.uploaded?await query('SELECT file_data,mime_type FROM secure_documents WHERE document_key=$1 AND active=true LIMIT 1',[document.key]):null;
   const image=document.uploaded?stored.rows[0]?.file_data:fs.readFileSync(path.join(__dirname,'_private-documents',document.asset));
   if(!image)return json(404,{error:'Document file not found'});
   const mimeType=document.uploaded?stored.rows[0].mime_type:'image/png';
   await audit('SECURE_DOCUMENT',String(grant.rows[0].id),me.role==='ADMIN'?'ADMIN_PAGE_PREVIEWED':'PAGE_VIEWED',{by:me.email,documentKey:document.key});
   return {statusCode:200,isBase64Encoded:true,headers:{'content-type':mimeType,'cache-control':'private, no-store, max-age=0','content-disposition':'inline','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'self'"},body:image.toString('base64')};
  }
  if(p[0]==='admin'&&p[1]==='settings'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const settings=await readPlatformSettings();
   return json(200,{settings});
  }
  if(p[0]==='admin'&&p[1]==='settings'&&method==='PATCH'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const body=parseBody(event);
   const current=await readPlatformSettings();
   const next=writePlatformSettings({
    pricing:body.pricing||current.pricing,
    fareRules:body.fareRules||current.fareRules,
    organization:body.organization||current.organization,
    activeServices:body.activeServices||current.activeServices
   },me.id);
   const saved=await next;
   await audit('SETTINGS','platform','UPDATED',{by:me.email,sections:Object.keys(body||{})});
   return json(200,{settings:saved});
  }
  if(p.join('/')==='locations/search'&&method==='GET'){
   const q=clean(event.queryStringParameters?.q);if(q.length<2)return json(200,{locations:[]});
   const r=await query(`SELECT facility_code AS id,name,address,'facility' AS type FROM facilities WHERE active=true AND (name ILIKE $1 OR address ILIKE $1) ORDER BY CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,name LIMIT 12`,[`%${q}%`,`${q}%`]);
   return json(200,{locations:r.rows});
  }
  if(p[0]==='patient-feedback'&&method==='POST'&&p.length===1){
   const b=parseBody(event);
   if(clean(b.website))return json(202,{accepted:true});
   const rating=Number(b.rating),category=clean(b.category).toUpperCase(),suggestion=clean(b.suggestion);
   const allowedCategories=new Set(['DRIVER','TIMELINESS','COMMUNICATION','BOOKING','ACCESSIBILITY','LIVECARE','OTHER']);
   if(!Number.isInteger(rating)||rating<1||rating>5)return json(400,{error:'Choose a rating from 1 to 5 stars.'});
   if(!allowedCategories.has(category))return json(400,{error:'Choose what your feedback is about.'});
   if(suggestion.length<10||suggestion.length>2000)return json(400,{error:'Suggestion must be between 10 and 2,000 characters.'});
   const bookingReference=clean(b.bookingReference).toUpperCase().slice(0,40)||null;
   let feedbackUser=null;
   try{if(bearer(event))feedbackUser=await requireUser(bearer(event),['PATIENT'])}catch{}
   const feedbackReference=`FB-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomInt(1000,9999)}`;
   await query(`INSERT INTO patient_feedback(feedback_reference,user_id,booking_reference,rating,category,suggestion,contact_permission) VALUES($1,$2,$3,$4,$5,$6,$7)`,[feedbackReference,feedbackUser?.id||null,bookingReference,rating,category,suggestion,Boolean(b.contactPermission)]);
   return json(201,{accepted:true,reference:feedbackReference});
  }
  if(p[0]==='booking-drafts'&&method==='POST'&&p.length===1){
   const b=parseBody(event);required(b,['draftToken','phone']);
   const digits=normalizeE164(b.phone);
   if(!digits)return json(400,{error:'Enter a valid international phone number with country code, such as +1 240 555 0101'});
   const step=['RIDER','ROUTE','RIDE','REVIEW','PAYMENT'].includes(clean(b.currentStep).toUpperCase())?clean(b.currentStep).toUpperCase():'RIDER';
   await query(`INSERT INTO booking_drafts(draft_token,name,phone,email,current_step,last_activity_at,reminder_due_at,updated_at) VALUES($1,$2,$3,$4,$5,now(),now()+interval '5 minutes',now()) ON CONFLICT(draft_token) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,email=EXCLUDED.email,current_step=EXCLUDED.current_step,last_activity_at=now(),reminder_due_at=CASE WHEN booking_drafts.reminder_sent_at IS NULL THEN now()+interval '5 minutes' ELSE booking_drafts.reminder_due_at END,updated_at=now() WHERE booking_drafts.completed_at IS NULL`,[clean(b.draftToken).slice(0,100),clean(b.name)||null,digits,clean(b.email)||null,step]);
   return json(202,{saved:true,reminderInMinutes:5});
  }
  if(p[0]==='booking-drafts'&&p[1]&&p[2]==='complete'&&method==='POST'){
   await query('UPDATE booking_drafts SET completed_at=now(),updated_at=now() WHERE draft_token=$1',[decodeURIComponent(p[1])]);
   return json(200,{completed:true});
  }
  if(p[0]==='bookings'&&method==='POST'&&p.length===1){
   const b=parseBody(event);required(b,['name','phone','service','pickup','destination','date','time','appointmentTime']);
   const phoneDigits=normalizeE164(b.phone);
   if(!phoneDigits)return json(400,{error:'Enter a valid international phone number with country code, such as +1 240 555 0101'});
   // Validate email if provided
   if(b.email){const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!emailPattern.test(b.email.trim()))return json(400,{error:'Please enter a valid email address'});}
   if(clean(b.payerType).toUpperCase()==='INSURANCE'&&!clean(b.insuranceCarrier))return json(400,{error:'Private insurance provider is required'});
  // Detect booking source and billing behavior by role.
   let bookingActor=null;
   try{if(bearer(event))bookingActor=await requireUser(bearer(event))}catch{}
  const actorRole=String(bookingActor?.role||'CUSTOMER').toUpperCase();
  const appointmentTime=normalizeOptionalTripTime(b.appointmentTime||'');
  if(!appointmentTime)return json(400,{error:'Appointment time is required and must be valid (for example 2:00 PM).'});
  const tripType=['ONE_WAY','ROUND_TRIP','RECURRING'].includes(clean(b.tripType).toUpperCase())?clean(b.tripType).toUpperCase():'ONE_WAY';
  const returnTripDate=tripType==='ROUND_TRIP'?normalizeTripDate(b.returnTripDate||''):null;
  const returnTripTime=tripType==='ROUND_TRIP'?normalizeOptionalTripTime(b.returnTripTime||''):null;
  const recurrenceDays=tripType==='RECURRING'?[...new Set((Array.isArray(b.recurrenceDays)?b.recurrenceDays:[]).map((day)=>clean(day).toUpperCase()).filter((day)=>['MON','TUE','WED','THU','FRI','SAT','SUN'].includes(day)))]:[];
  const recurrenceEndDate=tripType==='RECURRING'?normalizeTripDate(b.recurrenceEndDate||''):null;
  if(tripType==='ROUND_TRIP'&&(!returnTripDate||!returnTripTime))return json(400,{error:'Return date and pickup time are required for a round trip'});
  if(tripType==='RECURRING'&&(!recurrenceEndDate||!recurrenceDays.length))return json(400,{error:'Recurring rides require at least one weekday and an end date'});
  if(tripType==='RECURRING'){const start=new Date(`${normalizeTripDate(b.date)}T00:00:00Z`);const end=new Date(`${recurrenceEndDate}T00:00:00Z`);if(end<start||end-start>84*86400000)return json(400,{error:'Recurring ride schedules must end within 12 weeks of the first ride'});}
  const pickupTimeEstimate=clean(b.pickupTimeEstimate||b.time||'');
  const yardAddress=clean(b.yardAddress||'');
  const yardToPickupMinutes=Number(b.yardToPickupMinutes);
  const yardToPickupTrafficMinutes=Number(b.yardToPickupTrafficMinutes);
  const checkInTime=normalizeOptionalTripTime(b.checkInTime||b.driverReportTime||'');
  const preTripInspectionMinutes=Number(b.preTripInspectionMinutes);
  const requestedByRole=clean(b.requestedByRole||actorRole||'CUSTOMER').toUpperCase();

  let bookingSource='CUSTOMER';
  if(actorRole==='FACILITY') bookingSource='FACILITY';
  else if(actorRole==='DISPATCHER') bookingSource='DISPATCH';
  else if(actorRole==='DRIVER') bookingSource='DRIVER_REFERRAL';
  else if(actorRole==='PATIENT'||actorRole==='RIDER') bookingSource='PATIENT';
  else if(actorRole==='ADMIN'||actorRole==='BILLING') bookingSource='STAFF';
  bookingSource=normalizeBookingSource(bookingSource);
  const paymentPolicy=bookingPaymentPolicy({authenticated:Boolean(bookingActor),bookingSource,payerType:b.payerType,service:b.service});
  const initialStatus=paymentPolicy.requiresDeposit?'PENDING_PAYMENT':paymentPolicy.requiresApproval?'PENDING_APPROVAL':'SUBMITTED';

  const baseNotes=clean(b.notes)||'';
  const metadataNotes=[
   pickupTimeEstimate?`Pickup estimate: ${pickupTimeEstimate}`:'',
    yardAddress?`Yard start: ${yardAddress}`:'',
    Number.isFinite(yardToPickupMinutes)&&yardToPickupMinutes>0?`Yard to pickup estimate: ${Math.round(yardToPickupMinutes)} min`:'',
    Number.isFinite(yardToPickupTrafficMinutes)&&yardToPickupTrafficMinutes>0?`Yard to pickup traffic estimate: ${Math.round(yardToPickupTrafficMinutes)} min`:'',
    checkInTime?`Check-in time: ${checkInTime}`:'',
    Number.isFinite(preTripInspectionMinutes)&&preTripInspectionMinutes>=0?`Pre-trip inspection buffer: ${Math.round(preTripInspectionMinutes)} min`:'',
   requestedByRole?`Requested by role: ${requestedByRole}`:'',
   paymentPolicy.payerType==='INSURANCE'&&clean(b.insuranceCarrier)?`Insurance carrier: ${clean(b.insuranceCarrier)}`:'',
   tripType==='ROUND_TRIP'?`Round trip return: ${returnTripDate} ${returnTripTime}`:'',
   tripType==='RECURRING'?`Recurring schedule: ${recurrenceDays.join(', ')} through ${recurrenceEndDate}`:'',
   clean(b.paymentWindowLabel)?clean(b.paymentWindowLabel):''
  ].filter(Boolean).join(' | ');
  const notesWithAppointment=upsertAppointmentNote([baseNotes,metadataNotes].filter(Boolean).join(baseNotes&&metadataNotes?'\n':''),appointmentTime);
  const composedNotes=upsertCheckInNote(notesWithAppointment,checkInTime);

   const ref=reference();
   const fare=Number(b.estimatedFare||0);
   const r=await query(`INSERT INTO bookings(reference,name,phone,email,service,pickup,destination,trip_date,trip_time,status,notes,pickup_lat,pickup_lng,destination_lat,destination_lng,distance_miles,estimated_duration,estimated_fare,booking_source,submitter_entity,broker_company_name,broker_accepted_rate,facility_id,payer_type,requires_deposit,deposit_amount,balance_due,coverage_status,coverage_message,trip_type,return_trip_date,return_trip_time,recurrence_days,recurrence_end_date,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33::jsonb,$34,now(),now()) RETURNING *`,[ref,clean(b.name),clean(b.phone),clean(b.email)||null,clean(b.service),clean(b.pickup),clean(b.destination),b.date,pickupTimeEstimate||b.time,initialStatus,composedNotes||null,b.pickupLat||null,b.pickupLng||null,b.destinationLat||null,b.destinationLng||null,b.distanceMiles||null,clean(b.estimatedDuration)||null,fare,bookingSource,clean(b.requestedByUser||bookingActor?.email||'')||null,bookingSource==='BROKER'?clean(b.brokerCompanyName||'')||null:null,bookingSource==='BROKER'&&b.brokerAcceptedRate!=null?Number(b.brokerAcceptedRate):null,bookingSource==='FACILITY'?clean(bookingActor?.scope_id||'')||null:null,paymentPolicy.payerType,paymentPolicy.requiresDeposit,paymentPolicy.requiresDeposit?fare*.25:0,paymentPolicy.requiresDeposit?fare*.75:fare,paymentPolicy.coverageStatus,paymentPolicy.coverageMessage||null,tripType,returnTripDate,returnTripTime,JSON.stringify(recurrenceDays),recurrenceEndDate]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,initialStatus,statusLabel(initialStatus),paymentPolicy.coverageMessage||(paymentPolicy.requiresDeposit?'Awaiting required 25% deposit':paymentPolicy.requiresApproval?'Awaiting payer eligibility approval':'Online transportation request received'),bookingActor?.display_name||bookingSource||'PUBLIC']);
   await query("UPDATE booking_drafts SET completed_at=now(),updated_at=now() WHERE completed_at IS NULL AND regexp_replace(phone,'\\D','','g')=$1",[phoneDigits.replace(/\D/g,'')]).catch(()=>{});
  await audit('BOOKING',ref,'CREATED',{source:'UNIFIED_BOOKING',service:b.service,bookingSource,requestedByRole,appointmentTime:appointmentTime||null,pickupTimeEstimate:pickupTimeEstimate||null,referralIncentiveEligible:bookingSource==='DRIVER_REFERRAL'});
  const mappedBooking=mapBooking(r.rows[0]);
  const booking={...mappedBooking,appointmentTime,pickupTime:pickupTimeEstimate||mappedBooking.time,requestedByRole,requestedByUser:clean(b.requestedByUser||bookingActor?.email||'')};
   // Auto-assign driver + vehicle (fire-and-forget, does not block response)
   if(!paymentPolicy.requiresDeposit&&!paymentPolicy.requiresApproval)autoAssign(r.rows[0]).catch(()=>{});
   let notifications;
   const isFacilityInvoice=bookingSource==='FACILITY';
   const isDriverReferral=bookingSource==='DRIVER_REFERRAL';

   if(isFacilityInvoice){
    const facilityTeams=await sendBookingTeamsAlert(booking,'New Facility Trip Booked','New Trip Booked');
    const direct=await notifyBookingPending(booking,{subject:`Facility booking received — ${ref}`,statusText:'was received',detail:'The trip is on the facility account. A detailed invoice will be sent after completion.'});
    const facilityNotifications={...direct,teams:facilityTeams};
    await query('UPDATE bookings SET notification_status=$2::jsonb WHERE reference=$1',[ref,JSON.stringify(facilityNotifications)]).catch(()=>{});
    return json(201,{booking:{...booking,notifications:facilityNotifications},invoiceSent:false,invoiceAfterCompletion:true,requiresOnlinePayment:false,clientMessage:'Booking created. A detailed invoice will be sent to facility managers after the trip is complete.'});
    /* Legacy pre-trip invoicing retained below only for deployment rollback reference.
    const invoiceTargetEmail=bookingSource==='FACILITY'
      ? clean(bookingActor?.email||booking.email)
      : clean(booking.email||bookingActor?.email);
    notifications=await sendInvoice({...booking,email:invoiceTargetEmail||booking.email});
      const teamsNotification=await sendBookingTeamsAlert(booking,'🚐 New Trip Booked — Admin_NMT','New Trip Booked');
      const mergedNotifications={...notifications,teams:teamsNotification};
      await query('UPDATE bookings SET payment_status=$2,notification_status=$3::jsonb WHERE reference=$1',[ref,'INVOICED',JSON.stringify(mergedNotifications)]).catch(()=>{});
      return json(201,{booking:{...booking,paymentStatus:'INVOICED',notifications:mergedNotifications},invoiceSent:true,requiresOnlinePayment:false,clientMessage:'Booking created. Invoice sent by email.'});
    */
   }

  if(paymentPolicy.requiresDeposit){
   const teamsNotification=await sendBookingTeamsAlert(booking,'New Trip Awaiting Deposit','Deposit Required');
   const detail=paymentPolicy.coverageNotAvailable?`${paymentPolicy.coverageMessage} A 25% self-pay deposit is required to confirm.`:'A 25% deposit or full payment is required to confirm this booking.';
   const direct=await notifyBookingPending(booking,{subject:`Deposit required — ${ref}`,statusText:'is awaiting payment',detail});
   return json(201,{booking,requiresOnlinePayment:true,depositRequired:true,coverageNotAvailable:paymentPolicy.coverageNotAvailable,coverageStatus:paymentPolicy.coverageStatus,clientMessage:paymentPolicy.coverageNotAvailable?`${paymentPolicy.coverageMessage} Pay the 25% self-pay deposit to confirm booking ${ref}.`:`Ride request created. Pay the 25% deposit to confirm booking ${ref}.`,notifications:{...direct,teams:teamsNotification}});
  }

  if(paymentPolicy.requiresApproval){
   const teamsNotification=await sendBookingTeamsAlert(booking,'New Trip Pending Payer Approval','Approval Required');
   const direct=await notifyBookingPending(booking,{subject:`Booking pending approval — ${ref}`,statusText:'is pending approval',detail:paymentPolicy.coverageMessage});
   return json(202,{booking,requiresOnlinePayment:false,pendingApproval:true,coverageStatus:paymentPolicy.coverageStatus,clientMessage:`Booking ${ref} is pending approval. ${paymentPolicy.coverageMessage}`,notifications:{...direct,teams:teamsNotification}});
  }

  notifications=await notifyBooking(booking);
   const extra={};
   if(isDriverReferral){
    extra.driverReferral=await sendDriverReferralIncentiveAlert(booking,bookingActor?.email).catch((err)=>({email:{status:'failed',error:err.message}}));
    await audit('BOOKING',ref,'DRIVER_REFERRAL_INCENTIVE',{amount:10,currency:'USD',driverEmail:clean(bookingActor?.email||''),status:extra.driverReferral?.email?.status||'queued'});
   }
   const mergedNotifications={...notifications,...extra};
   await query('UPDATE bookings SET notification_status=$2::jsonb WHERE reference=$1',[ref,JSON.stringify(mergedNotifications)]).catch(()=>{});
   const paymentNotice='A secure payment link will be sent to the rider 60 to 30 minutes before pickup.';
  return json(201,{booking:{...booking,notifications:mergedNotifications},requiresOnlinePayment:false,clientMessage:`Booking created. ${paymentNotice}`});
  }
  if(p[0]==='bookings'&&p[1]&&method==='GET'){
   const phone=clean(event.queryStringParameters?.phone);if(!phone)return json(400,{error:'Phone number is required'});
   const searchRef=decodeURIComponent(p[1]);
   // Try matching by reference first, then by name
   let r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[searchRef,phone]);
   if(!r.rows[0]){r=await query('SELECT * FROM bookings WHERE LOWER(name)=LOWER($1) AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\') ORDER BY created_at DESC LIMIT 1',[searchRef,phone]);}
   if(!r.rows[0])return json(404,{error:'Request not found'});return json(200,{booking:await mapPatientBooking(r.rows[0])});
  }
  // Cancel booking
  if(p[0]==='bookings'&&p[1]&&p[2]==='accept'&&method==='POST'){
   const token=bearer(event);
   let u;
   try{
    u=await requireUser(token,['DRIVER','ADMIN','DISPATCHER']);
   }catch(err){
    const fallbackSession=getFallbackSession(token);
    if(fallbackSession?.user?.role==='DRIVER'){
     const ref=decodeURIComponent(p[1]);
    const accepted=acceptFallbackAssignment(fallbackSession.user,ref);
     if(!accepted)return json(404,{error:'Booking not found'});
     return json(200,{booking:mapBooking(accepted),message:'Trip accepted'});
    }
    throw err;
   }
   const ref=decodeURIComponent(p[1]);
   const booking=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);
   if(!booking.rows[0])return json(404,{error:'Booking not found'});
   if(!isDriverAssignableStatus(booking.rows[0].status))return json(409,{error:'This booking is not currently available for acceptance'});
  const nextStatus=normalizeDriverAcceptanceStatus(booking.rows[0].status);
   const updated=await query(`UPDATE bookings SET status=$2, driver_name=COALESCE($3,driver_name), driver_scope_id=COALESCE($4,driver_scope_id), updated_at=now() WHERE reference=$1 RETURNING *`,[ref,nextStatus,clean(u.display_name||u.email||'Driver')||null,clean(u.scope_id||u.scopeId||null)||null]);
   if(!updated.rows[0])return json(404,{error:'Booking not found'});
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,nextStatus,statusLabel(nextStatus),`Accepted by ${u.display_name||u.email||'driver'}`,'DRIVER']);
   return json(200,{booking:mapBooking(updated.rows[0]),message:'Trip accepted'});
  }
  if(p[0]==='bookings'&&p[1]&&p[2]==='cancel'&&method==='POST'){
   const b=parseBody(event);const phone=clean(b.phone);if(!phone)return json(400,{error:'Phone number is required to cancel'});
   const ref=decodeURIComponent(p[1]);
   const r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[ref,phone]);
   if(!r.rows[0])return json(404,{error:'Booking not found or phone number does not match'});
   if(['CANCELLED','COMPLETED','IN_TRANSIT','ARRIVED'].includes(r.rows[0].status))return json(400,{error:`Cannot cancel a booking with status: ${r.rows[0].status}`});
    const settings=await readPlatformSettings();
    const fareRules=settings.fareRules||{};
    const tripAt=new Date(`${String(r.rows[0].trip_date||'')}T${String(r.rows[0].trip_time||'00:00:00')}`);
    const createdAt=new Date(r.rows[0].created_at||Date.now());
    const now=new Date();
    const hoursUntilTrip=(tripAt.getTime()-now.getTime())/36e5;
    const bookingLeadHours=(tripAt.getTime()-createdAt.getTime())/36e5;
    const windowHours=Math.max(0,Number(fareRules.cancellationWindowHours||24));
    const leadHours=Math.max(0,Number(fareRules.cancellationLeadHours||72));
    const applyWindow=Number.isFinite(hoursUntilTrip)&&hoursUntilTrip<=windowHours;
    const applyLead=Number.isFinite(bookingLeadHours)&&bookingLeadHours>=leadHours;
    const policyKey=resolveServicePolicyKey(r.rows[0].service);
    const servicePolicy=fareRules.servicePolicies?.[policyKey]||{};
    const serviceCancellationFee=Math.max(0,Number(servicePolicy.cancellationFee ?? fareRules.cancellationFee ?? 0));
    const cancellationFeeApplied=Boolean(applyWindow&&applyLead&&serviceCancellationFee>0);
    const cancellationFeeAmount=cancellationFeeApplied?serviceCancellationFee:0;
    const ruleSnapshot={policyKey,cancellationWindowHours:windowHours,cancellationLeadHours:leadHours,hoursUntilTrip:Number.isFinite(hoursUntilTrip)?Number(hoursUntilTrip.toFixed(2)):null,bookingLeadHours:Number.isFinite(bookingLeadHours)?Number(bookingLeadHours.toFixed(2)):null,applied:cancellationFeeApplied};
    const updated=await query('UPDATE bookings SET status=$2,cancelled_at=now(),cancel_reason=$3,cancellation_fee_amount=$4,cancellation_fee_applied=$5,cancellation_rule_snapshot=$6::jsonb,payment_status=CASE WHEN $5 THEN $7 ELSE payment_status END,updated_at=now() WHERE reference=$1 RETURNING *',[ref,'CANCELLED',clean(b.reason)||'Cancelled by passenger',cancellationFeeAmount,cancellationFeeApplied,JSON.stringify(ruleSnapshot),cancellationFeeApplied?'DUE':'UNPAID']);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,'CANCELLED','cancelled',clean(b.reason)||'Cancelled by passenger','PASSENGER']);
    await audit('BOOKING',ref,'CANCELLED',{reason:clean(b.reason)||'Passenger request',cancellationFeeAmount,cancellationFeeApplied,policyKey});
   const booking=mapBooking(updated.rows[0]);
     const driverAlert=sendTripStakeholderUpdate(r.rows[0],updated.rows[0],{display_name:'Passenger'},clean(b.reason)||'Cancelled by passenger').catch(e=>console.error('[CANCEL_NOTIFY]',e.message));
   // Notify passenger and company of cancellation
   const cancelSmsRecipients=buildSmsRecipients(booking.phone);
   const cancelEmailRecipients=buildEmailRecipients(booking.email||process.env.COMPANY_EMAIL);
   await Promise.allSettled([
     Promise.all(cancelSmsRecipients.map((phone)=>sendSms(phone,`Nexus Medical Transit: Your trip ${ref} has been cancelled. Reference saved for your records. Call (888) 760-4990 to rebook.`))).then(()=>({status:'sent'})),
     booking.email?sendEmail(cancelEmailRecipients,`Trip ${ref} cancelled`,`<h2>Your trip has been cancelled</h2><p>Reference <strong>${ref}</strong> has been cancelled as requested.</p><p>Call <strong>(888) 760-4990</strong> or visit nexusmt.com to book a new trip.</p>`):Promise.resolve(),
       process.env.COMPANY_EMAIL?sendEmail(buildEmailRecipients(process.env.COMPANY_EMAIL),`Trip cancellation: ${ref}`,`<h2>Trip Cancelled</h2><p><strong>Reference:</strong> ${ref}</p><p><strong>Passenger:</strong> ${booking.name} (${booking.phone})</p><p><strong>Route:</strong> ${booking.pickup} → ${booking.destination}</p><p><strong>Original Date/Time:</strong> ${booking.date} at ${booking.time}</p><p><strong>Reason:</strong> ${clean(b.reason)||'Passenger request'}</p>`):Promise.resolve(),
       driverAlert
   ]);
  return json(200,{booking,cancellationFee:{applied:cancellationFeeApplied,amount:cancellationFeeAmount,policyKey,windowHours,leadHours},message:'Booking cancelled successfully'});
  }
  // Reschedule booking
  if(p[0]==='bookings'&&p[1]&&p[2]==='reschedule'&&method==='POST'){
   const b=parseBody(event);const phone=clean(b.phone);if(!phone)return json(400,{error:'Phone number is required to reschedule'});
   if(!b.date||!b.time)return json(400,{error:'New date and time are required'});
   const ref=decodeURIComponent(p[1]);
   const r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[ref,phone]);
   if(!r.rows[0])return json(404,{error:'Booking not found or phone number does not match'});
   if(['CANCELLED','COMPLETED','IN_TRANSIT','ARRIVED'].includes(r.rows[0].status))return json(400,{error:`Cannot reschedule a booking with status: ${r.rows[0].status}`});
   const updated=await query('UPDATE bookings SET trip_date=$2,trip_time=$3,reminder_sent=false,updated_at=now() WHERE reference=$1 RETURNING *',[ref,b.date,b.time]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,r.rows[0].status,statusLabel(r.rows[0].status),`Rescheduled to ${b.date} at ${b.time}`,'PASSENGER']);
   await audit('BOOKING',ref,'RESCHEDULED',{newDate:b.date,newTime:b.time});
   const booking=mapBooking(updated.rows[0]);
   const driverAlert=sendTripStakeholderUpdate(r.rows[0],updated.rows[0],{display_name:'Passenger'},`Rescheduled to ${b.date} at ${b.time}`).catch(e=>console.error('[RESCHEDULE_NOTIFY]',e.message));
   // Notify passenger of reschedule
   const rescheduleSmsRecipients=buildSmsRecipients(booking.phone);
   const rescheduleEmailRecipients=buildEmailRecipients(booking.email||process.env.COMPANY_EMAIL);
   await Promise.allSettled([
     Promise.all(rescheduleSmsRecipients.map((phone)=>sendSms(phone,`Nexus Medical Transit: Your trip ${ref} has been rescheduled to ${b.date} at ${b.time}. Questions? Call (888) 760-4990.`))).then(()=>({status:'sent'})),
     booking.email?sendEmail(rescheduleEmailRecipients,`Trip ${ref} rescheduled`,`<h2>Your trip has been rescheduled</h2><p>Reference <strong>${ref}</strong> is now scheduled for <strong>${b.date} at ${b.time}</strong>.</p><p>Questions? Call <strong>(888) 760-4990</strong>.</p>`):Promise.resolve(),
     process.env.COMPANY_EMAIL?sendEmail(buildEmailRecipients(process.env.COMPANY_EMAIL),`Trip rescheduled: ${ref}`,`<h2>Trip Rescheduled</h2><p><strong>Reference:</strong> ${ref}</p><p><strong>Passenger:</strong> ${booking.name} (${booking.phone})</p><p><strong>Route:</strong> ${booking.pickup} → ${booking.destination}</p><p><strong>New Date/Time:</strong> ${b.date} at ${b.time}</p><p><strong>Service:</strong> ${booking.service}</p>`):Promise.resolve(),
     driverAlert
   ]);
   return json(200,{booking,message:'Booking rescheduled successfully'});
  }
  if(p.join('/')==='payments/create-intent'&&method==='POST'){
   const b=parseBody(event);required(b,['bookingReference']);const r=await query('SELECT reference,estimated_fare,payment_status FROM bookings WHERE reference=$1',[b.bookingReference]);if(!r.rows[0])return json(404,{error:'Booking not found'});
   const amount=Math.round(Number(b.amount||r.rows[0].estimated_fare||0)*100);if(amount<50)return json(400,{error:'A valid payment amount is required'});
   const pi=await createStripeIntent(amount,{bookingReference:r.rows[0].reference});await query('UPDATE bookings SET stripe_payment_intent_id=$2,payment_status=$3,updated_at=now() WHERE reference=$1',[r.rows[0].reference,pi.id,'PENDING']);
   return json(200,{clientSecret:pi.client_secret,paymentIntentId:pi.id,amount});
  }
  if(p.join('/')==='payments/stripe/checkout'&&method==='POST'){
   const b=parseBody(event);required(b,['bookingReference']);
   const paymentMode=['deposit','full'].includes(b.paymentMode)?b.paymentMode:'full';
   const r=await query('SELECT reference,email,estimated_fare,payment_status,booking_source,coverage_status FROM bookings WHERE reference=$1',[b.bookingReference]);
   if(!r.rows[0])return json(404,{error:'Booking not found'});
   const totalFare=Number(b.amount||r.rows[0].estimated_fare||0);
   const chargeAmount=paymentMode==='deposit'?Math.round(totalFare*0.25*100):Math.round(totalFare*100);
   if(chargeAmount<50)return json(400,{error:'A valid payment amount is required'});
   const depositAmount=paymentMode==='deposit'?chargeAmount/100:totalFare;
   const balanceDue=paymentMode==='deposit'?Math.max(0,totalFare-depositAmount):0;
   const session=await createStripeCheckoutSession(chargeAmount,{bookingReference:r.rows[0].reference,email:r.rows[0].email||undefined,paymentMode});
   await query("UPDATE bookings SET stripe_checkout_session_id=$2,payment_status=$3,deposit_amount=$4,balance_due=$5,payer_type=CASE WHEN coverage_status='NOT_COVERED_STANDARD' THEN 'SELF_PAY' ELSE payer_type END,coverage_status=CASE WHEN coverage_status='NOT_COVERED_STANDARD' THEN 'SELF_PAY' ELSE coverage_status END,updated_at=now() WHERE reference=$1",[r.rows[0].reference,session.id,'PENDING',depositAmount,balanceDue]);
   return json(200,{provider:'stripe',url:session.url,sessionId:session.id,amount:chargeAmount,paymentMode});
  }
  if(p.join('/')==='payments/stripe/webhook'&&method==='POST'){
   const sig=event.headers['stripe-signature'];
   if(!sig)return json(400,{error:'Missing stripe-signature header'});
   let stripeEvent;
   try{stripeEvent=verifyStripeWebhookSignature(event.body||'',sig)}catch(err){return json(err.statusCode||400,{error:err.message});}
   if(stripeEvent.type==='checkout.session.completed'){
    const session=stripeEvent.data.object;
    const bookingReference=session.metadata?.bookingReference;
    const paymentMode=session.metadata?.paymentMode||'full';
    if(bookingReference){
     const bRow=await query('SELECT * FROM bookings WHERE reference=$1',[bookingReference]);
     if(bRow.rows[0]){
      const bk=bRow.rows[0];
      const isDeposit=paymentMode==='deposit';
      const newStatus=isDeposit?'DEPOSIT_PAID':'PAID_IN_FULL';
      const updateSql=isDeposit
       ?"UPDATE bookings SET payment_status=$2,deposit_paid_at=now(),status=CASE WHEN status='PENDING_PAYMENT' THEN 'SUBMITTED' ELSE status END,updated_at=now() WHERE reference=$1 RETURNING *"
       :"UPDATE bookings SET payment_status=$2,paid_in_full_at=now(),balance_due=0,status=CASE WHEN status='PENDING_PAYMENT' THEN 'SUBMITTED' ELSE status END,updated_at=now() WHERE reference=$1 RETURNING *";
      const paidBookingResult=await query(updateSql,[bookingReference,newStatus]);
      if(clean(bk.status).toUpperCase()==='PENDING_PAYMENT'){
       const confirmedRow=paidBookingResult.rows[0]||{...bk,status:'SUBMITTED',payment_status:newStatus};
       autoAssign(confirmedRow).catch(()=>{});
       await notifyBooking(mapBooking(confirmedRow)).catch(()=>{});
      }
      await audit('BOOKING',bookingReference,'PAYMENT_RECEIVED',{mode:paymentMode,sessionId:session.id,amount:session.amount_total});
      if(isDeposit){
       const depositSmsRecipients=buildSmsRecipients(bk.phone);
       const depositEmailRecipients=buildEmailRecipients(bk.email||process.env.COMPANY_EMAIL);
       await Promise.allSettled([
        Promise.all(depositSmsRecipients.map((phone)=>sendSms(phone,`Nexus Medical Transit: 25% deposit received for booking ${bookingReference}. Your ride is reserved! The remaining balance of $${Number(bk.balance_due||0).toFixed(2)} will be due before pickup.`))).then(()=>({status:'sent'})),
        bk.email?sendEmail(depositEmailRecipients,`Deposit confirmed — ${bookingReference}`,`<h2>Deposit received</h2><p>Your 25% deposit for booking <strong>${bookingReference}</strong> has been received and your ride is reserved.</p><p>Remaining balance: <strong>$${Number(bk.balance_due||0).toFixed(2)}</strong> — due before pickup.</p>`):Promise.resolve()
       ]);
      }else{
       const paymentSmsRecipients=buildSmsRecipients(bk.phone);
       const paymentEmailRecipients=buildEmailRecipients(bk.email||process.env.COMPANY_EMAIL);
       await Promise.allSettled([
        Promise.all(paymentSmsRecipients.map((phone)=>sendSms(phone,`Nexus Medical Transit: Full payment confirmed for booking ${bookingReference}. Thank you!`))).then(()=>({status:'sent'})),
        bk.email?sendEmail(paymentEmailRecipients,`Payment confirmed — ${bookingReference}`,`<h2>Payment confirmed</h2><p>Booking <strong>${bookingReference}</strong> is fully paid. We look forward to your ride.</p>`):Promise.resolve(),
        process.env.COMPANY_EMAIL?sendEmail(buildEmailRecipients(process.env.COMPANY_EMAIL),`Payment complete: ${bookingReference}`,`<h2>Payment Received</h2><p><strong>Reference:</strong> ${bookingReference}</p><p><strong>Passenger:</strong> ${bk.name}</p><p><strong>Amount:</strong> $${((session.amount_total||0)/100).toFixed(2)}</p>`):Promise.resolve(),
        bk.driver_name?Promise.all(paymentSmsRecipients.map((phone)=>sendSms(phone,`[NEXUS DRIVER ALERT] Payment complete for booking ${bookingReference} — ${bk.name}. You are clear to proceed.`))).then(()=>({status:'sent'})):Promise.resolve()
       ]);
      }
     }
    }
   }
   return json(200,{received:true});
  }
  if(p.join('/')==='payments/square/checkout'&&method==='POST'){
   const b=parseBody(event);required(b,['bookingReference']);
   const r=await query('SELECT reference,email,estimated_fare,payment_status FROM bookings WHERE reference=$1',[b.bookingReference]);
   if(!r.rows[0])return json(404,{error:'Booking not found'});
   const amount=Math.round(Number(b.amount||r.rows[0].estimated_fare||0)*100);if(amount<50)return json(400,{error:'A valid payment amount is required'});
   const square=await createSquarePaymentLink(amount,{bookingReference:r.rows[0].reference,email:r.rows[0].email||undefined});
   await query('UPDATE bookings SET square_payment_link_id=$2,square_order_id=$3,payment_status=$4,updated_at=now() WHERE reference=$1',[r.rows[0].reference,square.payment_link?.id||null,square.payment_link?.order_id||square.related_resources?.orders?.[0]?.id||null,'PENDING']);
   return json(200,{provider:'square',url:square.payment_link?.url,linkId:square.payment_link?.id||null,amount});
  }
  if(p.join('/')==='gps/positions'&&method==='POST'){
   const u=await requireUser(bearer(event),['DRIVER','ADMIN','DISPATCHER']);const b=parseBody(event);required(b,['vehicleUnit','latitude','longitude']);
   const lat=Number(b.latitude),lng=Number(b.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return json(400,{error:'Invalid coordinates'});
   await query(`INSERT INTO gps_positions(vehicle_unit,driver_scope_id,booking_reference,latitude,longitude,heading,speed_mph,accuracy_m,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,now()))`,[b.vehicleUnit,u.scope_id||null,b.bookingReference||null,lat,lng,b.heading||null,b.speedMph||null,b.accuracyM||null,b.recordedAt||null]);
    const unit=clean(b.vehicleUnit);
    const vehicleType=clean(b.vehicleType)||'wheelchair';
    const status=clean(b.status).toUpperCase().replaceAll('-','_')||'EN_ROUTE';
    const updated=await query(`UPDATE vehicles SET latitude=$2,longitude=$3,heading=$4,speed_mph=$5,last_seen_at=now(),updated_at=now() WHERE unit_number=$1`,[unit,lat,lng,b.heading||null,b.speedMph||null]);
    if(updated.rowCount===0){
     await query(`INSERT INTO vehicles(unit_number,vehicle_type,status,latitude,longitude,heading,speed_mph,last_seen_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())`,[unit,vehicleType,status,lat,lng,b.heading||null,b.speedMph||null]);
    }
    return json(202,{accepted:true});
  }
  if(p[0]==='auth'&&p[1]==='me'&&method==='GET'){
   try{
    const u=await requireUser(bearer(event));
    return json(200,{user:safeUser(u)});
   }catch(err){
    const session=getFallbackSession(bearer(event));
    if(session){return json(200,{user:safeUser(session.user)});} 
    throw err;
   }
  }
  if(p[0]==='auth'&&p[1]==='logout'&&method==='POST'){const token=bearer(event);if(token){try{await query('UPDATE sessions SET revoked_at=now() WHERE token_digest=$1',[digest(token)]);}catch{}revokeFallbackSession(token);}return json(200,{ok:true})}
  if(p[0]==='auth'&&p[1]==='password-setup'&&method==='POST'){
   const b=parseBody(event);
   const token=clean(b.token);
   const password=String(b.password||'');
   if(!token)return json(400,{error:'Setup token is required'});
   if(password.length<12)return json(400,{error:'Password must be at least 12 characters'});
   const tokenHash=digest(token);
   const pool=getPool();
   const client=await pool.connect();
   let row;
   try{
     const tokenResult=await client.query('SELECT pst.user_id,u.email FROM password_setup_tokens pst JOIN users u ON u.id=pst.user_id WHERE pst.token_digest=$1 AND pst.used_at IS NULL AND pst.expires_at>now() LIMIT 1',[tokenHash]);
     row=tokenResult.rows[0];
     if(!row)return json(400,{error:'This setup link is invalid or expired'});
     const passwordHash=crypto.createHash('sha256').update(password).digest('hex');
     await client.query('BEGIN');
     try{
      await client.query('UPDATE users SET password_hash=$2, active=true, updated_at=now() WHERE id=$1',[row.user_id,passwordHash]);
      await client.query('UPDATE password_setup_tokens SET used_at=now() WHERE token_digest=$1',[tokenHash]);
      await audit('USER',String(row.user_id),'PASSWORD_SET',{email:row.email});
      await client.query('COMMIT');
     }catch(err){
      await client.query('ROLLBACK').catch(()=>{});
      throw err;
     }
   }catch(err){
     throw err;
   }finally{
     client.release();
   }
   return json(200,{ok:true,message:'Password saved'});
  }
  if(p[0]==='auth'&&p[1]==='register'&&method==='POST'){
   await ensureMultiRoleSchema();
   const b=parseBody(event),displayName=clean(b.displayName),email=clean(b.email).toLowerCase(),password=String(b.password||''),phoneDigits=normalizeE164(b.phone),requestedRole=String(b.role||'PATIENT').toUpperCase();
   const publicRoles=['PATIENT','DRIVER','FACILITY','DISPATCHER','BILLING','QA','EXECUTIVE','ADMIN'];
   if(!publicRoles.includes(requestedRole))return json(400,{error:'Select a valid account role'});
   if(displayName.length<2)return json(400,{error:'Your name is required'});
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{error:'Enter a valid email address'});
   if(!phoneDigits)return json(400,{error:'Enter a valid international phone number with country code, such as +1 240 555 0101'});
   if(password.length<12)return json(400,{error:'Password must be at least 12 characters'});
   if(b.acceptTerms!==true)return json(400,{error:'Accept the Terms and Privacy Notice to create an account'});
   const existing=await query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1',[email]);
   let u=existing.rows[0]||null;
   if(u&&!verifyPassword(password,String(u.password_hash||'')))return json(409,{error:'An account already exists for this email. Use Sign In or reset your password.'});
   if(!u){
    const orgResult=await query(`SELECT organization_id AS id FROM users WHERE organization_id IS NOT NULL ORDER BY CASE WHEN role='ADMIN' THEN 0 ELSE 1 END,created_at ASC LIMIT 1`)
     .catch(()=>({rows:[]}));
    let orgId=orgResult.rows[0]?.id||null;
    if(!orgId){
     const fallbackOrg=await query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1').catch(()=>({rows:[]}));
     orgId=fallbackOrg.rows[0]?.id||null;
    }
    if(!orgId)return json(503,{error:'Account registration is temporarily unavailable while organization setup is completed. Please contact Nexus support.'});
    const created=await query(`INSERT INTO users(id,email,display_name,password_hash,phone,role,active,organization_id,identity_subject,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,'PATIENT',true,$6,$7,now(),now()) RETURNING *`,
     [crypto.randomUUID(),email,displayName,hashPassword(password),phoneDigits,orgId,crypto.randomUUID()]);
    u=created.rows[0];
   }
   const token=crypto.randomBytes(32).toString('base64url');
   await query(`INSERT INTO user_role_requests(user_id,role,status,reviewed_at) VALUES($1,'PATIENT','APPROVED',now()) ON CONFLICT(user_id,role) DO NOTHING`,[u.id]);
   if(requestedRole!=='PATIENT')await query(`INSERT INTO user_role_requests(user_id,role,status) VALUES($1,$2,'PENDING') ON CONFLICT(user_id,role) DO UPDATE SET status='PENDING',requested_at=now(),reviewed_at=null,reviewed_by=null`,[u.id,requestedRole]);
   await query(`INSERT INTO sessions(token_digest,user_id,active_role,expires_at,ip_address,user_agent) VALUES($1,$2,'PATIENT',now()+interval '8 hours',$3,$4)`,[digest(token),u.id,event.headers['x-forwarded-for']||null,event.headers['user-agent']||null]);
   u.role='PATIENT';u.scope_id=null;u.available_roles=['PATIENT'];
   await audit('USER',String(u.id),'ACCOUNT_REGISTERED',{requestedRole,status:requestedRole==='PATIENT'?'APPROVED':'PENDING'});
   return json(201,{token,user:safeUser(u),roleRequest:requestedRole==='PATIENT'?null:{role:requestedRole,status:'PENDING'},message:requestedRole==='PATIENT'?'Your patient account is ready.':`Your ${requestedRole.toLowerCase()} access request is awaiting administrator verification. Patient access is available now.`});
  }
  if(p[0]==='bookings'&&p[1]&&p[2]==='update'&&method==='POST'){
   const b=parseBody(event);required(b,['name','phone','service','pickup','destination','date','time','appointmentTime']);
   const ref=decodeURIComponent(p[1]);
   const phoneDigits=normalizeE164(b.phone);if(!phoneDigits)return json(400,{error:'Enter the phone number used for this booking'});
   const found=await query(`SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,'\\D','','g')=regexp_replace($2,'\\D','','g')`,[ref,phoneDigits]);
   if(!found.rows[0])return json(404,{error:'Booking not found or phone number does not match'});
   if(!['PENDING_PAYMENT','PENDING_APPROVAL','SUBMITTED','REQUESTED','SCHEDULED'].includes(clean(found.rows[0].status).toUpperCase()))return json(409,{error:'This trip can no longer be changed online. Please call dispatch.'});
   if(found.rows[0].driver_name||found.rows[0].driver_scope_id)return json(409,{error:'A driver is already assigned. Please call dispatch to change this trip.'});
   const fare=Math.max(0,Number(b.estimatedFare||0));
   const updated=await query(`UPDATE bookings SET name=$2,email=$3,service=$4,pickup=$5,destination=$6,trip_date=$7,trip_time=$8,notes=$9,distance_miles=$10,estimated_duration=$11,estimated_fare=$12,deposit_amount=CASE WHEN requires_deposit THEN $12*.25 ELSE deposit_amount END,balance_due=CASE WHEN requires_deposit THEN $12*.75 ELSE $12 END,updated_at=now() WHERE reference=$1 RETURNING *`,[ref,clean(b.name),clean(b.email)||null,clean(b.service),clean(b.pickup),clean(b.destination),b.date,clean(b.time),upsertAppointmentNote(clean(b.notes),clean(b.appointmentTime)),b.distanceMiles||null,clean(b.estimatedDuration)||null,fare]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,updated.rows[0].status,statusLabel(updated.rows[0].status),'Rider updated booking details','PASSENGER']);
   await audit('BOOKING',ref,'RIDER_UPDATED',{service:b.service,date:b.date,time:b.time});
   return json(200,{booking:mapBooking(updated.rows[0]),requiresOnlinePayment:Boolean(updated.rows[0].requires_deposit),depositRequired:Boolean(updated.rows[0].requires_deposit),clientMessage:`Booking ${ref} updated. Review the new details and complete payment.`});
  }
  if(p[0]==='auth'&&p[1]==='switch-role'&&method==='POST'){
   await ensureMultiRoleSchema();
   const token=bearer(event),u=await requireUser(token),b=parseBody(event),nextRole=String(b.role||'').toUpperCase();
   if(!u.available_roles?.includes(nextRole))return json(403,{error:'That role is not approved for this account'});
   await query('UPDATE sessions SET active_role=$2 WHERE token_digest=$1 AND revoked_at IS NULL',[digest(token),nextRole]);
   const refreshed=await requireUser(token);await audit('USER',String(u.id),'ROLE_SWITCHED',{from:u.role,to:nextRole});
   return json(200,{user:safeUser(refreshed)});
  }
  if(p[0]==='patient'&&p[1]==='dashboard'&&method==='GET'){
   const u=await requireUser(bearer(event),['PATIENT']);
   await ensurePatientPreferencesSchema();
   const patientPhone=String(u.phone||'').replace(/\D/g,'');
   const phoneVariants=patientPhone.length===11&&patientPhone.startsWith('1')?[patientPhone,patientPhone.slice(1)]:[patientPhone];
   const bookingWhere=patientPhone
    ? `lower(email)=lower($1) OR regexp_replace(phone,'\\D','','g')=ANY($2::text[])`
    : 'lower(email)=lower($1)';
   const bookingParams=patientPhone?[u.email,phoneVariants]:[u.email];
   const [preferencesResult,bookingsResult]=await Promise.all([
    query('SELECT * FROM patient_transport_preferences WHERE user_id=$1 LIMIT 1',[u.id]),
    query(`SELECT * FROM bookings WHERE ${bookingWhere} ORDER BY trip_date DESC,trip_time DESC LIMIT 50`,bookingParams)
   ]);
   const preferenceRow=preferencesResult.rows[0]||{};
   const trips=await Promise.all((await mapBookingsWithIntakeAudit(bookingsResult.rows)).map(mapPatientBooking));
   const inactiveStatuses=new Set(['COMPLETED','CANCELLED','NO_SHOW','DELIVERED']);
   const upcoming=trips
    .filter(trip=>!inactiveStatuses.has(String(trip.status||'').toUpperCase())&&String(trip.date||trip.tripDate||trip.trip_date||'')>=new Date().toISOString().slice(0,10))
    .sort((a,b)=>`${a.date||a.tripDate||a.trip_date||''} ${a.time||a.tripTime||a.trip_time||''}`.localeCompare(`${b.date||b.tripDate||b.trip_date||''} ${b.time||b.tripTime||b.trip_time||''}`));
   return json(200,{
    user:safeUser(u),
    preferences:{mobilityType:preferenceRow.mobility_type||'AMBULATORY',remainsInWheelchair:!!preferenceRow.remains_in_wheelchair,transferAssistance:!!preferenceRow.transfer_assistance,oxygenRequired:!!preferenceRow.oxygen_required,preferredLanguage:preferenceRow.preferred_language||'',communicationPreference:preferenceRow.communication_preference||'SMS',defaultPickup:preferenceRow.default_pickup||'',accessibilityNotes:preferenceRow.accessibility_notes||''},
    nextRide:upcoming[0]||null,
    recentRides:trips.slice(0,5)
   });
  }
  if(p[0]==='patient'&&p[1]==='preferences'&&method==='GET'){
   const u=await requireUser(bearer(event),['PATIENT']);await ensurePatientPreferencesSchema();
   const result=await query('SELECT * FROM patient_transport_preferences WHERE user_id=$1 LIMIT 1',[u.id]),row=result.rows[0]||{};
   return json(200,{preferences:{mobilityType:row.mobility_type||'AMBULATORY',remainsInWheelchair:!!row.remains_in_wheelchair,transferAssistance:!!row.transfer_assistance,oxygenRequired:!!row.oxygen_required,preferredLanguage:row.preferred_language||'',communicationPreference:row.communication_preference||'SMS',defaultPickup:row.default_pickup||'',accessibilityNotes:row.accessibility_notes||''}});
  }
  if(p[0]==='patient'&&p[1]==='preferences'&&method==='PATCH'){
   const u=await requireUser(bearer(event),['PATIENT']),b=parseBody(event);await ensurePatientPreferencesSchema();
   const mobilityType=String(b.mobilityType||'AMBULATORY').toUpperCase(),communicationPreference=String(b.communicationPreference||'SMS').toUpperCase();
   if(!['AMBULATORY','WHEELCHAIR','BRODA','STRETCHER','BARIATRIC'].includes(mobilityType))return json(400,{error:'Select a valid mobility type'});
   if(!['SMS','VOICE','EMAIL'].includes(communicationPreference))return json(400,{error:'Select a valid communication preference'});
   const result=await query(`INSERT INTO patient_transport_preferences(user_id,mobility_type,remains_in_wheelchair,transfer_assistance,oxygen_required,preferred_language,communication_preference,default_pickup,accessibility_notes,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT(user_id) DO UPDATE SET mobility_type=EXCLUDED.mobility_type,remains_in_wheelchair=EXCLUDED.remains_in_wheelchair,transfer_assistance=EXCLUDED.transfer_assistance,oxygen_required=EXCLUDED.oxygen_required,preferred_language=EXCLUDED.preferred_language,communication_preference=EXCLUDED.communication_preference,default_pickup=EXCLUDED.default_pickup,accessibility_notes=EXCLUDED.accessibility_notes,updated_at=now() RETURNING *`,[u.id,mobilityType,b.remainsInWheelchair===true,b.transferAssistance===true,b.oxygenRequired===true,clean(b.preferredLanguage)||null,communicationPreference,clean(b.defaultPickup)||null,clean(b.accessibilityNotes)||null]);
   await audit('PATIENT_PREFERENCES',String(u.id),'UPDATED',{mobilityType,communicationPreference});
   return json(200,{preferences:result.rows[0],message:'Your transportation preferences will be used as defaults for future rides.'});
  }
  if(p[0]==='auth'&&p[1]==='login'&&method==='POST'){
   try{
     const b=parseBody(event);
     console.log('[LOGIN] Email:', b.email?.substring(0,10)+'...');
     const fallbackUser=getFallbackUser(b.email, b.password);
     if(fallbackUser){
       const token=createFallbackSession(fallbackUser);
       return json(200,{token,user:safeUser(fallbackUser)});
     }
     try{
       const r=await query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true',[b.email||'']);
       let u=r.rows[0];
       if(!u){
         try{
           const restored=await ensureDefaultUserForEmail(query, b.email||'');
           if(restored){
             const restoredRows=await query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true',[b.email||'']);
             u=restoredRows.rows[0];
           }
         }catch(restoreErr){
           console.warn('[LOGIN] Default-user restore skipped:', restoreErr?.message||restoreErr);
         }
       }
       if(!u){console.log('[LOGIN] User not found or inactive'); return json(401,{error:'Invalid credentials'});}
       console.log('[LOGIN] User found:', u.email, 'role:', u.role);
       
       const supplied=hashPassword(String(b.password||''));
       console.log('[LOGIN] Hash length supplied:', supplied.length, 'stored:', String(u.password_hash).length);
       
       if(!verifyPassword(String(b.password||''), String(u.password_hash))){console.log('[LOGIN] Password mismatch'); return json(401,{error:'Invalid credentials'});}
       console.log('[LOGIN] Password verified');
      if(u.must_change_password&&u.password_reset_expires){
        const expiryTs=new Date(u.password_reset_expires).getTime();
        if(Number.isFinite(expiryTs)&&Date.now()>expiryTs){
          return json(403,{error:'Temporary password expired. Contact admin for a new temporary password.',code:'TEMP_PASSWORD_EXPIRED'});
        }
      }
       
       const token=crypto.randomBytes(32).toString('base64url');
       await query(`INSERT INTO sessions(token_digest,user_id,expires_at,ip_address,user_agent) VALUES($1,$2,now()+interval '8 hours',$3,$4)`,[digest(token),u.id,event.headers['x-forwarded-for']||null,event.headers['user-agent']||null]);
       console.log('[LOGIN] Session created');
       
       await audit('USER',String(u.id),'LOGIN',{role:u.role});
       console.log('[LOGIN] Audit logged');
       const sessionUser=await requireUser(token);
       return json(200,{token,user:safeUser(sessionUser)});
     }catch(err){
       console.error('[LOGIN] Error:', err.message, err.stack);
       throw err;
     }
   }catch(err){
     console.error('[LOGIN] Error:', err.message, err.stack);
     throw err;
   }
  }
  // Forgot password — send reset link via email
  if(p[0]==='auth'&&p[1]==='forgot-password'&&method==='POST'){
    await ensurePasswordResetColumns();
   const emailServiceReady=envEnabled('SENDGRID_API_KEY')&&envEnabled('SENDGRID_FROM_EMAIL');
   if(!emailServiceReady){
    return json(200,{message:'Password reset email service is temporarily unavailable. Call (888) 639-5766 for immediate access reset.'});
   }
   const b=parseBody(event);
   const email=clean(b.email).toLowerCase();
   if(!email)return json(400,{error:'Email is required'});
   const r=await query('SELECT id,email,role FROM users WHERE lower(email)=$1 AND active=true',[email]);
   // Always return success to prevent email enumeration
   if(r.rows[0]){
    const resetToken=crypto.randomBytes(32).toString('base64url');
    const expires=new Date(Date.now()+60*60*1000); // 1 hour
    await query('UPDATE users SET password_reset_token=$1,password_reset_expires=$2,password_reset_used=false,updated_at=now() WHERE id=$3',[resetToken,expires.toISOString(),r.rows[0].id]);
    const base=String(process.env.SITE_URL||process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
    const isDriver=r.rows[0].role==='DRIVER';
    const resetUrl=isDriver
      ?`${base}/driver-app.html?action=reset&token=${encodeURIComponent(resetToken)}`
      :`${base}/livecare.html?action=reset&token=${encodeURIComponent(resetToken)}`;
    try{
     await sendEmail(r.rows[0].email,'Reset your Nexus password',
       `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#082f49">Reset your password</h2>
        <p>We received a request to reset your Nexus Medical Transit password.</p>
        <p style="margin:24px 0"><a href="${resetUrl}" style="background:#d61f1f;color:#fff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:700">Reset Password</a></p>
        <p style="color:#666;font-size:13px">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
        <p style="color:#666;font-size:13px">Or copy this link: ${resetUrl}</p>
       </div>`
     );
    }catch(err){
     console.error('[FORGOT_PASSWORD] Email delivery failed:', err?.message||err);
     return json(200,{message:'Password reset request received, but email delivery is delayed. Call (888) 639-5766 for immediate credential reset.'});
    }
   }
   return json(200,{message:'If that email is registered you will receive a reset link shortly.'});
  }
  // Reset password via token
  if(p[0]==='auth'&&p[1]==='reset-password'&&method==='POST'){
    await ensurePasswordResetColumns();
   const b=parseBody(event);
   const token=clean(b.token);
   const newPass=clean(b.newPassword);
   if(!token||!newPass)return json(400,{error:'Token and new password are required'});
   if(newPass.length<8)return json(400,{error:'Password must be at least 8 characters'});
   const r=await query('SELECT id,role FROM users WHERE password_reset_token=$1 AND password_reset_used=false AND password_reset_expires>now()',[token]);
   if(!r.rows[0])return json(400,{error:'Reset link is invalid or has expired. Please request a new one.'});
   const newHash=crypto.createHash('sha256').update(newPass).digest('hex');
   await query('UPDATE users SET password_hash=$1,must_change_password=false,password_reset_token=null,password_reset_expires=null,password_reset_used=true,updated_at=now() WHERE id=$2',[newHash,r.rows[0].id]);
   await audit('USER',r.rows[0].id,'PASSWORD_RESET',{via:'token'});
   return json(200,{message:'Password updated successfully. You can now sign in.'});
  }
  // Change password (authenticated — first-time or in-app change)
  if(p[0]==='auth'&&p[1]==='change-password'&&method==='POST'){
    await ensurePasswordResetColumns();
   const u=await requireUser(bearer(event));
   const b=parseBody(event);
   const newPass=clean(b.newPassword);
   if(!newPass||newPass.length<8)return json(400,{error:'New password must be at least 8 characters'});
   // If not a forced change, verify current password
   if(!u.must_change_password){
    const current=clean(b.currentPassword);
    if(!current)return json(400,{error:'Current password is required'});
    const supplied=crypto.createHash('sha256').update(current).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(supplied,'hex'),Buffer.from(String(u.password_hash),'hex')))
     return json(401,{error:'Current password is incorrect'});
   }
   const newHash=crypto.createHash('sha256').update(newPass).digest('hex');
  await query('UPDATE users SET password_hash=$1,must_change_password=false,password_reset_expires=null,updated_at=now() WHERE id=$2',[newHash,u.id]);
   await audit('USER',u.id,'PASSWORD_CHANGED',{forced:!!u.must_change_password});
   return json(200,{message:'Password updated successfully.'});
  }
  if(p[0]==='portal'&&p[1]==='trips'&&method==='GET'){
   try{
     const u=await requireUser(bearer(event));
     let sql='SELECT * FROM bookings',params=[];
     if(u.role==='FACILITY'){sql+=' WHERE facility_id=$1';params=[u.scope_id]}
     else if(u.role==='DRIVER'){sql+=' WHERE driver_scope_id=$1';params=[u.scope_id]}
     else if(u.role==='PATIENT'){
      const patientPhone=String(u.phone||'').replace(/\D/g,'');
      const phoneVariants=patientPhone.length===11&&patientPhone.startsWith('1')?[patientPhone,patientPhone.slice(1)]:[patientPhone];
      sql+=patientPhone?` WHERE lower(email)=lower($1) OR regexp_replace(phone,'\\D','','g')=ANY($2::text[])`:' WHERE lower(email)=lower($1)';
      params=patientPhone?[u.email,phoneVariants]:[u.email];
     }
     else if(!['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA'].includes(u.role))return json(403,{error:'Insufficient permission'});
     sql+=' ORDER BY trip_date DESC, trip_time DESC LIMIT 250';
     console.log('[TRIPS] Query:', sql, 'Params:', params, 'Role:', u.role);
     const r=await query(sql,params);
     console.log('[TRIPS] Found', r.rowCount, 'trips');
     const trips=await mapBookingsWithIntakeAudit(r.rows);
     return json(200,{trips});
   }catch(err){
     console.error('[TRIPS] Error:', err.message, err.stack);
     throw err;
   }
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&!p[2]&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA']);
   const r=await query('SELECT * FROM bookings ORDER BY trip_date DESC,trip_time DESC LIMIT 500');
   const bookings=await mapBookingsWithIntakeAudit(r.rows);
   return json(200,{bookings});
  }
    if(p[0]==='admin'&&p[1]==='bookings'&&p[2]==='purge-demo'&&method==='POST'){
    const u=await requireUser(bearer(event),['ADMIN']);
    const body=parseBody(event);
    const dryRun=Boolean(body?.dryRun);
    const candidateQuery=`
     SELECT reference
     FROM bookings
     WHERE reference ~* '^NMT(?:-DRV)?-DEMO-'
       OR upper(COALESCE(booking_source,'')) IN ('DEMO','LOCAL','MOCK','TEST')
       OR upper(COALESCE(name,'')) LIKE '%DEMO RIDER%'
       OR upper(COALESCE(name,'')) LIKE 'FLETCHER DEMO%'
       OR upper(COALESCE(name,'')) LIKE 'PREVIEW RIDER%'
       OR upper(COALESCE(notes,'')) LIKE '%DEMO%'
       OR upper(COALESCE(notes,'')) LIKE '%LOCAL PREVIEW%'
     ORDER BY reference
    `;
    const candidates=await query(candidateQuery);
    const references=(candidates.rows||[]).map((row)=>clean(row.reference)).filter(Boolean);
    if(dryRun){
     return json(200,{dryRun:true,matched:references.length,references:references.slice(0,200)});
    }
    if(!references.length){
     await audit('BOOKING','DEMO_PURGE','RUN',{actor:u.email||u.display_name||'ADMIN',deleted:0});
     return json(200,{dryRun:false,deleted:0,references:[]});
    }
    const deleted=await query('DELETE FROM bookings WHERE reference = ANY($1::text[]) RETURNING reference',[references]);
    const deletedRefs=(deleted.rows||[]).map((row)=>clean(row.reference)).filter(Boolean);
    await audit('BOOKING','DEMO_PURGE','RUN',{actor:u.email||u.display_name||'ADMIN',deleted:deletedRefs.length,references:deletedRefs.slice(0,200)});
    return json(200,{dryRun:false,deleted:deletedRefs.length,references:deletedRefs.slice(0,200)});
    }
    if(p[0]==='admin'&&p[1]==='bookings'&&p[2]==='prune'&&method==='POST'){
     const u=await requireUser(bearer(event),['ADMIN']);
     const body=parseBody(event);
     const dryRun=Boolean(body?.dryRun);
     const keepNamesRaw=Array.isArray(body?.keepNames)?body.keepNames:[];
     const keepReferencesRaw=Array.isArray(body?.keepReferences)?body.keepReferences:[];
     const keepNames=keepNamesRaw.map((x)=>clean(x).toLowerCase()).filter(Boolean);
     const keepReferences=keepReferencesRaw.map((x)=>clean(x)).filter(Boolean);
     if(!keepNames.length&&!keepReferences.length)return json(400,{error:'Provide keepNames and/or keepReferences'});

     const candidates=await query('SELECT reference,name FROM bookings ORDER BY trip_date DESC, trip_time DESC, reference DESC');
     const toDelete=[];
     const toKeep=[];
     for(const row of candidates.rows||[]){
      const reference=clean(row.reference);
      const nameNorm=clean(row.name).toLowerCase();
      const keepByRef=keepReferences.includes(reference);
      const keepByName=keepNames.includes(nameNorm);
      if(keepByRef||keepByName)toKeep.push(reference);
      else toDelete.push(reference);
     }

     if(dryRun){
      return json(200,{dryRun:true,total:candidates.rowCount||0,keep:toKeep.length,delete:toDelete.length,keepReferences:toKeep.slice(0,200),deleteReferences:toDelete.slice(0,200)});
     }

     if(!toDelete.length){
      await audit('BOOKING','PRUNE','RUN',{actor:u.email||u.display_name||'ADMIN',deleted:0,kept:toKeep.length});
      return json(200,{dryRun:false,total:candidates.rowCount||0,deleted:0,kept:toKeep.length,keepReferences:toKeep.slice(0,200),deleteReferences:[]});
     }

     const deleted=await query('DELETE FROM bookings WHERE reference = ANY($1::text[]) RETURNING reference',[toDelete]);
     const deletedRefs=(deleted.rows||[]).map((row)=>clean(row.reference)).filter(Boolean);
     await audit('BOOKING','PRUNE','RUN',{actor:u.email||u.display_name||'ADMIN',deleted:deletedRefs.length,kept:toKeep.length,keepNames:keepNamesRaw,keepReferences});
     return json(200,{dryRun:false,total:candidates.rowCount||0,deleted:deletedRefs.length,kept:toKeep.length,keepReferences:toKeep.slice(0,200),deleteReferences:deletedRefs.slice(0,200)});
    }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&p[3]==='attachments'&&!p[4]&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA']);
   await ensureBookingAttachmentsTable();
   const ref=decodeURIComponent(p[2]);
   const rows=await query(`SELECT id,file_name,mime_type,octet_length(decode(content_base64,'base64')) AS size_bytes,created_at FROM booking_attachments WHERE booking_reference=$1 ORDER BY created_at DESC`,[ref]).catch(()=>({rows:[]}));
   const attachments=(rows.rows||[]).map((row)=>({
    id:row.id,
    fileName:row.file_name,
    mimeType:row.mime_type||'application/octet-stream',
    sizeBytes:row.size_bytes!=null?Number(row.size_bytes):null,
    createdAt:row.created_at,
    downloadPath:`/api/admin/bookings/${encodeURIComponent(ref)}/attachments/${row.id}`
   }));
   return json(200,{reference:ref,attachments});
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&p[3]==='attachments'&&p[4]&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA']);
   await ensureBookingAttachmentsTable();
   const ref=decodeURIComponent(p[2]);
   const attachmentId=Number(p[4]);
   if(!Number.isFinite(attachmentId)||attachmentId<=0)return json(400,{error:'Invalid attachment id'});
   const result=await query(`SELECT file_name,mime_type,content_base64 FROM booking_attachments WHERE booking_reference=$1 AND id=$2 LIMIT 1`,[ref,attachmentId]);
   const row=result.rows?.[0];
   if(!row)return json(404,{error:'Attachment not found'});
   const mimeType=clean(row.mime_type||'application/octet-stream',160);
   const fileName=clean(row.file_name||`attachment-${attachmentId}`,180);
   const binary=Buffer.from(String(row.content_base64||''),'base64');
   return {
    statusCode:200,
    isBase64Encoded:true,
    headers:{
     'Content-Type':mimeType,
     'Content-Disposition':`inline; filename="${fileName.replace(/"/g,'')}"`,
     'Cache-Control':'no-store'
    },
    body:binary.toString('base64')
   };
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING','QA']);
   const ref=decodeURIComponent(p[2]);
   const r=await query('SELECT * FROM bookings WHERE reference=$1 LIMIT 1',[ref]);
   if(!r.rows[0])return json(404,{error:'Booking not found'});
  const intake=await query(`SELECT id,submission_method,source_message_id,source_received_at,patient_name,referral_id,crm_reference,parse_source_method,parsed_payload,broker_quoted_rate,created_at,updated_at FROM broker_requests WHERE booking_reference=$1 ORDER BY created_at DESC LIMIT 1`,[ref]).catch(()=>({rows:[]}));
   const sourceAttachmentCount=await query('SELECT COUNT(*)::int AS count FROM booking_attachments WHERE booking_reference=$1',[ref]).catch(()=>({rows:[{count:0}]}));
   const intakeRow=intake.rows?.[0]||null;
   const intakeAudit=intakeRow?{
    requestId:intakeRow.id,
    submissionMethod:intakeRow.submission_method||null,
    sourceMessageId:intakeRow.source_message_id||null,
    sourceReceivedAt:intakeRow.source_received_at||null,
      patientName:intakeRow.patient_name||null,
      referralId:intakeRow.referral_id||null,
      crmReference:intakeRow.crm_reference||null,
      parseSourceMethod:intakeRow.parse_source_method||null,
      parsedPayload:intakeRow.parsed_payload||null,
      brokerQuotedRate:intakeRow.broker_quoted_rate!=null?Number(intakeRow.broker_quoted_rate):null,
    sourceAttachmentCount:Number(sourceAttachmentCount.rows?.[0]?.count||0),
    createdAt:intakeRow.created_at||null,
    updatedAt:intakeRow.updated_at||null
   }:null;
  const mappedBooking=mapBooking(r.rows[0]);
  if(intakeRow&&mappedBooking.brokerQuotedRate==null&&intakeRow.broker_quoted_rate!=null){
   mappedBooking.brokerQuotedRate=Number(intakeRow.broker_quoted_rate);
  }
  if(intakeRow&&!mappedBooking.pickupTime){
   const parsedPayload=intakeRow.parsed_payload&&typeof intakeRow.parsed_payload==='object'?intakeRow.parsed_payload:{};
   const intakePickupTime=normalizeOptionalTripTime(parsedPayload.pickup_time||'');
   if(intakePickupTime)mappedBooking.pickupTime=intakePickupTime;
  }
  return json(200,{booking:mappedBooking,intakeAudit});
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&method==='DELETE'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const ref=decodeURIComponent(p[2]);
   const current=await query('SELECT * FROM bookings WHERE reference=$1 LIMIT 1',[ref]);
   if(!current.rows[0])return json(404,{error:'Booking not found'});

   await query('DELETE FROM trip_status_history WHERE booking_reference=$1',[ref]).catch(()=>{});
   await query('DELETE FROM booking_attachments WHERE booking_reference=$1',[ref]).catch(()=>{});
   const deleted=await query('DELETE FROM bookings WHERE reference=$1 RETURNING *',[ref]);
   if(!deleted.rows[0])return json(404,{error:'Booking not found'});

   await audit('BOOKING',ref,'DELETED',{
    actor:u.display_name||u.email||u.role,
    role:u.role,
    previousStatus:current.rows[0].status||null,
    bookingSource:current.rows[0].booking_source||null
   });

   return json(200,{deleted:true,reference:ref});
  }
  if(p[0]==='admin'&&p[1]==='analytics'&&p[2]==='revenue'&&method==='GET'){
   const u=await requireUser(bearer(event),['ADMIN','EXECUTIVE','BILLING']);
   const {start,end,groupBy}=parseAnalyticsRange(event);
   const analytics=await getRevenueAnalytics(start,end,groupBy);
   await audit('REPORT','revenue-analytics','VIEWED',{start,end,groupBy,role:u.role});
   return json(200,analytics);
  }
  if(p[0]==='admin'&&p[1]==='analytics'&&p[2]==='revenue-export'&&method==='GET'){
   const u=await requireUser(bearer(event),['ADMIN','EXECUTIVE','BILLING']);
   const {start,end}=parseAnalyticsRange(event);
   const exportRows=await query(`
    SELECT
     reference,trip_date,trip_time,service,booking_source,status,payment_status,
     COALESCE(estimated_fare,0) AS estimated_fare,
     COALESCE(deposit_amount,0) AS deposit_amount,
     COALESCE(balance_due,0) AS balance_due,
     COALESCE(cancellation_fee_amount,0) AS cancellation_fee_amount,
     COALESCE(driver_name,'') AS driver_name,
     COALESCE(vehicle_unit,'') AS vehicle_unit
    FROM bookings
    WHERE trip_date >= $1 AND trip_date <= $2
    ORDER BY trip_date DESC, trip_time DESC, reference DESC
   `,[start,end]);
   await audit('REPORT','revenue-export','EXPORTED',{start,end,rowCount:exportRows.rowCount,role:u.role});
   return {statusCode:200,headers:{'Content-Type':'text/csv','Content-Disposition':`attachment; filename=revenue-export-${start}-to-${end}.csv`},body:toRevenueExportCsv(exportRows.rows)};
  }
  if(p[0]==='admin'&&p[1]==='analytics'&&p[2]==='cost'&&method==='GET'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const options=parseCostAnalyzerRange(event);
   const analytics=await getCostAnalyzerAnalytics(options);
   await audit('REPORT','cost-analyzer','VIEWED',{start:options.start,end:options.end,groupBy:options.groupBy,limit:options.limit,role:u.role});
   return json(200,analytics);
  }
  if(p[0]==='admin'&&p[1]==='analytics'&&p[2]==='cost-export'&&method==='GET'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const options=parseCostAnalyzerRange(event);
   const analytics=await getCostAnalyzerAnalytics(options);
   await audit('REPORT','cost-analyzer-export','EXPORTED',{start:options.start,end:options.end,rows:analytics.trips?.length||0,role:u.role});
   return {statusCode:200,headers:{'Content-Type':'text/csv','Content-Disposition':`attachment; filename=cost-analyzer-${options.start}-to-${options.end}.csv`},body:toCostAnalyzerCsv(analytics.trips||[])};
  }
  if(p[0]==='admin'&&p[1]==='analytics'&&p[2]==='cost-report'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const body=parseBody(event);
   const mergedQuery={queryStringParameters:{...(event.queryStringParameters||{}),...(body||{})}};
   const options=parseCostAnalyzerRange(mergedQuery);
   const analytics=await getCostAnalyzerAnalytics(options);
   const delivery=await sendCostAnalyzerReport(analytics,clean(u.display_name||u.email||'Admin'));
   await audit('REPORT','cost-analyzer-report','SENT',{start:options.start,end:options.end,emails:delivery.recipients?.length||0,role:u.role});
   return json(200,{analytics:{period:analytics.period,summary:analytics.summary,assumptions:analytics.assumptions},delivery});
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&method==='PATCH'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER','DRIVER']);
   const b=parseBody(event),ref=decodeURIComponent(p[2]);
   const before=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);
   if(!before.rows[0])return json(404,{error:'Booking not found'});

   // DRIVER role: only allowed to update trip status.
   if(u.role==='DRIVER'){
    const forbidden=['driverName','vehicleUnit','estimatedFare','pickup','destination','pickupLocation','destinationLocation','pickup_location','dropoff_location','date','time','service','name','phone','email','submitterEntity','bookingSource','brokerCompanyName','brokerAcceptedRate','checkInTime'];
    if(forbidden.some((key)=>Object.prototype.hasOwnProperty.call(b,key)))return json(403,{error:'Drivers may only update trip status'});
   }

   const hasEstimatedFare=Object.prototype.hasOwnProperty.call(b,'estimatedFare');
   const estimatedFareRaw=hasEstimatedFare?Number(b.estimatedFare):null;
   if(hasEstimatedFare&&!Number.isFinite(estimatedFareRaw))return json(400,{error:'estimatedFare must be a valid number'});
   if(hasEstimatedFare&&estimatedFareRaw<0)return json(400,{error:'estimatedFare must be 0 or greater'});
   if(hasEstimatedFare&&u.role!=='ADMIN')return json(403,{error:'Only Admin can adjust fares'});

   const statusValue=b.status?String(b.status).toUpperCase().replaceAll('-','_'):null;
   const hasService=Object.prototype.hasOwnProperty.call(b,'service');
   const hasPickup=Object.prototype.hasOwnProperty.call(b,'pickup');
   const hasDestination=Object.prototype.hasOwnProperty.call(b,'destination');
  const hasPickupLocation=Object.prototype.hasOwnProperty.call(b,'pickupLocation')||Object.prototype.hasOwnProperty.call(b,'pickup_location');
  const hasDestinationLocation=Object.prototype.hasOwnProperty.call(b,'destinationLocation')||Object.prototype.hasOwnProperty.call(b,'dropoff_location');
   const hasDate=Object.prototype.hasOwnProperty.call(b,'date');
   const hasTime=Object.prototype.hasOwnProperty.call(b,'time');
  const hasDriverName=Object.prototype.hasOwnProperty.call(b,'driverName');
  const hasVehicleUnit=Object.prototype.hasOwnProperty.call(b,'vehicleUnit');
  const hasNotes=Object.prototype.hasOwnProperty.call(b,'notes');
  const hasDispatchNote=Object.prototype.hasOwnProperty.call(b,'dispatchNote')||Object.prototype.hasOwnProperty.call(b,'note');
   const hasName=Object.prototype.hasOwnProperty.call(b,'name');
   const hasPhone=Object.prototype.hasOwnProperty.call(b,'phone');
   const hasEmail=Object.prototype.hasOwnProperty.call(b,'email');
  const hasAppointmentTime=Object.prototype.hasOwnProperty.call(b,'appointmentTime');
  const appointmentTimeValue=hasAppointmentTime?normalizeOptionalTripTime(b.appointmentTime):'';
  if(hasAppointmentTime&&!appointmentTimeValue)return json(400,{error:'appointmentTime must be a valid time (for example 2:00 PM).'});
  const hasPickupTime=Object.prototype.hasOwnProperty.call(b,'pickupTime')||Object.prototype.hasOwnProperty.call(b,'pickup_time');
  const pickupTimeInput=Object.prototype.hasOwnProperty.call(b,'pickupTime')?b.pickupTime:b.pickup_time;
  let pickupTimeValue=null;
  if(hasPickupTime){
   const raw=clean(pickupTimeInput);
   if(raw==='')pickupTimeValue=null;
   else{
    const normalized=normalizeOptionalTripTime(pickupTimeInput);
    if(!normalized)return json(400,{error:'pickupTime must be a valid time (for example 1:45 PM).'});
    pickupTimeValue=normalized;
   }
  }
  const proposedTripTime=hasTime?normalizeOptionalTripTime(b.time):'';
  const hasCheckInTime=Object.prototype.hasOwnProperty.call(b,'checkInTime');
  const checkInTimeValue=hasCheckInTime?normalizeOptionalTripTime(b.checkInTime):'';
  if(hasCheckInTime&&!checkInTimeValue)return json(400,{error:'checkInTime must be a valid time (for example 12:00 PM).'});
  const existingAppointmentTime=getSubmittedAppointmentTime(before.rows[0]);
  const effectiveAppointmentTime=appointmentTimeValue||(!existingAppointmentTime?proposedTripTime:'');
  if(!existingAppointmentTime&&!effectiveAppointmentTime)return json(409,{error:'Appointment time must be entered by the submitter before further actions can proceed. Enter appointment time and save first.'});
  const hasBookingSource=Object.prototype.hasOwnProperty.call(b,'bookingSource')||Object.prototype.hasOwnProperty.call(b,'booking_source');
  const hasSubmitterEntity=Object.prototype.hasOwnProperty.call(b,'submitterEntity')||Object.prototype.hasOwnProperty.call(b,'submitter_entity');
  const hasBrokerCompanyName=Object.prototype.hasOwnProperty.call(b,'brokerCompanyName')||Object.prototype.hasOwnProperty.call(b,'broker_company_name');
  const hasBrokerAcceptedRate=Object.prototype.hasOwnProperty.call(b,'brokerAcceptedRate')||Object.prototype.hasOwnProperty.call(b,'broker_accepted_rate');
  const hasBrokerQuotedRate=Object.prototype.hasOwnProperty.call(b,'brokerQuotedRate')||Object.prototype.hasOwnProperty.call(b,'broker_quoted_rate');
  const bookingSourceInput=Object.prototype.hasOwnProperty.call(b,'bookingSource')?b.bookingSource:b.booking_source;
  const submitterEntityInput=Object.prototype.hasOwnProperty.call(b,'submitterEntity')?b.submitterEntity:b.submitter_entity;
  const brokerCompanyNameInput=Object.prototype.hasOwnProperty.call(b,'brokerCompanyName')?b.brokerCompanyName:b.broker_company_name;
  const brokerAcceptedRateInput=Object.prototype.hasOwnProperty.call(b,'brokerAcceptedRate')?b.brokerAcceptedRate:b.broker_accepted_rate;
  const brokerQuotedRateInput=Object.prototype.hasOwnProperty.call(b,'brokerQuotedRate')?b.brokerQuotedRate:b.broker_quoted_rate;
  const bookingSourceValue=hasBookingSource?normalizeBookingSource(bookingSourceInput):null;
  let brokerAcceptedRateValue=null;
  if(hasBrokerAcceptedRate){
   const raw=clean(brokerAcceptedRateInput);
   if(raw==='')brokerAcceptedRateValue=null;
   else{
    const parsed=Number(brokerAcceptedRateInput);
    if(!Number.isFinite(parsed)||parsed<0)return json(400,{error:'brokerAcceptedRate must be a valid number >= 0'});
    brokerAcceptedRateValue=parsed;
   }
  }
  let brokerQuotedRateValue=null;
  if(hasBrokerQuotedRate){
   const raw=clean(brokerQuotedRateInput);
   if(raw==='')brokerQuotedRateValue=null;
   else{
    const parsed=Number(brokerQuotedRateInput);
    if(!Number.isFinite(parsed)||parsed<0)return json(400,{error:'brokerQuotedRate must be a valid number >= 0'});
    brokerQuotedRateValue=parsed;
   }
  }

  const notesBase=hasNotes?clean(b.notes)||null:before.rows[0].notes;
  const notesWithAppointment=(hasAppointmentTime||(!existingAppointmentTime&&proposedTripTime))?upsertAppointmentNote(notesBase,effectiveAppointmentTime):notesBase;
  const notesValue=hasCheckInTime?upsertCheckInNote(notesWithAppointment,checkInTimeValue):notesWithAppointment;

   const r=await query(`
    UPDATE bookings
    SET status=COALESCE($2,status),
        driver_name=COALESCE($3,driver_name),
        vehicle_unit=COALESCE($4,vehicle_unit),
        estimated_fare=CASE WHEN $5 THEN $6 ELSE estimated_fare END,
        service=CASE WHEN $7 THEN $8 ELSE service END,
        pickup=CASE WHEN $9 THEN $10 ELSE pickup END,
      pickup_location=CASE WHEN $11 THEN $12 ELSE pickup_location END,
      destination=CASE WHEN $13 THEN $14 ELSE destination END,
      dropoff_location=CASE WHEN $15 THEN $16 ELSE dropoff_location END,
      trip_date=CASE WHEN $17 THEN $18 ELSE trip_date END,
      trip_time=CASE WHEN $19 THEN $20 ELSE trip_time END,
      notes=CASE WHEN $21 THEN $22 ELSE notes END,
      name=CASE WHEN $23 THEN $24 ELSE name END,
      phone=CASE WHEN $25 THEN $26 ELSE phone END,
      email=CASE WHEN $27 THEN $28 ELSE email END,
      booking_source=CASE WHEN $29 THEN $30 ELSE booking_source END,
      submitter_entity=CASE WHEN $31 THEN $32 ELSE submitter_entity END,
      broker_company_name=CASE WHEN $33 THEN $34 ELSE broker_company_name END,
      broker_accepted_rate=CASE WHEN $35 THEN $36 ELSE broker_accepted_rate END,
        updated_at=now()
    WHERE reference=$1
    RETURNING *`,[
      ref,
      statusValue,
      b.driverName||null,
      b.vehicleUnit||null,
      hasEstimatedFare,
      hasEstimatedFare?estimatedFareRaw:null,
      hasService,
      hasService?clean(b.service)||before.rows[0].service:null,
      hasPickup,
      hasPickup?clean(b.pickup)||before.rows[0].pickup:null,
      hasPickupLocation,
      hasPickupLocation?clean(b.pickupLocation||b.pickup_location)||before.rows[0].pickup_location:null,
      hasDestination,
      hasDestination?clean(b.destination)||before.rows[0].destination:null,
      hasDestinationLocation,
      hasDestinationLocation?clean(b.destinationLocation||b.dropoff_location)||before.rows[0].dropoff_location:null,
      hasDate,
      hasDate?clean(b.date)||before.rows[0].trip_date:null,
      hasTime,
      hasTime?clean(b.time)||before.rows[0].trip_time:null,
      hasNotes||hasAppointmentTime||hasCheckInTime,
      hasNotes||hasAppointmentTime||hasCheckInTime?notesValue:null,
      hasName,
      hasName?clean(b.name)||before.rows[0].name:null,
      hasPhone,
      hasPhone?clean(b.phone)||before.rows[0].phone:null,
      hasEmail,
      hasEmail?clean(b.email)||before.rows[0].email:null,
      hasBookingSource,
      hasBookingSource?bookingSourceValue:null,
      hasSubmitterEntity,
      hasSubmitterEntity?clean(submitterEntityInput)||null:null,
      hasBrokerCompanyName,
      hasBrokerCompanyName?clean(brokerCompanyNameInput)||null:null,
      hasBrokerAcceptedRate,
      hasBrokerAcceptedRate?brokerAcceptedRateValue:null
    ]);

  if(!r.rows[0])return json(404,{error:'Booking not found'});

  if(hasPickupTime){
    await query('UPDATE bookings SET pickup_time=$2::time,updated_at=now() WHERE reference=$1',[ref,pickupTimeValue]).catch(()=>{});
    if(pickupTimeValue){
      await query(`UPDATE broker_requests SET
        parsed_payload=jsonb_set(COALESCE(parsed_payload,'{}'::jsonb),'{pickup_time}',to_jsonb($2::text),true),
        updated_at=now()
        WHERE id=(SELECT id FROM broker_requests WHERE booking_reference=$1 ORDER BY created_at DESC LIMIT 1)`,[ref,pickupTimeValue]).catch(()=>{});
    }else{
      await query(`UPDATE broker_requests SET
        parsed_payload=COALESCE(parsed_payload,'{}'::jsonb)-'pickup_time',
        updated_at=now()
        WHERE id=(SELECT id FROM broker_requests WHERE booking_reference=$1 ORDER BY created_at DESC LIMIT 1)`,[ref]).catch(()=>{});
    }
  }
  const afterRow=hasPickupTime?(await query('SELECT * FROM bookings WHERE reference=$1 LIMIT 1',[ref])).rows?.[0]||r.rows[0]:r.rows[0];

  if(hasBrokerQuotedRate){
   await query(`UPDATE broker_requests SET broker_quoted_rate=$2,updated_at=now() WHERE id=(SELECT id FROM broker_requests WHERE booking_reference=$1 ORDER BY created_at DESC LIMIT 1)`,[ref,brokerQuotedRateValue]).catch(()=>{});
    await query('UPDATE bookings SET broker_quoted_rate=$2,updated_at=now() WHERE reference=$1',[ref,brokerQuotedRateValue]).catch(()=>{});
  }

  const shouldResetReminders=hasDate||hasTime||hasPickupTime||hasPickup||hasDestination||hasDriverName||hasVehicleUnit;
   if(shouldResetReminders){
    await query(`
      UPDATE bookings
      SET reminder_sent=false,
          notification_status=(COALESCE(notification_status,'{}')::jsonb - 'driverReminder2h'),
          updated_at=now()
      WHERE reference=$1
    `,[ref]).catch(()=>{});
   }

  const noteValue=clean((hasDispatchNote?(b.dispatchNote||b.note):b.note) || '')||null;
  const fieldHistoryEntries=collectBookingFieldHistoryEntries(before.rows[0],afterRow);
  if(fieldHistoryEntries.length){
   for(const historyNote of fieldHistoryEntries){
    await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,afterRow.status,statusLabel(afterRow.status),historyNote,u.display_name]);
   }
   const summary=`Updated fields: ${fieldHistoryEntries.map((entry)=>entry.split(' changed:')[0]).join(', ')}`;
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,afterRow.status,statusLabel(afterRow.status),summary,u.display_name]);
  }
  if(noteValue){
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,afterRow.status,statusLabel(afterRow.status),`Dispatch note: ${noteValue}`,u.display_name]);
  }
   await audit('BOOKING',ref,'UPDATED',{
    status:afterRow.status,
    estimatedFare:hasEstimatedFare?estimatedFareRaw:undefined,
    pickup:hasPickup?clean(b.pickup):undefined,
    destination:hasDestination?clean(b.destination):undefined,
    date:hasDate?clean(b.date):undefined,
    time:hasTime?clean(b.time):undefined,
    pickupTime:hasPickupTime?pickupTimeValue:undefined,
    driverName:b.driverName||undefined,
    vehicleUnit:b.vehicleUnit||undefined,
    bookingSource:hasBookingSource?bookingSourceValue:undefined,
    appointmentTime:(hasAppointmentTime||(!existingAppointmentTime&&proposedTripTime))?effectiveAppointmentTime:undefined,
    checkInTime:hasCheckInTime?checkInTimeValue:undefined,
    submitterEntity:hasSubmitterEntity?clean(submitterEntityInput):undefined,
    brokerCompanyName:hasBrokerCompanyName?clean(brokerCompanyNameInput):undefined,
    brokerAcceptedRate:hasBrokerAcceptedRate?brokerAcceptedRateValue:undefined,
    by:u.role
   });

  const notifications=await sendTripStakeholderUpdate(before.rows[0],afterRow,u,noteValue||'').catch(()=>({status:'failed'}));
  return json(200,{booking:mapBooking(afterRow),notifications});
  }
  if(p[0]==='admin'&&p[1]==='bookings'&&p[2]&&p[3]==='advance'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);const ref=decodeURIComponent(p[2]);const current=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);if(!current.rows[0])return json(404,{error:'Booking not found'});const currentStatus=String(current.rows[0].status||'').toUpperCase();const next=STATUS_FLOW[currentStatus]||currentStatus;
    const submittedAppointment=getSubmittedAppointmentTime(current.rows[0]);
    if(!submittedAppointment)return json(409,{error:'Appointment time is required before advancing this trip. The submitter must provide appointment time first.',booking:mapBooking(current.rows[0])});
   if(!next||next===currentStatus)return json(409,{error:'Trip is already at the furthest workflow step for manual advance.',booking:mapBooking(current.rows[0])});
  const driverAvailabilitySql=typeof buildDriverAvailabilitySql==='function'
   ? buildDriverAvailabilitySql()
   : `SELECT COUNT(DISTINCT e.id) AS available
      FROM employees e
      INNER JOIN employee_shifts es ON e.id=es.employee_id
      LEFT JOIN users u ON e.user_id=u.id
      WHERE e.role='DRIVER' AND e.active=true AND es.active=true
        AND es.weekday_iso=$1
        AND es.start_time::time<=$2::time AND es.end_time::time>$2::time
        AND es.effective_start_date<=$3::date
        AND (es.effective_end_date IS NULL OR es.effective_end_date>=$3::date)`;
   const bookingDate=clean(current.rows[0].trip_date)||new Date().toISOString().slice(0,10);
   const bookingTimeRaw=clean(current.rows[0].trip_time||current.rows[0].time||'08:00');
   const bookingTime=/^\d{2}:\d{2}/.test(bookingTimeRaw)?bookingTimeRaw.slice(0,5):'08:00';
   const bookingWeekday=new Date(`${bookingDate}T12:00:00`).getDay()||7;
  const availabilityCheck=await query(driverAvailabilitySql,[bookingWeekday,bookingTime,bookingDate]);
   const vehicleCheck=await query(`SELECT COUNT(*) as vehicle_count FROM vehicles WHERE active=true AND status='AVAILABLE'`,[]);
   const driversAvailable=Number(availabilityCheck.rows[0]?.driver_count ?? availabilityCheck.rows[0]?.available ?? 0);
   const vehiclesAvailable=Number(vehicleCheck.rows[0]?.vehicle_count||0);
   const availability={available:driversAvailable>0&&vehiclesAvailable>0,drivers:{available:driversAvailable},vehicles:{available:vehiclesAvailable}};
   const approval=canAdvanceBookingForAvailability({currentStatus:current.rows[0].status,nextStatus:next,availability});
   if(!approval.allowed){return json(409,{error:approval.message,approval,booking:mapBooking(current.rows[0])});}
  const r=await query('UPDATE bookings SET status=$2,updated_at=now() WHERE reference=$1 RETURNING *',[ref,next]);await query('INSERT INTO trip_status_history(booking_reference,status,status_label,actor) VALUES($1,$2,$3,$4)',[ref,next,statusLabel(next),u.display_name||u.email||u.role]);await audit('BOOKING',ref,'STATUS_ADVANCED',{from:current.rows[0].status,to:next});
  if(next==='COMPLETED')await issueFacilityCompletionInvoice(r.rows[0]).catch(err=>console.error('[FACILITY_INVOICE]',err.message));
  const advanceNote=`Status advanced from ${statusLabel(current.rows[0].status)} to ${statusLabel(next)} by ${u.display_name||u.email||u.role}.`;
  const advanceNotifications=await sendTripStakeholderUpdate(current.rows[0],r.rows[0],u,advanceNote).catch(()=>({status:'failed'}));
   // When driver is en route and customer only paid a deposit, send the balance-due reminder
   if(next==='EN_ROUTE'&&current.rows[0].payment_status==='DEPOSIT_PAID'&&!current.rows[0].balance_reminder_sent_at){
    const bk=mapBooking(r.rows[0]);
    await sendBalanceDueReminder(bk,current.rows[0].balance_due).catch(e=>console.error('[BALANCE_REMINDER]',e.message));
    await query('UPDATE bookings SET payment_status=$2,balance_reminder_sent_at=now(),updated_at=now() WHERE reference=$1',[ref,'BALANCE_REMINDER_SENT']);
   }
  return json(200,{booking:mapBooking(r.rows[0]),approval,notifications:advanceNotifications});
  }
  if(p[0]==='fleet'&&p[1]==='live'&&method==='GET'){
    let u=null;try{if(bearer(event))u=await requireUser(bearer(event))}catch{}
    const includeAll=String(event.queryStringParameters?.includeAll||'').toLowerCase()==='true';
    const whereClause=includeAll?'':' WHERE last_seen_at IS NULL OR last_seen_at>now()-interval \'24 hours\'';
    const sqlVariants=[
     `SELECT unit_number,vehicle_type,status,latitude,longitude,heading,speed_mph,last_seen_at,driver_scope_id,active,metadata FROM vehicles${whereClause} ORDER BY unit_number`,
     `SELECT unit_number,vehicle_type,status,latitude,longitude,heading,speed_mph,last_seen_at,driver_scope_id,active FROM vehicles${whereClause} ORDER BY unit_number`,
     `SELECT unit_number,vehicle_type,status,latitude,longitude,heading,speed_mph,last_seen_at,driver_scope_id FROM vehicles${whereClause} ORDER BY unit_number`,
      `SELECT unit_number,vehicle_type,status,latitude,longitude,last_seen_at FROM vehicles${whereClause} ORDER BY unit_number`,
      `SELECT unit_number,vehicle_type,status,lat AS latitude,lng AS longitude,heading,speed_mph,last_seen_at,driver_scope_id,active,metadata FROM vehicles${whereClause} ORDER BY unit_number`,
      `SELECT unit_number,vehicle_type,status,lat AS latitude,lng AS longitude,heading,speed_mph,last_seen_at,driver_scope_id,active FROM vehicles${whereClause} ORDER BY unit_number`,
      `SELECT unit_number,vehicle_type,status,lat AS latitude,lng AS longitude,last_seen_at FROM vehicles${whereClause} ORDER BY unit_number`,
      `SELECT unit_number,vehicle_type,status,lat AS latitude,lng AS longitude,last_seen AS last_seen_at FROM vehicles ORDER BY unit_number`,
      `SELECT unit_number,vehicle_type,status FROM vehicles ORDER BY unit_number`
    ];
    let r=null;
    for(const sql of sqlVariants){
     try{r=await query(sql);break;}catch{}
    }
    if(!r) throw Object.assign(new Error('Fleet records unavailable for current schema'),{statusCode:500});
    return json(200,{generatedAt:new Date().toISOString(),role:u?.role||'PUBLIC',includeAll,vehicles:r.rows.map(v=>({id:v.unit_number,unit:v.unit_number,type:v.vehicle_type,status:v.status,lat:Number(v.latitude),lng:Number(v.longitude),heading:Number(v.heading||0),speed:Number(v.speed_mph||0),lastSeen:v.last_seen_at,driverScopeId:v.driver_scope_id||null,active:v.active!==false,metadata:v.metadata||{}}))});
  }
  // Auto-assign: find best available driver + vehicle for a booking
  if(p[0]==='dispatch'&&p[1]==='auto-assign'&&method==='POST'){
   await requireUser(bearer(event),['DISPATCHER','ADMIN']);
   const b=parseBody(event);
   const ref=clean(b.bookingReference);
   if(!ref)return json(400,{error:'bookingReference required'});
   const booking=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);
   if(!booking.rows[0])return json(404,{error:'Booking not found'});
   const result=await autoAssign(booking.rows[0]);
   return json(result.assigned?200:409,result);
  }
  if(p[0]==='dispatch'&&p[1]==='drivers'&&method==='GET'){
   let user=null;try{if(bearer(event))user=await requireUser(bearer(event),['DISPATCHER','ADMIN']);}catch{};
     const now=new Date();
     const todayIso=now.toISOString().slice(0,10);
     const nowTime=now.toTimeString().slice(0,5); // HH:MM
     const includeAll=String(event.queryStringParameters?.includeAll||'').toLowerCase()==='true';
     const requestedDateRaw=clean(event.queryStringParameters?.date||todayIso);
     const requestedTimeRaw=clean(event.queryStringParameters?.time||nowTime);
     const requestedDate=/^\d{4}-\d{2}-\d{2}$/.test(requestedDateRaw)?requestedDateRaw:todayIso;
     const requestedTime=/^\d{2}:\d{2}/.test(requestedTimeRaw)?requestedTimeRaw.slice(0,5):nowTime;
     const weekday=new Date(`${requestedDate}T12:00:00`).getDay()||7; // ISO weekday: Mon=1 … Sun=7
     const driverRows=await query(`
      SELECT e.id, e.display_name AS name, e.email, e.phone, e.active,
        u.scope_id,
        v.unit_number AS vehicle_unit, v.vehicle_type, v.status AS vehicle_status
      FROM employees e
      LEFT JOIN users u ON e.user_id=u.id
      LEFT JOIN vehicles v ON v.driver_scope_id=u.scope_id
      WHERE e.role='DRIVER'
      ORDER BY e.active DESC, e.display_name
     `);
     const activeShiftRows=await query(`
      SELECT employee_id, weekday_iso, start_time::text AS start_time, end_time::text AS end_time,
        effective_start_date, effective_end_date
      FROM employee_shifts
      WHERE assignment_role='DRIVER' AND active=true
        AND weekday_iso=$1
        AND start_time::time<=$2::time AND end_time::time>$2::time
        AND effective_start_date<=$3::date
        AND (effective_end_date IS NULL OR effective_end_date>=$3::date)
     `,[weekday,requestedTime,requestedDate]);
     const scheduleRows=await query(`
      SELECT employee_id, weekday_iso, start_time::text AS start_time, end_time::text AS end_time,
        effective_start_date, effective_end_date, active
      FROM employee_shifts
      WHERE assignment_role='DRIVER' AND active=true
        AND effective_start_date<=$1::date + interval '31 day'
        AND (effective_end_date IS NULL OR effective_end_date>=$1::date)
      ORDER BY weekday_iso, start_time
     `,[requestedDate]);
     // Trip counts for requested day
   const tripCounts=await query(`
    SELECT driver_name, COUNT(*) as total,
           COUNT(*) FILTER (WHERE status IN ('assigned','en-route','arrived','in-transit')) as active
    FROM bookings
    WHERE trip_date=$1 AND driver_name IS NOT NULL
    GROUP BY driver_name
     `,[requestedDate]);
   const countMap=Object.fromEntries(tripCounts.rows.map(r=>[r.driver_name,{total:Number(r.total),active:Number(r.active)}]));
     const onShiftMap=new Map((activeShiftRows.rows||[]).map((row)=>[String(row.employee_id),row]));
     const scheduleMap=new Map();
     for(const row of scheduleRows.rows||[]){
      const key=String(row.employee_id);
      if(!scheduleMap.has(key)) scheduleMap.set(key,[]);
      scheduleMap.get(key).push({
        weekdayIso:Number(row.weekday_iso),
        startTime:String(row.start_time||'').slice(0,5),
        endTime:String(row.end_time||'').slice(0,5),
        effectiveStartDate:row.effective_start_date,
        effectiveEndDate:row.effective_end_date,
        active:row.active!==false
      });
     }
     const allDrivers=(driverRows.rows||[]).map((d)=>{
      const key=String(d.id);
      const shift=onShiftMap.get(key)||null;
      const tripsTotal=countMap[d.name]?.total||0;
      const activeTrips=countMap[d.name]?.active||0;
      const onDuty=Boolean(shift);
      const status=activeTrips>0?'ON_TRIP':(onDuty?'ON_DUTY':'OFF_DUTY');
      return {
        id:d.id,
        name:d.name,
        email:d.email||null,
        phone:d.phone||null,
        scopeId:d.scope_id,
        active:d.active===true,
        shiftStart:shift?String(shift.start_time||'').slice(0,5):null,
        shiftEnd:shift?String(shift.end_time||'').slice(0,5):null,
        vehicleUnit:d.vehicle_unit||null,
        vehicleType:d.vehicle_type||null,
        vehicleStatus:d.vehicle_status||null,
        tripsOnDate:tripsTotal,
        activeTrips,
        onDuty,
        status,
        schedule:scheduleMap.get(key)||[]
      };
     });
     const drivers=includeAll?allDrivers:allDrivers.filter((d)=>d.onDuty||d.activeTrips>0);
     const onDutyCount=allDrivers.filter((d)=>d.onDuty).length;
     const onTripCount=allDrivers.filter((d)=>d.activeTrips>0).length;
     const offDutyCount=allDrivers.filter((d)=>!d.onDuty).length;
     return json(200,{generatedAt:now.toISOString(),targetDate:requestedDate,targetTime:requestedTime,includeAll,onDuty:onDutyCount,onTrip:onTripCount,offDuty:offDutyCount,totalDrivers:allDrivers.length,drivers});
  }
    if(p[0]==='admin'&&p[1]==='driver-schedule'&&method==='GET'){
     await requireUser(bearer(event),['ADMIN','DISPATCHER']);
     const driverEmail=clean(event.queryStringParameters?.driverEmail||'').toLowerCase();
     const activeOnly=String(event.queryStringParameters?.activeOnly||'true').toLowerCase()!=='false';
     const limit=Math.min(Math.max(Number(event.queryStringParameters?.limit)||100,1),500);
     const params=[];
     const where=[];
     if(driverEmail){
      params.push(driverEmail);
      where.push(`lower(e.email)=lower($${params.length})`);
     }
     if(activeOnly){
      where.push(`es.active=true`);
      where.push(`(es.effective_end_date IS NULL OR es.effective_end_date>=CURRENT_DATE)`);
     }
     const sql=`
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.display_name,
        e.email,
        e.role,
        es.id AS shift_id,
        es.assignment_role,
        es.weekday_iso,
        es.start_time::text AS start_time,
        es.end_time::text AS end_time,
        es.effective_start_date,
        es.effective_end_date,
        es.active,
        es.notes,
        es.updated_at
      FROM employees e
      INNER JOIN employee_shifts es ON es.employee_id=e.id
      ${where.length?`WHERE ${where.join(' AND ')}`:''}
      ORDER BY e.display_name, es.weekday_iso, es.start_time
      LIMIT ${limit}
     `;
     const r=await query(sql,params);
     return json(200,{schedules:r.rows});
    }
  if(p[0]==='admin'&&p[1]==='driver-schedule'&&method==='POST'){
   await requireUser(bearer(event),['ADMIN']);
   const b=parseBody(event);
   const driverEmail=clean(b.driverEmail).toLowerCase();
   const startTimeRaw=clean(b.startTime||'06:00');
   const endTimeRaw=clean(b.endTime||'15:00');
   const effectiveStartDate=clean(b.effectiveStartDate)||new Date().toISOString().slice(0,10);
   const weekdaysInput=Array.isArray(b.weekdays)?b.weekdays:[1,2,3,4,5];
   const weekdays=Array.from(new Set(weekdaysInput.map((x)=>Number(x)).filter((x)=>Number.isInteger(x)&&x>=1&&x<=7))).sort((a,b)=>a-b);
   if(!driverEmail)return json(400,{error:'driverEmail is required'});
   if(!/^\d{2}:\d{2}$/.test(startTimeRaw)||!/^\d{2}:\d{2}$/.test(endTimeRaw))return json(400,{error:'startTime and endTime must be HH:MM'});
   if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStartDate))return json(400,{error:'effectiveStartDate must be YYYY-MM-DD'});
   if(!weekdays.length)return json(400,{error:'At least one weekday is required (1=Mon ... 7=Sun)'});

   const userRes=await query('SELECT id,email,display_name,role,phone FROM users WHERE lower(email)=lower($1) LIMIT 1',[driverEmail]);
   const driverUser=userRes.rows[0];
   if(!driverUser)return json(404,{error:'Driver user not found'});
   if(String(driverUser.role||'').toUpperCase()!=='DRIVER')return json(409,{error:'Selected user is not a DRIVER role'});

   const employeeRes=await query('SELECT id,employee_code FROM employees WHERE user_id=$1 OR lower(email)=lower($2) ORDER BY created_at ASC LIMIT 1',[driverUser.id,driverEmail]).catch(()=>({rows:[]}));
   let employeeId=employeeRes.rows[0]?.id||null;
   let employeeCode=employeeRes.rows[0]?.employee_code||null;

   if(!employeeId){
    const codeBase='NEXD';
    for(let i=0;i<20;i++){
     const suffix=String(Math.floor(Math.random()*10000)).padStart(4,'0');
     const candidate=`${codeBase}${suffix}`;
     try{
      const inserted=await query(
       `INSERT INTO employees(user_id,employee_code,role,display_name,email,phone,active,timezone,metadata,created_at,updated_at)
        VALUES($1,$2,'DRIVER',$3,$4,$5,true,'America/New_York',jsonb_build_object('source','admin_driver_schedule_api'),now(),now())
        RETURNING id,employee_code`,
       [driverUser.id,candidate,clean(driverUser.display_name)||driverEmail,driverEmail,clean(driverUser.phone)||null]
      );
      employeeId=inserted.rows[0]?.id||null;
      employeeCode=inserted.rows[0]?.employee_code||candidate;
      break;
     }catch(err){
      const msg=String(err?.message||'').toLowerCase();
      if(!msg.includes('employee_code'))throw err;
     }
    }
   }
   if(!employeeId)return json(500,{error:'Unable to create or resolve employee profile for this driver'});

   await query(
    `UPDATE employee_shifts
     SET active=false,
         effective_end_date=COALESCE(effective_end_date,($2::date-INTERVAL '1 day')::date),
         updated_at=now()
     WHERE employee_id=$1
       AND assignment_role='DRIVER'
       AND weekday_iso=ANY($3::int[])
       AND active=true
       AND (effective_end_date IS NULL OR effective_end_date>=$2::date)`,
    [employeeId,effectiveStartDate,weekdays]
   ).catch(()=>{});

   const created=[];
   for(const weekday of weekdays){
    const shift=await query(
     `INSERT INTO employee_shifts(employee_id,assignment_role,weekday_iso,start_time,end_time,effective_start_date,effective_end_date,active,notes,created_at,updated_at)
      VALUES($1,'DRIVER',$2,$3::time,$4::time,$5::date,NULL,true,$6,now(),now())
      ON CONFLICT (employee_id, assignment_role, weekday_iso, start_time, end_time, effective_start_date)
      DO UPDATE SET active=true,effective_end_date=NULL,notes=EXCLUDED.notes,updated_at=now()
      RETURNING id,weekday_iso,start_time::text AS start_time,end_time::text AS end_time,effective_start_date`,
     [employeeId,weekday,startTimeRaw,endTimeRaw,effectiveStartDate,`Set by admin schedule API on ${new Date().toISOString()}`]
    );
    if(shift.rows[0])created.push(shift.rows[0]);
   }

   await audit('USER',String(driverUser.id),'SCHEDULE_UPDATED',{email:driverEmail,weekdayIso:weekdays,startTime:startTimeRaw,endTime:endTimeRaw,effectiveStartDate});
   return json(200,{ok:true,driver:{userId:String(driverUser.id),email:driverUser.email,name:driverUser.display_name,employeeId:String(employeeId),employeeCode:employeeCode||null},schedule:{assignmentRole:'DRIVER',weekdayIso:weekdays,startTime:startTimeRaw,endTime:endTimeRaw,effectiveStartDate,created}});
  }
  // Admin: reset all test credentials (idempotent upsert for all standard roles)
  if(p[0]==='admin'&&p[1]==='reset-credentials'&&method==='POST'){
   await requireUser(bearer(event),['ADMIN']);
   const orgRow=await query("SELECT organization_id FROM users WHERE role='ADMIN' LIMIT 1");
   const orgId=orgRow.rows[0]?.organization_id||null;
   const result=await ensureDefaultTestUsers(query,{organizationId:orgId});
   await audit('USER','system','CREDENTIALS_RESET',{count:result.results.length});
   return json(200,{ok:true,results:result.results,created:result.created,updated:result.updated,message:`${result.results.length} accounts reset. All credentials restored.`});
  }
  // Admin: list users
  if(p[0]==='admin'&&p[1]==='role-requests'&&method==='GET'){
   await ensureMultiRoleSchema();
   await requireUser(bearer(event),['ADMIN']);
   const result=await query(`SELECT rr.id,rr.role,rr.status,rr.requested_at,rr.reviewed_at,rr.scope_id,u.id AS user_id,u.email,u.display_name,u.phone
     FROM user_role_requests rr JOIN users u ON u.id=rr.user_id
     WHERE rr.role<>'PATIENT' ORDER BY CASE rr.status WHEN 'PENDING' THEN 0 ELSE 1 END,rr.requested_at DESC LIMIT 250`);
   return json(200,{requests:result.rows.map(row=>({id:row.id,userId:row.user_id,email:row.email,name:row.display_name,phone:row.phone,role:row.role,status:row.status,scopeId:row.scope_id,requestedAt:row.requested_at,reviewedAt:row.reviewed_at}))});
  }
  if(p[0]==='admin'&&p[1]==='role-requests'&&p[2]&&method==='POST'){
   await ensureMultiRoleSchema();
   const me=await requireUser(bearer(event),['ADMIN']),requestId=decodeURIComponent(p[2]),b=parseBody(event),decision=String(b.decision||'').toUpperCase();
   if(!['APPROVED','REJECTED'].includes(decision))return json(400,{error:'Decision must be APPROVED or REJECTED'});
   const found=await query(`SELECT rr.*,u.email FROM user_role_requests rr JOIN users u ON u.id=rr.user_id WHERE rr.id=$1 LIMIT 1`,[requestId]);
   const request=found.rows[0];if(!request)return json(404,{error:'Role request not found'});
   const scopeId=clean(b.scopeId)||request.scope_id||null;
   if(decision==='APPROVED'&&['DRIVER','FACILITY'].includes(request.role)&&!scopeId)return json(400,{error:`${request.role} approval requires a driver or facility scope ID`});
   const updated=await query(`UPDATE user_role_requests SET status=$2,scope_id=$3,reviewed_at=now(),reviewed_by=$4,notes=$5 WHERE id=$1 RETURNING *`,[requestId,decision,scopeId,me.id,clean(b.notes)||null]);
   await audit('USER_ROLE',requestId,decision,{userId:request.user_id,email:request.email,role:request.role,scopeId,by:me.email});
   return json(200,{request:updated.rows[0]});
  }
  if(p[0]==='admin'&&p[1]==='users'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text').catch(()=>{});
   const phoneByEmail={
    'patient@example.com':'8886395766',
    'executive@nexusmt.com':'8886395766',
    'qa@nexusmt.com':'8886395766',
    'billing@nexusmt.com':'8886395766',
    'facility@nexusmt.com':'8886395766',
    'dispatcher@nexusmt.com':'8886395766',
    'driver@nexusmt.com':'8886395766',
    'admin@nexusmt.com':'8886395766',
    'fletcher@nexusmt.com':'2022702174',
    'keames@adventisthealthcare.com':'2406201940'
   };
   let r;
   try{
    r=await query(`SELECT id,email,display_name,role,phone,active,created_at,organization_id FROM users ORDER BY created_at DESC LIMIT 200`);
   }catch(err){
    const message=String(err?.message||'');
    if(message.toLowerCase().includes('phone')){
      r=await query(`SELECT id,email,display_name,role,null::text as phone,active,created_at,organization_id FROM users ORDER BY created_at DESC LIMIT 200`);
    }else throw err;
   }
   for(const u of r.rows||[]){
    const email=clean(u.email).toLowerCase();
    const fallbackPhone=phoneByEmail[email]||'';
    if(!clean(u.phone)&&fallbackPhone){
      await query('UPDATE users SET phone=$2,updated_at=now() WHERE id=$1',[u.id,fallbackPhone]);
      u.phone=fallbackPhone;
    }
   }
   return json(200,{users:r.rows.map(u=>({id:String(u.id),email:u.email,name:u.display_name,phone:u.phone||'',role:u.role,active:u.active,createdAt:u.created_at}))});
  }
  // Admin: emergency password reset by email (manual support fallback)
  if(p[0]==='admin'&&p[1]==='users'&&p[2]==='reset-password'&&method==='POST'){
   const me=await requireUser(bearer(event),['ADMIN']);
   await ensurePasswordResetColumns();
   const b=parseBody(event);
   const targetEmail=clean(b.email).toLowerCase();
   if(!targetEmail)return json(400,{error:'email is required'});
   const userRes=await query('SELECT id,email,display_name,role,active FROM users WHERE lower(email)=lower($1) LIMIT 1',[targetEmail]);
   const target=userRes.rows[0];
   if(!target)return json(404,{error:'User not found'});
   if(target.active===false)return json(409,{error:'Cannot reset password for inactive user'});

   const tempPassword=generateTempPassword(14);
   const passwordHash=hashPassword(tempPassword);
   const tempPasswordExpiresAt=new Date(Date.now()+2*60*60*1000).toISOString();

   await query(
    'UPDATE users SET password_hash=$2,must_change_password=true,password_reset_expires=$3,password_reset_token=null,password_reset_used=false,updated_at=now() WHERE id=$1',
    [target.id,passwordHash,tempPasswordExpiresAt]
   );

   let emailDeliveryStatus='skipped';
   let warning='';
   try{
    const appBase=(process.env.APP_BASE_URL||process.env.SITE_URL||process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
    const isDriver=String(target.role||'').toUpperCase()==='DRIVER';
    const loginUrl=isDriver?`${appBase}/driver-app.html`:`${appBase}/livecare.html`;
    const expiresLabel=new Date(tempPasswordExpiresAt).toLocaleString('en-US',{timeZone:'America/New_York'});
    const html=`
      <h2>Nexus temporary password issued</h2>
      <p>A temporary password was created for <strong>${clean(target.email)}</strong>.</p>
      <p><strong>Temporary password:</strong> <code style="font-size:16px">${tempPassword}</code></p>
      <p>This temporary password expires in <strong>2 hours</strong> (${expiresLabel} ET).</p>
      <p>Sign in at <a href="${loginUrl}">${loginUrl}</a> and change your password immediately.</p>
    `;
    const emailResult=await sendEmail([clean(target.email).toLowerCase()],'Your Nexus temporary password',html);
    emailDeliveryStatus=emailResult?.status||'skipped';
    if(emailDeliveryStatus!=='sent')warning='Password reset completed, but credential email was not delivered automatically. Share the temporary password with the user securely.';
   }catch(err){
    emailDeliveryStatus='failed';
    warning='Password reset completed, but credential email failed to send. Share the temporary password with the user securely.';
   }

   await audit('USER',String(target.id),'ADMIN_PASSWORD_RESET',{by:me.email,targetEmail:target.email,role:target.role,expiresAt:tempPasswordExpiresAt,emailDeliveryStatus});
   return json(200,{
    ok:true,
    user:{id:String(target.id),email:target.email,name:target.display_name,role:target.role,mustChangePassword:true},
    tempPassword,
    tempPasswordExpiresAt,
    emailDeliveryStatus,
    warning,
    message:'Temporary password issued. User must change password at next login.'
   });
  }
  // Admin: set a specific password by email (support use only)
  if(p[0]==='admin'&&p[1]==='users'&&p[2]==='set-password'&&method==='POST'){
   const me=await requireUser(bearer(event),['ADMIN']);
   await ensurePasswordResetColumns();
   const b=parseBody(event);
   const targetEmail=clean(b.email).toLowerCase();
   const newPassword=String(b.password||'');
   const sendCredentialEmail=Boolean(b.sendEmail);
   if(!targetEmail)return json(400,{error:'email is required'});
   if(newPassword.length<8)return json(400,{error:'password must be at least 8 characters'});
   const userRes=await query('SELECT id,email,display_name,role,active FROM users WHERE lower(email)=lower($1) LIMIT 1',[targetEmail]);
   const target=userRes.rows[0];
   if(!target)return json(404,{error:'User not found'});
   if(target.active===false)return json(409,{error:'Cannot set password for inactive user'});

   const passwordHash=hashPassword(newPassword);
   await query(
    'UPDATE users SET password_hash=$2,must_change_password=true,password_reset_expires=$3,password_reset_token=null,password_reset_used=false,updated_at=now() WHERE id=$1',
    [target.id,passwordHash,new Date(Date.now()+2*60*60*1000).toISOString()]
   );

   let emailDeliveryStatus='skipped';
   let warning='';
   if(sendCredentialEmail){
    try{
      const appBase=(process.env.APP_BASE_URL||process.env.SITE_URL||process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
      const isDriver=String(target.role||'').toUpperCase()==='DRIVER';
      const loginUrl=isDriver?`${appBase}/driver-app.html`:`${appBase}/livecare.html`;
      const html=`
        <h2>Nexus password updated</h2>
        <p>Your account password has been updated for <strong>${clean(target.email)}</strong>.</p>
        <p><strong>Temporary password:</strong> <code style="font-size:16px">${newPassword}</code></p>
        <p>Sign in at <a href="${loginUrl}">${loginUrl}</a> and change your password immediately.</p>
      `;
      const emailResult=await sendEmail([clean(target.email).toLowerCase()],'Your Nexus password has been updated',html);
      emailDeliveryStatus=emailResult?.status||'skipped';
      if(emailDeliveryStatus!=='sent')warning='Password updated, but email was not delivered automatically.';
    }catch(_err){
      emailDeliveryStatus='failed';
      warning='Password updated, but email delivery failed.';
    }
   }

   await audit('USER',String(target.id),'ADMIN_SET_PASSWORD',{by:me.email,targetEmail:target.email,role:target.role,emailDeliveryStatus});
   return json(200,{ok:true,user:{id:String(target.id),email:target.email,name:target.display_name,role:target.role,mustChangePassword:true},emailDeliveryStatus,warning,message:'Password set successfully. User must change password at next login.'});
  }
  // Admin: create user
  if(p[0]==='admin'&&p[1]==='users'&&!p[2]&&method==='POST'){
    try{
    const me=await requireUser(bearer(event),['ADMIN']);
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text').catch(()=>{});
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false').catch(()=>{});
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires timestamptz').catch(()=>{});
    const b=parseBody(event);required(b,['email','phone','name','role']);
   const validRoles=['ADMIN','DISPATCHER','FACILITY','DRIVER','BILLING','QA','EXECUTIVE','PATIENT'];
   if(!validRoles.includes(String(b.role).toUpperCase()))return json(400,{error:'Invalid role'});
   const phoneDigits=normalizeE164(b.phone);
   if(!phoneDigits)return json(400,{error:'Enter a valid international phone number with country code, such as +1 240 555 0101'});
   const existing=await query('SELECT id FROM users WHERE lower(email)=lower($1)',[b.email]);
   if(existing.rows[0])return json(409,{error:'A user with that email already exists'});
    const tempPassword=generateTempPassword(14);
    const passwordHash=hashPassword(tempPassword);
    const tempPasswordExpiresAt=new Date(Date.now()+2*60*60*1000).toISOString();
   const userId=crypto.randomUUID();
  // Resolve organization_id for the new user. Some environments enforce NOT NULL.
  let orgId=null;
  const meId=String(me?.id||'').trim();
  const meEmail=clean(me?.email).toLowerCase();
  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meId);
  if(isUuid){
   const adminRow=await query('SELECT organization_id FROM users WHERE id=$1',[meId]).catch(()=>({rows:[]}));
   orgId=adminRow.rows[0]?.organization_id||null;
  }
  if(!orgId&&meEmail){
   const adminByEmail=await query('SELECT organization_id FROM users WHERE lower(email)=lower($1) LIMIT 1',[meEmail]).catch(()=>({rows:[]}));
   orgId=adminByEmail.rows[0]?.organization_id||null;
  }
  if(!orgId){
   const orgRow=await query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1').catch(()=>({rows:[]}));
   orgId=orgRow.rows[0]?.id||null;
  }
  if(!orgId){
   return json(500,{error:'Organization setup is incomplete. Run reset standard accounts, then try creating the user again.'});
  }
   let policyEnforced=true;
   let warning='';
   const normalizedEmail=clean(b.email).toLowerCase();
   const normalizedName=clean(b.name);
   const normalizedRole=String(b.role).toUpperCase();
   const identitySubject=crypto.randomUUID();
   try{
    await query(`INSERT INTO users(id,email,display_name,role,password_hash,phone,must_change_password,password_reset_expires,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,true,$7,true,$8,$9,now(),now())`,[userId,normalizedEmail,normalizedName,normalizedRole,passwordHash,phoneDigits,tempPasswordExpiresAt,orgId,identitySubject]);
   }catch(err){
    const message=String(err?.message||'').toLowerCase();
    if(message.includes('organization')||message.includes('organization_id')){
      return json(500,{error:'Organization setup is incomplete. Run reset standard accounts, then try again.'});
    }
    let createdViaFallback=false;
    try{
      // Fallback 1: keep organization and identity subject, drop optional temp-password columns.
      await query(`INSERT INTO users(id,email,display_name,role,password_hash,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now())`,[userId,normalizedEmail,normalizedName,normalizedRole,passwordHash,orgId,identitySubject]);
      createdViaFallback=true;
    }catch(fallbackErr1){
      const fallbackMessage1=String(fallbackErr1?.message||'').toLowerCase();
      if(fallbackMessage1.includes('identity_subject')){
        // Fallback 2: older schemas without identity_subject.
        await query(`INSERT INTO users(id,email,display_name,role,password_hash,active,organization_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,now(),now())`,[userId,normalizedEmail,normalizedName,normalizedRole,passwordHash,orgId]);
        createdViaFallback=true;
      }else{
        throw Object.assign(new Error(`User create failed: ${fallbackErr1.message||'database insert error'}`),{statusCode:500});
      }
    }
    if(createdViaFallback){
      const phoneUpdate=await query('UPDATE users SET phone=$2,updated_at=now() WHERE id=$1',[userId,phoneDigits]).then(()=>true).catch(()=>false);
      const policyUpdate=await query('UPDATE users SET must_change_password=true,password_reset_expires=$2,updated_at=now() WHERE id=$1',[userId,tempPasswordExpiresAt]).then(()=>true).catch(()=>false);
      policyEnforced=Boolean(policyUpdate);
      if(!phoneUpdate||!policyUpdate){
        warning='User created, but some security-policy columns are unavailable in this environment. Run migrations to enforce the 2-hour temporary password expiry.';
      }
    }
   }
   let emailDeliveryStatus='skipped';
   try{
    const appBase=(process.env.APP_BASE_URL||'https://nexusmt.com').replace(/\/$/,'');
    const loginUrl=`${appBase}/livecare.html`;
    const expiresLabel=new Date(tempPasswordExpiresAt).toLocaleString('en-US',{timeZone:'America/New_York'});
    const loginRole=String(normalizedRole||'').toUpperCase();
    const html=`
      <h2>Welcome to Nexus Medical Transit</h2>
      <p>Your account has been created for <strong>${clean(normalizedEmail)}</strong>.</p>
      <p><strong>Temporary password:</strong> <code style="font-size:16px">${tempPassword}</code></p>
      <p>This temporary password expires in <strong>2 hours</strong> (${expiresLabel} ET).</p>
      <p>Sign in at <a href="${loginUrl}">${loginUrl}</a> using role <strong>${loginRole}</strong>, then change your password immediately when prompted.</p>
      <p>If you did not expect this account, contact Nexus support right away.</p>
    `;
    const emailResult=await sendEmail([normalizedEmail],'Your Nexus login credentials',html);
    emailDeliveryStatus=emailResult?.status||'skipped';
    if(emailDeliveryStatus!=='sent'){
      warning=`${warning?`${warning} `:''}Credential email was not sent automatically. Share the temporary password securely with the user.`.trim();
    }
   }catch(emailErr){
    emailDeliveryStatus='failed';
    warning=`${warning?`${warning} `:''}Credential email failed to send. Share the temporary password securely with the user.`.trim();
   }
   await audit('USER',userId,'CREATED',{role:b.role,by:me.email,emailDeliveryStatus});
    return json(201,{user:{id:userId,email:b.email,name:b.name,phone:phoneDigits,role:b.role,active:true,mustChangePassword:policyEnforced},tempPassword,tempPasswordExpiresAt,warning,emailDeliveryStatus});
   }catch(err){
    const message=clean(err?.message||'Failed to create user');
    return json(err?.statusCode||500,{error:err?.statusCode?message:`Create user failed: ${message}`});
   }
  }
    if(p[0]==='admin'&&p[1]==='users'&&p[2]&&p[3]==='resend-credentials'&&method==='POST'){
     const me=await requireUser(bearer(event),['ADMIN']);
     const userId=decodeURIComponent(p[2]);
     const userRes=await query('SELECT id,email,display_name,role,active FROM users WHERE id=$1 LIMIT 1',[userId]);
     const target=userRes.rows[0];
     if(!target)return json(404,{error:'User not found'});
     if(target.active===false)return json(409,{error:'Cannot resend credentials for inactive user'});

     await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false').catch(()=>{});
     await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires timestamptz').catch(()=>{});

     const tempPassword=generateTempPassword(14);
     const passwordHash=hashPassword(tempPassword);
     const tempPasswordExpiresAt=new Date(Date.now()+2*60*60*1000).toISOString();
     let warning='';
     let policyEnforced=true;

     try{
      await query('UPDATE users SET password_hash=$2,must_change_password=true,password_reset_expires=$3,updated_at=now() WHERE id=$1',[userId,passwordHash,tempPasswordExpiresAt]);
     }catch(err){
      await query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[userId,passwordHash]);
      policyEnforced=false;
      warning='User password was reset, but policy columns are unavailable in this environment. Run migrations to enforce temporary-password expiry.';
     }

     let emailDeliveryStatus='skipped';
     try{
      const appBase=(process.env.APP_BASE_URL||'https://nexusmt.com').replace(/\/$/,'');
      const loginUrl=`${appBase}/livecare.html`;
      const expiresLabel=new Date(tempPasswordExpiresAt).toLocaleString('en-US',{timeZone:'America/New_York'});
      const loginRole=String(target.role||'').toUpperCase();
      const html=`
        <h2>Nexus credentials reissued</h2>
        <p>A new temporary password was issued for your account <strong>${clean(target.email)}</strong>.</p>
        <p><strong>Temporary password:</strong> <code style="font-size:16px">${tempPassword}</code></p>
        <p>This temporary password expires in <strong>2 hours</strong> (${expiresLabel} ET).</p>
        <p>Sign in at <a href="${loginUrl}">${loginUrl}</a> using role <strong>${loginRole}</strong>, then change your password immediately.</p>
      `;
      const emailResult=await sendEmail([clean(target.email).toLowerCase()],'Your Nexus login credentials were reissued',html);
      emailDeliveryStatus=emailResult?.status||'skipped';
      if(emailDeliveryStatus!=='sent'){
        warning=`${warning?`${warning} `:''}Credential email was not sent automatically. Share the temporary password securely with the user.`.trim();
      }
     }catch(emailErr){
      emailDeliveryStatus='failed';
      warning=`${warning?`${warning} `:''}Credential email failed to send. Share the temporary password securely with the user.`.trim();
     }

       if(emailDeliveryStatus!=='sent'){
        try{
         const adminRecipients=buildEmailRecipients([process.env.COMPANY_EMAIL||'',process.env.NEXUS_ADMIN_EMAIL||'']);
         if(adminRecipients.length){
          const statusLabel=String(emailDeliveryStatus||'unknown').toUpperCase();
          const alertHtml=`
            <h2>Nexus credential delivery alert</h2>
            <p>Resent credentials could not be auto-delivered.</p>
            <p><strong>User:</strong> ${clean(target.display_name||target.email)}</p>
            <p><strong>Email:</strong> ${clean(target.email)}</p>
            <p><strong>Status:</strong> ${statusLabel}</p>
            <p><strong>Issued by:</strong> ${clean(me.email)}</p>
            <p><strong>Expires at:</strong> ${new Date(tempPasswordExpiresAt).toLocaleString('en-US',{timeZone:'America/New_York'})} ET</p>
            <p>Please deliver credentials to the user through a secure fallback channel.</p>
          `;
          await sendEmail(adminRecipients,'ALERT: Credential resend email not delivered',alertHtml);
         }
        }catch(alertErr){}
       }

     await audit('USER',userId,'CREDENTIALS_REISSUED',{by:me.email,email:target.email,role:target.role,emailDeliveryStatus,policyEnforced});
     return json(200,{ok:true,user:{id:String(target.id),email:target.email,name:target.display_name,role:target.role,mustChangePassword:policyEnforced},tempPassword,tempPasswordExpiresAt,emailDeliveryStatus,warning});
    }
  if(p[0]==='driver'&&p[1]==='assignments'&&method==='GET'){
   const token=bearer(event);
   let u;
   try{
    u=await requireUser(token,['DRIVER','ADMIN','DISPATCHER']);
   }catch(err){
    const fallbackSession=getFallbackSession(token);
    if(fallbackSession?.user?.role==='DRIVER'){
     return json(200,{assignments:getFallbackAssignments(fallbackSession.user).map(mapBooking)});
    }
    throw err;
   }
   const driverName=clean(u.display_name||u.email||'');
   const scopeId=clean(u.scope_id||u.scopeId||'');
   await query(
    `WITH marked AS (
       UPDATE bookings
       SET status='MISSED', updated_at=now()
       WHERE ((driver_name IS NOT NULL AND lower(trim(driver_name))=lower(trim($1))) OR (driver_scope_id IS NOT NULL AND driver_scope_id=$2))
         AND status IN ('ASSIGNED','SCHEDULED','REQUESTED','SUBMITTED','PENDING_DISPATCH_CONFIRMATION')
         AND (trip_date::text || ' ' || COALESCE(trip_time::text,'00:00'))::timestamp < now()
       RETURNING reference
     )
     INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor)
     SELECT reference,'MISSED','missed','Trip auto-marked as MISSED because scheduled time passed without completion.','SYSTEM'
     FROM marked`,
    [driverName,scopeId]
   );
  const sql=`SELECT * FROM bookings WHERE ((driver_name IS NOT NULL AND lower(trim(driver_name))=lower(trim($1))) OR (driver_scope_id IS NOT NULL AND driver_scope_id=$2)) AND status IN ('ASSIGNED','SCHEDULED','REQUESTED','SUBMITTED','PENDING_DISPATCH_CONFIRMATION','EN_ROUTE','ARRIVED_PICKUP','PATIENT_ON_BOARD','DEPARTED','ARRIVED_DESTINATION','DELIVERED','COMPLETED','NO_SHOW','MISSED','CANCELLED') ORDER BY trip_date,trip_time,created_at`;
   const r=await query(sql,[driverName,scopeId]);
   return json(200,{assignments:r.rows.map(mapBooking)});
  }
  // Admin: toggle user active/inactive
  if(p[0]==='admin'&&p[1]==='users'&&p[2]&&method==='PATCH'){
   const me=await requireUser(bearer(event),['ADMIN']);
   const b=parseBody(event);const userId=decodeURIComponent(p[2]);
   if(typeof b.active!=='boolean')return json(400,{error:'active (boolean) is required'});
   const r=await query('UPDATE users SET active=$2,updated_at=now() WHERE id=$1 RETURNING id,email,role,active',[userId,b.active]);
   if(!r.rows[0])return json(404,{error:'User not found'});
   await audit('USER',userId,b.active?'ACTIVATED':'DEACTIVATED',{by:me.email});
   return json(200,{user:r.rows[0]});
  }
  // Admin: audit log
  if(p[0]==='admin'&&p[1]==='audit-log'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN']);
    const queryParams=event.queryStringParameters||{};
    const limit=Math.min(Number(queryParams.limit)||100,500);
    const since=queryParams.since;
    const action=clean(queryParams.action).toUpperCase();
    const entityType=clean(queryParams.entityType).toUpperCase();
    const entityId=clean(queryParams.entityId);
    const q=clean(queryParams.q);
    let sql='SELECT * FROM audit_log';
    const params=[];
    const where=[];
    if(since){
     params.push(since);
     where.push(`created_at >= $${params.length}`);
    }
    if(action){
     params.push(action);
     where.push(`upper(action) = $${params.length}`);
    }
    if(entityType){
     params.push(entityType);
     where.push(`upper(entity_type) = $${params.length}`);
    }
    if(entityId){
     params.push(entityId);
     where.push(`cast(entity_id as text) = $${params.length}`);
    }
    if(q){
     params.push(`%${q}%`);
     where.push(`(cast(entity_id as text) ILIKE $${params.length} OR cast(changes as text) ILIKE $${params.length})`);
    }
    if(where.length)sql+=` WHERE ${where.join(' AND ')}`;
   sql+=` ORDER BY created_at DESC LIMIT ${limit}`;
   const r=await query(sql,params);
   return json(200,{entries:r.rows.map(e=>({id:String(e.id||''),entityType:e.entity_type,entityId:String(e.entity_id||''),action:e.action,changes:e.changes,createdAt:e.created_at}))});
  }
  if(p[0]==='facilities'&&method==='GET'){const u=await requireUser(bearer(event),['ADMIN','DISPATCHER','FACILITY']);const r=await query(u.role==='FACILITY'?'SELECT * FROM facilities WHERE facility_code=$1':'SELECT * FROM facilities ORDER BY name',[...(u.role==='FACILITY'?[u.scope_id]:[])]);return json(200,{facilities:r.rows})}
  if(p[0]==='patients'&&method==='GET'){const u=await requireUser(bearer(event),['ADMIN','DISPATCHER','FACILITY']);const r=await query(u.role==='FACILITY'?'SELECT * FROM patients WHERE facility_code=$1 AND active=true ORDER BY display_name':'SELECT * FROM patients WHERE active=true ORDER BY display_name',[...(u.role==='FACILITY'?[u.scope_id]:[])]);return json(200,{patients:r.rows})}
  // Update trip details/status.
  // - Authenticated DRIVER/DISPATCHER/ADMIN path: status/vehicle updates via token.
  // - Passenger path: requires booking phone verification and allows contact/detail edits.
  if(p[0]==='bookings'&&p[1]&&p[2]==='payment'&&p[3]==='confirm-full'&&method==='POST'){
   const u=await requireUser(bearer(event),['DRIVER','ADMIN','DISPATCHER']);
   const ref=decodeURIComponent(p[1]);
   const found=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);
   if(!found.rows[0])return json(404,{error:'Booking not found'});
   if(u.role==='DRIVER'&&clean(found.rows[0].driver_scope_id)&&clean(found.rows[0].driver_scope_id)!==clean(u.scope_id))return json(403,{error:'This trip is not assigned to you.'});
   if(clean(found.rows[0].payer_type).toUpperCase()!=='SELF_PAY')return json(409,{error:'Driver payment confirmation applies only to self-pay trips.'});
   const updated=await query("UPDATE bookings SET payment_status='PAID_IN_FULL',balance_due=0,paid_in_full_at=now(),payment_confirmed_at=now(),payment_confirmed_by=$2,updated_at=now() WHERE reference=$1 RETURNING *",[ref,u.email||u.display_name||u.role]);
   await audit('BOOKING',ref,'FULL_PAYMENT_CONFIRMED',{by:u.email||u.role,source:'DRIVER_APP'});
   return json(200,{booking:mapBooking(updated.rows[0]),message:'Full payment confirmed'});
  }
  if(p[0]==='bookings'&&p[1]&&p[2]==='update'&&method==='POST'){
   const ref=decodeURIComponent(p[1]);
   const token=bearer(event);
   const b=parseBody(event);
    const earlyPickupReason=clean(b.earlyPickupReason||b.earlyPickupRequestReason||b.earlyPickupNote||b.note||'');
   if(token){
    if(typeof token==='string'&&token.startsWith('fb.')){
     const fallbackSession=getFallbackSession(token);
     if(!fallbackSession)return json(401,{error:'Session expired or invalid'});
    const role=String(fallbackSession.user?.role||'').toUpperCase();
     if(!['DRIVER','ADMIN','DISPATCHER'].includes(role))return json(403,{error:'Forbidden'});
     const statusInput=b.status?String(b.status).toUpperCase().replaceAll('-','_'):null;
     if(role==='DRIVER'&&!statusInput)return json(400,{error:'Status is required'});
     if(role==='DRIVER'&&(b.name||b.service||b.pickup||b.destination||b.email||b.alternatePhone||b.alternateEmail||Object.prototype.hasOwnProperty.call(b,'estimatedFare')))return json(403,{error:'Drivers may only update trip status and vehicle data'});
     const currentFallback=getFallbackAssignments(fallbackSession.user).find((item)=>String(item.reference)===String(ref));
     if(!currentFallback)return json(404,{error:'Booking not found'});
     if(statusInput==='EN_ROUTE'){
      const startPolicy=getTripStartPolicy(currentFallback,earlyPickupReason);
      if(!startPolicy.allowed)return json(409,{error:startPolicy.message});
     }
    const updatedFallback=updateFallbackAssignmentStatus({email:fallbackSession.user?.email},ref,statusInput||'',{earlyPickupReason});
     if(!updatedFallback)return json(404,{error:'Booking not found'});
     return json(200,{booking:mapBooking(updatedFallback),message:'Trip updated successfully'});
    }

    const u=await requireUser(token,['DRIVER','ADMIN','DISPATCHER']);
    if(u.role==='DRIVER'&&(b.name||b.service||b.pickup||b.destination||b.email||b.alternatePhone||b.alternateEmail||Object.prototype.hasOwnProperty.call(b,'estimatedFare')))return json(403,{error:'Drivers may only update trip status and vehicle data'});
    const statusInput=b.status?String(b.status).toUpperCase().replaceAll('-','_'):null;
    const vehicleUnitInput=clean(b.vehicleUnit)||null;
    const driverNameInput=u.role==='DRIVER'?(clean(u.display_name||u.email||'Driver')||null):(clean(b.driverName)||null);
    const driverScopeInput=u.role==='DRIVER'?(clean(u.scope_id||u.scopeId||null)||null):null;
    const currentBooking=await query('SELECT * FROM bookings WHERE reference=$1',[ref]);
    if(!currentBooking.rows[0])return json(404,{error:'Booking not found'});
    if(statusInput==='PATIENT_ON_BOARD'&&requiresFullPaymentBeforeBoarding(currentBooking.rows[0]))return json(409,{error:'Full payment must be confirmed before a self-pay passenger can board.'});
    if(statusInput==='EN_ROUTE'){
     const startPolicy=getTripStartPolicy(currentBooking.rows[0],earlyPickupReason);
     if(!startPolicy.allowed)return json(409,{error:startPolicy.message});
    }
    const updated=await query(`UPDATE bookings SET status=COALESCE($2,status),vehicle_unit=COALESCE($3,vehicle_unit),driver_name=COALESCE($4,driver_name),driver_scope_id=COALESCE($5,driver_scope_id),updated_at=now() WHERE reference=$1 RETURNING *`,[ref,statusInput,vehicleUnitInput,driverNameInput,driverScopeInput]);
    if(!updated.rows[0])return json(404,{error:'Booking not found'});
    const note=earlyPickupReason||null;
    await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,updated.rows[0].status,statusLabel(updated.rows[0].status),note,u.display_name||u.email||u.role]);
    await audit('BOOKING',ref,'UPDATED',{by:u.role,status:updated.rows[0].status,vehicleUnit:updated.rows[0].vehicle_unit||null});
    const notifications=await sendTripStakeholderUpdate(currentBooking.rows[0],updated.rows[0],u,note||`Trip updated by ${u.display_name||u.email||u.role}`).catch(()=>({status:'failed'}));
    const facilityInvoice=statusInput==='COMPLETED'?await issueFacilityCompletionInvoice(updated.rows[0]).catch(err=>({status:'failed',error:err.message})):null;
    return json(200,{booking:mapBooking(updated.rows[0]),notifications,facilityInvoice,message:'Trip updated successfully'});
   }

   const phone=clean(b.phone);if(!phone)return json(400,{error:'Phone number is required to update'});
   const r=await query('SELECT * FROM bookings WHERE reference=$1 AND regexp_replace(phone,\'\\D\',\'\',\'g\')=regexp_replace($2,\'\\D\',\'\',\'g\')',[ref,phone]);
   if(!r.rows[0])return json(404,{error:'Booking not found or phone number does not match'});
   if(['CANCELLED','COMPLETED','IN_TRANSIT','ARRIVED'].includes(r.rows[0].status))return json(400,{error:`Cannot update a booking with status: ${r.rows[0].status}`});
   // Validate email if provided
   if(b.email){const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!emailPattern.test(b.email.trim()))return json(400,{error:'Please enter a valid email address'});}
   if(b.alternateEmail){const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!emailPattern.test(b.alternateEmail.trim()))return json(400,{error:'Please enter a valid alternate email address'});}
   // Validate alternate phone if provided
   if(b.alternatePhone&&!normalizeE164(b.alternatePhone))return json(400,{error:'Enter the alternate phone with country code, such as +1 240 555 0101'});
   const updated=await query('UPDATE bookings SET name=$2,service=$3,pickup=$4,destination=$5,email=$6,alternate_phone=$7,alternate_email=$8,last_updated_by=\'passenger\',last_updated_at=now(),updated_at=now() WHERE reference=$1 RETURNING *',[ref,clean(b.name)||r.rows[0].name,clean(b.service)||r.rows[0].service,clean(b.pickup)||r.rows[0].pickup,clean(b.destination)||r.rows[0].destination,clean(b.email)||r.rows[0].email,clean(b.alternatePhone)||r.rows[0].alternate_phone||null,clean(b.alternateEmail)||r.rows[0].alternate_email||null]);
   await query('INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) VALUES($1,$2,$3,$4,$5)',[ref,r.rows[0].status,statusLabel(r.rows[0].status),'Trip details updated by passenger','PASSENGER']);
   await audit('BOOKING',ref,'DETAILS_UPDATED',{updatedFields:Object.keys(b).filter(k=>['name','service','pickup','destination','email','alternatePhone','alternateEmail'].includes(k))});
   const booking=mapBooking(updated.rows[0]);
   return json(200,{booking,message:'Trip details updated successfully'});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const b=parseBody(event);required(b,['name','contact_email','net_terms_days']);
   const r=await query('INSERT INTO brokers(name,contact_email,contact_person,contact_phone,net_terms_days,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(name) DO NOTHING RETURNING *',[clean(b.name),clean(b.contact_email),clean(b.contact_person)||null,clean(b.contact_phone)||null,Number(b.net_terms_days)||30,clean(b.notes)||null]);
   if(!r.rows[0])return json(409,{error:'Broker name already exists'});
   await audit('BROKER',r.rows[0].id,'CREATED',{name:b.name,email:b.contact_email});
   return json(201,{broker:r.rows[0]});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING']);
   const r=await query('SELECT * FROM brokers WHERE status=$1 ORDER BY name',['ACTIVE']);
   return json(200,{brokers:r.rows});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER','EXECUTIVE','BILLING']);
   const brokerId=Number(p[2]);
   const r=await query('SELECT * FROM brokers WHERE id=$1',[brokerId]);
   if(!r.rows[0])return json(404,{error:'Broker not found'});
   const rates=await query('SELECT * FROM broker_rates WHERE broker_id=$1 AND effective_to IS NULL ORDER BY service',[brokerId]);
   return json(200,{broker:r.rows[0],rates:rates.rows});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&method==='PATCH'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const brokerId=Number(p[2]);
   const b=parseBody(event);
   const r=await query('UPDATE brokers SET contact_person=COALESCE($2,contact_person),contact_phone=COALESCE($3,contact_phone),net_terms_days=COALESCE($4,net_terms_days),notes=COALESCE($5,notes),updated_at=now() WHERE id=$1 RETURNING *',[brokerId,clean(b.contact_person)||null,clean(b.contact_phone)||null,Number(b.net_terms_days)||null,clean(b.notes)||null]);
   if(!r.rows[0])return json(404,{error:'Broker not found'});
   await audit('BROKER',brokerId,'UPDATED',{fields:Object.keys(b)});
   return json(200,{broker:r.rows[0]});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&p[3]==='rates'&&method==='POST'){
   const u=await requireUser(bearer(event),['ADMIN']);
   const brokerId=Number(p[2]);
   const b=parseBody(event);required(b,['service','base_rate','per_mile_rate']);
   const r=await query('UPDATE broker_rates SET effective_to=now() WHERE broker_id=$1 AND service=$2 AND effective_to IS NULL',[brokerId,clean(b.service)]);
   const nr=await query('INSERT INTO broker_rates(broker_id,service,base_rate,per_mile_rate,notes) VALUES($1,$2,$3,$4,$5) RETURNING *',[brokerId,clean(b.service),Number(b.base_rate),Number(b.per_mile_rate),clean(b.notes)||null]);
   await audit('BROKER',brokerId,'RATE_UPDATED',{service:b.service,baseRate:b.base_rate,perMileRate:b.per_mile_rate});
   return json(201,{rate:nr.rows[0]});
  }
  if(p.join('/')==='broker-requests'&&method==='POST'){
   const b=parseBody(event);required(b,['pickup','destination','trip_date','trip_time','service','broker_quoted_rate']);
   let brokerId=null;
   if(b.broker_id)brokerId=Number(b.broker_id);
   const platformRate=Number(b.platform_calculated_rate)||0;
   const brokerRate=Number(b.broker_quoted_rate)||0;
   const delta=brokerRate-platformRate;
    const r=await query('INSERT INTO broker_requests(broker_id,booking_reference,broker_name,service,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,trip_date,trip_time,broker_quoted_rate,platform_calculated_rate,rate_delta,variance,submission_method,submitted_by,request_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *',[brokerId,clean(b.booking_reference)||null,clean(b.broker_name)||'Unknown',clean(b.service),clean(b.pickup),clean(b.destination),Number(b.pickup_lat)||null,Number(b.pickup_lng)||null,Number(b.destination_lat)||null,Number(b.destination_lng)||null,b.trip_date,b.trip_time,brokerRate,platformRate,delta,delta,clean(b.submission_method)||'FORM',clean(b.submitted_by)||'ANONYMOUS','PENDING_DISPATCH_CONFIRMATION']);
   const req=r.rows[0];
   let requestState=req;
   try{
    const autoBookResult=await createBookingFromBrokerRequest(b,req);
    requestState=(await query('SELECT * FROM broker_requests WHERE id=$1',[req.id])).rows[0];
    if(autoBookResult.autoAssignResult?.assigned){
     await sendBrokerRequestToDispatch(requestState).catch(e=>console.error('[BROKER_NOTIFY]',e.message));
    }else{
     await sendBrokerRequestToDispatch(requestState).catch(e=>console.error('[BROKER_NOTIFY]',e.message));
    }
   }catch(e){console.error('[BROKER_AUTO_BOOK]',e.message);}
   const submitterEmail=clean(b.submitted_by)||clean(b.contact_email)||null;
   if(submitterEmail){
    await sendBrokerRequestConfirmation(requestState,submitterEmail,clean(b.broker_name)||'Broker request').catch(e=>console.error('[BROKER_CONFIRM]',e.message));
   }
   const confirmationMessage='Your broker request has been received and is pending dispatch confirmation. It will be finalized once dispatch completes the booking.';
   await audit('BROKER_REQUEST',req.id,'SUBMITTED',{method:b.submission_method,broker:b.broker_name,autoBooked:false});
   return json(201,{request:requestState,autoConfirmed:false,autoBooked:false,bookingReference:requestState.booking_reference||null,clientMessage:confirmationMessage,message:confirmationMessage});
  }
  if(p[0]==='admin'&&p[1]==='broker-requests'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const status=event.queryStringParameters?.status||'AUTO_CONFIRMED';
   const r=await query('SELECT * FROM broker_requests WHERE request_status=$1 ORDER BY created_at DESC LIMIT 200',[clean(status)]);
   return json(200,{requests:r.rows});
  }
  if(p[0]==='admin'&&p[1]==='broker-requests'&&p[2]&&method==='PATCH'){
   const u=await requireUser(bearer(event),['ADMIN','DISPATCHER']);
   const reqId=Number(p[2]);
   const b=parseBody(event);required(b,['dispatch_status']);
   const r=await query('UPDATE broker_requests SET request_status=$2,dispatch_reviewed=true,dispatch_reviewed_at=now(),dispatch_reviewed_by=$3,dispatch_notes=$4,updated_at=now() WHERE id=$1 RETURNING *',[reqId,clean(b.dispatch_status),u.display_name,clean(b.dispatch_notes)||null]);
   if(!r.rows[0])return json(404,{error:'Request not found'});
   let requestState=r.rows[0];
   if(clean(b.dispatch_status)==='APPROVED'&&!requestState.booking_reference){
    try{
     const autoBookResult=await createBookingFromBrokerRequest({broker_name:requestState.broker_name,service:requestState.service,pickup:requestState.pickup,destination:requestState.destination,trip_date:requestState.trip_date,trip_time:requestState.trip_time,broker_quoted_rate:requestState.broker_quoted_rate,platform_calculated_rate:requestState.platform_calculated_rate,booking_reference:requestState.booking_reference},requestState);
     requestState=(await query('SELECT * FROM broker_requests WHERE id=$1',[reqId])).rows[0];
     if(autoBookResult.autoAssignResult?.assigned){
      await sendBrokerRequestToDispatch(requestState).catch(e=>console.error('[BROKER_NOTIFY]',e.message));
     }
    }catch(e){console.error('[BROKER_AUTO_BOOK_APPROVAL]',e.message);}
   }
   if(clean(b.dispatch_status)==='APPROVED' || clean(b.dispatch_status)==='BOOKED' || clean(b.dispatch_status)==='COMPLETED'){
    const submitterEmail=clean(requestState.submitted_by)||clean(requestState.contact_email)||null;
    if(submitterEmail){
     await sendBrokerRequestDispatchNotifications(requestState,submitterEmail,requestState.broker_name||'Broker request').catch(e=>console.error('[BROKER_DISPATCH_NOTIFY]',e.message));
    }
   }
   await audit('BROKER_REQUEST',reqId,'REVIEWED',{status:b.dispatch_status,reviewedBy:u.display_name});
   return json(200,{request:requestState});
  }
  // ========== TRANSPORTATION COMPANIES ==========
  if(p.join('/')==='transportation-companies'&&method==='GET'){
   const DEFAULT_COMPANIES=[
    {id:'modivcare',name:'Modivcare',category:'Medicaid Broker',headquarters:'Denver, Colorado',website:'https://www.modivcare.com',providerPortal:'https://www.modivcare.com/transportation-providers-contact-us',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS'],acceptingProviders:true},
    {id:'mtm',name:'MTM',category:'Medicaid Broker',headquarters:'Lake Saint Louis, Missouri',website:'https://www.mtm-inc.net',states:['National'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'access2care',name:'Access2Care',category:'Medicaid Broker',headquarters:'United States',website:'https://www.access2care.net',states:['Multiple States'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'verida',name:'Verida',category:'Medicaid Broker',headquarters:'Atlanta, Georgia',website:'https://verida.com',states:['Multiple States','District of Columbia'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'saferide-health',name:'SafeRide Health',category:'Health Plan',headquarters:'San Antonio, Texas',phone:'855-955-7433',website:'https://www.saferidehealth.com',states:['National'],services:['Ambulatory','Wheelchair','Rideshare'],acceptingProviders:true},
    {id:'alivi',name:'Alivi',category:'Health Plan',headquarters:'Miami, Florida',website:'https://www.alivi.com',states:['Multiple States'],services:['Ambulatory','Wheelchair'],acceptingProviders:true},
    {id:'mas',name:'Medical Answering Services',category:'Medicaid Broker',headquarters:'New York',website:'https://www.medanswering.com',states:['New York'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'american-logistics',name:'American Logistics',category:'Health Plan',headquarters:'California',website:'https://americanlogistics.com',states:['Multiple States'],services:['Ambulatory','Wheelchair','Rideshare'],acceptingProviders:true},
    {id:'one-call',name:'One Call',category:'Workers Compensation',headquarters:'Jacksonville, Florida',website:'https://www.onecallcm.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS','ALS'],acceptingProviders:true},
    {id:'go-t-and-t',name:'Go Transportation & Translation',category:'Workers Compensation',headquarters:'United States',website:'https://www.gotandt.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS','ALS','Air Ambulance'],acceptingProviders:true},
    {id:'corvel',name:'CorVel Corporation',category:'Workers Compensation',headquarters:'Fort Worth, Texas',website:'https://www.corvel.com',states:['National'],services:['Medical Transportation','Case Management'],acceptingProviders:true},
    {id:'sedgwick',name:'Sedgwick',category:'Workers Compensation',headquarters:'Memphis, Tennessee',website:'https://www.sedgwick.com',states:['National'],services:['Medical Transportation','Claims Management'],acceptingProviders:false},
    {id:'enlyte',name:'Enlyte',category:'Workers Compensation',headquarters:'San Diego, California',website:'https://www.enlyte.com',states:['National'],services:['Medical Transportation','Case Management'],acceptingProviders:true},
    {id:'genex',name:'Genex Services',category:'Workers Compensation',headquarters:'Wayne, Pennsylvania',website:'https://www.genexservices.com',states:['National'],services:['Medical Transportation','Case Management'],acceptingProviders:true},
    {id:'coventry',name:'Coventry Workers Compensation Services',category:'Workers Compensation',headquarters:'United States',website:'https://www.coventrywcs.com',states:['National'],services:['Medical Transportation','Provider Networks'],acceptingProviders:true},
    {id:'mti-america',name:'MTI America',category:'Workers Compensation',headquarters:'Pompano Beach, Florida',website:'https://www.mtiamerica.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'procare',name:'ProCare Transportation and Language Services',category:'Workers Compensation',headquarters:'United States',website:'https://www.procaretransportation.com',states:['National'],services:['Ambulatory','Wheelchair','Translation'],acceptingProviders:true},
    {id:'roundtrip',name:'Roundtrip',category:'Hospital Transportation',headquarters:'Philadelphia, Pennsylvania',website:'https://www.roundtriphealth.com',states:['National'],services:['Ambulatory','Wheelchair','Stretcher'],acceptingProviders:true},
    {id:'ride-health',name:'Ride Health',category:'Hospital Transportation',headquarters:'New York',website:'https://www.ridehealth.com',states:['National'],services:['Ambulatory','Wheelchair','Rideshare'],acceptingProviders:true},
    {id:'uber-health',name:'Uber Health',category:'Hospital Transportation',headquarters:'San Francisco, California',website:'https://www.uberhealth.com',states:['National'],services:['Ambulatory','Rideshare'],acceptingProviders:false},
    {id:'lyft-healthcare',name:'Lyft Healthcare',category:'Hospital Transportation',headquarters:'San Francisco, California',website:'https://www.lyft.com/healthcare',states:['National'],services:['Ambulatory','Rideshare'],acceptingProviders:false},
    {id:'va',name:'U.S. Department of Veterans Affairs',category:'Government',headquarters:'Washington, DC',website:'https://www.va.gov',states:['National'],services:['Ambulatory','Wheelchair','Stretcher','BLS'],acceptingProviders:true},
   ];
   // Check if custom companies table exists; merge with defaults if so
   try{
    const tableCheck=await query("SELECT to_regclass('public.transportation_companies') AS name");
    if(tableCheck.rows[0]?.name){
     const custom=await query('SELECT * FROM transportation_companies WHERE active=true ORDER BY name');
     const customMapped=custom.rows.map(r=>({id:r.id,name:r.name,category:r.category||'Other',headquarters:r.headquarters||'',phone:r.phone||'',email:r.email||'',website:r.website||'',providerPortal:r.provider_portal||'',states:r.states||[],services:r.services||[],acceptingProviders:r.accepting_providers??true}));
     const merged=[...DEFAULT_COMPANIES,...customMapped.filter(c=>!DEFAULT_COMPANIES.find(d=>d.id===String(c.id)))];
     return json(200,merged);
    }
   }catch(e){console.warn('[COMPANIES] DB lookup failed, using defaults:',e.message);}
   return json(200,DEFAULT_COMPANIES);
  }
  // ===== SETUP/BOOTSTRAP — seed users without needing an admin login =====
  // Protected by SETUP_KEY env var. Call: POST /api/setup/seed { key: "VALUE" }
  if(p[0]==='setup'&&p[1]==='seed'&&method==='POST'){
   const b=parseBody(event);
   const setupKey=process.env.SETUP_KEY||'nexus-setup-2026';
   if(clean(b.key)!==setupKey)return json(403,{error:'Invalid setup key'});
   const TEST_USERS=[
    {email:'admin@nexusmt.com',name:'Test Administrator',role:'ADMIN',password:'NexusAdmin042!',phone:'8886395766'},
    {email:'dispatcher@nexusmt.com',name:'Test Dispatcher',role:'DISPATCHER',password:'Dispatch2026!',phone:'8886395766'},
    {email:'driver@nexusmt.com',name:'Test Driver',role:'DRIVER',password:'Driver2026!',phone:'8886395766'},
    {email:'facility@nexusmt.com',name:'Test Facility',role:'FACILITY',password:'Facility2026!',phone:'8886395766'},
    {email:'billing@nexusmt.com',name:'Test Billing',role:'BILLING',password:'Billing2026!',phone:'8886395766'},
    {email:'qa@nexusmt.com',name:'Test QA',role:'QA',password:'Quality2026!',phone:'8886395766'},
    {email:'executive@nexusmt.com',name:'Test Executive',role:'EXECUTIVE',password:'Exec2026!',phone:'8886395766'},
   ];
   const results=[];
   // organization_id is NOT NULL — get it from the existing admin
   const orgRow=await query("SELECT organization_id FROM users WHERE role='ADMIN' LIMIT 1");
   const orgId=orgRow.rows[0]?.organization_id||null;
   for(const u of TEST_USERS){
    const hash=crypto.createHash('sha256').update(u.password).digest('hex');
    const existing=await query('SELECT id FROM users WHERE lower(email)=lower($1)',[u.email]);
    if(existing.rows[0]){
    await query('UPDATE users SET display_name=$2,role=$3,password_hash=$4,phone=$5,active=true,updated_at=now() WHERE id=$1',[existing.rows[0].id,u.name,u.role,hash,u.phone||null]);
     results.push({email:u.email,role:u.role,action:'updated'});
    }else if(orgId){
    await query('INSERT INTO users(id,email,display_name,role,password_hash,phone,active,organization_id,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,true,$7,$8,now(),now())',[crypto.randomUUID(),u.email.toLowerCase(),u.name,u.role,hash,u.phone||null,orgId,crypto.randomUUID()]);
     results.push({email:u.email,role:u.role,action:'created'});
    }else{
    await query('INSERT INTO users(id,email,display_name,role,password_hash,phone,active,identity_subject,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,true,$7,now(),now())',[crypto.randomUUID(),u.email.toLowerCase(),u.name,u.role,hash,u.phone||null,crypto.randomUUID()]);
     results.push({email:u.email,role:u.role,action:'created'});
    }
   }
   return json(200,{ok:true,seeded:results.length,results,
    credentials:TEST_USERS.map(u=>({email:u.email,password:u.password,role:u.role}))
   });
  }
  // ===== AVAILABILITY CHECKING ==========
  if(p.join('/')==='availability/check'&&method==='POST'){
   const b=parseBody(event);required(b,['tripDate','tripTime','service']);
   const tripDate=clean(b.tripDate);
    const tripTimeRaw=clean(b.tripTime);
    const tripTime=/^\d{2}:\d{2}/.test(tripTimeRaw)?tripTimeRaw.slice(0,5):'08:00';
   const service=clean(b.service);
    const weekday=new Date(`${tripDate}T12:00:00`).getDay()||7;
   // Check driver availability for this date/time
    const driverAvailabilitySql=typeof buildDriverAvailabilitySql==='function'
     ? buildDriverAvailabilitySql()
     : `SELECT COUNT(DISTINCT e.id) AS driver_count
       FROM employees e
       INNER JOIN employee_shifts es ON e.id=es.employee_id
       WHERE e.role='DRIVER' AND e.active=true AND es.active=true
        AND es.weekday_iso=$1
        AND es.start_time::time<=$2::time AND es.end_time::time>$2::time
        AND es.effective_start_date<=$3::date
        AND (es.effective_end_date IS NULL OR es.effective_end_date>=$3::date)`;
    const drivers=await query(driverAvailabilitySql,[weekday,tripTime,tripDate]);
    const driverCount=Number(drivers.rows[0]?.driver_count ?? drivers.rows[0]?.available ?? 0);
   // Check fleet vehicle availability for this service
   const vehicles=await query(`
    SELECT COUNT(*) as available FROM vehicles
    WHERE active=true AND status='AVAILABLE'
    AND (metadata->>'availability_24_7'='true' OR metadata->'service_hours' @> $1::jsonb)
   `,[JSON.stringify({service})]);
   const vehicleCount=Number(vehicles.rows[0]?.available||0);
   const available=driverCount>0&&vehicleCount>0;
   return json(200,{
    available,
    drivers:{available:driverCount,total:10,status:driverCount>2?'HIGH':driverCount>0?'LOW':'NONE'},
    vehicles:{available:vehicleCount,total:4,status:vehicleCount>2?'HIGH':vehicleCount>0?'LOW':'NONE'},
    recommendation:available?'AUTO_CONFIRM':'DISPATCH_REVIEW',
    action:available?'AUTOMATIC':'MANUAL',
    checkedAt:new Date().toISOString()
   });
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&p[3]==='dashboard'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','EXECUTIVE','BILLING']);
   const brokerId=Number(p[2]);
   const broker=await query('SELECT * FROM brokers WHERE id=$1',[brokerId]);
   if(!broker.rows[0])return json(404,{error:'Broker not found'});
   const thisYear=new Date().getFullYear();
   const thisMonth=new Date().getMonth();
   const periodStart=new Date(thisYear,thisMonth,1).toISOString().split('T')[0];
   const periodEnd=new Date(thisYear,thisMonth+1,0).toISOString().split('T')[0];
   const volume=await query('SELECT COUNT(*) as rides, SUM(CASE WHEN broker_quoted_rate>0 THEN broker_quoted_rate ELSE 0 END) as revenue FROM broker_requests WHERE broker_id=$1 AND trip_date>=$2 AND trip_date<=$3 AND request_status=$4',[brokerId,periodStart,periodEnd,'AUTO_CONFIRMED']);
   const invoices=await query('SELECT * FROM broker_invoices WHERE broker_id=$1 ORDER BY period_start DESC LIMIT 12',[brokerId]);
   return json(200,{broker:broker.rows[0],currentPeriod:{start:periodStart,end:periodEnd,rides:Number(volume.rows[0]?.rides||0),revenue:Number(volume.rows[0]?.revenue||0)},recentInvoices:invoices.rows});
  }
  if(p[0]==='admin'&&p[1]==='brokers'&&p[2]&&p[3]==='export'&&method==='GET'){
   await requireUser(bearer(event),['ADMIN','EXECUTIVE','BILLING']);
   const brokerId=Number(p[2]);
   const r=await query('SELECT * FROM broker_requests WHERE broker_id=$1 ORDER BY created_at DESC',[brokerId]);
   const csv='booking_reference,service,pickup,destination,date,time,broker_rate,platform_rate,delta,status\n'+r.rows.map(row=>`${row.booking_reference||'N/A'},${row.service},"${row.pickup}","${row.destination}",${row.trip_date},${row.trip_time},${row.broker_quoted_rate},${row.platform_calculated_rate},${row.rate_delta},${row.request_status}`).join('\n');
   return {statusCode:200,headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename=broker-export.csv'},body:csv};
  }
  if(p[0]==='ready'&&method==='GET'){const r=await query("SELECT version FROM schema_migrations WHERE version IN ('040.001','041.001','042.001','044.001','045.001','046.001') ORDER BY version");return json(r.rowCount===6?200:503,{ready:r.rowCount===6,migrations:r.rows.map(x=>x.version)})}
  return json(404,{error:'Route not found'});
 }catch(err){console.error(err);return json(err.statusCode||500,{error:err.statusCode?err.message:'Internal server error',requestId:crypto.randomUUID()})}
}
function mapBooking(b){
 const submittedAppointmentTime=getSubmittedAppointmentTime(b);
 const checkInTime=getCheckInTime(b);
 const linkedAppointmentTime=submittedAppointmentTime||normalizeOptionalTripTime(b.trip_time||b.time||'');
 const effectiveSubmittedAppointment=submittedAppointmentTime||linkedAppointmentTime||null;
 return {
  id:b.reference,
  reference:b.reference,
  name:b.name,
  phone:b.phone,
  email:b.email,
  alternatePhone:b.alternate_phone,
  alternateEmail:b.alternate_email,
  service:b.service,
  pickupLocation:b.pickup_location||b.pickupLocation||null,
  pickup:b.pickup,
  destination:b.destination,
  destinationLocation:b.dropoff_location||b.destinationLocation||null,
  pickupLat:b.pickup_lat!=null?Number(b.pickup_lat):b.pickupLat!=null?Number(b.pickupLat):null,
  pickupLng:b.pickup_lng!=null?Number(b.pickup_lng):b.pickupLng!=null?Number(b.pickupLng):null,
  destinationLat:b.destination_lat!=null?Number(b.destination_lat):b.destinationLat!=null?Number(b.destinationLat):null,
  destinationLng:b.destination_lng!=null?Number(b.destination_lng):b.destinationLng!=null?Number(b.destinationLng):null,
  date:b.trip_date||b.date,
  time:String(b.trip_time||b.time||'').slice(0,5),
  pickupTime:normalizeOptionalTripTime(b.pickup_time||b.pickupTime||b.pickupTimeEstimate||'')||null,
  appointmentTime:linkedAppointmentTime,
  submittedAppointmentTime:effectiveSubmittedAppointment,
  checkInTime:checkInTime||null,
  appointmentMissing:!effectiveSubmittedAppointment,
  status:statusLabel(b.status),
  statusLabel:statusLabel(b.status).replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()),
  driver:b.driver_name,
  driverName:b.driver_name,
  driverScopeId:b.driver_scope_id||null,
  vehicle:b.vehicle_unit,
  vehicleUnit:b.vehicle_unit,
  facilityId:b.facility_id,
  distanceMiles:b.distance_miles!=null?Number(b.distance_miles):b.distanceMiles!=null?Number(b.distanceMiles):null,
  estimatedDuration:b.estimated_duration,
  estimatedFare:b.estimated_fare?Number(b.estimated_fare):null,
  paymentStatus:b.payment_status||'UNPAID',
  payerType:b.payer_type||'SELF_PAY',
  tripType:b.trip_type||'ONE_WAY',
  returnTripDate:b.return_trip_date||null,
  returnTripTime:b.return_trip_time?String(b.return_trip_time).slice(0,5):null,
  recurrenceDays:Array.isArray(b.recurrence_days)?b.recurrence_days:[],
  recurrenceEndDate:b.recurrence_end_date||null,
  coverageStatus:b.coverage_status||null,
  coverageMessage:b.coverage_message||null,
  requiresDeposit:Boolean(b.requires_deposit),
  bookingSource:b.booking_source||'CUSTOMER',
  submitterEntity:b.submitter_entity||null,
  brokerCompanyName:b.broker_company_name||null,
  brokerQuotedRate:b.broker_quoted_rate!=null?Number(b.broker_quoted_rate):null,
  brokerAcceptedRate:b.broker_accepted_rate!=null?Number(b.broker_accepted_rate):null,
  depositAmount:b.deposit_amount?Number(b.deposit_amount):null,
  balanceDue:b.balance_due?Number(b.balance_due):null,
  depositPaidAt:b.deposit_paid_at||null,
  paidInFullAt:b.paid_in_full_at||null,
  cancellationFeeAmount:b.cancellation_fee_amount?Number(b.cancellation_fee_amount):0,
  cancellationFeeApplied:Boolean(b.cancellation_fee_applied),
  cancellationRuleSnapshot:b.cancellation_rule_snapshot||null,
  lastUpdatedBy:b.last_updated_by,
  lastUpdatedAt:b.last_updated_at,
  notes:b.notes||null,
 };
  const mappedBooking=mapBooking(r.rows[0]);
  if(intakeRow&&mappedBooking.brokerQuotedRate==null&&intakeRow.broker_quoted_rate!=null){
   mappedBooking.brokerQuotedRate=Number(intakeRow.broker_quoted_rate);
  }
  return json(200,{booking:mappedBooking,intakeAudit});
}

async function mapPatientBooking(value){
 const booking=value&&value.reference&&value.statusLabel?{...value}:mapBooking(value||{});
 booking.driverLocationVisible=false;
 if(!canPatientSeeDriverLocation(booking))return booking;
 const position=await query(`SELECT latitude,longitude,heading,speed_mph,recorded_at FROM gps_positions
  WHERE booking_reference=$1 AND recorded_at>=now()-interval '15 minutes' ORDER BY recorded_at DESC LIMIT 1`,[booking.reference]).catch(()=>({rows:[]}));
 const row=position.rows[0];if(!row)return booking;
 const miles=distanceMiles(row.latitude,row.longitude,booking.pickupLat,booking.pickupLng);
 booking.driverLocationVisible=true;
 booking.driverLocation={latitude:Number(row.latitude),longitude:Number(row.longitude),heading:row.heading==null?null:Number(row.heading),recordedAt:row.recorded_at,distanceToPickupMiles:miles==null?null:Number(miles.toFixed(1))};
 return booking;
}

function mapParseSourceLabel(method){
 const key=String(method||'').toUpperCase();
 if(key==='EMAIL_ATTACHMENT') return 'ATTACHMENT_PARSED';
 if(key==='EMAIL_SUBJECT_FALLBACK') return 'SUBJECT_FALLBACK';
 return null;
}

async function mapBookingsWithIntakeAudit(rows){
 const mapped=(Array.isArray(rows)?rows:[]).map(mapBooking);
 const references=[...new Set(mapped.map((b)=>clean(b.reference)).filter(Boolean))];
 if(!references.length) return mapped;

 const intakeRows=await query(
  `SELECT DISTINCT ON (booking_reference)
    booking_reference,
    submission_method,
    source_received_at,
    source_message_id,
    parse_source_method,
    broker_quoted_rate,
    parsed_payload
   FROM broker_requests
   WHERE booking_reference = ANY($1::text[])
   ORDER BY booking_reference, created_at DESC`,
  [references]
 ).catch(()=>({rows:[]}));

 const attachmentCounts=await query(
  `SELECT booking_reference, COUNT(*)::int AS count
   FROM booking_attachments
   WHERE booking_reference = ANY($1::text[])
   GROUP BY booking_reference`,
  [references]
 ).catch(()=>({rows:[]}));

 const intakeByRef=new Map((intakeRows.rows||[]).map((row)=>[String(row.booking_reference),row]));
 const attachmentByRef=new Map((attachmentCounts.rows||[]).map((row)=>[String(row.booking_reference),Number(row.count||0)]));

 return mapped.map((booking)=>{
  const intake=intakeByRef.get(String(booking.reference||''))||null;
  const method=intake?.submission_method||null;
  const parsedPayload=intake?.parsed_payload&&typeof intake.parsed_payload==='object'?intake.parsed_payload:{};
    const intakePickupTime=normalizeOptionalTripTime(parsedPayload?.pickup_time||'')||null;
  const parseDiagnostics=parsedPayload?.parse_diagnostics&&typeof parsedPayload.parse_diagnostics==='object'?parsedPayload.parse_diagnostics:{};
  const intakeBrokerQuotedRate=intake?.broker_quoted_rate!=null?Number(intake.broker_quoted_rate):null;
  return {
   ...booking,
     pickupTime:booking.pickupTime||intakePickupTime,
   brokerQuotedRate:booking.brokerQuotedRate==null&&intakeBrokerQuotedRate!=null?intakeBrokerQuotedRate:booking.brokerQuotedRate,
   intakeSubmissionMethod:method,
   intakeParseSource:mapParseSourceLabel(method),
   intakeParseMethod:intake?.parse_source_method||null,
   sourceAttachmentCount:attachmentByRef.get(String(booking.reference||''))||0,
   sourceReceivedAt:intake?.source_received_at||null,
   sourceMessageId:intake?.source_message_id||null,
   intakeParseFailureReason:clean(parseDiagnostics.parse_failure_reason||'',240)||null,
   intakeParseDiagnostics:parseDiagnostics,
   intakeParseAttachmentSummary:parseDiagnostics?.attachment_summary||null
  };
 });
}

exports.handler=handler;
exports.sendBrokerRequestConfirmation=sendBrokerRequestConfirmation;
exports.sendBrokerRequestDispatchNotifications=sendBrokerRequestDispatchNotifications;
exports.buildBookingTeamsMessage=buildBookingTeamsMessage;
exports.sendBookingTeamsAlert=sendBookingTeamsAlert;
