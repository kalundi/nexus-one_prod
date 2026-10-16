const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Fare=require('../nexus-fare.js');
const settings={pricing:{bls:{base:1125,includedMiles:0,perMile:18.5,waitPer15:35}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15}};
const booking={service:'bls',bookingSource:'BROKER',date:'2030-10-15',time:'10:31',pickupTime:'10:31',appointmentTime:'13:15',pickup:'Home',destination:'Clinic',tripType:'ROUND_TRIP',returnTripDate:'2030-10-15',returnTripTime:'14:00',distanceMiles:33.35,
 fareInputs:{miles:33.35,durationMinutes:55,trafficDurationMinutes:55,stopWaitMinutes:0,discountPct:0,deadheadSegments:[52.07,50.99],scheduleBasis:'APPOINTMENT',finalAppointmentTime:'13:15',stopAppointmentTimes:['13:15']}};
function editor(overrides={}){
 const fields={dispatchEditService:'bls',dispatchEditPickup:'Home',dispatchEditDestination:'Clinic',dispatchEditDate:booking.date,dispatchEditTime:'10:31',dispatchEditAppointmentTime:'13:15',dispatchEditTripType:'ROUND_TRIP',dispatchEditReturnDate:booking.returnTripDate,dispatchEditReturnTiming:'SCHEDULED',dispatchEditReturnTime:'14:00',...overrides};
 const source=fs.readFileSync(require.resolve('../dispatch.html'),'utf8');
 const start=source.indexOf('  function fareEditorBooking(){');
 const end=source.indexOf('  async function updateEditorRoute()',start);
 return vm.runInNewContext(source.slice(start,end)+';fareEditorBooking()', {NexusFare:Fare,currentFareBooking:booking,currentFareSettings:settings,get:id=>({value:fields[id]})});
}
test('opening an appointment-based BLS round trip preserves booking total and waiting',()=>{
 const original=Fare.calculateEstimate(booking,settings),edited=Fare.calculateEstimate(editor(),settings);
 assert.equal(edited.inputs.scheduleBasis,'APPOINTMENT');
 assert.equal(edited.waitMinutes,original.waitMinutes);
 assert.equal(edited.discountedTotal,original.discountedTotal);
 assert.deepEqual(Array.from(edited.inputs.stopAppointmentTimes),['13:15']);
});
test('explicitly changing pickup time still recalculates from the dispatcher pickup',()=>{
 const result=Fare.calculateEstimate(editor({dispatchEditTime:'11:00'}),settings);
 assert.equal(result.inputs.scheduleBasis,'PICKUP');
 assert.equal(require('../nexus-trip-timing.js').localParts(result.timingPlan.crewArrivalAt).time,'11:00');
});
test('changing the appointment replaces the saved appointment deadline',()=>{
 const result=editor({dispatchEditAppointmentTime:'13:30'});
 assert.equal(result.fareInputs.finalAppointmentTime,'13:30');
 assert.equal(result.fareInputs.stopAppointmentTimes.length,0);
});
