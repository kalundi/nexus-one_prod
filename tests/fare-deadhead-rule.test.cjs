const test=require('node:test');
const assert=require('node:assert/strict');
const Fare=require('../nexus-fare.js');

// Deadhead allowance rule (owner directive, 2026-11-01, v2 — supersedes
// the same-day return-to-yard rule for the covered services):
//  - Covered services (Ambulatory, Wheelchair, Bariatric, Stretcher,
//    Broda, Routine IFT, High-Acuity IFT): the trip's empty miles —
//    segment 0 (origin→pickup) plus segment 1 (destination→return) —
//    share one 25-mile allowance. Billable deadhead miles =
//    max(0, totalEmpty − 25), priced at the standard deadhead rate
//    (service per-mile x deadheadRatePct, default 50%). The allowance
//    replaces the per-segment included-miles deduction for these
//    services and applies to one-way and round trips alike.
//  - BLS / ALS I / ALS II are NOT covered and keep the earlier rule
//    exactly: on one-way trips the destination→yard leg bills half its
//    actual miles; every other leg uses the standard formula
//    (miles beyond the service's included miles).
// Rates mirror the platform defaults; trips are dated Wednesday
// 2030-08-15 10:00 with bookings created days earlier, so no after-hours,
// weekend, holiday or short-notice premium applies.
const settings={pricing:{
  ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5},
  wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75},
  stretcher:{base:455,includedMiles:8,perMile:7.95,waitPer15:36.25},
  bariatric:{base:430,includedMiles:8,perMile:9.95,waitPer15:45},
  broda:{base:165,includedMiles:8,perMile:5.5,waitPer15:25},
  facility_transfer:{base:165,includedMiles:8,perMile:5.25,waitPer15:30},
  facility_transfer_critical:{base:340,includedMiles:8,perMile:8.75,waitPer15:45},
  bls:{base:1125,includedMiles:0,perMile:18.5,waitPer15:50},
  als1:{base:1395,includedMiles:0,perMile:21.5,waitPer15:62.5}
},fareRules:{}};

function fare(service,miles,deadheadSegments,tripType='ONE_WAY'){
  const booking={service,date:'2030-08-15',time:'10:00',createdAt:'2030-08-12T20:00:00Z',tripType,
    ...(tripType==='ROUND_TRIP'?{returnTripDate:'2030-08-15',returnTripTime:'15:00'}:{})};
  const inputs={miles,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,deadheadSegments,discountPct:0};
  return Fare.calculateBooking(booking,inputs,settings);
}

test('covered trip with 20 total deadhead miles bills no deadhead',()=>{
  const result=fare('ambulatory',30,[8,12]);
  assert.equal(result.deadheadDetails[0].billableMiles,0);
  assert.equal(result.deadheadDetails[1].billableMiles,0);
  assert.ok(Math.abs(result.deadheadCharge-0)<1e-9);
});

test('covered trip with exactly 25 total deadhead miles bills no deadhead',()=>{
  const result=fare('ambulatory',30,[10,15]);
  assert.equal(result.deadheadBillableMiles,0);
  assert.ok(Math.abs(result.deadheadCharge-0)<1e-9);
});

test('covered trip with 40 total deadhead miles bills only the 15 miles over the allowance',()=>{
  // Ambulatory deadhead rate = 3.55 x 50% = $1.775. The allowance is
  // consumed in segment order: segment 0 (18 mi) is fully covered, the
  // remaining 7 miles of allowance cover part of segment 1, leaving
  // 15 billable miles: 15 x 1.775 = $26.625.
  const result=fare('ambulatory',25,[18,22]);
  assert.equal(result.deadheadDetails[0].billableMiles,0);
  assert.equal(result.deadheadDetails[1].billableMiles,15);
  assert.equal(result.deadheadBillableMiles,15);
  assert.ok(Math.abs(result.deadheadCharge-26.625)<1e-9);
});

test('wheelchair 40 total deadhead miles bills 15 miles at its own deadhead rate',()=>{
  // Wheelchair deadhead rate = 4.10 x 50% = $2.05; 15 x 2.05 = $30.75.
  const result=fare('wheelchair',30,[18,22]);
  assert.equal(result.deadheadBillableMiles,15);
  assert.ok(Math.abs(result.deadheadCharge-30.75)<1e-9);
});

