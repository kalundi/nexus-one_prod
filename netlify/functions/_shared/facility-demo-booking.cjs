const crypto=require('node:crypto');
const ACTIONS=['book','editBooking','cancelBooking','restoreBooking'];
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
function minutes(value,label){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||'')))fail(`Enter a valid ${label}.`);const [h,m]=value.split(':').map(Number);return h*60+m;}
function text(value,label,max){const result=String(value||'').trim();if(!result||result.length>max)fail(`Enter ${label} (${max} characters maximum).`);return result;}
function apply(state,body,{patients,allPatients,templates,recipients,current,now=Date.now()}){
 const next={...state,baseMinute:current,anchorAt:now},all=allPatients||patients;
 const notify=(patient,title,message)=>{next.bookingEvents=[...(state.bookingEvents||[]).slice(-99),{id:`booking-${crypto.randomUUID()}`,at:current,createdAt:new Date(now).toISOString(),patientId:patient.id,patient:patient.name,title,text:message,recipients:[...new Set([...(patient.recipients||recipients),...recipients.slice(0,2),recipients.at(-1)])]}];};
 if(['cancelBooking','restoreBooking'].includes(body.action)){
  const patient=all.find(patient=>patient.id===body.patientId);if(!patient)fail('Choose a booking from this demo day.');
  const cancelled=new Set(state.cancelledIds||[]);
  if(body.action==='cancelBooking'){if(cancelled.has(patient.id))return next;cancelled.add(patient.id);notify(patient,'Demo trip cancelled',`${patient.name}: outbound and return transports cancelled. The daily invoice and route board have been updated. A daily booking slot is now available.`);}
  else{if(!cancelled.has(patient.id))return next;if(patients.length>=5)fail('This day already has five active round trips. Cancel a trip before restoring another.',409);if(patients.some(p=>p.slotIndex===patient.slotIndex))fail('This vehicle slot has a replacement booking. Cancel the replacement before restoring this trip.',409);cancelled.delete(patient.id);notify(patient,'Demo trip restored',`${patient.name}: outbound and return transports restored. The manifest, route board and daily invoice have been updated.`);}
  next.cancelledIds=[...cancelled];return next;
 }
 if(!['book','editBooking'].includes(body.action))fail('Unsupported booking action.');
 const requestId=String(body.requestId||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))fail('Refresh the booking form before saving.');
 const hash=crypto.createHash('sha256').update(JSON.stringify({action:body.action,patientId:body.patientId||'',name:body.name,service:body.service,destinationIndex:body.destinationIndex,pickupTime:body.pickupTime,appointmentTime:body.appointmentTime,returnTime:body.returnTime,vehicleWaiting:body.vehicleWaiting,appointment:body.appointment,notify:body.notify})).digest('hex');
 const prior=state.bookingRequests?.[requestId];if(prior){if(prior.hash!==hash)fail('This form was already saved. Reopen it to make another change.',409);return {...next,lastBookingId:prior.id};}
 const previous=body.action==='editBooking'?patients.find(patient=>patient.id===body.patientId):null;if(body.action==='editBooking'&&!previous)fail('Choose an active booking from this day.');
 if(body.action==='book'&&patients.length>=5)fail('The daily limit is five round trips. Edit or cancel an existing trip to free a slot.',409);
 const destinationIndex=Number(body.destinationIndex);if(!Number.isInteger(destinationIndex)||destinationIndex<0||destinationIndex>=templates.length)fail('Choose a presentation appointment location.');
 const template=templates[destinationIndex],slotIndex=previous?.slotIndex??[0,1,2,3,4].find(index=>!patients.some(patient=>patient.slotIndex===index)),vehicle=templates[slotIndex];
 const name=text(body.name,'a fictional patient name',80),service=text(body.service,'a transport service',30);if(!['Ambulatory','Wheelchair','Stretcher'].includes(service))fail('Choose a supported transport service.');
 const pickup=minutes(body.pickupTime,'facility pickup time'),appointmentAt=minutes(body.appointmentTime,'appointment time'),returnPickup=minutes(body.returnTime,'return pickup time');
 if(pickup<435||pickup>1140)fail('Facility pickup must be between 7:15 AM and 7 PM.');if(appointmentAt<pickup+template.travel+15)fail(`Allow ${template.travel} minutes of sample travel and a 15-minute arrival buffer before the appointment.`);if(returnPickup<appointmentAt+15||returnPickup>1380)fail('Return pickup must be at least 15 minutes after the appointment and no later than 11 PM.');
 if(typeof body.vehicleWaiting!=='boolean')fail('Choose whether the vehicle stays during the appointment.');
 if(!Array.isArray(body.notify)||body.notify.some(value=>!['destination','caregiver'].includes(value)))fail('Choose valid simulated notification recipients.');
 const watchers=[recipients[0],recipients[1],...(body.notify.includes('destination')?[recipients[2]]:[]),...(body.notify.includes('caregiver')?[recipients[3]]:[]),recipients[4]];
 const patient={id:previous?.id||`FC-BOOK-${crypto.randomUUID()}`,slotIndex,name,initials:name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase(),service,appointment:text(body.appointment,'an appointment description',120),destination:{...template.destination},distanceMiles:[8,7.5,7.2,23,26][destinationIndex],destinationIndex,driver:previous?.driver||vehicle.driver,unit:previous?.unit||vehicle.unit,pickup,appointmentAt,travel:template.travel,returnPickup,waitMinutes:returnPickup-appointmentAt,vehicleWaiting:body.vehicleWaiting,recipients:watchers,bookingRef:previous?.bookingRef||`DEMO-${state.date||'2026-10-26'}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,updatedAt:new Date(now).toISOString()};
 if(previous&&state.additionalBookings?.some(item=>item.id===previous.id))next.additionalBookings=state.additionalBookings.map(item=>item.id===previous.id?patient:item);
 else if(previous)next.bookingEdits={...(state.bookingEdits||{}),[previous.id]:patient};
 else next.additionalBookings=[...(state.additionalBookings||[]),patient];
 next.returnSchedules={...(state.returnSchedules||{})};delete next.returnSchedules[patient.id];
 next.bookingRequests={...(state.bookingRequests||{}),[requestId]:{id:patient.id,hash}};next.lastBookingId=patient.id;
 notify({...patient,recipients:[...new Set([...(previous?.recipients||[]),...watchers])]},previous?'Demo booking updated':'Demo booking confirmed',`${patient.name}: ${service} round trip ${previous?'updated':'booked'} from FutureCare Annapolis to ${template.destination.name}. Facility pickup ${body.pickupTime}; appointment ${body.appointmentTime}; return pickup ${body.returnTime} Eastern Time. ${body.vehicleWaiting?'Vehicle waiting charges apply under configured fare rules.':'Vehicle leaves and returns; appointment waiting is not charged.'} Route and invoice updated. All delivery is simulated.`);
 return next;
}
module.exports={ACTIONS,apply};
