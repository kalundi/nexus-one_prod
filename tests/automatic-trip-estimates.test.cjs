const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Fare=require('../nexus-fare.js');
const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
const legacy={reference:'OLD-1',service:'wheelchair',bookingSource:'BROKER',date:'2030-08-15',time:'10:00',createdAt:'2030-08-12T14:00:00Z',distanceMiles:25.28,estimatedFare:2258.52};
test('legacy trip with only booking variables yields a current dollar estimate',()=>{
 const result=Fare.calculateEstimate(legacy,settings);
 assert.equal(result.discountedTotal,173.91);
 assert.deepEqual(result.inputs.deadheadSegments,[0,0]);
 assert.equal(result.waitCharge,0);
});
test('legacy booking notes recover empty miles, waits and member savings',()=>{
 const result=Fare.calculateEstimate({...legacy,notes:'Expected stop times: Stop 1: 16 min | Deadhead mileage charge: $12.30; empty segments: 12.00 mi; 10.00 mi | Member savings: 5%'},settings);
 assert.ok(Math.abs(result.deadheadCharge-12.3)<1e-8);
 assert.equal(result.waitCharge,18.75);
 assert.equal(result.discountPct,5);
 assert.equal(result.discountedTotal,195.60);
});
test('round-trip waiting is recovered from the existing appointment and return schedule',()=>{
 const result=Fare.calculateEstimate({...legacy,tripType:'ROUND_TRIP',appointmentTime:'10:45',returnTripDate:'2030-08-15',returnTripTime:'12:00'},settings);
 assert.equal(result.waitMinutes,90);
 assert.equal(result.waitCharge,93.75);
 assert.equal(result.passengerLegCount,2);
 assert.equal(result.discountPct,0);
});
test('travel times read base and traffic hours separately',()=>{
 const inputs=Fare.resolveBookingInputs({...legacy,estimatedDuration:'1 hour 20 min (traffic 1 hour 45 min)'});
 assert.equal(inputs.durationMinutes,80);
 assert.equal(inputs.trafficDurationMinutes,105);
});
test('stored mileage takes precedence over obsolete fare metadata',()=>{
 const result=Fare.calculateEstimate({...legacy,notes:'Fare inputs: {"miles":100,"durationMinutes":0,"trafficDurationMinutes":0,"stopWaitMinutes":0,"discountPct":0,"deadheadSegments":[0,0]}'},settings);
 assert.equal(result.inputs.miles,25.28);
 assert.equal(result.discountedTotal,173.91);
});
test('legacy mock breakdowns recover the simulated fares without user input',()=>{
 const result=Fare.calculateEstimate({...legacy,bookingSource:'MOCK',notes:'Fare breakdown: {"deadheadSegments":[12,10]}. Member savings: 5%. Pricing booking timestamp: 2030-08-14T20:00:00Z (simulated test clock).'},settings);
 assert.ok(Math.abs(result.deadheadCharge-12.3)<1e-8);
 assert.equal(result.shortNoticeCharge,29.4);
 assert.equal(result.discountPct,5);
});
test('all 20 existing mock trips recalculate automatically from their original inputs',()=>{
 const batch=JSON.parse(fs.readFileSync('output/patient-mock-trips-20261010.json','utf8'));
 const bookingSource=fs.readFileSync('booking-app.js','utf8');
 const context=vm.createContext({});
 vm.runInContext(bookingSource.slice(bookingSource.indexOf('  const FALLBACK_PRICING ='),bookingSource.indexOf('  const DEFAULT_FARE_RULES ='))+';globalThis.pricing=FALLBACK_PRICING;',context);
 for(const trip of batch.trips){
  const booking={reference:trip.reference,bookingSource:'MOCK',service:trip.service,date:trip.date,time:trip.time,distanceMiles:trip.miles,estimatedDuration:trip.duration+' min (MOCK estimate)',createdAt:'2026-10-10T14:00:00Z',
    notes:'Fare breakdown: '+JSON.stringify(trip.breakdown)+'. Member savings: 5%. Pricing booking timestamp: '+trip.created+' (simulated test clock).'};
  const result=Fare.calculateEstimate(booking,{pricing:context.pricing,fareRules:{}});
  const direct=Fare.calculateBooking(booking,{miles:trip.miles,durationMinutes:trip.duration,trafficDurationMinutes:trip.duration,stopWaitMinutes:0,deadheadSegments:trip.breakdown.deadheadSegments,discountPct:5},{pricing:context.pricing,fareRules:{}});
  assert.equal(result.discountedTotal,direct.discountedTotal,trip.reference);
  assert.ok(Number.isFinite(result.discountedTotal)&&result.discountedTotal>0);
 }
 assert.equal(batch.trips.length,20);
});
test('original booking source selects the existing membership and schedule savings',()=>{
 const patient=Fare.calculateEstimate({...legacy,bookingSource:'PATIENT'},settings);
 assert.equal(patient.discountPct,5);
 const roundTrip=Fare.calculateEstimate({...legacy,bookingSource:'PATIENT',tripType:'ROUND_TRIP',returnTripDate:legacy.date,returnTripTime:'10:00'},settings);
 assert.equal(roundTrip.discountPct,10);
 const guest=Fare.calculateEstimate({...legacy,bookingSource:'CUSTOMER',tripType:'RECURRING'},settings);
 assert.equal(guest.discountPct,5);
});
test('all historical trips receive refreshed estimates on the API list path',async()=>{
 const source=fs.readFileSync('netlify/functions/api.cjs','utf8');
 const start=source.indexOf('async function mapBookingsWithIntakeAudit('),end=source.indexOf('exports.handler=',start);
 let reads=0;
 const trips=[legacy,{...legacy,reference:'OLD-2',distanceMiles:8},{...legacy,reference:'OLD-3',date:'2030-08-17'}];
 const context=vm.createContext({NexusFare:Fare,mapBooking:b=>({...b}),mapParseSourceLabel:()=>null,clean:v=>String(v||''),normalizeOptionalTripTime:v=>v||'',query:async()=>({rows:[]}),readPlatformSettings:async()=>{reads++;return settings;}});
 vm.runInContext(source.slice(start,end),context);
 const result=await context.mapBookingsWithIntakeAudit(trips);
 assert.equal(reads,1);
 assert.deepEqual(Array.from(result,b=>b.ourEstimate),[173.91,100.94,226.09]);
 assert.equal(result[0].estimatedFare,2258.52);
 assert.equal(result[0].intakePayload,undefined);
 const updated=await context.withCurrentEstimate(legacy,{...settings,pricing:{wheelchair:{...settings.pricing.wheelchair,base:120}}});
 assert.equal(updated.ourEstimate,196.57);
});
