const test=require('node:test'),assert=require('node:assert/strict');
const Schedule=require('../facility-demo-schedule.js'),Timing=require('../nexus-trip-timing.js');
const Demo=require('../netlify/functions/_shared/facility-demo.cjs'),Booking=require('../netlify/functions/_shared/facility-demo-booking.cjs'),Billing=require('../netlify/functions/_shared/facility-demo-billing.cjs');
const input={date:'2026-10-27',service:'wheelchair',scheduleBasis:'APPOINTMENT',appointmentTime:'10:00',pickupTime:'12:00',distanceMiles:8,travelMinutes:20,origin:Demo.FACILITY,destination:{address:'Clinic, Annapolis'}};
const rules={serviceSpeedModel:'CRUISING_CEILING',smartTiming:{enabled:true,reliabilityBufferMinutes:7,checkInLeadMinutes:15},servicePolicies:{wheelchair:{pickupPreparationMinutes:30,dropoffHandoffMinutes:20}}};
test('linked schedule reuses the booking app smart plan in both directions, including its configured allowances',()=>{
 const resolved=Schedule.resolve(input,rules),plan=Timing.plan({date:input.date,service:input.service,pickup:input.origin.address,destination:input.destination.address,appointmentTime:input.appointmentTime},{miles:8,durationMinutes:20,trafficDurationMinutes:20,scheduleBasis:'APPOINTMENT',finalAppointmentTime:input.appointmentTime},{fareRules:rules});
 assert.equal(resolved.pickupTime,Timing.localParts(plan.crewArrivalAt).time);assert.equal(resolved.pickupTime,'08:28');
 const reversed=Schedule.resolve({...input,scheduleBasis:'PICKUP',pickupTime:resolved.pickupTime,appointmentTime:''},rules);assert.equal(reversed.appointmentTime,'10:00');assert.equal(reversed.allowanceMinutes,72);
 const stops=Schedule.resolve({...input,stopWaitMinutes:35},rules);assert.equal(stops.pickupTime,'07:53');assert.equal(Schedule.resolve({...input,service:'Ambulatory'},rules).pickupTime,'08:58');
});
test('fallback matches booking travel calculation plus arrival buffer and never wraps an invalid schedule into another day',()=>{
 const simple={serviceSpeedModel:'CRUISING_CEILING'};
 assert.equal(Schedule.resolve(input,simple).pickupTime,'09:25');assert.equal(Schedule.resolve({...input,scheduleBasis:'PICKUP',pickupTime:'09:25'},simple).appointmentTime,'10:00');
 assert.equal(Schedule.resolve({...input,scheduleBasis:'HANDOFF'},simple).pickupTime,'09:40');
 assert.equal(Schedule.resolve({...input,appointmentTime:'00:05'},simple).pickupTime,'');assert.equal(Schedule.resolve({...input,scheduleBasis:'PICKUP',pickupTime:'23:50'},simple).appointmentTime,'');
 assert.equal(Schedule.resolve({...input,appointmentTime:''},simple),null);assert.equal(Schedule.resolve({...input,travelMinutes:0},simple),null);
 assert.ok(Schedule.resolve({...input,service:'Stretcher'},{}).drivingMinutes>Schedule.resolve({...input,service:'Ambulatory'},{}).drivingMinutes);
});
test('database saves trust only the selected time, preserve invoice waiting and derive each recurring occurrence',()=>{
 const settings={pricing:Object.fromEntries(Booking.SERVICES.map(([key])=>[key,{base:70,perMile:4,waitPer15:20}])),fareRules:rules};
 const body={action:'book',date:Demo.DATES[0],requestId:'linked-schedule-test-0001',name:'Fictional Linked Time',service:'Wheelchair',destinationIndex:0,scheduleBasis:'APPOINTMENT',pickupTime:'22:00',appointmentTime:'10:00',returnTime:'12:00',vehicleWaiting:true,notify:[],appointment:'Demo appointment'};
 const config={state:Demo.initialState(1000),days:{}};Demo.applyBookingDays(config,{...body,repeatDates:[Demo.DATES[1]]},settings,1000);
 for(const state of [config.state,config.days[Demo.DATES[1]]]){const patient=state.additionalBookings[0];assert.equal(patient.pickup,508);assert.equal(patient.appointmentAt,600);assert.equal(patient.waitMinutes,120);assert.equal(patient.scheduledTravelMinutes,20);assert.equal(Billing.create([patient],settings).rows[1].waitMinutes,120);assert.match(state.bookingEvents.at(-1).text,/Pickup 08:28/);}
 const pickupBody={...body,requestId:'linked-schedule-test-0002',scheduleBasis:'PICKUP',pickupTime:'08:28',appointmentTime:'22:59'};
 const patient=Demo.control(Demo.initialState(1000),pickupBody,1000,settings).additionalBookings[0];assert.equal(patient.appointmentAt,600);
 assert.throws(()=>Demo.control(Demo.initialState(1000),{...pickupBody,pickupTime:'19:00',returnTime:'19:30'},1000,settings),/Return pickup/);
});
