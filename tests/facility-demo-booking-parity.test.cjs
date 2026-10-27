const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../netlify/functions/_shared/facility-demo.cjs'),B=require('../netlify/functions/_shared/facility-demo-billing.cjs'),Booking=require('../netlify/functions/_shared/facility-demo-booking.cjs'),Fare=require('../nexus-fare.js');
const settings={pricing:Object.fromEntries(Booking.SERVICES.map(([key])=>[key,{base:70,perMile:4,waitPer15:20}])),fareRules:{shortNoticeSurchargePct:0,waitingPolicyVersion:2,freeWaitMinutes:20}};
const form=(extra={})=>({action:'editBooking',patientId:'FC-DEMO-01',requestId:'parity-booking-000001',date:'2026-10-26',name:'Fictional Demo Resident',service:'Wheelchair',destinationIndex:0,pickupTime:'08:00',appointmentTime:'09:00',returnTime:'11:00',vehicleWaiting:true,appointment:'Demo follow-up',notify:['destination','caregiver'],...extra});
function booked(extra={},state=D.initialState(1000)){return D.control(state,form(extra),1000,settings);}
test('all ten booking services use their configured pricing keys and reject unavailable rates',()=>{
 assert.equal(Booking.catalog(settings).length,10);
 for(const [key,label] of Booking.SERVICES){const state=booked({service:label,appointmentTime:'09:30'}),patient=D.patientsFor(state).find(p=>p.id==='FC-DEMO-01');assert.equal(patient.serviceKey,key);assert.equal(B.create([patient],settings).rows.length,2);}
 assert.throws(()=>D.control(D.initialState(1000),form({service:'ALS 2'}),1000,{...settings,pricing:{}}),/Configure ALS 2 pricing/);
 assert.equal(Booking.catalog({pricing:{wheelchair:{}}}).filter(service=>service.available).length,1);
});
test('one-way transport completes at destination with one invoice leg, no return alerts and no return editor',()=>{
 const state=booked({tripType:'ONE_WAY',returnTime:undefined}),patient=D.patientsFor(state)[0],invoice=B.create([patient],settings);
 assert.equal(patient.returnPickup,null);assert.equal(patient.vehicleWaiting,false);assert.equal(invoice.rows.length,1);assert.equal(invoice.rows[0].categories.waiting,0);
 const snapshot=D.project({...state,baseMinute:930},1000),view=snapshot.patients.find(p=>p.id===patient.id);assert.equal(view.phase,'complete');assert.equal(view.stage,'Destination handoff complete');assert.equal(snapshot.metrics.legs,9);assert.equal(view.returnArrival,null);assert.equal(view.returnLabel,'One-way');assert.ok(!snapshot.messages.some(message=>message.patientId===patient.id&&/Return pickup|Return trip|Patient returned/.test(message.title)));
 assert.throws(()=>D.control(state,{action:'returnSchedule',patientId:patient.id,waitHours:1,vehicleWaiting:true},1000),/return leg/);
 const oldReturn={...state,overrides:[{id:'old-return',patientId:patient.id,leg:'return',type:'delay',at:700,minutes:15}]};assert.equal(D.mergedEvents(oldReturn).some(event=>event.id==='old-return'),false);
});
test('custom multi-stop routes persist contacts, airport notes and separate intermediate-stop versus appointment waiting',()=>{
 const state=booked({origin:{name:'Demo pickup',address:'10 Demo Avenue',suite:'Room 4'},customDestination:{name:'Demo clinic',address:'30 Demo Avenue',suite:'Suite 5'},stops:[{name:'Demo lab',address:'20 Demo Avenue',waitMinutes:35}],distanceMiles:12.5,travelMinutes:25,appointmentTime:'09:15',returnTime:'10:15',notes:'Fictional wheelchair assistance',patientContact:{email:'demo@example.com',phone:'+13015550100'},caregiverContact:{name:'Demo Family'},destinationContact:{name:'Demo receiving team'},flight:{number:'DEMO123',airportStop:'destination',terminal:'Demo terminal'}});
 const patient=D.patientsFor(state).find(p=>p.id==='FC-DEMO-01');assert.equal(patient.origin.suite,'Room 4');assert.equal(patient.destination.suite,'Suite 5');assert.equal(patient.stopWaitMinutes,35);assert.equal(patient.caregiverContact.name,'Demo Family');assert.equal(patient.flight.number,'DEMO123');
 const rows=B.create([patient],settings).rows;assert.equal(rows[0].miles,12.5);assert.equal(rows[0].categories.waiting,2000);assert.equal(rows[1].categories.waiting,6000);assert.equal(rows[0].waitMinutes,35);assert.equal(rows[1].waitMinutes,60);assert.equal(rows[1].destination,'Demo pickup');
 const noHold={...patient,vehicleWaiting:false};const changed=B.create([noHold],settings);assert.equal(changed.rows[0].categories.waiting,2000);assert.equal(changed.rows[1].categories.waiting,0);assert.notEqual(B.signature([noHold]),B.signature([patient]));
 assert.equal(D.project({...state,baseMinute:500},1000).patients[0].outboundArrival,540);
});
test('pickup and handoff schedules validate travel and stops; fuel preferences use shared fare rules',()=>{
 const state=booked({service:'Ambulatory',scheduleBasis:'PICKUP',appointmentTime:'',returnTime:'10:00',fuelProfile:'hybrid_sedan'}),patient=D.patientsFor(state)[0];assert.equal(patient.appointmentAt,515);assert.equal(patient.fuelProfile,'hybrid_sedan');assert.ok(B.create([patient],settings).total>0);
 for(const extra of [{scheduleBasis:'HANDOFF',appointmentTime:'07:20'},{stops:[{name:'Duplicate',address:D.FACILITY.address}]},{patientContact:{email:'invalid'}},{patientContact:{phone:'no phone'}},{fuelProfile:'hybrid_sedan'},{stops:Array(4).fill({name:'Lab',address:'Address'})},{customDestination:{name:'Lab',address:'10 Test Street'},distanceMiles:-1,travelMinutes:30}])assert.throws(()=>booked(extra));
 assert.equal(Fare.getWaitingCharge(36,settings.pricing.wheelchair,settings.fareRules,'wheelchair').waitCharge,40);
});
test('a late one-way delay extends the presentation clock through the final destination handoff',()=>{
 let state=booked({tripType:'ONE_WAY',origin:{name:'Demo pickup',address:'10 Demo Street'},distanceMiles:80,travelMinutes:120,pickupTime:'18:30',appointmentTime:'21:00'});state={...state,baseMinute:1200,paused:true};state=D.control(state,{action:'delay',patientId:'FC-DEMO-01'},1000);assert.equal(D.project(state,1000).endMinute,1265);assert.equal(D.project({...state,baseMinute:1265},1000).patients.find(p=>p.id==='FC-DEMO-01').phase,'complete');
});
test('recurring bookings extend every seeded day beyond five and retry without duplicate occurrences',()=>{
 const config={state:D.initialState(1000),days:{}},body=form({action:'book',patientId:'',repeatDates:D.DATES.slice(1)});
 const before=JSON.stringify(config);assert.throws(()=>D.applyBookingDays(config,{...body,repeatDates:[D.DATES[1],'2026-11-01']},settings,1000),/repeat dates/);assert.equal(JSON.stringify(config),before);
 D.applyBookingDays(config,body,settings,1000);for(const state of [config.state,...Object.values(config.days)]){assert.equal(D.patientsFor(state).length,6);assert.equal(state.additionalBookings.length,1);}
 const firstId=config.state.lastBookingId;D.applyBookingDays(config,body,settings,1000);assert.equal(config.state.additionalBookings.length,1);assert.equal(config.state.lastBookingId,firstId);D.syncBilling(config,settings);assert.equal(config.invoices[D.DATES[1]].rows.filter(row=>row.patient==='Fictional Demo Resident').length,2);
 for(const repeatDates of [[D.DATES[0]],['2026-11-01'],[D.DATES[1],D.DATES[1]]])assert.throws(()=>D.applyBookingDays(config,{...body,repeatDates},settings,1000));
});
