const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
const fs=require('node:fs'),vm=require('node:vm');
const settings={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5},bls:{base:1125,includedMiles:0,perMile:18.5,waitPer15:35}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15,fuelSurchargePerMile:0.22,cardProcessingFeePct:3,deadheadRatePct:50,serviceSpeedModel:'CRUISING_CEILING',serviceTravelPolicyVersion:4}};
for(const base of [1125,1300])test(`BLS booking, save and trip editor use source base rate ${base}`,async({page})=>{
 const current={...settings,pricing:{...settings.pricing,bls:{...settings.pricing.bls,base}}};
 let payload;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  sessionStorage.setItem('nexusAccessToken','fare-source-test');
  window.google={maps:{TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'bestguess',PESSIMISTIC:'pessimistic'},UnitSystem:{IMPERIAL:1},DirectionsService:class{route(r,cb){const toPickup=r.origin==='Company yard',toYard=r.destination==='Company yard',back=String(r.origin).startsWith('109 Forest');const miles=toPickup?52.07:toYard?50.99:back?32.61:33.35;cb({routes:[{legs:[{distance:{value:miles*1609.344},duration:{value:55*60,text:'55 min'},duration_in_traffic:{value:55*60}}]}]},'OK');}}}};
 });
 await page.route('**/api/**',route=>{
  const p=new URL(route.request().url()).pathname;
  const json=p==='/api/settings/public'?current:p==='/api/auth/me'?{user:{role:'ADMIN',email:'test@example.com'}}:p==='/api/integrations/config'?{googleMapsEnabled:false,stripeEnabled:true}:p==='/api/bookings'?(()=>{payload=route.request().postDataJSON();return {booking:{reference:'BLS-PARITY',estimatedFare:Fare.calculateBooking(payload,payload.fareInputs,current).discountedTotal},requiresOnlinePayment:true,persisted:true};})():{};
  return route.fulfill({json});
 });
 await page.goto('/booking-app.html');
 await page.locator('#name').fill('Fare Test');await page.locator('#phone').fill('(240) 555-0130');await page.locator('#serviceTypeSelect').selectOption('ambulatory');await page.locator('#confirmRiderBtn').click();
 await page.locator('#tripType').selectOption('ROUND_TRIP');await page.locator('#tripDate').fill('2030-10-15');await page.locator('#returnTripDate').fill('2030-10-15');await page.locator('#returnTripTime').fill('14:00');
 await page.locator('#appointmentTime').fill('13:15');await page.locator('#pickup').fill('23 Penn St, Baltimore, MD');await page.locator('#destination').fill('109 Forest Valley Dr, Forest Hill, MD');
 await page.locator('#confirmPickupDropoffBtn').click();await page.locator('#toggleMoreRideOptions').click();await page.locator('[data-service="bls"]').click();
 await page.locator('#continueRideBtn').click();await page.locator('#fareConfirmAccept').click();
 await expect.poll(()=>payload?.service).toBe('bls');
 const expected=Fare.calculateBooking(payload,payload.fareInputs,current);
 expect(payload.estimatedFare).toBe(expected.discountedTotal);
 expect(expected.passengerMilesTotal).toBeCloseTo(65.96,2);
 const source=fs.readFileSync(require.resolve('../dispatch.html'),'utf8');
 const fields={dispatchEditService:'bls',dispatchEditPickup:payload.pickup,dispatchEditDestination:payload.destination,dispatchEditDate:payload.date,dispatchEditTime:payload.time,dispatchEditAppointmentTime:payload.appointmentTime,dispatchEditTripType:'ROUND_TRIP',dispatchEditReturnDate:payload.returnTripDate,dispatchEditReturnTiming:'SCHEDULED',dispatchEditReturnTime:payload.returnTripTime};
 const start=source.indexOf('  function fareEditorBooking(){'),end=source.indexOf('  async function updateEditorRoute()',start);
 const edited=vm.runInNewContext(source.slice(start,end)+';fareEditorBooking()', {NexusFare:Fare,currentFareBooking:{...payload,pickupTime:payload.time},currentFareSettings:current,get:id=>({value:fields[id]})});
 const editorFare=Fare.calculateEstimate(edited,current);
 expect(editorFare.discountedTotal).toBe(payload.estimatedFare);expect(editorFare.waitMinutes).toBe(expected.waitMinutes);
 expect(errors).toEqual([]);
});

test('booking stops when source pricing cannot be loaded',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:new URL(route.request().url()).pathname==='/api/settings/public'?503:200,json:{}}));
 await page.goto('/booking-app.html');
 await expect(page.locator('#statusMsg')).toContainText('Current pricing could not be loaded');
 await expect(page.locator('#submitBtn')).toBeDisabled();
});
