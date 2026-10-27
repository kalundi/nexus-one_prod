const Schedule=require('../../../facility-demo-schedule.js');
const crypto=require('node:crypto');
const Fare=require('../../../nexus-fare.js');
const ACTIONS=['book','editBooking','cancelBooking','restoreBooking'];
const SERVICES=[['ambulatory','Ambulatory'],['wheelchair','Wheelchair'],['broda','Broda'],['stretcher','Stretcher'],['bariatric','Bariatric'],['bls','BLS'],['als1','ALS 1'],['als2','ALS 2'],['facility_transfer','IFT Routine'],['facility_transfer_critical','IFT High-Acuity']];
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
function minutes(value,label){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||'')))fail(`Enter a valid ${label}.`);const [h,m]=value.split(':').map(Number);return h*60+m;}
function text(value,label,max,optional=false){const result=String(value??'').trim();if((!optional&&!result)||result.length>max)fail(`Enter ${label} (${max} characters maximum).`);return result;}
function number(value,label,min,max){const result=Number(value);if(!Number.isFinite(result)||result<min||result>max)fail(`Enter ${label} between ${min} and ${max}.`);return result;}
function location(value,label){if(!value||typeof value!=='object')fail(`Enter ${label}.`);return {name:text(value.name,`${label} name`,120),address:text(value.address,`${label} address`,240),suite:text(value.suite,`${label} room / suite`,80,true)};}
function contact(value,label){value=value||{};const result={name:text(value.name,`${label} name`,80,true),email:text(value.email,`${label} email`,160,true),phone:text(value.phone,`${label} phone`,30,true)};if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))fail(`Enter a valid ${label} email.`);if(result.phone&&!/^\+?[\d\s().-]{7,30}$/.test(result.phone))fail(`Enter a valid ${label} phone number.`);return result;}
function catalog(settings){return SERVICES.map(([key,label])=>({key,label,available:settings?!!settings.pricing?.[key]:true}));}
function nextSlot(patients,templates){return patients.reduce((maximum,patient)=>Number.isInteger(Number(patient.slotIndex))?Math.max(maximum,Number(patient.slotIndex)):maximum,templates.length-1)+1;}
function savePatient(next,state,previous,patient){
 if(previous&&state.additionalBookings?.some(item=>item.id===previous.id))next.additionalBookings=state.additionalBookings.map(item=>item.id===previous.id?patient:item);
 else if(previous)next.bookingEdits={...(state.bookingEdits||{}),[previous.id]:patient};
 else next.additionalBookings=[...(state.additionalBookings||[]),patient];
}
function apply(state,body,{patients,allPatients,templates,recipients,current,now=Date.now(),facility,settings}){
 const next={...state,baseMinute:current,anchorAt:now},all=allPatients||patients;
 const notify=(patient,title,message)=>{next.bookingEvents=[...(state.bookingEvents||[]).slice(-99),{id:`booking-${crypto.randomUUID()}`,at:current,createdAt:new Date(now).toISOString(),patientId:patient.id,patient:patient.name,title,text:message,recipients:[...new Set([...(patient.recipients||recipients),...recipients.slice(0,2),recipients.at(-1)])]}];};
 if(['cancelBooking','restoreBooking'].includes(body.action)){
  let patient=all.find(patient=>patient.id===body.patientId);if(!patient)fail('Choose a booking from this demo day.');
  const cancelled=new Set(state.cancelledIds||[]);
  if(body.action==='cancelBooking'){if(cancelled.has(patient.id))return next;cancelled.add(patient.id);notify(patient,'Demo trip cancelled',`${patient.name}: all scheduled transport legs cancelled. The daily invoice and route board have been updated.`);}
  else{if(!cancelled.has(patient.id))return next;
   // Older demo bookings reused the five original vehicle slots. Restore them without a collision or a booking cap.
   if(patients.some(p=>p.slotIndex===patient.slotIndex)){const slotIndex=nextSlot(all,templates),updated={...patient,slotIndex,unit:`DEMO-${String(slotIndex+1).padStart(2,'0')}`};savePatient(next,state,patient,updated);patient=updated;}
   cancelled.delete(patient.id);notify(patient,'Demo trip restored',`${patient.name}: scheduled transports restored. The manifest, route board and daily invoice have been updated.`);}
  next.cancelledIds=[...cancelled];return next;
 }
 if(!['book','editBooking'].includes(body.action))fail('Unsupported booking action.');
 const requestId=String(body.requestId||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))fail('Refresh the booking form before saving.');
 const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const prior=state.bookingRequests?.[requestId];if(prior){if(prior.hash!==hash)fail('This form was already saved. Reopen it to make another change.',409);return {...next,lastBookingId:prior.id};}
 const previous=body.action==='editBooking'?patients.find(patient=>patient.id===body.patientId):null;if(body.action==='editBooking'&&!previous)fail('Choose an active booking from this day.');
 const destinationIndex=Number(body.destinationIndex);if(!Number.isInteger(destinationIndex)||destinationIndex<0||destinationIndex>=templates.length)fail('Choose a presentation appointment location.');
 const template=templates[destinationIndex],slotIndex=previous?.slotIndex??nextSlot(all,templates),vehicle=templates[slotIndex%templates.length];
 const serviceEntry=SERVICES.find(([key,label])=>body.service===key||body.service===label);if(!serviceEntry)fail('Choose a supported transport service.');
 const [serviceKey,service]=serviceEntry;if(settings&&!settings.pricing?.[serviceKey])fail(`Configure ${service} pricing in the main system before booking this service.`,409);
 const name=text(body.name,'a fictional patient name',80),tripType=body.tripType||'ROUND_TRIP',scheduleBasis=body.scheduleBasis||'APPOINTMENT';
 if(!['ONE_WAY','ROUND_TRIP'].includes(tripType))fail('Choose a one-way or round-trip itinerary.');
 if(!['APPOINTMENT','PICKUP','HANDOFF'].includes(scheduleBasis))fail('Choose an appointment, pickup or handoff schedule.');
 const origin=body.origin?location(body.origin,'pickup'):facility||{name:'FutureCare Annapolis',address:'2700 Southaven Road, Annapolis, MD 21401'};
 const destination=body.customDestination?location(body.customDestination,'destination'):{...template.destination,suite:text(body.destinationSuite,'destination room / suite',80,true)};
 if(!Array.isArray(body.stops??[])||(body.stops||[]).length>3)fail('Use up to three intermediate stops (five locations total).');
 const stops=(body.stops||[]).map((stop,index)=>({...location(stop,`stop ${index+1}`),waitMinutes:number(stop.waitMinutes??0,`stop ${index+1} wait minutes`,0,240)}));
 if(stops.some(stop=>!Number.isInteger(stop.waitMinutes)))fail('Intermediate-stop waiting must use whole minutes.');
 const routeAddresses=[origin,...stops,destination].map(stop=>stop.address.toLowerCase().replace(/\s+/g,' ').trim());
 if(new Set(routeAddresses).size!==routeAddresses.length)fail('Pickup, stops and destination must have different addresses.');
 const customRoute=!!body.customDestination||!!body.origin||stops.length>0;
 const travel=customRoute?number(body.travelMinutes,'illustrative one-way travel minutes',1,360):template.travel;
 if(!Number.isInteger(travel))fail('Driving time must use whole minutes.');
 const distanceMiles=customRoute?number(body.distanceMiles,'illustrative one-way miles',0.1,300):[8,7.5,7.2,23,26][destinationIndex];
 const stopWaitMinutes=stops.reduce((sum,stop)=>sum+stop.waitMinutes,0);
 // Only the chosen time is authoritative. Recompute the other time for quotes,
 // saved bookings and recurring occurrences using the same shared browser code.
 minutes(scheduleBasis==='PICKUP'?body.pickupTime:body.appointmentTime,scheduleBasis==='PICKUP'?'pickup time':scheduleBasis==='HANDOFF'?'required handoff time':'appointment time');
 const timing=Schedule.resolve({date:body.date||state.date||'2026-10-26',service:serviceKey,scheduleBasis,pickupTime:body.pickupTime,appointmentTime:body.appointmentTime,origin,destination,distanceMiles,travelMinutes:travel,stopWaitMinutes},settings?.fareRules||{});
 if(!timing)fail('Complete the selected time and route estimate.');
 const {pickup,appointmentAt}=timing;
 if(pickup<435||pickup>1140)fail('Choose a time that allows demo pickup between 7:15 AM and 7 PM.');
 if(appointmentAt>1380)fail('Choose a time that allows arrival no later than 11 PM.');
 const returnPickup=tripType==='ONE_WAY'?null:minutes(body.returnTime,'return pickup time');
 if(returnPickup!==null&&(returnPickup<appointmentAt+15||returnPickup>1380))fail('Return pickup must be at least 15 minutes after the appointment and no later than 11 PM.');
 if(typeof body.vehicleWaiting!=='boolean')fail('Choose whether the vehicle stays during the appointment.');
 if(!Array.isArray(body.notify)||body.notify.some(value=>!['destination','caregiver'].includes(value)))fail('Choose valid simulated notification recipients.');
 const watchers=[recipients[0],recipients[1],...(body.notify.includes('destination')?[recipients[2]]:[]),...(body.notify.includes('caregiver')?[recipients[3]]:[]),recipients[4]];
 const fuelProfile=text(body.fuelProfile,'a vehicle fuel profile',40,true);if(fuelProfile&&(serviceKey!=='ambulatory'||!Fare.fuelProfiles[fuelProfile]||['ambulance','bus'].includes(fuelProfile)))fail('Choose a supported Ambulatory vehicle preference.');
 const flight={number:text(body.flight?.number,'flight number',20,true),airportStop:body.flight?.airportStop||'pickup',terminal:text(body.flight?.terminal,'airport terminal',80,true)};
 if(!['pickup','destination'].includes(flight.airportStop))fail('Choose a pickup or destination airport.');
 const patient={id:previous?.id||`FC-BOOK-${crypto.randomUUID()}`,slotIndex,name,initials:name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase(),service,serviceKey,tripType,scheduleBasis,origin,destination,stops,stopWaitMinutes,distanceMiles,destinationIndex,customRoute:!!customRoute,fuelProfile,flight,patientContact:contact(body.patientContact,'patient'),caregiverContact:contact(body.caregiverContact,'caregiver'),destinationContact:contact(body.destinationContact,'destination contact'),notes:text(body.notes,'transport / assistance notes',2000,true),appointment:text(body.appointment,'an appointment description',120),driver:previous?.driver||vehicle.driver,unit:previous?.unit||`DEMO-${String(slotIndex+1).padStart(2,'0')}`,pickup,appointmentAt,travel,scheduledTravelMinutes:timing.drivingMinutes,returnPickup,waitMinutes:returnPickup===null?0:returnPickup-appointmentAt,vehicleWaiting:tripType!=='ONE_WAY'&&body.vehicleWaiting,recipients:watchers,bookingRef:previous?.bookingRef||`DEMO-${state.date||'2026-10-26'}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,updatedAt:new Date(now).toISOString()};
 savePatient(next,state,previous,patient);
 next.returnSchedules={...(state.returnSchedules||{})};delete next.returnSchedules[patient.id];
 next.bookingRequests={...(state.bookingRequests||{}),[requestId]:{id:patient.id,hash}};next.lastBookingId=patient.id;
 const route=[origin,...stops,destination].map(stop=>`${stop.name} (${stop.address})`).join(' → ');
 notify({...patient,recipients:[...new Set([...(previous?.recipients||[]),...watchers])]},previous?'Demo booking updated':'Demo booking confirmed',`${patient.name}: ${service} ${tripType==='ONE_WAY'?'one-way':'round trip'} ${previous?'updated':'booked'}: ${route}. Pickup ${timing.pickupTime}; ${scheduleBasis.toLowerCase()} target ${Math.floor(appointmentAt/60)}:${String(appointmentAt%60).padStart(2,'0')}${returnPickup===null?'':`; return pickup ${body.returnTime}`} Eastern Time. ${patient.vehicleWaiting?'Vehicle waiting charges apply under configured fare rules.':'Appointment holding is not charged.'} ${stopWaitMinutes?`${stopWaitMinutes} intermediate-stop waiting minutes apply under configured fare rules. `:''}Route and facility invoice updated. All delivery is simulated.`);
 return next;
}
module.exports={ACTIONS,SERVICES,catalog,apply};
