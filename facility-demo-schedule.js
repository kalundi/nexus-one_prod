(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./nexus-fare.js'),require('./nexus-trip-timing.js'));
 else root.NexusFacilitySchedule=factory(root.NexusFare,root.NexusTripTiming);
})(globalThis,function(Fare,Timing){
 'use strict';
 const parse=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
 const format=value=>Number.isInteger(value)&&value>=0&&value<1440?`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`:'';
 const keys={'Ambulatory':'ambulatory','Wheelchair':'wheelchair','Broda':'broda','Stretcher':'stretcher','Bariatric':'bariatric','BLS':'bls','ALS 1':'als1','ALS 2':'als2','IFT Routine':'facility_transfer','IFT High-Acuity':'facility_transfer_critical'};
 function resolve(input,rules={}){
  const basis=input.scheduleBasis||'APPOINTMENT',pickupBasis=basis==='PICKUP',anchor=parse(pickupBasis?input.pickupTime:input.appointmentTime);
  const service=keys[input.service]||input.service,base=Number(input.travelMinutes),miles=Number(input.distanceMiles),waiting=Number(input.stopWaitMinutes)||0;
  if(anchor===null||!(base>0)||!(miles>0)||!Number.isFinite(waiting)||waiting<0)return null;
  const route={miles,durationMinutes:base,trafficDurationMinutes:base},drive=Math.ceil(Fare.serviceTravel(route,service,rules).scheduledMinutes-1e-9);
  let allowance=basis==='HANDOFF'?0:15,plan=null;
  if(rules.smartTiming?.enabled){
   // Use the booking app's shared preparation, handoff, reliability and check-in
   // allowances. Demo routes supply illustrative road estimates, not live GPS.
   const booking={service,date:input.date,pickup:input.origin?.address||'',destination:input.destination?.address||'',tripType:'ONE_WAY',pickupTime:input.pickupTime,appointmentTime:input.appointmentTime};
   plan=Timing.plan(booking,{...route,scheduleBasis:pickupBasis?'PICKUP':'APPOINTMENT',finalAppointmentTime:input.appointmentTime,deadlineBasis:basis==='HANDOFF'?'HANDOFF':'APPOINTMENT'},{fareRules:rules});
   if(plan&&!plan.routingPending){const leg=plan.legs[0];allowance=leg.pickupMinutes+leg.handoffMinutes+leg.bufferMinutes+(basis==='HANDOFF'?0:Timing.policy(service,rules).checkInLeadMinutes);}
  }
  const total=drive+waiting+allowance,pickup=pickupBasis?anchor:anchor-total,appointmentAt=pickupBasis?anchor+total:anchor;
  return {pickup,appointmentAt,pickupTime:format(pickup),appointmentTime:format(appointmentAt),drivingMinutes:drive,stopWaitMinutes:waiting,allowanceMinutes:allowance,totalMinutes:total,smart:!!plan};
 }
 return {resolve,parse,format};
});
