const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const client = fs.readFileSync(path.join(__dirname, '..', 'booking-app.js'), 'utf8');
const code = client.slice(client.indexOf('  function calculateFareBreakdown('), client.indexOf('  function calculateFare(service,'));
function calculator({ roundTrip = false, returnDate = '', returnTime = '', rate = {base:100,includedMiles:999,perMile:0}, rules = {} } = {}) {
  const context = vm.createContext({
    NexusFare:require('../nexus-fare.js'), getPricing: () => rate, getServicePolicy: () => ({}),
    fareRules: rules, CARD_PROCESSING_FEE_PCT:3,
    getWaitingCharge: () => ({ waitCharge:0 }),
    deadheadRouteMiles:{toPickup:0,fromDestination:0,fromReturn:0},
    tripType:{value:roundTrip?'ROUND_TRIP':'ONE_WAY'}, returnTripDate:{value:returnDate}, returnTripTime:{value:returnTime}
  });
  vm.runInContext(code, context);
  return context;
}
for (const scenario of [
  {name:'ordinary weekday',date:'2030-08-15',time:'10:00',minutes:30,premium:false},
  {name:'7 AM boundary',date:'2030-08-15',time:'07:00',minutes:30,premium:false},
  {name:'ends exactly at 7 PM',date:'2030-08-15',time:'18:30',minutes:30,premium:false},
  {name:'starts before 7 AM',date:'2030-08-15',time:'06:59',minutes:30,premium:true},
  {name:'starts after 7 PM',date:'2030-08-15',time:'19:01',minutes:30,premium:true},
  {name:'overlaps 7 PM',date:'2030-08-15',time:'18:50',minutes:20,premium:true},
  {name:'Saturday',date:'2030-08-17',time:'10:00',minutes:30,premium:true},
  {name:'Sunday',date:'2030-08-18',time:'10:00',minutes:30,premium:true},
  {name:'Independence Day',date:'2030-07-04',time:'10:00',minutes:30,premium:true},
  {name:'Thanksgiving',date:'2030-11-28',time:'10:00',minutes:30,premium:true},
  {name:'observed New Year crosses calendar years',date:'2032-12-31',time:'10:00',minutes:30,premium:true},
  {name:'overlaps Saturday at midnight',date:'2030-08-16',time:'23:50',minutes:20,premium:true},
  {name:'overlaps holiday at midnight',date:'2030-07-03',time:'23:50',minutes:20,premium:true},
  {name:'holiday and after-hours apply only once',date:'2030-07-04',time:'20:00',minutes:30,premium:true}
]) test(scenario.name, () => {
  const result=calculator().calculateFareBreakdown('wheelchair',5,scenario.date,scenario.time,{durationMinutes:scenario.minutes});
  assert.equal(result.subtotal,scenario.premium?130:100);
  assert.equal(result.total,scenario.premium?133.9:103);
});

