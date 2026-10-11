const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fare=require('../nexus-fare.js');
const Routes=require('../nexus-route.js');
const rate={base:100,includedMiles:5,perMile:4,waitPer15:20};
const route={miles:20,durationMinutes:30,trafficDurationMinutes:50};

test('wheelchair uses the configured reduction from route-average speed and preserves traffic delay',()=>{
 const ambulatory=Fare.serviceTravel(route,'ambulatory');
 const wheelchair=Fare.serviceTravel(route,'wheelchair');
 assert.equal(ambulatory.scheduledMinutes,50);
 assert.equal(wheelchair.routeAverageMph,40);assert.equal(wheelchair.serviceAverageMph,30);
 assert.equal(wheelchair.serviceDurationMinutes,40);assert.equal(wheelchair.scheduledMinutes,60);
 assert.equal(wheelchair.trafficDelayMinutes,20);
});

test('stretcher and ambulance reductions produce the requested driving times and retain traffic separately',()=>{
 const stretcher=Fare.serviceTravel(route,'stretcher');
 assert.equal(stretcher.speedReductionMph,20);assert.equal(stretcher.serviceAverageMph,20);
 assert.equal(stretcher.serviceDurationMinutes,60);assert.equal(stretcher.scheduledMinutes,80);
 for(const service of ['bls','als1','als2','facility_transfer_critical','Ambulance','BLS Ambulance','ALS I Ambulance','ALS II Ambulance']){
  const travel=Fare.serviceTravel(route,service);
  assert.equal(travel.speedReductionMph,25,service);assert.equal(travel.serviceAverageMph,15,service);
  assert.equal(travel.serviceDurationMinutes,80,service);assert.equal(travel.scheduledMinutes,100,service);
  assert.equal(travel.trafficDelayMinutes,20,service);
 }
});

test('legacy zero reductions migrate while current explicit overrides remain editable',()=>{
 const legacy={servicePolicies:{stretcher:{speedReductionMph:0},bls:{speedReductionMph:0},wheelchair:{speedReductionMph:0}}};
 assert.equal(Fare.serviceTravel(route,'stretcher',legacy).scheduledMinutes,80);
 assert.equal(Fare.serviceTravel(route,'bls',legacy).scheduledMinutes,100);
 assert.equal(Fare.serviceTravel(route,'wheelchair',legacy).scheduledMinutes,50);
 const current={...legacy,serviceTravelPolicyVersion:2};
 assert.equal(Fare.serviceTravel(route,'stretcher',current).scheduledMinutes,50);
 assert.equal(Fare.serviceTravel(route,'bls',current).scheduledMinutes,50);
});

