const {test}=require('node:test'),assert=require('node:assert/strict'),Fare=require('../nexus-fare.js'),Timing=require('../nexus-trip-timing.js');
for(const smart of [false,true])test(`61 appointment minutes less 15 free minutes, smart timing=${smart}`,()=>{
 const booking={service:'ambulatory',date:'2030-10-30',time:'09:02',pickup:'Home',destination:'Clinic',appointmentTime:'10:02',tripType:'ROUND_TRIP',returnTripDate:'2030-10-30',returnTripTime:'11:03'};
 const inputs={miles:10,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,discountPct:0,deadheadSegments:[2,2],scheduleBasis:'APPOINTMENT',finalAppointmentTime:'10:02'};
 const settings={pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12}},fareRules:{smartTiming:{enabled:smart},waitingPolicyVersion:2,freeWaitMinutes:15}};
 const fare=Fare.calculateBooking(booking,inputs,settings);
 assert.equal(fare.waitMinutes,61);assert.equal(fare.freeWaitMinutes,15);assert.equal(fare.billableWaitMinutes,46);assert.equal(fare.waitCharge,48);
 if(smart){const plan=Timing.plan(booking,inputs,settings);assert.ok(plan.legs[0].vehicleAvailableAt<plan.legs[0].waitingStartsAt);assert.equal(plan.waitingMinutes,61);assert.equal(plan.totalMinutes,(plan.vehicleAvailableAt-plan.crewArrivalAt)/60000);}
});