test('approved wheelchair example applies allowance to each empty segment and urgency only to base',()=>{
  const calc=calculator({rate:{base:98,includedMiles:8,perMile:4.1}});
  const result=calc.calculateFareBreakdown('wheelchair',20,'2030-08-15','10:00',{
    deadheadSegments:[12,10],bookingTime:new Date('2030-08-14T16:00:00').getTime()
  });
  assert.ok(Math.abs(result.deadheadCharge-12.3)<.00001);
  assert.ok(Math.abs(result.shortNoticeCharge-29.4)<.00001);
  assert.ok(Math.abs(result.subtotal-188.9)<.00001);
  assert.ok(Math.abs(result.total-194.567)<.00001);
});
test('unused allowance on one deadhead segment does not offset another segment',()=>{
  const calc=calculator({rate:{base:98,includedMiles:8,perMile:4.1}});
  const result=calc.calculateFareBreakdown('wheelchair',8,'2030-08-15','10:00',{deadheadSegments:[2,12],bookingTime:new Date('2030-08-13T10:00:00').getTime()});
  assert.ok(Math.abs(result.deadheadCharge-8.2)<.00001);
  assert.equal(result.shortNoticeCharge,0);
});
for(const [service,rate,segments,charge,urgent] of [
  ['ambulatory',{base:75,includedMiles:5,perMile:3.55},[8,4],5.325,22.5],
  ['bls',{base:1125,includedMiles:0,perMile:18.5},[1,2],27.75,337.5]
]) test(`${service} uses its own included mileage, half rate, and base surcharge`,()=>{
  const result=calculator({rate}).calculateFareBreakdown(service,5,'2030-08-15','10:00',{deadheadSegments:segments,bookingTime:new Date('2030-08-14T16:00:00').getTime()});
  assert.ok(Math.abs(result.deadheadCharge-charge)<.00001);
  assert.ok(Math.abs(result.shortNoticeCharge-urgent)<.00001);
});
for(const hours of [0,23,24,24.01,-1]) test(`short-notice boundary: ${hours} hours`,()=>{
  const pickup=new Date('2030-08-15T10:00:00').getTime();
  const result=calculator().calculateFareBreakdown('wheelchair',5,'2030-08-15','10:00',{bookingTime:pickup-hours*3600000});
  assert.equal(result.shortNoticeCharge,hours>=0 && hours<=24?30:0);
});
test('round trip adds short-notice surcharge only for qualifying passenger legs',()=>{
  const result=calculator({roundTrip:true,returnDate:'2030-08-16',returnTime:'12:00'}).calculateFareBreakdown('wheelchair',5,'2030-08-15','10:00',{bookingTime:new Date('2030-08-14T16:00:00').getTime()});
  assert.equal(result.shortNoticeCharge,30);
});
test('traffic that pushes arrival past closing triggers the premium',()=>{
  const result=calculator().calculateFareBreakdown('wheelchair',5,'2030-08-15','18:30',{durationMinutes:20,trafficDurationMinutes:40});
  assert.equal(result.subtotal,130);
});
test('only the return leg receives its after-hours premium',()=>{
  const result=calculator({roundTrip:true,returnDate:'2030-08-15',returnTime:'20:00'}).calculateFareBreakdown('wheelchair',5,'2030-08-15','10:00',{durationMinutes:30});
  assert.equal(result.subtotal,230);
  assert.equal(result.premiumRateReason,'');
  assert.equal(result.returnPremiumRateReason,'after-hours');
});
test('both round-trip legs receive one premium each when both qualify',()=>{
  const result=calculator({roundTrip:true,returnDate:'2030-08-18',returnTime:'20:00'}).calculateFareBreakdown('wheelchair',5,'2030-08-17','20:00',{durationMinutes:30});
  assert.equal(result.subtotal,260);
});

for(const [miles,subtotal] of [[5,98],[8,98],[8.5,100.05],[9,102.1],[20,147.2]]) test(`wheelchair base includes eight miles: ${miles} mile route`,()=>{
  const result=calculator({rate:{base:98,includedMiles:8,perMile:4.1},rules:{returnMilesThreshold:10,returnMilesInclusionPct:100}}).calculateFareBreakdown('wheelchair',miles,'2030-08-15','10:00');
  assert.ok(Math.abs(result.subtotal-subtotal)<.00001);
  assert.equal(result.billableMilesPerLeg,Math.max(0,miles-8));
});
test('round trip includes the mileage allowance separately on each leg',()=>{
  const result=calculator({roundTrip:true,returnDate:'2030-08-15',returnTime:'15:00',rate:{base:98,includedMiles:8,perMile:4.1}}).calculateFareBreakdown('wheelchair',20,'2030-08-15','10:00');
  assert.ok(Math.abs(result.subtotal-294.4)<.00001);
  assert.equal(result.billableMilesPerLeg,12);
});
test('zero included miles bills every mile at the service rate',()=>{
  const result=calculator({rate:{base:1125,includedMiles:0,perMile:18.5}}).calculateFareBreakdown('bls',10,'2030-08-15','10:00');
  assert.equal(result.subtotal,1310);
});
