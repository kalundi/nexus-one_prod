const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Fare=require('../nexus-fare.js'),Timing=require('../nexus-trip-timing.js');
const api=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
const client=fs.readFileSync(require.resolve('../booking-app.js'),'utf8');
const settings={pricing:{bls:{base:1300,includedMiles:0,perMile:18.5,waitPer15:35}},fareRules:{smartTiming:{enabled:true},freeWaitMinutes:15}};
const booking={service:'bls',date:'2030-10-15',time:'09:00',pickupTime:'09:00',pickup:'Home',destination:'Clinic',appointmentTime:'13:15',tripType:'ROUND_TRIP',returnTripDate:'2030-10-15',returnTripTime:'14:00',estimatedFare:1,fareInputs:{miles:33.35,durationMinutes:55,trafficDurationMinutes:55,stopWaitMinutes:0,discountPct:0,deadheadSegments:[52.07,50.99],scheduleBasis:'APPOINTMENT',finalAppointmentTime:'13:15'}};
test('booking creation uses source pricing and the submitted scheduling basis, never the dollar amount',async()=>{
 const start=api.indexOf('   if(!b.fareInputs)return json(400'),end=api.indexOf('   const codeHash=',start);
 const context={b:booking,readPlatformSettings:async()=>settings,TripTiming:{hydrate:async rows=>rows},query:()=>{},NexusFare:Fare,pickupTimeEstimate:booking.time,appointmentTime:booking.appointmentTime,tripType:booking.tripType,returnTripDate:booking.returnTripDate,returnTripTime:booking.returnTripTime,bookingSource:'CUSTOMER',json:(status,body)=>({status,body})};
 const saved=await vm.runInNewContext(`(async()=>{${api.slice(start,end)};return submittedFare;})()`,context);
 assert.equal(saved,Fare.calculateBooking(booking,booking.fareInputs,settings).discountedTotal);
 assert.notEqual(Timing.plan(booking,booking.fareInputs,settings).crewArrivalAt,Timing.plan(booking,{...booking.fareInputs,scheduleBasis:'PICKUP'},settings).crewArrivalAt);
 const missing=await vm.runInNewContext(`(async()=>{${api.slice(start,end)};return submittedFare;})()`,{...context,b:{...booking,fareInputs:null}});
 assert.equal(missing.status,400);
});
test('trip list uses the same schedule and fare as booking',()=>{
 const start=api.indexOf('function withCurrentEstimate('),end=api.indexOf('exports.handler=',start);
 const context=vm.createContext({NexusFare:Fare,NexusTripTiming:Timing,RouteFares:{currentBooking:b=>b},TripTiming:{publicContext:c=>c}});
 vm.runInContext(api.slice(start,end),context);
 assert.equal(context.withCurrentEstimate(booking,settings).ourEstimate,Fare.calculateBooking(booking,booking.fareInputs,settings).discountedTotal);
});
test('online edits recalculate from source settings and persist their route and schedule inputs',async()=>{
 const start=api.indexOf('   if(!b.fareInputs)return json(400',api.indexOf('   if(!b.fareInputs)return json(400')+1);
 const end=api.indexOf("   await query('INSERT INTO trip_status_history",start);
 let update;
 const inputs={...booking.fareInputs,routeVerified:true};
 const context={b:{...booking,fareInputs:inputs},found:{rows:[booking]},ref:'TEST',flightInfo:null,
  readPlatformSettings:async()=>settings,TripTiming:{hydrate:async rows=>rows},mapBooking:b=>b,
  NexusFare:Fare,NexusRoute:{validate(){}},clean:v=>String(v||''),upsertAppointmentNote:s=>s,
  query:async(sql,params)=>{update={sql,params};return {rows:[{}]};},json:(status,body)=>({status,body})};
 const result=await vm.runInNewContext(`(async()=>{${api.slice(start,end)};return fare;})()`,context);
 assert.equal(result,Fare.calculateBooking(booking,inputs,settings).discountedTotal);
 assert.equal(update.params[11],result);
 assert.deepEqual(JSON.parse(update.params[13]),inputs);
 assert.equal(update.params[14],'ROUND_TRIP');
 assert.equal(update.params[16],'14:00');
 assert.match(update.params[8],/Fare inputs:/);
});
test('booking rates come only from loaded platform settings, not local defaults or cached rates',()=>{
 const start=client.indexOf('  function getPricing('),end=client.indexOf('  function getServicePolicy(',start);
 const context=vm.createContext({normalizeService:s=>s,platformPricing:settings.pricing,window:{NexusCore:{getPricing:()=>({bls:{base:1}})}},FALLBACK_PRICING:{bls:{base:2},ambulatory:{base:3}}});
 vm.runInContext(client.slice(start,end),context);
 assert.equal(context.getPricing('bls').base,1300);
 assert.throws(()=>context.getPricing('wheelchair'),/Current pricing is unavailable/);
 context.platformPricing=null;
 assert.throws(()=>context.getPricing('bls'),/Current pricing is unavailable/);
});
