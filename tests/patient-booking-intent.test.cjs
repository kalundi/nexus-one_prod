const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extract}=require('../patient-booking-intent.js');
const today='2026-11-24';
test('extracts multiple explicit details from one request',()=>{
 const result=extract('I need a wheelchair ride to dialysis tomorrow at 10 AM, from home',today);
 assert.equal(result.date,'2026-11-25');assert.equal(result.time,'10:00');assert.equal(result.service,'wheelchair');assert.equal(result.basis,'APPOINTMENT');assert.equal(result.destination,'dialysis');assert.equal(result.savedPickup,true);
});
test('interprets relative weekdays without guessing a time',()=>{
 assert.equal(extract('next Monday',today).date,'2026-11-30');
 assert.equal(extract('next Monday',today).time,undefined);
});
test('handles explicit time correction and noon or midnight',()=>{
 assert.equal(extract('Actually make that 11 AM',today).time,'11:00');
 assert.equal(extract('12 PM',today).time,'12:00');assert.equal(extract('12 AM',today).time,'00:00');
});
test('does not invent time for ambiguous input or destination for usual place',()=>{
 assert.equal(extract('at 9',today).time,undefined);assert.equal(extract('ride to my usual',today).destination,undefined);
});
test('extracts round trip and return time',()=>{
 const r=extract('I need a round trip for my appointment at 10 AM, return at 1 PM',today);
 assert.equal(r.tripType,'ROUND_TRIP');assert.equal(r.time,'10:00');assert.equal(r.returnTime,'13:00');
});
test('rejects impossible and past dates',()=>{
 assert.equal(extract('2026-02-30',today).date,undefined);assert.equal(extract('2026-11-23',today).date,undefined);
});
