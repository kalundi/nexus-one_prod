const Billing=require('./facility-demo-billing.cjs');
const Booking=require('./facility-demo-booking.cjs');
const crypto=require('node:crypto');
const DemoAccount=require('./facility-demo-account.cjs');
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
const DATES=Array.from({length:5},(_,index)=>`2026-10-${26+index}`);
const WEEKLY_RESIDENTS=[
 PATIENTS.map(patient=>patient.name),
 ['Dorothy Bennett','Ronald Ellis','Patricia Coleman','Arthur Simmons','Gloria Mitchell'],
 ['Clara Whitmore','Victor Hayes','Lillian Foster','George Bennett','Anita Lawson'],
 ['Walter Sinclair','Beatrice Palmer','Leonard Price','Sylvia Dawson','Josephine Grant'],
 ['Thomas Whitaker','Marian Russell','Edwin Chambers','Ruth Delaney','Calvin Monroe']
];
function dayIndex(state){return Math.max(0,DATES.indexOf(state.date||DATES[0]));}
function resident(day,index){const name=WEEKLY_RESIDENTS[day][index];return {id:`FC-DEMO-${String(day*5+index+1).padStart(2,'0')}`,name,initials:name.split(' ').map(part=>part[0]).join('')};}
function migrateState(state){
 if(state.rosterVersion===2)return state;
 const day=dayIndex(state),aliases=new Map(PATIENTS.map((patient,index)=>[patient.id,resident(day,index)]));
 const remap=id=>aliases.get(id)?.id||id;
 const changes=(state.scheduleChanges||[]).map(change=>{let text=change.text;PATIENTS.forEach((patient,index)=>{text=String(text||'').replaceAll(patient.name,resident(day,index).name);});return {...change,patientId:remap(change.patientId),text};});
 return {...state,rosterVersion:2,returnSchedules:Object.fromEntries(Object.entries(state.returnSchedules||{}).map(([id,value])=>[remap(id),value])),overrides:(state.overrides||[]).map(event=>({...event,patientId:remap(event.patientId)})),scheduleChanges:changes};
}
function initialState(now=Date.now(),date=DATES[0]){return {date,rosterVersion:2,runId:crypto.randomUUID(),baseMinute:435,anchorAt:now,speed:120,paused:true,overrides:[],acknowledged:[],returnSchedules:{},scheduleChanges:[]};}
function patientsFor(state){
 state=migrateState(state);const day=dayIndex(state);
 const seeds=PATIENTS.map((patient,index)=>{const identity=resident(day,index),appointmentAt=patient.appointmentAt+day*5,pickup=patient.pickup+day*5,waitMinutes=[60,120,180][(index+day)%3];return {...patient,...identity,slotIndex:index,destinationIndex:index,distanceMiles:[8,7.5,7.2,23,26][index],pickup,appointmentAt,returnPickup:appointmentAt+waitMinutes,waitMinutes,vehicleWaiting:true,...state.bookingEdits?.[identity.id]};});
 return [...seeds,...(state.additionalBookings||[])].filter(patient=>!(state.cancelledIds||[]).includes(patient.id)).map(patient=>({...patient,...state.returnSchedules?.[patient.id]})).sort((a,b)=>a.pickup-b.pickup||a.id.localeCompare(b.id));
}
function endMinute(state){return Math.max(930,...patientsFor(state).map(patient=>(patient.tripType==='ONE_WAY'?patient.pickup+Number(patient.stopWaitMinutes||0):patient.returnPickup)+Number(patient.scheduledTravelMinutes??patient.travel)+mergedEvents(state).filter(e=>e.patientId===patient.id&&e.leg===(patient.tripType==='ONE_WAY'?'outbound':'return')).reduce((sum,e)=>sum+Number(e.minutes||0),0)+5));}
function minuteAt(state,now=Date.now()){return Math.max(435,Math.min(endMinute(state),Number(state.baseMinute)+(state.paused?0:(now-Number(state.anchorAt))/1000*Number(state.speed)/60)));}
function timeLabel(minute){const rounded=Math.round(minute),hour=Math.floor(rounded/60)%24;return `${hour%12||12}:${String(rounded%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}${rounded>=1440?' (next day)':''}`;}
function recipients(){return ['Facility manager (demo inbox)','Facility receiving team (demo)','Destination contact (demo)','Patient / authorized caregiver (demo)','Nexus dispatch (demo)'];}
function project(state,now=Date.now()){
 state=migrateState(state);
 const minute=minuteAt(state,now),messages=[],alerts=[];
 function notify(id,patient,at,title,text,severity='info',extra={}){if(at>minute)return;messages.push({id:`${state.runId}:${id}`,patientId:patient.id,patient:patient.name,at,time:timeLabel(at),title,text,severity,recipients:patient.recipients||recipients(),delivery:'Displayed in demo manager inbox · SMS/email simulated, not sent',...extra});}
 const patients=patientsFor(state).map(patient=>{
  const events=mergedEvents(state).filter(event=>event.patientId===patient.id&&event.at<=minute);
  const outboundDelay=events.filter(e=>e.leg==='outbound').reduce((sum,e)=>sum+Number(e.minutes||0),0);
  const returnDelay=events.filter(e=>e.leg==='return').reduce((sum,e)=>sum+Number(e.minutes||0),0);
  const outboundArrival=patient.pickup+Number(patient.scheduledTravelMinutes??patient.travel)+Number(patient.stopWaitMinutes||0)+outboundDelay,returnArrival=patient.tripType==='ONE_WAY'?null:patient.returnPickup+Number(patient.scheduledTravelMinutes??patient.travel)+returnDelay;
  let stage='Scheduled',phase='scheduled',progress=0,eta=patient.pickup;
  if(minute>=patient.pickup-15&&minute<patient.pickup){stage='Driver to facility';phase='approach';progress=(minute-(patient.pickup-15))/15;}
  else if(minute>=patient.pickup&&minute<outboundArrival){const pausedMinutes=events.filter(e=>e.leg==='outbound').reduce((sum,e)=>sum+Math.max(0,Math.min(Number(e.minutes||0),minute-Math.max(patient.pickup,e.at))),0);stage='Traveling to appointment';phase='outbound';progress=(minute-patient.pickup-pausedMinutes)/(Number(patient.scheduledTravelMinutes??patient.travel)+Number(patient.stopWaitMinutes||0));eta=outboundArrival;}
  else if(patient.tripType==='ONE_WAY'&&minute>=outboundArrival){stage='Destination handoff complete';phase='complete';progress=1;eta=outboundArrival;}
  else if(minute>=outboundArrival&&minute<patient.returnPickup-15){stage=minute>=patient.appointmentAt+45?'Awaiting scheduled return':minute>=patient.appointmentAt?'At appointment':'Arrived · awaiting appointment';phase='appointment';progress=1;eta=patient.returnPickup;}
  else if(minute>=patient.returnPickup-15&&minute<patient.returnPickup){stage='Return vehicle approaching';phase='return-approach';progress=(minute-(patient.returnPickup-15))/15;eta=patient.returnPickup;}
  else if(minute>=patient.returnPickup&&minute<returnArrival){const pausedMinutes=events.filter(e=>e.leg==='return').reduce((sum,e)=>sum+Math.max(0,Math.min(Number(e.minutes||0),minute-Math.max(patient.returnPickup,e.at))),0);stage='Returning to facility';phase='return';progress=(minute-patient.returnPickup-pausedMinutes)/Number(patient.scheduledTravelMinutes??patient.travel);eta=returnArrival;}
  else if(minute>=returnArrival){stage=patient.origin&&patient.origin.address!==FACILITY.address?'Return handoff complete':'Back at FutureCare';phase='complete';progress=1;eta=returnArrival;}
  const active=events.filter(e=>e.resolvedAt==null||e.resolvedAt>minute);
  const risk=active.some(e=>e.type==='issue')?'issue':active.length?'delay':'normal';
  const currentEta=patient.tripType!=='ONE_WAY'&&['return','return-approach','complete'].includes(phase)?returnArrival:outboundArrival;
  for(const event of events){
   const eventDelay=events.filter(e=>e.leg===event.leg&&e.at<=event.at).reduce((sum,e)=>sum+Number(e.minutes||0),0);
   const eventEta=(event.leg==='return'?patient.returnPickup:patient.pickup+Number(patient.stopWaitMinutes||0))+Number(patient.scheduledTravelMinutes??patient.travel)+eventDelay;
   const messageId=`${state.runId}:${event.id}`;
   const acknowledged=(state.acknowledged||[]).includes(messageId);
   notify(event.id,patient,event.at,event.type==='issue'?'Reported issue — review required':'Delay detected — ETA revised',`${event.note}${event.minutes?` Revised ${event.leg==='return'?'facility return':'destination arrival'} ETA: ${timeLabel(eventEta)}.`:''}`,event.type==='issue'?'issue':'delay',{eta:timeLabel(eventEta),acknowledged});
   if(event.resolvedAt!=null&&event.resolvedAt<=minute)notify(`${event.id}-resolved`,patient,event.resolvedAt,event.type==='issue'?'Reported issue resolved':'Delay cleared',`Dispatch has confirmed the next step. Current arrival estimate: ${timeLabel(eventEta)}.`,'success');
   if(active.includes(event))alerts.push({id:messageId,patientId:patient.id,patient:patient.name,severity:event.type==='issue'?'issue':'delay',title:event.type==='issue'?'Receiving handoff needs review':'Transport delayed',note:event.note,eta:timeLabel(eventEta),acknowledged});
  }
  notify(`${patient.id}-activation`,patient,patient.pickup-15,'Driver activated outbound trip',`${patient.driver} is on the way to ${patient.origin?.name||FACILITY.name}. Pickup: ${timeLabel(patient.pickup)}.`);
  const departureEta=patient.pickup+Number(patient.scheduledTravelMinutes??patient.travel)+Number(patient.stopWaitMinutes||0)+events.filter(e=>e.leg==='outbound'&&e.at<=patient.pickup).reduce((sum,e)=>sum+Number(e.minutes||0),0);
  notify(`${patient.id}-departed`,patient,patient.pickup,patient.origin&&patient.origin.address!==FACILITY.address?'Patient pickup complete':'Patient departed facility',`${patient.name} is on board with ${patient.driver}, traveling to ${patient.destination.name}. Arrival ETA: ${timeLabel(departureEta)}.`);
  notify(`${patient.id}-appointment`,patient,outboundArrival,'Arrived for appointment',`${patient.name} has arrived at ${patient.destination.name}. ${patient.tripType==='ONE_WAY'?'Destination handoff complete; no return leg is booked.':`Return pickup remains scheduled for ${timeLabel(patient.returnPickup)}.`}`,'success');
  if(patient.tripType!=='ONE_WAY'){
  notify(`${patient.id}-return-activation`,patient,patient.returnPickup-15,'Return pickup approaching',`${patient.driver} is heading to the appointment location. Scheduled return pickup: ${timeLabel(patient.returnPickup)}.`);
  const returnDepartureEta=patient.returnPickup+Number(patient.scheduledTravelMinutes??patient.travel)+events.filter(e=>e.leg==='return'&&e.at<=patient.returnPickup).reduce((sum,e)=>sum+Number(e.minutes||0),0);
  notify(`${patient.id}-return`,patient,patient.returnPickup,'Return trip started',`${patient.name} is returning to ${patient.origin?.name||FACILITY.name}. Facility arrival ETA: ${timeLabel(returnDepartureEta)}.`);
  notify(`${patient.id}-back`,patient,returnArrival,'Patient returned — handoff complete',`${patient.name} is back at ${patient.origin?.name||FACILITY.name}. The facility receiving team has a simulated handoff-complete notification.`,'success');
  }
  return {...patient,fictional:true,stage,phase,progress:Math.max(0,Math.min(1,progress)),eta,etaLabel:timeLabel(eta),arrivalEta:timeLabel(currentEta),outboundArrival,returnArrival,risk,alerts:active.map(e=>e.note),pickupLabel:timeLabel(patient.pickup),appointmentLabel:timeLabel(patient.appointmentAt),returnLabel:patient.tripType==='ONE_WAY'?'One-way':timeLabel(patient.returnPickup),returnArrivalLabel:returnArrival===null?'Not booked':timeLabel(returnArrival),outboundDelay,returnDelay};
 });
 for(const change of state.scheduleChanges||[]){const patient=patients.find(p=>p.id===change.patientId);if(patient)notify(change.id,patient,change.at,'Return pickup rescheduled',change.text,'info');}
 for(const [sequence,event] of (state.bookingEvents||[]).entries())notify(event.id,{id:event.patientId,name:event.patient,recipients:event.recipients},event.at,event.title,event.text,'info',{createdAt:event.createdAt,sequence});
 messages.sort((a,b)=>b.at-a.at||new Date(b.createdAt||0)-new Date(a.createdAt||0)||(b.sequence||0)-(a.sequence||0)||a.id.localeCompare(b.id));
 const date=state.date||DATES[0],label=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
 const cancelledBookings=patientsFor({...state,cancelledIds:[]}).filter(patient=>(state.cancelledIds||[]).includes(patient.id)).map(patient=>({id:patient.id,name:patient.name,service:patient.service,destination:patient.destination.name,pickup:timeLabel(patient.pickup)}));
 return {scope:SCOPE,facility:FACILITY,scenarioDate:date,availableDates:DATES,scenarioLabel:`${label} · Eastern Time`,fictional:true,minute,endMinute:endMinute(state),endLabel:timeLabel(endMinute(state)),time:timeLabel(minute),paused:state.paused||minute>=endMinute(state),speed:state.speed,runId:state.runId,patients,cancelledBookings,bookingTargets:PATIENTS.map((patient,index)=>({index,...patient.destination,travel:patient.travel,distanceMiles:[8,7.5,7.2,23,26][index]})),lastBookingId:state.lastBookingId||null,messages,alerts,severity:alerts.some(a=>a.severity==='issue')?'issue':alerts.length?'delay':'normal',metrics:{patients:patients.length,legs:patients.reduce((sum,p)=>sum+(p.tripType==='ONE_WAY'?1:2),0),away:patients.filter(p=>['outbound','appointment','return-approach','return'].includes(p.phase)).length,returned:patients.filter(p=>p.phase==='complete').length,active:patients.filter(p=>['approach','outbound','return-approach','return'].includes(p.phase)).length,alerts:alerts.length,unread:alerts.filter(a=>!a.acknowledged).length}};
}
function control(state,body,now=Date.now(),settings){
 state=migrateState(state);
 const current=minuteAt(state,now),next={...state,baseMinute:current,anchorAt:now};
 if(body.date&&body.date!==(state.date||DATES[0]))throw Object.assign(Error('The selected demo day changed. Refresh before saving.'),{statusCode:409});
 if(Booking.ACTIONS.includes(body.action))return Booking.apply(state,body,{patients:patientsFor(state),allPatients:patientsFor({...state,cancelledIds:[]}),templates:PATIENTS,recipients:recipients(),current,now,facility:FACILITY,settings});
 if(body.action==='restart')return {...state,...initialState(now,state.date||DATES[0]),returnSchedules:state.returnSchedules||{},bookingEdits:state.bookingEdits||{},additionalBookings:state.additionalBookings||[],cancelledIds:state.cancelledIds||[],bookingRequests:state.bookingRequests||{},bookingEvents:state.bookingEvents||[],scheduleChanges:[],paused:false};
 if(body.action==='returnSchedule'){
  const patient=patientsFor(state).find(p=>p.id===body.patientId);
  if(!patient||patient.tripType==='ONE_WAY')throw Object.assign(Error('Choose a demo patient with a return leg.'),{statusCode:400});
  let pickup;
  if(body.waitHours!=null){if(![1,2,3].includes(Number(body.waitHours)))throw Object.assign(Error('Select a 1, 2 or 3 hour appointment wait.'),{statusCode:400});pickup=patient.appointmentAt+Number(body.waitHours)*60;}
  else{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.returnTime||'')))throw Object.assign(Error('Enter a valid return pickup time.'),{statusCode:400});const [h,m]=body.returnTime.split(':').map(Number);pickup=h*60+m;}
  if(pickup<patient.appointmentAt+15||pickup>1380)throw Object.assign(Error('Return pickup must be at least 15 minutes after the appointment and no later than 11 PM.'),{statusCode:400});
  if(typeof body.vehicleWaiting!=='boolean')throw Object.assign(Error('Choose whether the vehicle waits at the appointment.'),{statusCode:400});
  const schedule={returnPickup:pickup,waitMinutes:pickup-patient.appointmentAt,vehicleWaiting:body.vehicleWaiting};
  next.returnSchedules={...(state.returnSchedules||{}),[patient.id]:schedule};
  next.scheduleChanges=[...(state.scheduleChanges||[]).slice(-49),{id:`schedule-${crypto.randomUUID()}`,patientId:patient.id,at:current,text:`${patient.name}: return pickup changed from ${timeLabel(patient.returnPickup)} to ${timeLabel(pickup)}. Appointment wait: ${schedule.waitMinutes} minutes. ${body.vehicleWaiting?'Vehicle remains on site; configured waiting charges apply once to the return leg.':'Vehicle leaves and returns; appointment time is not billable waiting.'} Daily invoice recalculated; facility manager and monitoring parties notified (simulated).`}];
  return next;
 }
 if(body.action==='play')next.paused=false;
 else if(body.action==='pause')next.paused=true;
 else if(body.action==='seek'){const value=Number(body.minute);if(!Number.isFinite(value)||value<435||value>endMinute(state))throw Object.assign(Error('Choose a time within the demo schedule.'),{statusCode:400});next.baseMinute=value;}
 else if(body.action==='speed'){const value=Number(body.speed);if(![30,60,120,240].includes(value))throw Object.assign(Error('Choose a supported playback speed.'),{statusCode:400});next.speed=value;}
 else if(body.action==='ack')next.acknowledged=[...new Set([...(state.acknowledged||[]),...project(state,now).alerts.map(a=>a.id)])];
 else if(['delay','issue','resolve'].includes(body.action)){
  const patient=patientsFor(state).find(p=>p.id===body.patientId);if(!patient)throw Object.assign(Error('Choose a scheduled demo patient.'),{statusCode:400});
  const overrides=[...(state.overrides||[])];
  if(body.action==='resolve'){
   const resolved=new Set();
   for(const event of mergedEvents(state).filter(e=>e.patientId===patient.id&&e.at<=current&&(e.resolvedAt==null||e.resolvedAt>current))){resolved.add(event.id);if(!overrides.some(e=>e.id===event.id))overrides.push({...event,resolvedAt:current});}
   next.overrides=overrides.map(e=>resolved.has(e.id)?{...e,resolvedAt:current}:e);
  }else{
   if(overrides.filter(e=>e.at<=current&&(e.resolvedAt==null||e.resolvedAt>current)).length>=10)throw Object.assign(Error('Resolve an existing demo alert before adding another.'),{statusCode:409});
   const snapshot=project(state,now).patients.find(p=>p.id===patient.id);
   if(snapshot.phase==='complete')throw Object.assign(Error('This patient has returned. Restart or rewind the demo to show a trip change.'),{statusCode:409});
   const leg=patient.tripType!=='ONE_WAY'&&current>=patient.returnPickup-15?'return':'outbound';
   overrides.push({id:`manual-${crypto.randomUUID()}`,patientId:patient.id,at:current,type:body.action,leg,minutes:body.action==='delay'?15:0,resolvedAt:body.action==='delay'?current+15:null,note:body.action==='delay'?'Presenter scenario: driver reported a 15-minute transport delay. Facility manager and all monitoring parties have an updated ETA.':'Presenter scenario: transport coordination issue reported. Dispatch review and facility-manager acknowledgment requested.'});next.overrides=overrides;
  }
 }else throw Object.assign(Error('Unsupported demo action.'),{statusCode:400});
 return next;
}
function mergedEvents(state){
 state=migrateState(state);const overrides=new Map((state.overrides||[]).map(e=>[e.id,e])),day=dayIndex(state),offset=day*5,patients=patientsFor(state);
 return [...AUTO_EVENTS.filter(e=>!overrides.has(e.id)).flatMap(event=>{const index=PATIENTS.findIndex(patient=>patient.id===event.patientId),patient=patients.find(patient=>patient.slotIndex===index);if(!patient||(patient.tripType==='ONE_WAY'&&event.leg==='return'))return [];return event.leg==='return'?{...event,patientId:patient.id,at:patient.returnPickup+5,resolvedAt:patient.returnPickup+55}:{...event,patientId:patient.id,at:patient.pickup+(event.at-PATIENTS[index].pickup),resolvedAt:patient.pickup+(event.resolvedAt-PATIENTS[index].pickup)};}),...[...overrides.values()].filter(event=>patients.some(patient=>patient.id===event.patientId&&(patient.tripType!=='ONE_WAY'||event.leg!=='return')))];
}
function encodeToken(secret,now=Date.now()){const payload=Buffer.from(JSON.stringify({scope:SCOPE,expires:now+8*3600000,nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');return `${payload}.${crypto.createHmac('sha256',secret).update(payload).digest('base64url')}`;}
function validToken(token,secret,now=Date.now()){try{const [payload,signature,...extra]=String(token).split('.');if(extra.length||!payload||!signature)return false;const expected=crypto.createHmac('sha256',secret).update(payload).digest();const supplied=Buffer.from(signature,'base64url');if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return false;const data=JSON.parse(Buffer.from(payload,'base64url'));return data.scope===SCOPE&&Number(data.expires)>now;}catch{return false;}}
function passwordHash(password,salt){return crypto.scryptSync(String(password),salt,32).toString('hex');}
function syncBilling(config,settings){
 config.days=config.days||{};config.invoices=config.invoices||{};
 if(config.billing&&!config.invoices[DATES[0]])config.invoices[DATES[0]]=config.billing;
 delete config.billing;
 const activeDate=config.state.date||DATES[0];config.state=migrateState({...config.state,date:activeDate});
 for(const date of DATES){
  const state=date===activeDate?config.state:(config.days[date]=migrateState({...(config.days[date]||initialState(Date.now(),date)),date}));
  const patients=patientsFor(state),previous=config.invoices[date];
  const invoice=previous?.signature===Billing.signature(patients,date)?previous:Billing.create(patients,settings,date,previous);
  config.invoices[date]=Billing.finalize(invoice,project(state));
 }
}
function dashboardFor(config){
 const snapshot=project(config.state),invoice=config.invoices?.[snapshot.scenarioDate];
 if(invoice?.delivery)snapshot.messages.unshift({id:invoice.delivery.id,patientId:'billing',patient:'Facility billing',at:invoice.delivery.at,time:invoice.delivery.time,title:'Daily invoice delivered (demo)',text:`${invoice.date} · ${invoice.id}: ${invoice.rows.length} transport legs. Total $${(invoice.total/100).toFixed(2)}. Open Daily invoicing to review the itemized invoice.`,severity:'success',recipients:[invoice.delivery.recipient],delivery:'Simulated manager inbox delivery. No external email sent.'});
 return snapshot;
}
function bookingContext(config,settings){return {bookingFareRules:settings?.fareRules||{},bookingServices:Booking.catalog(settings),bookingFuelProfiles:Object.entries(require('../../../nexus-fare.js').fuelProfiles).filter(([key])=>!['ambulance','bus'].includes(key)).map(([key,value])=>({key,label:value.label})),bookingDays:DATES.map(date=>({date,count:patientsFor(date===config.state.date?config.state:config.days?.[date]||initialState(Date.now(),date)).length}))};}
function applyBookingDays(config,body,settings,now=Date.now()){
 const repeatDates=body.repeatDates??[];
 if(!Array.isArray(repeatDates)||repeatDates.length>4||new Set(repeatDates).size!==repeatDates.length||repeatDates.some(date=>!DATES.includes(date)||date<=(config.state.date||DATES[0])))throw Object.assign(Error('Choose distinct future repeat dates within October 26–30.'),{statusCode:400});
 if(repeatDates.length&&body.action!=='book')throw Object.assign(Error('Repeat dates apply to new bookings only. Edit each saved occurrence individually.'),{statusCode:400});
 // Build all occurrences before updating the locked configuration: a full day cannot cause a partial series.
 const state=control(config.state,body,now,settings),days={...(config.days||{})};
 for(const date of repeatDates){try{days[date]=control(days[date]||initialState(now,date),{...body,date},now,settings);}catch(error){error.message=date+': '+error.message;throw error;}}
 config.state=state;config.days=days;return config;
}
function createHandler({query,getPool,requireUser,bearer,json,parseBody,readPlatformSettings}){
 return async function handle(event,p,method){
  if(p[0]!=='facility-demo')return null;
  if(method==='POST'&&p[1]==='setup'){
   await requireUser(bearer(event),['ADMIN']);
   const password=DemoAccount.newPassword(),client=await getPool().connect();let result;
   try{await client.query('BEGIN');result=await DemoAccount.provision(client.query.bind(client),DemoAccount.hashPassword(password),{scope:SCOPE,username:USERNAME,secret:crypto.randomBytes(32).toString('hex'),state:initialState()});await client.query('COMMIT');}
   catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   return json(result.changed?201:200,{configured:true,username:USERNAME,...(result.changed?{password}:{}),managedIn:'User Management',message:result.changed?'Demo manager created in User Management. Save the issued password.':'Demo account is managed in Admin → User Management. Select Manage → Issue demo password to replace a lost password.'});
  }
  if(method==='POST'&&p[1]==='login'){
   const ip=String(event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']||'unknown').split(',')[0],bucket=Math.floor(Date.now()/900000);
   const rateKey=`demo:facility:login:${crypto.createHash('sha256').update(ip).digest('hex')}`;
   const rate=await query(`INSERT INTO system_settings(key,value,updated_at) VALUES($1,jsonb_build_object('bucket',$2::bigint,'count',1),now()) ON CONFLICT(key) DO UPDATE SET value=jsonb_build_object('bucket',$2::bigint,'count',CASE WHEN system_settings.value->>'bucket'=$2::text THEN COALESCE((system_settings.value->>'count')::int,0)+1 ELSE 1 END),updated_at=now() RETURNING value`,[rateKey,bucket]);
   if(Number(rate.rows[0]?.value?.count)>20)return json(429,{error:'Too many demo login attempts. Try again in 15 minutes.'});
   const config=(await query('SELECT value FROM system_settings WHERE key=$1',[KEY])).rows[0]?.value;
   if(!config)return json(409,{error:'An administrator must prepare this presentation demo first.'});
   const body=parseBody(event);if(typeof body.password!=='string'||body.password.length>256)return json(401,{error:'Check your demo manager email and password.'});
   const account=await DemoAccount.getAccount(query);
   if(String(body.email||'').trim().toLowerCase()!==USERNAME||!DemoAccount.allowed(account)||config.managedUserId!==String(account.id)||!DemoAccount.verifyPassword(body.password,account.password_hash))return json(401,{error:'Check your demo manager email and password, or ask an administrator to manage this account in User Management.'});
   if(account.must_change_password)return json(403,{error:'Ask an administrator to issue a demo password from User Management.'});
   return json(200,{token:encodeToken(DemoAccount.signingSecret(config,account)),user:{id:String(account.id),userCode:account.user_code,email:account.email,name:account.display_name,role:'FACILITY',scope:SCOPE,demoOnly:true,loginUrl:'/facility-demo.html'},dashboard:dashboardFor(config)});
  }
  const config=(await query('SELECT value FROM system_settings WHERE key=$1',[KEY])).rows[0]?.value;
  let admin=false,presenter=false,platformUser=null;
  try{const user=await requireUser(bearer(event));platformUser=user;admin=user.role==='ADMIN';
   const email=String(user.email||'').trim().toLowerCase();
   presenter=(email==='facility@nexusmt.com'&&user.role==='FACILITY')||(email==='dispatch@nexusmt.com'&&user.role==='DISPATCHER');
  }catch{}
  if(!config)return json(admin?409:401,{error:admin?'Prepare demo manager access first.':'Sign in to the facility demo.'});
  if(!admin&&!presenter){const account=await DemoAccount.getAccount(query);if(!DemoAccount.allowed(account)||config.managedUserId!==String(account.id)||!validToken(bearer(event),DemoAccount.signingSecret(config,account)))return json(401,{error:'Your demo session expired or this account was changed. Sign in again.'});}
  if(method==='GET'&&p[1]==='paid-bookings')return json(200,await require('./facility-paid-bookings.cjs').view(query,platformUser));
  if(p[1]==='editor')return require('./facility-demo-editor.cjs').handle(event,p,method,{config,json,query,getPool,parseBody,readPlatformSettings,KEY,DATES,FACILITY,PATIENTS,patientsFor,project,initialState,control,syncBilling});
  if(method==='GET'&&['state','billing'].includes(p[1])&&readPlatformSettings){
   const settings=await readPlatformSettings(),client=await getPool().connect();let invoices,snapshot;
   try{await client.query('BEGIN');const locked=(await client.query('SELECT value FROM system_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0].value;
    const before=JSON.stringify(locked);syncBilling(locked,settings);snapshot={...dashboardFor(locked),...bookingContext(locked,settings)};invoices=Object.values(locked.invoices);
    if(JSON.stringify(locked)!==before)await client.query('UPDATE system_settings SET value=$2::jsonb,updated_at=now() WHERE key=$1',[KEY,JSON.stringify(locked)]);
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
   if(p[1]==='billing'){const params=event.queryStringParameters||{};return json(200,Billing.view(invoices,params.period||snapshot.scenarioDate,params.mode||'day'));}
   return json(200,{dashboard:snapshot,admin,presenter});
  }
  if(method==='GET'&&p[1]==='state')return json(200,{dashboard:project(config.state),admin,presenter});
  if(method==='POST'&&p[1]==='quote'){
   if(!readPlatformSettings)return json(409,{error:'Configured pricing is unavailable.'});
   const settings=await readPlatformSettings(),body=parseBody(event),patients=patientsFor(config.state),editing=body.patientId?patients.find(p=>p.id===body.patientId):null;
   if(body.date!==config.state.date)return json(409,{error:'The selected demo day changed. Reopen the booking form.'});
   const preview=Booking.apply(config.state,{...body,action:editing?'editBooking':'book'},{patients:editing?[editing]:[],templates:PATIENTS,recipients:recipients(),current:minuteAt(config.state),facility:FACILITY,settings});
   const patient=patientsFor(preview).find(p=>p.id===preview.lastBookingId),invoice=Billing.create([patient],settings,body.date);
   return json(200,{invoice,labels:Billing.LABELS,simulated:true});
  }
  if(method==='POST'&&p[1]==='control'){
   const settings=readPlatformSettings?await readPlatformSettings():null,client=await getPool().connect();
   try{await client.query('BEGIN');const locked=(await client.query('SELECT value FROM system_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0]?.value;if(!locked)throw Error('Demo configuration missing.');
    const body=parseBody(event);
    if(body.action==='date'){
     if(!DATES.includes(body.date))throw Object.assign(Error('Select a demo date from October 26–30, 2026.'),{statusCode:400});
     const activeDate=locked.state.date||DATES[0];locked.days=locked.days||{};
     locked.days[activeDate]={...control(locked.state,{action:'pause'}),date:activeDate};
     locked.state={...(locked.days[body.date]||initialState(Date.now(),body.date)),date:body.date,paused:true,anchorAt:Date.now()};
    }else if(Booking.ACTIONS.includes(body.action))applyBookingDays(locked,body,settings);else locked.state=control(locked.state,body);
    if(settings)syncBilling(locked,settings);
    await client.query('UPDATE system_settings SET value=$2::jsonb,updated_at=now() WHERE key=$1',[KEY,JSON.stringify(locked)]);await client.query('COMMIT');return json(200,{dashboard:{...dashboardFor(locked),...bookingContext(locked,settings)},admin,presenter});
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  return json(404,{error:'Demo action not found.'});
 };
}
module.exports={SCOPE,KEY,USERNAME,FACILITY,PATIENTS,AUTO_EVENTS,DATES,WEEKLY_RESIDENTS,migrateState,patientsFor,initialState,minuteAt,timeLabel,project,control,mergedEvents,encodeToken,validToken,passwordHash,syncBilling,dashboardFor,applyBookingDays,bookingContext,createHandler};
