const crypto=require('node:crypto');
const SCOPE='futurecare-annapolis-demo',KEY='demo:facility:futurecare-annapolis',USERNAME='annapolis.demo@nexusmt.com';
const FACILITY={name:'FutureCare Annapolis',address:'2700 Southaven Road, Annapolis, MD 21401',source:'https://www.futurecare.com/locations/annapolis/'};
const PATIENTS=[
 {id:'FC-DEMO-01',name:'Evelyn Hart',initials:'EH',service:'Wheelchair',appointment:'Outpatient follow-up',driver:'James Carter',unit:'DEMO-01',pickup:455,appointmentAt:490,travel:20,returnPickup:780,destination:{name:'Luminis Health Anne Arundel Medical Center',address:'2001 Medical Parkway, Annapolis, MD 21401',source:'https://www.luminishealth.org/en/find-a-location/lhaamc?language_content_entity=en'}},
 {id:'FC-DEMO-02',name:'Marcus Reed',initials:'MR',service:'Ambulatory',appointment:'Physical therapy',driver:'Alicia Morgan',unit:'DEMO-02',pickup:495,appointmentAt:540,travel:20,returnPickup:805,destination:{name:'MedStar Health Physical Therapy at Annapolis',address:'810 Bestgate Road, 3rd Floor, Annapolis, MD 21401',source:'https://www.medstarhealth.org/services/outpatient-physical-therapy'}},
 {id:'FC-DEMO-03',name:'Naomi Brooks',initials:'NB',service:'Wheelchair',appointment:'Medical office follow-up',driver:'Daniel Lewis',unit:'DEMO-03',pickup:540,appointmentAt:585,travel:18,returnPickup:830,destination:{name:'Kaiser Permanente Annapolis Medical Center',address:'888 Bestgate Road, Suite 111, Annapolis, MD 21401',source:'https://healthy.kaiserpermanente.org/maryland-virginia-washington-dc/facilities/annapolis-medical-center-100425'}},
 {id:'FC-DEMO-04',name:'Samuel Parker',initials:'SP',service:'Wheelchair',appointment:'Outpatient rehabilitation',driver:'Priya Shah',unit:'DEMO-04',pickup:575,appointmentAt:630,travel:40,returnPickup:855,destination:{name:'Johns Hopkins Health Care Center – Odenton',address:'1132 Annapolis Road, Suite 101, Odenton, MD 21113',source:'https://www.hopkinsmedicine.org/patient-care/locations/johns-hopkins-health-care-center-odenton'}},
 {id:'FC-DEMO-05',name:'Helen Owens',initials:'HO',service:'Stretcher',appointment:'Specialty follow-up',driver:'Michael Bennett',unit:'DEMO-05',pickup:620,appointmentAt:690,travel:45,returnPickup:880,destination:{name:'UM Baltimore Washington Medical Center',address:'301 Hospital Drive, Glen Burnie, MD 21061',source:'https://www.umms.org/bwmc'}}
];
const AUTO_EVENTS=[
 {id:'auto-outbound-delay',patientId:'FC-DEMO-02',at:505,type:'delay',leg:'outbound',minutes:15,resolvedAt:530,note:'Traffic slowdown on the outbound route. Arrival estimate revised by 15 minutes.'},
 {id:'auto-entrance-issue',patientId:'FC-DEMO-03',at:545,type:'issue',leg:'outbound',minutes:8,resolvedAt:560,note:'Receiving entrance changed. Dispatch is confirming the correct handoff location with the destination.'},
 {id:'auto-return-delay',patientId:'FC-DEMO-04',at:860,type:'delay',leg:'return',minutes:15,resolvedAt:910,note:'Return-route traffic slowdown. Facility receiving team and monitoring contacts have a revised return ETA.'}
];
function initialState(now=Date.now()){return {runId:crypto.randomUUID(),baseMinute:435,anchorAt:now,speed:120,paused:true,overrides:[],acknowledged:[]};}
function endMinute(state){return Math.max(930,...PATIENTS.map(patient=>patient.returnPickup+patient.travel+mergedEvents(state).filter(e=>e.patientId===patient.id&&e.leg==='return').reduce((sum,e)=>sum+Number(e.minutes||0),0)+5));}
function minuteAt(state,now=Date.now()){return Math.max(435,Math.min(endMinute(state),Number(state.baseMinute)+(state.paused?0:(now-Number(state.anchorAt))/1000*Number(state.speed)/60)));}
function timeLabel(minute){const rounded=Math.round(minute),hour=Math.floor(rounded/60);return `${hour%12||12}:${String(rounded%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;}
function recipients(){return ['Facility manager (demo inbox)','Facility receiving team (demo)','Destination contact (demo)','Patient / authorized caregiver (demo)','Nexus dispatch (demo)'];}
function project(state,now=Date.now()){
 const minute=minuteAt(state,now),messages=[],alerts=[];
 function notify(id,patient,at,title,text,severity='info',extra={}){if(at>minute)return;messages.push({id:`${state.runId}:${id}`,patientId:patient.id,patient:patient.name,at,time:timeLabel(at),title,text,severity,recipients:recipients(),delivery:'Displayed in demo manager inbox · SMS/email simulated, not sent',...extra});}
 const patients=PATIENTS.map(patient=>{
  const events=mergedEvents(state).filter(event=>event.patientId===patient.id&&event.at<=minute);
  const outboundDelay=events.filter(e=>e.leg==='outbound').reduce((sum,e)=>sum+Number(e.minutes||0),0);
  const returnDelay=events.filter(e=>e.leg==='return').reduce((sum,e)=>sum+Number(e.minutes||0),0);
  const outboundArrival=patient.pickup+patient.travel+outboundDelay,returnArrival=patient.returnPickup+patient.travel+returnDelay;
  let stage='Scheduled',phase='scheduled',progress=0,eta=patient.pickup;
  if(minute>=patient.pickup-15&&minute<patient.pickup){stage='Driver to facility';phase='approach';progress=(minute-(patient.pickup-15))/15;}
  else if(minute>=patient.pickup&&minute<outboundArrival){const pausedMinutes=events.filter(e=>e.leg==='outbound').reduce((sum,e)=>sum+Math.max(0,Math.min(Number(e.minutes||0),minute-Math.max(patient.pickup,e.at))),0);stage='Traveling to appointment';phase='outbound';progress=(minute-patient.pickup-pausedMinutes)/patient.travel;eta=outboundArrival;}
  else if(minute>=outboundArrival&&minute<patient.returnPickup-15){stage=minute>=patient.appointmentAt+45?'Awaiting scheduled return':minute>=patient.appointmentAt?'At appointment':'Arrived · awaiting appointment';phase='appointment';progress=1;eta=patient.returnPickup;}
  else if(minute>=patient.returnPickup-15&&minute<patient.returnPickup){stage='Return vehicle approaching';phase='return-approach';progress=(minute-(patient.returnPickup-15))/15;eta=patient.returnPickup;}
  else if(minute>=patient.returnPickup&&minute<returnArrival){const pausedMinutes=events.filter(e=>e.leg==='return').reduce((sum,e)=>sum+Math.max(0,Math.min(Number(e.minutes||0),minute-Math.max(patient.returnPickup,e.at))),0);stage='Returning to facility';phase='return';progress=(minute-patient.returnPickup-pausedMinutes)/patient.travel;eta=returnArrival;}
  else if(minute>=returnArrival){stage='Back at FutureCare';phase='complete';progress=1;eta=returnArrival;}
  const active=events.filter(e=>e.resolvedAt==null||e.resolvedAt>minute);
  const risk=active.some(e=>e.type==='issue')?'issue':active.length?'delay':'normal';
  const currentEta=phase==='return'||phase==='return-approach'||phase==='complete'?returnArrival:outboundArrival;
  for(const event of events){
   const eventDelay=events.filter(e=>e.leg===event.leg&&e.at<=event.at).reduce((sum,e)=>sum+Number(e.minutes||0),0);
   const eventEta=(event.leg==='return'?patient.returnPickup:patient.pickup)+patient.travel+eventDelay;
   const messageId=`${state.runId}:${event.id}`;
   const acknowledged=(state.acknowledged||[]).includes(messageId);
   notify(event.id,patient,event.at,event.type==='issue'?'Reported issue — review required':'Delay detected — ETA revised',`${event.note}${event.minutes?` Revised ${event.leg==='return'?'facility return':'destination arrival'} ETA: ${timeLabel(eventEta)}.`:''}`,event.type==='issue'?'issue':'delay',{eta:timeLabel(eventEta),acknowledged});
   if(event.resolvedAt!=null&&event.resolvedAt<=minute)notify(`${event.id}-resolved`,patient,event.resolvedAt,event.type==='issue'?'Reported issue resolved':'Delay cleared',`Dispatch has confirmed the next step. Current arrival estimate: ${timeLabel(eventEta)}.`,'success');
   if(active.includes(event))alerts.push({id:messageId,patientId:patient.id,patient:patient.name,severity:event.type==='issue'?'issue':'delay',title:event.type==='issue'?'Receiving handoff needs review':'Transport delayed',note:event.note,eta:timeLabel(eventEta),acknowledged});
  }
  notify(`${patient.id}-activation`,patient,patient.pickup-15,'Driver activated outbound trip',`${patient.driver} is on the way to ${FACILITY.name}. Pickup: ${timeLabel(patient.pickup)}.`);
  const departureEta=patient.pickup+patient.travel+events.filter(e=>e.leg==='outbound'&&e.at<=patient.pickup).reduce((sum,e)=>sum+Number(e.minutes||0),0);
  notify(`${patient.id}-departed`,patient,patient.pickup,'Patient departed facility',`${patient.name} is on board with ${patient.driver}, traveling to ${patient.destination.name}. Arrival ETA: ${timeLabel(departureEta)}.`);
  notify(`${patient.id}-appointment`,patient,outboundArrival,'Arrived for appointment',`${patient.name} has arrived at ${patient.destination.name}. Return pickup remains scheduled for ${timeLabel(patient.returnPickup)}.`,'success');
  notify(`${patient.id}-return-activation`,patient,patient.returnPickup-15,'Return pickup approaching',`${patient.driver} is heading to the appointment location. Scheduled return pickup: ${timeLabel(patient.returnPickup)}.`);
  const returnDepartureEta=patient.returnPickup+patient.travel+events.filter(e=>e.leg==='return'&&e.at<=patient.returnPickup).reduce((sum,e)=>sum+Number(e.minutes||0),0);
  notify(`${patient.id}-return`,patient,patient.returnPickup,'Return trip started',`${patient.name} is returning to FutureCare Annapolis. Facility arrival ETA: ${timeLabel(returnDepartureEta)}.`);
  notify(`${patient.id}-back`,patient,returnArrival,'Patient returned — handoff complete',`${patient.name} is back at ${FACILITY.name}. The facility receiving team has a simulated handoff-complete notification.`,'success');
  return {...patient,fictional:true,stage,phase,progress:Math.max(0,Math.min(1,progress)),eta,etaLabel:timeLabel(eta),arrivalEta:timeLabel(currentEta),outboundArrival,returnArrival,risk,alerts:active.map(e=>e.note),pickupLabel:timeLabel(patient.pickup),appointmentLabel:timeLabel(patient.appointmentAt),returnLabel:timeLabel(patient.returnPickup),returnArrivalLabel:timeLabel(returnArrival),outboundDelay,returnDelay};
 });
 messages.sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
 return {scope:SCOPE,facility:FACILITY,scenarioDate:'2026-10-26',scenarioLabel:'Monday, October 26, 2026 · Eastern Time',fictional:true,minute,endMinute:endMinute(state),endLabel:timeLabel(endMinute(state)),time:timeLabel(minute),paused:state.paused||minute>=endMinute(state),speed:state.speed,runId:state.runId,patients,messages,alerts,severity:alerts.some(a=>a.severity==='issue')?'issue':alerts.length?'delay':'normal',metrics:{patients:5,legs:10,away:patients.filter(p=>['outbound','appointment','return-approach','return'].includes(p.phase)).length,returned:patients.filter(p=>p.phase==='complete').length,active:patients.filter(p=>['approach','outbound','return-approach','return'].includes(p.phase)).length,alerts:alerts.length,unread:alerts.filter(a=>!a.acknowledged).length}};
}
function control(state,body,now=Date.now()){
 const current=minuteAt(state,now),next={...state,baseMinute:current,anchorAt:now};
 if(body.action==='restart')return {...initialState(now),paused:false};
 if(body.action==='play')next.paused=false;
 else if(body.action==='pause')next.paused=true;
 else if(body.action==='seek'){const value=Number(body.minute);if(!Number.isFinite(value)||value<435||value>endMinute(state))throw Object.assign(Error('Choose a time within the demo schedule.'),{statusCode:400});next.baseMinute=value;}
 else if(body.action==='speed'){const value=Number(body.speed);if(![30,60,120,240].includes(value))throw Object.assign(Error('Choose a supported playback speed.'),{statusCode:400});next.speed=value;}
 else if(body.action==='ack')next.acknowledged=[...new Set([...(state.acknowledged||[]),...project(state,now).alerts.map(a=>a.id)])];
 else if(['delay','issue','resolve'].includes(body.action)){
  const patient=PATIENTS.find(p=>p.id===body.patientId);if(!patient)throw Object.assign(Error('Choose one of the five demo patients.'),{statusCode:400});
  const overrides=[...(state.overrides||[])];
  if(body.action==='resolve'){
   const resolved=new Set();
   for(const event of mergedEvents(state).filter(e=>e.patientId===patient.id&&e.at<=current&&(e.resolvedAt==null||e.resolvedAt>current))){resolved.add(event.id);if(!overrides.some(e=>e.id===event.id))overrides.push({...event,resolvedAt:current});}
   next.overrides=overrides.map(e=>resolved.has(e.id)?{...e,resolvedAt:current}:e);
  }else{
   if(overrides.filter(e=>e.at<=current&&(e.resolvedAt==null||e.resolvedAt>current)).length>=10)throw Object.assign(Error('Resolve an existing demo alert before adding another.'),{statusCode:409});
   const snapshot=project(state,now).patients.find(p=>p.id===patient.id);
   if(snapshot.phase==='complete')throw Object.assign(Error('This patient has returned. Restart or rewind the demo to show a trip change.'),{statusCode:409});
   const leg=current>=patient.returnPickup-15?'return':'outbound';
   overrides.push({id:`manual-${crypto.randomUUID()}`,patientId:patient.id,at:current,type:body.action,leg,minutes:body.action==='delay'?15:0,resolvedAt:body.action==='delay'?current+15:null,note:body.action==='delay'?'Presenter scenario: driver reported a 15-minute transport delay. Facility manager and all monitoring parties have an updated ETA.':'Presenter scenario: transport coordination issue reported. Dispatch review and facility-manager acknowledgment requested.'});next.overrides=overrides;
  }
 }else throw Object.assign(Error('Unsupported demo action.'),{statusCode:400});
 return next;
}
function mergedEvents(state){const overrides=new Map((state.overrides||[]).map(e=>[e.id,e]));return [...AUTO_EVENTS.filter(e=>!overrides.has(e.id)),...overrides.values()];}
function encodeToken(secret,now=Date.now()){const payload=Buffer.from(JSON.stringify({scope:SCOPE,expires:now+8*3600000,nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');return `${payload}.${crypto.createHmac('sha256',secret).update(payload).digest('base64url')}`;}
function validToken(token,secret,now=Date.now()){try{const [payload,signature,...extra]=String(token).split('.');if(extra.length||!payload||!signature)return false;const expected=crypto.createHmac('sha256',secret).update(payload).digest();const supplied=Buffer.from(signature,'base64url');if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return false;const data=JSON.parse(Buffer.from(payload,'base64url'));return data.scope===SCOPE&&Number(data.expires)>now;}catch{return false;}}
function passwordHash(password,salt){return crypto.scryptSync(String(password),salt,32).toString('hex');}
function createHandler({query,getPool,requireUser,bearer,json,parseBody}){
 return async function handle(event,p,method){
  if(p[0]!=='facility-demo')return null;
  if(method==='POST'&&p[1]==='setup'){
   await requireUser(bearer(event),['ADMIN']);
   const password=crypto.randomBytes(12).toString('base64url'),salt=crypto.randomBytes(16).toString('hex');
   const config={scope:SCOPE,username:USERNAME,salt,passwordHash:passwordHash(password,salt),secret:crypto.randomBytes(32).toString('hex'),state:initialState()};
   const result=await query('INSERT INTO system_settings(key,value,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO NOTHING RETURNING key',[KEY,JSON.stringify(config)]);
   if(!result.rowCount)return json(200,{configured:true,username:USERNAME,message:'Demo access already exists. Use the credentials issued during initial setup.'});
   return json(201,{configured:true,username:USERNAME,password,message:'Demo-only manager access created. This login cannot access real patient data or production operations.'});
  }
  if(method==='POST'&&p[1]==='login'){
   const ip=String(event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']||'unknown').split(',')[0],bucket=Math.floor(Date.now()/900000);
   const rateKey=`demo:facility:login:${crypto.createHash('sha256').update(ip).digest('hex')}`;
   const rate=await query(`INSERT INTO system_settings(key,value,updated_at) VALUES($1,jsonb_build_object('bucket',$2::bigint,'count',1),now()) ON CONFLICT(key) DO UPDATE SET value=jsonb_build_object('bucket',$2::bigint,'count',CASE WHEN system_settings.value->>'bucket'=$2::text THEN COALESCE((system_settings.value->>'count')::int,0)+1 ELSE 1 END),updated_at=now() RETURNING value`,[rateKey,bucket]);
   if(Number(rate.rows[0]?.value?.count)>20)return json(429,{error:'Too many demo login attempts. Try again in 15 minutes.'});
   const config=(await query('SELECT value FROM system_settings WHERE key=$1',[KEY])).rows[0]?.value;
   if(!config)return json(409,{error:'An administrator must prepare this presentation demo first.'});
   const body=parseBody(event);if(typeof body.password!=='string'||body.password.length>256)return json(401,{error:'Check your demo manager email and password.'});
   const supplied=Buffer.from(passwordHash(body.password,config.salt),'hex'),expected=Buffer.from(config.passwordHash,'hex');
   if(String(body.email||'').trim().toLowerCase()!==USERNAME||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return json(401,{error:'Check your demo manager email and password.'});
   return json(200,{token:encodeToken(config.secret),user:{name:'FutureCare Annapolis Demo Manager',scope:SCOPE},dashboard:project(config.state)});
  }
  const config=(await query('SELECT value FROM system_settings WHERE key=$1',[KEY])).rows[0]?.value;
  let admin=false;try{admin=(await requireUser(bearer(event),['ADMIN'])).role==='ADMIN';}catch{}
  if(!config)return json(admin?409:401,{error:admin?'Prepare demo manager access first.':'Sign in to the facility demo.'});
  if(!admin&&!validToken(bearer(event),config.secret))return json(401,{error:'Your demo session expired. Sign in again.'});
  if(method==='GET'&&p[1]==='state')return json(200,{dashboard:project(config.state),admin});
  if(method==='POST'&&p[1]==='control'){
   const client=await getPool().connect();
   try{await client.query('BEGIN');const locked=(await client.query('SELECT value FROM system_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0]?.value;if(!locked)throw Error('Demo configuration missing.');
    locked.state=control(locked.state,parseBody(event));await client.query('UPDATE system_settings SET value=$2::jsonb,updated_at=now() WHERE key=$1',[KEY,JSON.stringify(locked)]);await client.query('COMMIT');return json(200,{dashboard:project(locked.state),admin});
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  return json(404,{error:'Demo action not found.'});
 };
}
module.exports={SCOPE,KEY,USERNAME,FACILITY,PATIENTS,AUTO_EVENTS,initialState,minuteAt,timeLabel,project,control,mergedEvents,encodeToken,validToken,passwordHash,createHandler};