test('stretcher and ambulance round trips adjust both directions without compounding',()=>{
 const booking={date:'2030-08-15',time:'10:00',createdAt:'2030-08-01T12:00:00Z',tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00'};
 const passengerLegs=[{kind:'OUTBOUND',miles:20,durationMinutes:30,trafficDurationMinutes:30},{kind:'RETURN',miles:25,durationMinutes:30,trafficDurationMinutes:30}];
 const inputs={passengerLegs,miles:20,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,scheduleBasis:'PICKUP',deadheadSegments:[0,0],discountPct:0};
 for(const [service,outbound,returning] of [['stretcher',60,50],['bls',80,60]]){
  const fare=Fare.calculateBooking({...booking,service},inputs,{pricing:{[service]:rate},fareRules:{}});
  assert.equal(fare.passengerLegs[0].scheduledMinutes,outbound);assert.equal(fare.passengerLegs[1].scheduledMinutes,returning);
  assert.equal(fare.drivingMinutes,outbound+returning);assert.equal(fare.waitMinutes,120-outbound);
  assert.deepEqual(Fare.calculateBooking({...booking,service},inputs,{pricing:{[service]:rate},fareRules:{}}),fare);
 }
});

test('very slow, zero-distance and missing-time routes remain finite and never get a faster estimate',()=>{
 for(const service of ['wheelchair','stretcher','bls'])for(const input of [{miles:5,durationMinutes:60},{miles:.25,durationMinutes:20},{miles:0,durationMinutes:0},{miles:0,durationMinutes:15},{miles:10,durationMinutes:0,trafficDurationMinutes:15}]){
  const travel=Fare.serviceTravel(input,service);
  assert.ok(Number.isFinite(travel.scheduledMinutes));
  assert.ok(travel.scheduledMinutes>=Math.max(input.durationMinutes||0,input.trafficDurationMinutes||0));
 }
 assert.equal(Fare.serviceTravel({miles:5,durationMinutes:60},'wheelchair').scheduledMinutes,60);
 assert.equal(Fare.serviceTravel({miles:.25,durationMinutes:20},'wheelchair').scheduledMinutes,20);
});

test('long highway trips use their own baseline instead of one fixed fleet average',()=>{
 const travel=Fare.serviceTravel({miles:200,durationMinutes:200,trafficDurationMinutes:210},'wheelchair');
 assert.equal(travel.routeAverageMph,60);assert.equal(travel.serviceAverageMph,50);assert.equal(travel.scheduledMinutes,250);
});

test('repeated calculations and changed service policies always use the original route measurements',()=>{
 const travel=Fare.serviceTravel(route,'wheelchair');
 assert.deepEqual(Fare.serviceTravel({...route,...travel},'wheelchair'),travel);
 assert.equal(Fare.serviceTravel(route,'wheelchair',{servicePolicies:{wheelchair:{speedReductionMph:20}}}).scheduledMinutes,80);
 assert.equal(Fare.serviceTravel(route,'stretcher',{servicePolicies:{stretcher:{speedReductionMph:15}}}).scheduledMinutes,68);
 assert.deepEqual(route,{miles:20,durationMinutes:30,trafficDurationMinutes:50});
});

test('service travel can overlap after hours without treating the service adjustment as traffic overage',()=>{
 const calculate=service=>Fare.calculate({service,rate,miles:20,date:'2030-08-15',time:'18:25',metrics:{durationMinutes:30,trafficDurationMinutes:30,bookingTime:0},rules:{trafficOverageFeePerHour:60}});
 const ambulatory=calculate('ambulatory'),wheelchair=calculate('wheelchair');
 assert.equal(ambulatory.premiumRatePct,0);assert.equal(wheelchair.premiumRatePct,30);
 assert.equal(wheelchair.trafficChargePerLeg,0);assert.equal(wheelchair.drivingMinutes,40);
 const congested=Fare.calculate({service:'wheelchair',rate,miles:20,date:'2030-08-15',time:'10:00',metrics:{...route,bookingTime:0},rules:{trafficOverageFeePerHour:60}});
 assert.equal(congested.trafficChargePerLeg,20);assert.equal(congested.drivingMinutes,60);
});

test('round trip uses distinct outbound and return routes and calculates waiting from adjusted arrival',()=>{
 const booking={service:'wheelchair',date:'2030-08-15',time:'10:00',createdAt:'2030-08-01T12:00:00Z',tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00'};
 const passengerLegs=[{kind:'OUTBOUND',miles:20,durationMinutes:30,trafficDurationMinutes:30},{kind:'RETURN',miles:30,durationMinutes:36,trafficDurationMinutes:36}];
 const inputs={miles:20,durationMinutes:30,trafficDurationMinutes:30,passengerLegs,stopWaitMinutes:0,deadheadSegments:[8,9],discountPct:0,scheduleBasis:'PICKUP'};
 const fare=Fare.calculateBooking(booking,inputs,{pricing:{wheelchair:rate},fareRules:{}});
 assert.equal(fare.waitMinutes,80);assert.equal(fare.drivingMinutes,85);assert.equal(fare.journeyMinutes,165);
 assert.equal(fare.passengerLegs[0].scheduledMinutes,40);assert.equal(fare.passengerLegs[1].scheduledMinutes,45);
 assert.equal(fare.deadheadDetails[0].miles,8);assert.equal(fare.deadheadDetails[1].miles,9);
});

test('each intermediate stop uses its own route speed and next appointment',()=>{
 const measured=Routes.fromDirections({routes:[{legs:[{distance:{value:10*1609.344},duration:{value:900}},{distance:{value:5*1609.344},duration:{value:900}}]}]},{kind:'OUTBOUND'});
 const travel=Fare.serviceTravel(measured,'wheelchair');
 assert.deepEqual(travel.stopScheduledMinutes,[20,30]);assert.equal(travel.scheduledMinutes,50);
 const booking={service:'wheelchair',date:'2030-08-15',time:'10:00',createdAt:'2030-08-01T12:00:00Z',tripType:'ONE_WAY'};
 const inputs={...measured,passengerLegs:[measured],stopWaitMinutes:999,stopAppointmentTimes:['10:35','12:00'],deadheadSegments:[0,0],discountPct:0,scheduleBasis:'APPOINTMENT'};
 const fare=Fare.calculateBooking(booking,inputs,{pricing:{wheelchair:rate},fareRules:{}});
 assert.equal(fare.waitMinutes,40);assert.equal(fare.transitionMinutes,15);assert.equal(fare.journeyMinutes,105);
});

test('empty route measurements are kept at the road baseline',async()=>{
 const measured=await Routes.measure({pickup:'Home',destination:'Clinic',tripType:'ROUND_TRIP'},'Yard',async()=>({routes:[{legs:[{distance:{value:20*1609.344},duration:{value:1800}}]}]}));
 assert.equal(measured.deadheadRoutes[0].durationMinutes,30);assert.equal(measured.deadheadRoutes[1].durationMinutes,30);
 assert.equal(Fare.serviceTravel(measured.passengerLegs[0],'wheelchair').scheduledMinutes,40);
});

test('display rounds once at the end rather than rounding every route segment',()=>{
 assert.equal(Fare.formatTravelMinutes(59.2),'1h');assert.equal(Fare.formatTravelMinutes(80),'1h 20m');assert.equal(Fare.formatTravelMinutes(0),'Time pending');
 assert.equal(Fare.formatTravelMinutes(30.000000000000004),'30 min');
 assert.equal(Fare.formatTravelMinutes(6200),'4d 7h 20m');assert.equal(Fare.formatTravelMinutes(1440),'1d');
 assert.equal(Fare.serviceTravel({miles:13.575,durationMinutes:20},'ambulatory').scheduledMinutes,20);
});
