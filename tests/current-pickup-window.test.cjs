const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Fare=require('../nexus-fare.js');
const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:12}},fareRules:{waitingPolicyVersion:2,freeWaitMinutes:15,fuelSurchargePerMile:.24,cardProcessingFeePct:3,shortNoticeHours:24,shortNoticeSurchargePct:30,servicePolicies:{wheelchair:{afterHoursSurchargePct:25}}}};
const booking={reference:'MOCK-20261010-02',bookingSource:'MOCK',service:'wheelchair',date:'2026-10-14',time:'05:30',appointmentTime:'05:30',createdAt:'2026-10-10T14:00:00Z',tripType:'ROUND_TRIP',returnTripDate:'2026-10-14',returnTripTime:'09:00',notes:'Pricing booking timestamp: 2026-10-13T12:00:00Z (simulated test clock).'};
const inputs={miles:12,durationMinutes:21,trafficDurationMinutes:21,stopWaitMinutes:0,deadheadSegments:[12,10],discountPct:5};
const freeze=(t,iso)=>t.mock.method(Date,'now',()=>Date.parse(iso));

test('October 14 mock trip has no 24-hour charge when reviewed on October 11',t=>{
 freeze(t,'2026-10-11T16:00:00Z');
 const fare=Fare.calculateBooking(booking,inputs,settings);
 assert.equal(fare.shortNoticeCharge,0);
 assert.equal(fare.waitMinutes,225);
 assert.equal(fare.waitCharge,168);
 assert.equal(fare.discountedTotal,434.63);
 assert.equal(Fare.calculateEstimate({...booking,distanceMiles:12,estimatedDuration:'21 min',fareInputs:inputs},settings).discountedTotal,fare.discountedTotal);
});

test('API current estimates use the same calculation for existing trips',t=>{
 const source=fs.readFileSync('netlify/functions/api.cjs','utf8');
 const code=source.slice(source.indexOf('function withCurrentEstimate('),source.indexOf('exports.handler=handler;'));
 const context=vm.createContext({NexusFare:Fare,RouteFares:require('../netlify/functions/_shared/route-fares.cjs')});
 vm.runInContext(code,context);
 const trip={...booking,distanceMiles:12,estimatedDuration:'21 min',fareInputs:inputs,estimatedFare:492.17};
 freeze(t,'2026-10-11T16:00:00Z');
 const result=context.withCurrentEstimate(trip,settings);
 assert.equal(result.ourEstimate,434.63);
 assert.equal(result.fareCalculation.shortNoticeCharge,0);
 assert.equal(result.estimatedFare,492.17,'the estimate does not rewrite a saved charge');
 freeze(t,'2026-10-13T20:00:00Z');
 const later=context.withCurrentEstimate(trip,settings);
 assert.equal(later.ourEstimate,492.17);
 assert.equal(later.fareCalculation.shortNoticeCharge,58.8);
});

for(const hours of [-1,0,1/60,23.999,24,24+1/3600000,48,72])test(`current pickup window boundary: ${hours} hours`,t=>{
 const pickup=Fare.scheduledEpoch('2026-10-14','10:00');
 t.mock.method(Date,'now',()=>pickup-hours*3600000);
 const fare=Fare.calculateBooking({...booking,tripType:'ONE_WAY',time:'10:00'},inputs,settings);
 assert.equal(fare.shortNoticeCharge,hours>=0&&hours<=24?29.4:0);
});

test('old creation dates and simulated or submitted clocks cannot change eligibility',t=>{
 freeze(t,'2026-10-11T16:00:00Z');
 for(const source of ['MOCK','BROKER','PATIENT']){
  for(const createdAt of [null,'invalid','2026-10-14T04:00:00Z']){
   const fare=Fare.calculateBooking({...booking,bookingSource:source,createdAt},inputs,settings);
   assert.equal(fare.shortNoticeCharge,0);
  }
 }
 const direct=Fare.calculate({service:'wheelchair',rate:settings.pricing.wheelchair,rules:settings.fareRules,date:booking.date,time:booking.time,miles:12,metrics:{bookingTime:Date.parse('2026-10-13T12:00:00Z')}});
 assert.equal(direct.shortNoticeCharge,0);
});

