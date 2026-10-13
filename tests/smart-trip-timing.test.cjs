const {test}=require('node:test');
const assert=require('node:assert/strict');
const Timing=require('../nexus-trip-timing.js');
const Fare=require('../nexus-fare.js');
const settings={fareRules:{smartTiming:{enabled:true},servicePolicies:{wheelchair:{speedReductionMph:0}},waitingPolicyVersion:2,freeWaitMinutes:15,cardProcessingFeePct:0},pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:12}}};
const booking={service:'wheelchair',date:'2026-10-14',time:'08:30',pickup:'Urban Rehab A',destination:'Urban Rehab B',appointmentTime:'10:00',tripType:'ONE_WAY'};
const inputs={miles:5,durationMinutes:20,trafficDurationMinutes:20,stopWaitMinutes:0,discountPct:0,deadheadSegments:[0,0],scheduleBasis:'APPOINTMENT',finalAppointmentTime:'10:00'};
test('wheelchair rehab transfer includes 30 prep, 20 drive, 20 handoff and 5 buffer; appointment has check-in lead',()=>{
 const plan=Timing.plan(booking,inputs,settings);
 assert.equal(plan.totalMinutes,75);
 assert.equal(Timing.localParts(plan.crewArrivalAt).time,'08:30');
 assert.equal(Timing.localParts(plan.legs[0].patientDepartureAt).time,'09:00');
 assert.equal(Timing.localParts(plan.patientArrivalAt).time,'09:20');
 assert.equal(Timing.localParts(plan.vehicleAvailableAt).time,'09:45');
 assert.equal(plan.waitingMinutes,0);assert.equal(plan.confidence,'LOW');
 assert.equal(plan.legs[0].pickupHandling.facilityType,'REHAB');
});
test('handoff deadlines do not subtract appointment check-in lead',()=>{
 const plan=Timing.plan(booking,{...inputs,deadlineBasis:'HANDOFF'},settings);
 assert.equal(Timing.localParts(plan.crewArrivalAt).time,'08:45');
 assert.equal(Timing.localParts(plan.vehicleAvailableAt).time,'10:00');
});
test('backwards scheduling keeps prior date when crossing midnight and accounts for Eastern DST',()=>{
 for(const date of ['2026-10-14','2026-11-02']){
  const plan=Timing.plan({...booking,date,appointmentTime:'00:30'},{...inputs,finalAppointmentTime:'00:30'},settings);
  assert.equal(Timing.localParts(plan.crewArrivalAt).time,'23:00');
  assert.notEqual(Timing.localParts(plan.crewArrivalAt).date,date);
  assert.equal(plan.vehicleAvailableAt-plan.crewArrivalAt,75*60000);
 }
});
test('facility p85 uses enough real observations, favoring matching weekday/time window',()=>{
 const context={locations:{[Timing.addressKey(booking.pickup)]:{observations:Array.from({length:10},(_,i)=>({service:'wheelchair',role:'PICKUP',minutes:20+i,bucket:Timing.bucket(Fare.scheduledEpoch(booking.date,'08:30'))}))}}};
 const h=Timing.handling;
 const plan=Timing.plan(booking,inputs,settings,context);
 assert.equal(plan.legs[0].pickupMinutes,28);
 assert.equal(plan.legs[0].pickupHandling.source,'HISTORICAL_P85');
 assert.equal(plan.legs[0].pickupHandling.confidence,'HIGH');
});
test('return waiting excludes handling; preparation is never billed as driver waiting',()=>{
 const rt={...booking,tripType:'ROUND_TRIP',returnTripDate:booking.date,returnTripTime:'11:00'};
 const fare=Fare.calculateBooking(rt,inputs,settings);
 assert.equal(fare.waitMinutes,75);assert.equal(fare.waitCharge,48);
 assert.equal(fare.timingPlan.preparationMinutes,100);
 assert.equal(fare.journeyMinutes,225);
 assert.equal(Timing.localParts(fare.timingPlan.vehicleAvailableAt).time,'12:15');
});
test('multi-stop appointment deadlines flag impossible connections and never reverse time',()=>{
 const plan=Timing.plan({...booking,destinations:['Urban Rehab B','Hospital C']},{...inputs,stopAppointmentTimes:['10:00','10:30'],stopDistancesMiles:[3,2],stopDurationMinutes:[12,8],stopTrafficDurationMinutes:[12,8]},settings);
 assert.equal(plan.legs.length,2);assert(plan.alerts.some(a=>a.code==='TIGHT_CONNECTION'));
 assert(plan.legs[1].crewArrivalAt>=plan.legs[0].vehicleAvailableAt);assert.equal(plan.waitingMinutes,0);
});
test('saved pickup remains visible and a late plan is flagged rather than silently moving the trip',()=>{
 const plan=Timing.plan({...booking,time:'09:30'},{...inputs,scheduleBasis:'PICKUP'},settings);
 assert.equal(Timing.localParts(plan.crewArrivalAt).time,'09:30');
 assert.equal(Timing.localParts(plan.recommendedPickupAt).time,'08:30');
 assert(plan.alerts.some(a=>a.code==='APPOINTMENT_AT_RISK'));
});
test('driver delay projects handoff and vehicle availability, keeping documentation time',()=>{
 const plan=Timing.plan(booking,inputs,settings),at=Fare.scheduledEpoch(booking.date,'09:10');
 const predicted=Timing.predict(plan,[{status:'DEPARTED',createdAt:new Date(at).toISOString()}],at);
 assert.equal(Timing.localParts(predicted.predictedPatientArrivalAt).time,'09:30');
 assert.equal(Timing.localParts(predicted.predictedVehicleAvailableAt).time,'09:55');
 assert.equal(predicted.delayMinutes,10);assert(predicted.alerts.some(a=>a.code==='LIVE_DELAY'));
});

