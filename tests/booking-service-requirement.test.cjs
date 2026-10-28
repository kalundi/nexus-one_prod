const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require.resolve('../booking-app.html'),'utf8');
const app=fs.readFileSync(require.resolve('../booking-app.js'),'utf8');
const api=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
const guidance=require('../booking-service-guidance.js');

test('booking service is visible, required, and followed by one helper button',()=>{
  const riderSection=html.slice(html.indexOf('id="riderDetailsSection"'),html.indexOf('id="pickupDropoffSection"'));
  const rideSection=html.slice(html.indexOf('id="rideTypeSection"'),html.indexOf('id="routeScheduleFields"'));
  assert.match(riderSection,/id="serviceTypeField"/);assert.match(riderSection,/Service type[^]*?\*/);assert.match(riderSection,/id="serviceTypeSelect"[^>]*required/);
  assert.equal((html.match(/id="helpChooseRideBtn"/g)||[]).length,1);assert.ok(riderSection.indexOf('id="helpChooseRideBtn"')>riderSection.indexOf('id="serviceTypeSelect"'));
  assert.match(riderSection,/id="serviceError"[^>]*role="alert"/);assert.match(riderSection,/aria-describedby="serviceError"/);
  assert.ok(riderSection.indexOf('id="serviceTypeField"')<riderSection.indexOf('id="confirmRiderBtn"'),'service selection must precede rider confirmation');
  assert.match(rideSection,/id="serviceChips"[^>]*aria-required="true"/);
  assert.equal((html.match(/id="serviceChips"/g)||[]).length,1);
  assert.equal((html.match(/id="serviceChips"/g)||[]).length,1);
  assert.match(html,/@media \(min-width:640px\)\{\.serviceChips\.rideMarketplace\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('service requirement blocks client submission and server booking creation',()=>{
  assert.match(app,/validateRequiredService\(\{focus:true\}\)/);assert.match(app,/Service type is required\. Select a service to continue\./);
  assert.match(app,/function confirmRiderDetails\(\)\{[^]*?if\(!validateRequiredService\(\{focus:true\}\)\)\{/);
  assert.match(api,/if\(!normalizedService\)return json\(400/);assert.match(api,/restrictedServices\.has\(normalizedService\)/);
});

test('legacy booking and profile preference values normalize to the existing bariatric code',()=>{
  assert.match(api,/normalizeBariatricService=value=>/);
  assert.match(api,/service:normalizeBariatricService\(b\.service\)/);
  assert.match(api,/normalizeBariatricService\(b\.mobilityType\|\|'AMBULATORY'\)/);
});

test('passenger names and primary contacts are required and required fields are marked',()=>{
  for(const label of ['Passenger First Name','Passenger Last Name','Phone','Email','Pickup','Destination','Outbound date','Appointment Time'])assert.ok(html.includes(`${label} <span class="requiredMark">*</span>`));
  assert.match(html,/<input id="email"[^>]*required/);
  assert.doesNotMatch(html,/<input id="alternateEmail"[^>]*required/);
});

test('helper filters unavailable recommendations while retaining its disclaimer',()=>{
  const restricted=new Set(['ambulatory','wheelchair','broda','stretcher','bariatric']);
  assert.equal(guidance.recommendRideType({extraSpace:'yes'},restricted).service,'bariatric');
  assert.equal(guidance.recommendRideType({brodaChair:'yes'},restricted).service,'broda');
  const unavailable=guidance.recommendRideType({lyingDown:'yes'},new Set(['ambulatory','wheelchair','broda','bariatric']));
  assert.equal(unavailable.service,'ambulatory');assert.match(unavailable.reason,/unavailable for this account/);assert.match(unavailable.reason,/contact Nexus/);
  assert.match(html,/This aid does not make a clinical determination/);
});