test('each scheduled round-trip leg qualifies separately and pending returns are excluded',t=>{
 freeze(t,'2026-10-13T12:00:00Z'); // 8 AM Eastern
 const fare=returnTime=>Fare.calculateBooking({...booking,time:'07:00',appointmentTime:'07:45',returnTripTime:returnTime},inputs,settings);
 assert.equal(fare('09:00').shortNoticeCharge,29.4,'only outbound is within 24 hours');
 assert.equal(fare('08:00').shortNoticeCharge,58.8,'both legs are within 24 hours');
 assert.equal(Fare.calculateBooking({...booking,time:'07:00',returnTimePending:true,returnTripTime:null},inputs,settings).shortNoticeCharge,29.4);
 freeze(t,'2026-10-14T12:30:00Z'); // outbound has passed, return is still ahead
 assert.equal(fare('09:00').shortNoticeCharge,29.4,'only the future return qualifies');
});

test('configured window and base percentage use the current time',t=>{
 freeze(t,'2026-10-13T12:00:00Z');
 const configured={...settings,fareRules:{...settings.fareRules,shortNoticeHours:12,shortNoticeSurchargePct:40}};
 const oneWay={...booking,tripType:'ONE_WAY',date:'2026-10-13'};
 assert.equal(Fare.calculateBooking({...oneWay,time:'20:00'},inputs,configured).shortNoticeCharge,39.2);
 assert.equal(Fare.calculateBooking({...oneWay,time:'20:01'},inputs,configured).shortNoticeCharge,0);
});

for(const date of ['2026-03-08','2026-11-01'])test(`24-hour boundary uses Eastern time through DST on ${date}`,t=>{
 const pickup=Fare.scheduledEpoch(date,'10:00');
 let now=pickup-24*3600000;
 t.mock.method(Date,'now',()=>now);
 const trip={...booking,tripType:'ONE_WAY',date,time:'10:00'};
 assert.equal(Fare.calculateBooking(trip,inputs,settings).shortNoticeCharge,29.4);
 now--;
 assert.equal(Fare.calculateBooking(trip,inputs,settings).shortNoticeCharge,0);
});

test('Booking and Dispatch produce identical fare components at the same time',t=>{
 const client=fs.readFileSync('booking-app.js','utf8');
 const code=client.slice(client.indexOf('  function calculateFareBreakdown('),client.indexOf('  function calculateFare(service,'));
 let dispatchFare;
 const context=vm.createContext({NexusFare:Fare,fareRules:settings.fareRules,getPricing:()=>settings.pricing.wheelchair,routeStopMetrics:[],measuredRouteInputs:null,
  getOutboundTravel:(service,route)=>Fare.serviceTravel(route,service,settings.fareRules),
  getWaitingCharge:()=>({waitMinutes:dispatchFare.waitMinutes}),
  tripType:{value:'ROUND_TRIP'},returnTripDate:{value:booking.returnTripDate},returnTripTime:{value:booking.returnTripTime}});
 vm.runInContext(code,context);
 let now=Date.parse('2026-10-11T16:00:00Z');
 t.mock.method(Date,'now',()=>now);
 for(const instant of ['2026-10-11T16:00:00Z','2026-10-13T12:00:00Z','2026-10-14T08:00:00Z','2026-10-14T16:00:00Z']){
  now=Date.parse(instant);
  dispatchFare=Fare.calculateBooking(booking,inputs,settings);
  const bookingFare=context.calculateFareBreakdown('wheelchair',12,booking.date,booking.time,inputs);
  for(const key of ['subtotal','taxAmount','total','mileageCharge','waitCharge','deadheadCharge','fuelCharge','premiumAmount','shortNoticeCharge'])assert.equal(bookingFare[key],dispatchFare[key],key+' at '+instant);
  assert.equal(Fare.applySavings(bookingFare.total,5).total,dispatchFare.discountedTotal);
 }
});