test('scheduled and assigned history does not turn a future planning warning into a live driver delay',()=>{
 const plan=Timing.plan({...booking,time:'09:30'},{...inputs,scheduleBasis:'PICKUP'},settings);
 const at=Fare.scheduledEpoch(booking.date,'07:00');
 const predicted=Timing.predict(plan,[{status:'SCHEDULED',createdAt:new Date(at-60000).toISOString()},{status:'ASSIGNED',createdAt:new Date(at).toISOString()}],at);
 assert.equal(predicted.predicted,false);
 assert.equal(predicted.predictedPatientArrivalAt,undefined);
 assert(predicted.alerts.some(a=>a.code==='APPOINTMENT_AT_RISK'));
 assert(!predicted.alerts.some(a=>a.code==='LIVE_DELAY'));
});
test('vehicle intervals overlap through handoff but adjacent completed windows are available',()=>{
 const plan=Timing.plan(booking,inputs,settings);
 assert(Timing.overlaps({start:plan.crewArrivalAt,end:plan.vehicleAvailableAt},{start:Fare.scheduledEpoch(booking.date,'09:30'),end:Fare.scheduledEpoch(booking.date,'10:00')}));
 assert(!Timing.overlaps({start:plan.crewArrivalAt,end:plan.vehicleAvailableAt},{start:plan.vehicleAvailableAt,end:plan.vehicleAvailableAt+60000}));
});
test('peak-window boundary uses destination arrival time, and closed receiving hours require review',()=>{
 const context={locations:{[Timing.addressKey(booking.destination)]:{handoffExtraMinutes:0,peakWindows:[{start:'09:00',end:'09:30',extraMinutes:5}],receivingHours:[{start:'10:00',end:'16:00'}]}}};
 const plan=Timing.plan(booking,inputs,settings,context);
 assert.equal(Timing.localParts(plan.crewArrivalAt).time,'08:25');assert(plan.legs[0].vehicleAvailableAt<=Fare.scheduledEpoch(booking.date,'09:45'));assert(plan.alerts.some(a=>a.code==='RECEIVING_CLOSED'));
});
test('return waiting absorbs an outbound delay before vehicle readiness is moved',()=>{
 const plan=Timing.plan({...booking,tripType:'ROUND_TRIP',returnTripDate:booking.date,returnTripTime:'11:00'},inputs,settings);
 const at=Fare.scheduledEpoch(booking.date,'09:10'),predicted=Timing.predict(plan,[{status:'DEPARTED',createdAt:new Date(at).toISOString()}],at);
 assert.equal(predicted.delayMinutes,10);assert.equal(Timing.localParts(predicted.predictedVehicleAvailableAt).time,'12:15');
});
test('multi-stop traffic requests use each leg departure and retain the complete itinerary',async()=>{
 const Route=require('../nexus-route.js'),requests=[],start=Date.now()+3600000;
 const maps={TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'BEST_GUESS',PESSIMISTIC:'PESSIMISTIC'},DirectionsService:class{route(request,callback){requests.push(request);callback({routes:[{legs:[{distance:{value:1609.344},duration:{value:600},duration_in_traffic:{value:900}}],overview_path:[request.origin,request.destination]}],geocoded_waypoints:[{place_id:request.origin},{place_id:request.destination}]},'OK');}}};
 const booking={smartTiming:true,timingPlan:{legs:[{kind:'OUTBOUND',patientDepartureAt:start},{kind:'OUTBOUND',patientDepartureAt:start+7200000}]}};
 const result=await Route.googleProvider(maps,booking)({kind:'OUTBOUND',from:'Pickup',to:'Final destination',waypoints:['Clinic']});
 assert.deepEqual(requests.map(r=>[r.origin,r.destination]),[['Pickup','Clinic'],['Clinic','Final destination']]);
 assert(requests.every(r=>r.waypoints.length===0&&r.drivingOptions.trafficModel==='PESSIMISTIC'));
 assert.equal(requests[1].drivingOptions.departureTime.getTime(),start+7200000);
 assert.equal(result.routes[0].legs.length,2);assert.deepEqual(result.routes[0].overview_path,['Pickup','Clinic','Clinic','Final destination']);
 assert.equal(Route.fromDirections(result,{kind:'OUTBOUND'}).trafficDurationMinutes,30);
});
test('schedule premiums consider the full multi-stop window including appointment gaps',()=>{
 const multi={...booking,destinations:['Urban Rehab B','Hospital C'],time:'08:30'};
 const metrics={...inputs,stopAppointmentTimes:['10:00','20:00'],stopDistancesMiles:[3,2],stopDurationMinutes:[12,8],stopTrafficDurationMinutes:[12,8]};
 const fare=Fare.calculateBooking(multi,metrics,{...settings,fareRules:{...settings.fareRules,afterHoursSurchargePct:30}});
 assert.equal(fare.premiumRateReason,'after-hours');assert.equal(fare.outboundPremiumPct,30);
});
test('a new appointment request flags a crew pickup that would already be in the past',t=>{
 t.mock.method(Date,'now',()=>Fare.scheduledEpoch(booking.date,'09:00'));
 const plan=Timing.plan(booking,inputs,settings);assert(plan.alerts.some(a=>a.code==='PICKUP_WINDOW_PASSED'));
});
