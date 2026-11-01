const test=require('node:test');
const assert=require('node:assert/strict');
const Fare=require('../nexus-fare.js');
const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
const booking={service:'wheelchair',date:'2030-08-15',time:'10:00',createdAt:'2030-08-14T20:00:00Z',tripType:'ONE_WAY'};
const inputs={miles:20,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,deadheadSegments:[12,10],discountPct:0};
test('current pricing and current time determine the estimate',t=>{
 t.mock.method(Date,'now',()=>Date.parse('2030-08-14T20:00:00Z'));
 const fare=Fare.calculateBooking(booking,inputs,settings);
 assert.equal(fare.discountedTotal,181.9);
 assert.equal(fare.shortNoticeCharge,29.4);
 // Deadhead (rule v2, 2026-11-01): wheelchair is a covered service, so
 // the trip's empty miles share a 25-mile allowance. Segments are
 // 12 + 10 = 22 empty miles, all inside the allowance: $0.
 assert.ok(Math.abs(fare.deadheadCharge-0)<1e-8);
 const updated=Fare.calculateBooking(booking,inputs,{...settings,pricing:{wheelchair:{...settings.pricing.wheelchair,base:120}}});
 // Base $120: subtotal 120 + 49.2 + 0 deadhead + 36 short notice
 // = 205.20, x 1.03 = 211.36.
 assert.equal(updated.discountedTotal,211.36);
});
test('a pickup more than 24 hours from now stays nonurgent on review',t=>{
 t.mock.method(Date,'now',()=>Date.parse('2030-08-12T20:00:00Z'));
 const fare=Fare.calculateBooking({...booking,createdAt:'2030-08-12T20:00:00Z'},inputs,settings);
 assert.equal(fare.shortNoticeCharge,0);
 assert.equal(fare.discountedTotal,151.62);
});
test('round trip includes each leg, calculated return waiting and selected savings',()=>{
 const fare=Fare.calculateBooking({...booking,createdAt:'2030-08-12T20:00:00Z',tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00'}, {...inputs,discountPct:10},settings);
 assert.equal(fare.waitMinutes,80);
 assert.equal(fare.drivingMinutes,80);
 assert.equal(fare.journeyMinutes,160);
 assert.equal(fare.waitCharge,93.75);
 // Round-trip deadhead under rule v2: 22 empty miles inside the
 // 25-mile allowance bill $0, removing the old $12.30 deadhead.
 assert.equal(fare.discountedTotal,359.81);
});
test('multiple-stop waiting adds stop waits and uses the final appointment for return waiting',()=>{
 const fare=Fare.calculateBooking({...booking,tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00'}, {...inputs,stopWaitMinutes:35,scheduleBasis:'APPOINTMENT',finalAppointmentTime:'11:30'},settings);
 assert.equal(fare.waitMinutes,65);
});
test('each started 15-minute waiting block uses the selected service rate',()=>{
 const fare=Fare.calculateBooking(booking,{...inputs,stopWaitMinutes:16},settings);
 assert.equal(fare.waitCharge,18.75);
});
test('DST timezone is consistent on server and browser',()=>{
 assert.equal(new Date(Fare.scheduledEpoch('2030-08-15','10:00')).toISOString(),'2030-08-15T14:00:00.000Z');
 assert.equal(new Date(Fare.scheduledEpoch('2030-01-15','10:00')).toISOString(),'2030-01-15T15:00:00.000Z');
});
test('missing route or pickup inputs cannot become a zero-dollar estimate',()=>{
 assert.throws(()=>Fare.calculateBooking(booking,{...inputs,deadheadSegments:['',10]},settings),/empty-mile/);
 assert.throws(()=>Fare.calculateBooking({...booking,date:''},inputs,settings),/Pickup/);
 assert.ok(Fare.calculateBooking({...booking,createdAt:null},inputs,settings).discountedTotal>0);
 assert.throws(()=>Fare.calculateBooking(booking,{...inputs,miles:''},settings),/miles/);
});
test('real and MOCK trips ignore saved clocks when checking the current pickup window',t=>{
 t.mock.method(Date,'now',()=>Date.parse('2030-08-12T20:00:00Z'));
 const notes='Pricing booking timestamp: 2030-08-14T20:00:00Z (simulated test clock).';
 assert.equal(Fare.calculateBooking({...booking,bookingSource:'MOCK',createdAt:'2030-08-01T20:00:00Z',notes},inputs,settings).shortNoticeCharge,0);
 assert.equal(Fare.calculateBooking({...booking,bookingSource:'CUSTOMER',createdAt:'2030-08-01T20:00:00Z',notes},inputs,settings).shortNoticeCharge,0);
});
test('API computes the fare from current settings and ignores a submitted dollar amount',async t=>{
 t.mock.method(Date,'now',()=>Date.parse('2030-08-14T20:00:00Z'));
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
 const start=source.indexOf('   const hasCalculatedFare=');
 const end=source.indexOf('   const statusValue=',start);
 const context=vm.createContext({hasTripSchedule:false,b:{fareInputs:inputs,estimatedFare:1},u:{role:'DISPATCHER'},before:{rows:[booking]},mapBooking:b=>b,readPlatformSettings:async()=>settings,NexusFare:Fare,json:(status,body)=>({status,body})});
 const result=await vm.runInContext(`(async()=>{${source.slice(start,end)};return {estimatedFareRaw};})()`,context);
 assert.equal(result.estimatedFareRaw,181.9);
 context.b={estimatedFare:1};
 const manual=await vm.runInContext(`(async()=>{${source.slice(start,end)};return {estimatedFareRaw};})()`,context);
 assert.equal(manual.status,403);
});
