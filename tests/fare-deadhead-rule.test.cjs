const test=require('node:test');
const assert=require('node:assert/strict');
const Fare=require('../nexus-fare.js');

// Return-to-yard deadhead rule (owner directive, 2026-11-01), ONE-WAY trips:
//  - Ambulatory / Wheelchair with loaded miles < 20: the destination→yard
//    leg (deadhead segment 1) is not billed at all.
//  - Every other one-way trip: that leg is billed on half of its actual
//    miles (no included-miles allowance on the leg), priced at the standard
//    deadhead rate (service per-mile x deadheadRatePct, default 50%).
//  - The yard→pickup leg (segment 0) and all round-trip deadhead keep the
//    standard formula: miles beyond the included miles at the deadhead rate.
// Rates mirror the platform defaults: ambulatory $75 incl 5 mi @ $3.55
// (deadhead rate $1.775), wheelchair $98 incl 8 mi @ $4.10 (rate $2.05),
// stretcher $455 incl 8 mi @ $7.95 (rate $3.975). Pickup is a far-future
// weekday daytime, so no premium or short-notice charge applies.
const settings={pricing:{
  ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5},
  wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75},
  stretcher:{base:455,includedMiles:8,perMile:7.95,waitPer15:36.25}
},fareRules:{}};
const approx=(actual,expected)=>Math.abs(actual-expected)<1e-8;
function fare(service,miles,deadheadSegments,tripType='ONE_WAY'){
  const booking={service,date:'2030-08-15',time:'10:00',createdAt:'2030-08-12T20:00:00Z',tripType,...(tripType==='ROUND_TRIP'?{returnTripDate:'2030-08-15',returnTripTime:'15:00'}:{})};
  return Fare.calculateBooking(booking,{miles,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,deadheadSegments,discountPct:0},settings);
}

test('ambulatory one-way under 20 loaded miles bills no return-to-yard deadhead',()=>{
  const result=fare('ambulatory',15,[10,12]);
  assert.equal(result.deadheadDetails[1].miles,12);
  assert.equal(result.deadheadDetails[1].billableMiles,0);
  assert.equal(result.deadheadDetails[1].charge,0);
  // Pickup leg unchanged: (10 - 5 included) x $1.775.
  assert.ok(approx(result.deadheadDetails[0].charge,8.875));
  assert.ok(approx(result.deadheadCharge,8.875));
});

test('ambulatory one-way at or over 20 loaded miles bills half the return-to-yard miles',()=>{
  const result=fare('ambulatory',25,[10,12]);
  assert.equal(result.deadheadDetails[1].billableMiles,6);
  assert.ok(approx(result.deadheadDetails[1].charge,10.65));
  assert.ok(approx(result.deadheadCharge,8.875+10.65));
  // Exactly 20 loaded miles is not exempt.
  assert.equal(fare('ambulatory',20,[10,12]).deadheadDetails[1].billableMiles,6);
});

test('wheelchair one-way under 20 loaded miles bills no return-to-yard deadhead',()=>{
  const result=fare('wheelchair',15,[10,12]);
  assert.equal(result.deadheadDetails[1].billableMiles,0);
  assert.equal(result.deadheadDetails[1].charge,0);
  // Pickup leg unchanged: (10 - 8 included) x $2.05.
  assert.ok(approx(result.deadheadCharge,4.1));
});

test('stretcher one-way under 20 loaded miles still bills half the return-to-yard miles (no exemption)',()=>{
  const result=fare('stretcher',10,[10,12]);
  assert.equal(result.deadheadDetails[1].billableMiles,6);
  assert.ok(approx(result.deadheadDetails[1].charge,23.85));
  // Pickup leg unchanged: (10 - 8 included) x $3.975.
  assert.ok(approx(result.deadheadDetails[0].charge,7.95));
  assert.ok(approx(result.deadheadCharge,31.8));
});

test('round trips keep the standard deadhead formula on both legs',()=>{
  const result=fare('ambulatory',15,[10,12],'ROUND_TRIP');
  // Return leg: (12 - 5 included) x $1.775, exactly as before the rule.
  assert.equal(result.deadheadDetails[1].billableMiles,7);
  assert.ok(approx(result.deadheadDetails[1].charge,12.425));
  assert.ok(approx(result.deadheadCharge,8.875+12.425));
});