test('stretcher trip inside the allowance bills no deadhead',()=>{
  const result=fare('stretcher',10,[10,12]);
  assert.ok(Math.abs(result.deadheadCharge-0)<1e-9);
});

test('bariatric trip bills only the deadhead miles over 25 across both segments',()=>{
  // Bariatric deadhead rate = 9.95 x 50% = $4.975. Segments 30 + 20 =
  // 50 empty miles: segment 0 bills 5 (30 − 25 allowance), segment 1
  // bills all 20 — 25 billable miles x 4.975 = $124.375.
  const result=fare('bariatric',30,[30,20]);
  assert.equal(result.deadheadDetails[0].billableMiles,5);
  assert.equal(result.deadheadDetails[1].billableMiles,20);
  assert.ok(Math.abs(result.deadheadCharge-124.375)<1e-9);
});

test('broda trip bills only the deadhead miles over 25',()=>{
  // Broda deadhead rate = 5.50 x 50% = $2.75; 40 − 25 = 15 billable
  // miles x 2.75 = $41.25.
  const result=fare('broda',30,[20,20]);
  assert.equal(result.deadheadBillableMiles,15);
  assert.ok(Math.abs(result.deadheadCharge-41.25)<1e-9);
});

test('routine IFT trip bills only the deadhead miles over 25',()=>{
  // Routine IFT deadhead rate = 5.25 x 50% = $2.625; 30 − 25 = 5
  // billable miles x 2.625 = $13.125.
  const result=fare('facility_transfer',30,[12,18]);
  assert.equal(result.deadheadBillableMiles,5);
  assert.ok(Math.abs(result.deadheadCharge-13.125)<1e-9);
});

test('high-acuity IFT trip bills only the deadhead miles over 25',()=>{
  // High-Acuity IFT deadhead rate = 8.75 x 50% = $4.375; 50 − 25 = 25
  // billable miles x 4.375 = $109.375.
  const result=fare('facility_transfer_critical',30,[40,10]);
  assert.equal(result.deadheadBillableMiles,25);
  assert.ok(Math.abs(result.deadheadCharge-109.375)<1e-9);
});

test('covered round trip gets the same 25-mile allowance',()=>{
  // Same segments as the one-way 40-mile case: 15 billable miles,
  // 15 x 1.775 = $26.625 — the allowance is not one-way-only.
  const result=fare('ambulatory',25,[18,22],'ROUND_TRIP');
  assert.equal(result.deadheadBillableMiles,15);
  assert.ok(Math.abs(result.deadheadCharge-26.625)<1e-9);
});

test('BLS one-way keeps the earlier rule: pickup leg in full, return leg at half its actual miles',()=>{
  // Regression guard for the pre-v2 branch. BLS deadhead rate =
  // 18.50 x 50% = $9.25, included miles 0: segment 0 bills 10 x 9.25 =
  // $92.50; segment 1 bills half of 12 = 6 miles x 9.25 = $55.50.
  const result=fare('bls',30,[10,12]);
  assert.equal(result.deadheadDetails[0].billableMiles,10);
  assert.equal(result.deadheadDetails[1].billableMiles,6);
  assert.ok(Math.abs(result.deadheadCharge-148)<1e-9);
});

test('BLS round trip keeps the standard formula on both legs',()=>{
  // Included miles 0, so both legs bill in full: 22 x 9.25 = $203.50.
  const result=fare('bls',30,[10,12],'ROUND_TRIP');
  assert.ok(Math.abs(result.deadheadCharge-203.5)<1e-9);
});

test('ALS I one-way keeps the earlier half-return rule',()=>{
  // ALS I deadhead rate = 21.50 x 50% = $10.75: segment 0 bills
  // 10 x 10.75 = $107.50; segment 1 bills 6 x 10.75 = $64.50.
  const result=fare('als1',30,[10,12]);
  assert.ok(Math.abs(result.deadheadCharge-172)<1e-9);
});
