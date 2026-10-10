const test=require('node:test');
const assert=require('node:assert/strict');
const Fare=require('../nexus-fare.js');
const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
const booking={service:'wheelchair',date:'2030-08-15',time:'10:00',createdAt:'2030-08-14T20:00:00Z',tripType:'ONE_WAY'};
const inputs={miles:20,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,deadheadSegments:[12,10],discountPct:0};
test('current pricing and original booking timestamp determine the estimate',()=>{
 const fare=Fare.calculateBooking(booking,inputs,settings);
 assert.equal(fare.discountedTotal,194.57);
 assert.equal(fare.shortNoticeCharge,29.4);
 assert.ok(Math.abs(fare.deadheadCharge-12.3)<1e-8);
 const updated=Fare.calculateBooking(booking,inputs,{...settings,pricing:{wheelchair:{...settings.pricing.wheelchair,base:120}}});
 assert.equal(updated.discountedTotal,224.03);
});
test('a booking made more than 24 hours before pickup stays nonurgent on review',()=>{
 const fare=Fare.calculateBooking({...booking,createdAt:'2030-08-12T20:00:00Z'},inputs,settings);
 assert.equal(fare.shortNoticeCharge,0);
 assert.equal(fare.discountedTotal,164.29);
});
test('round trip includes each leg, calculated return waiting and selected savings',()=>{
 const fare=Fare.calculateBooking({...booking,createdAt:'2030-08-12T20:00:00Z',tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00'}, {...inputs,discountPct:10},settings);
 assert.equal(fare.waitMinutes,90);
 assert.equal(fare.waitCharge,112.5);
 assert.equal(fare.discountedTotal,388.60);
});
test('multiple-stop waiting adds stop waits and uses the final appointment for return waiting',()=>{
 const fare=Fare.calculateBooking({...booking,tripType:'ROUND_TRIP',returnTripDate:'2030-08-15',returnTripTime:'12:00'}, {...inputs,stopWaitMinutes:35,scheduleBasis:'APPOINTMENT',finalAppointmentTime:'11:30'},settings);
 assert.equal(fare.waitMinutes,80);
});
test('each started 15-minute waiting block uses the selected service rate',()=>{
 const fare=Fare.calculateBooking(booking,{...inputs,stopWaitMinutes:16},settings);
 assert.equal(fare.waitCharge,37.5);
});
test('DST timezone is consistent on server and browser',()=>{
 assert.equal(new Date(Fare.scheduledEpoch('2030-08-15','10:00')).toISOString(),'2030-08-15T14:00:00.000Z');
 assert.equal(new Date(Fare.scheduledEpoch('2030-01-15','10:00')).toISOString(),'2030-01-15T15:00:00.000Z');
});
test('missing route inputs and creation time cannot become a zero-dollar estimate',()=>{
 assert.throws(()=>Fare.calculateBooking(booking,{...inputs,deadheadSegments:['',10]},settings),/empty-mile/);
 assert.throws(()=>Fare.calculateBooking({...booking,createdAt:null},inputs,settings),/creation/);
 assert.throws(()=>Fare.calculateBooking(booking,{...inputs,miles:''},settings),/miles/);
});
test('MOCK trips retain their explicit simulation clock; real trips ignore it',()=>{
 const notes='Pricing booking timestamp: 2030-08-14T20:00:00Z (simulated test clock).';
 assert.equal(Fare.calculateBooking({...booking,bookingSource:'MOCK',createdAt:'2030-08-01T20:00:00Z',notes},inputs,settings).shortNoticeCharge,29.4);
 assert.equal(Fare.calculateBooking({...booking,bookingSource:'CUSTOMER',createdAt:'2030-08-01T20:00:00Z',notes},inputs,settings).shortNoticeCharge,0);
});
test('API computes the fare from current settings and ignores a submitted dollar amount',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
 const start=source.indexOf('   const hasCalculatedFare=');
 const end=source.indexOf('   const statusValue=',start);
 const context=vm.createContext({b:{fareInputs:inputs,estimatedFare:1},u:{role:'DISPATCHER'},before:{rows:[booking]},mapBooking:b=>b,readPlatformSettings:async()=>settings,NexusFare:Fare,json:(status,body)=>({status,body})});
 const result=await vm.runInContext(`(async()=>{${source.slice(start,end)};return {estimatedFareRaw};})()`,context);
 assert.equal(result.estimatedFareRaw,194.57);
 context.b={estimatedFare:1};
 const manual=await vm.runInContext(`(async()=>{${source.slice(start,end)};return {estimatedFareRaw};})()`,context);
 assert.equal(manual.status,403);
});
