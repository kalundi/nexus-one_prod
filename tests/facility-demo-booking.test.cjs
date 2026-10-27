const test=require('node:test'),assert=require('node:assert/strict'),D=require('../netlify/functions/_shared/facility-demo.cjs'),B=require('../netlify/functions/_shared/facility-demo-billing.cjs');
const settings={pricing:{ambulatory:{base:40,perMile:3,waitPer15:15},wheelchair:{base:65,perMile:4,waitPer15:20},stretcher:{base:100,perMile:5,waitPer15:30}},fareRules:{shortNoticeSurchargePct:0}};
const form=(extra={})=>({action:'book',requestId:'booking-request-0000001',date:'2026-10-26',name:'Alice Demo Foster',service:'Wheelchair',destinationIndex:1,pickupTime:'08:00',appointmentTime:'08:45',returnTime:'10:45',vehicleWaiting:true,appointment:'Physical therapy demo',notify:['destination','caregiver'],...extra});
test('manager cancels and replaces one round trip with a persisted, idempotent booking and simulated alerts',()=>{
 let state=D.initialState(1000);
 state=D.control(state,{action:'cancelBooking',patientId:'FC-DEMO-01'},1000);assert.equal(D.patientsFor(state).length,4);
 state=D.control(state,form(),1000);const patient=D.patientsFor(state).find(p=>p.name==='Alice Demo Foster');assert.ok(patient.id.startsWith('FC-BOOK-'));assert.equal(patient.distanceMiles,7.5);assert.equal(patient.slotIndex,5);assert.equal(D.patientsFor(state).length,5);
 const duplicate=D.control(state,form(),1000);assert.equal(duplicate.additionalBookings.length,1);assert.equal(duplicate.bookingEvents.length,2);assert.throws(()=>D.control(state,form({name:'Different name'}),1000),/already saved/);
 const snapshot=D.project(state,1000),message=snapshot.messages.find(m=>m.title==='Demo booking confirmed');assert.equal(message.patient,patient.name);assert.equal(message.recipients.length,5);assert.match(message.delivery,/simulated, not sent/);assert.equal(snapshot.cancelledBookings.length,1);
 const invoice=B.create(D.patientsFor(state),settings);assert.equal(invoice.rows.length,10);assert.equal(invoice.rows.find(row=>row.patientId===patient.id).miles,7.5);assert.ok(invoice.rows.some(row=>row.patient===patient.name));assert.equal(invoice.rows.some(row=>row.patientId==='FC-DEMO-01'),false);
 assert.deepEqual(D.control(state,{action:'restart'},1000).additionalBookings,state.additionalBookings);
});
test('booking edits update route/fare inputs and invalidate return overrides without changing other patients',()=>{
 let state=D.initialState(1000);state=D.control(state,{action:'returnSchedule',patientId:'FC-DEMO-01',waitHours:3,vehicleWaiting:true},1000);const previousFare=B.create(D.patientsFor(state),settings).total;
 state=D.control(state,form({action:'editBooking',patientId:'FC-DEMO-01',service:'Stretcher',destinationIndex:4,pickupTime:'08:00',appointmentTime:'09:15',returnTime:'11:15'}),1000);
 const patients=D.patientsFor(state),patient=patients.find(p=>p.id==='FC-DEMO-01');assert.equal(patient.name,'Alice Demo Foster');assert.equal(patient.service,'Stretcher');assert.equal(patient.travel,45);assert.equal(patient.distanceMiles,26);assert.equal(patient.returnPickup,675);assert.equal(state.returnSchedules['FC-DEMO-01'],undefined);assert.equal(patients.find(p=>p.id==='FC-DEMO-02').name,'Marcus Reed');
 assert.equal(D.project(state,1000).messages[0].title,'Demo booking updated');assert.notEqual(B.create(patients,settings).total,previousFare);
});
test('restoring a trip remains available after more bookings are added and invalid bookings are rejected',()=>{
 let state=D.initialState(1000);state=D.control(state,{action:'cancelBooking',patientId:'FC-DEMO-02'},1000);state=D.control(state,{action:'restoreBooking',patientId:'FC-DEMO-02'},1000);assert.equal(D.patientsFor(state).length,5);
 const open=D.control(state,{action:'cancelBooking',patientId:'FC-DEMO-01'},1000);
 for(const extra of [{pickupTime:'24:00'},{appointmentTime:'08:05'},{returnTime:'08:45'},{service:'Ambulance'},{destinationIndex:99},{vehicleWaiting:'true'},{notify:['unknown']},{date:'2026-10-30'},{name:''}])assert.throws(()=>D.control(open,form(extra),1000));
 const booked=D.control(open,form(),1000),restored=D.control(booked,{action:'restoreBooking',patientId:'FC-DEMO-01'},1000);assert.equal(D.patientsFor(restored).length,6);assert.equal(new Set(D.patientsFor(restored).map(patient=>patient.unit)).size,6);
});
test('managers add many bookings beyond the five seeded trips with unique demo vehicles and complete invoices',()=>{
 let state=D.initialState(1000);const forms=Array.from({length:12},(_,index)=>form({requestId:'unlimited-booking-'+String(index).padStart(5,'0'),name:'Additional Demo Resident '+index}));
 for(const body of forms)state=D.control(state,body,1000);
 const patients=D.patientsFor(state);assert.equal(patients.length,17);assert.equal(new Set(patients.map(patient=>patient.slotIndex)).size,17);assert.equal(new Set(patients.map(patient=>patient.unit)).size,17);assert.ok(patients.every(patient=>patient.driver));
 state=D.control(state,forms[0],1000);assert.equal(D.patientsFor(state).length,17);
 const invoice=B.create(patients,settings),dashboard=D.project({...state,baseMinute:930},1000);assert.equal(invoice.rows.length,34);assert.equal(dashboard.metrics.patients,17);assert.equal(dashboard.metrics.legs,34);assert.equal(B.finalize(invoice,dashboard).status,'issued');
 assert.equal(invoice.total,invoice.rows.reduce((sum,row)=>sum+row.total,0));
});
test('restoring a booking from the previous five-slot version reallocates a conflicting demo vehicle',()=>{
 let state=D.control(D.initialState(1000),{action:'cancelBooking',patientId:'FC-DEMO-01'},1000);state=D.control(state,form(),1000);
 state.additionalBookings=state.additionalBookings.map(patient=>({...patient,slotIndex:0,unit:'DEMO-01'}));
 const restored=D.control(state,{action:'restoreBooking',patientId:'FC-DEMO-01'},1000),patients=D.patientsFor(restored);assert.equal(patients.length,6);assert.equal(new Set(patients.map(patient=>patient.unit)).size,6);assert.equal(patients.find(patient=>patient.id==='FC-DEMO-01').slotIndex,5);assert.equal(B.create(patients,settings).rows.length,12);
 assert.equal(D.patientsFor(D.control(restored,{action:'restoreBooking',patientId:'FC-DEMO-01'},1000)).length,6);
});
test('cancelling all trips yields an empty manifest and zero draft invoice without false handoff completion',()=>{
 let state=D.initialState(1000);for(const patient of D.patientsFor(state))state=D.control(state,{action:'cancelBooking',patientId:patient.id},1000);
 const dashboard=D.project(state,1000);assert.equal(dashboard.patients.length,0);assert.equal(dashboard.metrics.legs,0);assert.equal(dashboard.cancelledBookings.length,5);assert.equal(dashboard.messages.filter(message=>message.title==='Demo trip cancelled').length,5);
 const invoice=B.create([],settings);assert.equal(invoice.total,0);assert.equal(B.finalize(invoice,dashboard).status,'draft');
 assert.equal(D.timeLabel(1450),'12:10 AM (next day)');
});
