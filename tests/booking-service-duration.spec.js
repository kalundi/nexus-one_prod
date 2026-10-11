const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
const settings={organization:{yardAddress:'Company yard',preTripInspectionMinutes:45},pricing:{ambulatory:{base:100,includedMiles:100,perMile:0,waitPer15:20},wheelchair:{base:100,includedMiles:100,perMile:0,waitPer15:20}},fareRules:{waitingPolicyVersion:2,freeWaitMinutes:15,fuelSurchargePerMile:0,trafficOverageFeePerHour:0,servicePolicies:{wheelchair:{trafficOverageFeePerHour:0},stretcher:{speedReductionMph:15}}}};
async function prepare(page,{roundTrip=false,multiStop=false}={}){
 let submitted;
 await page.addInitScript(()=>{
  window.__directionsRequests=[];
  class DirectionsService{route(request,callback){
   window.__directionsRequests.push({origin:request.origin,destination:request.destination,departure:request.drivingOptions?.departureTime?.toISOString()});
   const empty=request.origin==='Company yard'||request.destination==='Company yard';
   const returning=String(request.origin).startsWith('200 Medical');
   const count=(request.waypoints?.length||0)+1;
   const legs=Array.from({length:count},()=>({distance:{value:(empty?5:returning?25:20)*1609.344},duration:{value:(empty?10:30)*60,text:empty?'10 mins':'30 mins'},duration_in_traffic:{value:(empty?10:30)*60}}));
   callback({routes:[{legs}]},'OK');
  }}
  window.google={maps:{DirectionsService,TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'bestguess'},UnitSystem:{IMPERIAL:1}}};
 });
 await page.route('**/api/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  const json=pathname==='/api/settings/public'?settings:pathname==='/api/integrations/config'?{googleMapsEnabled:false,stripeEnabled:true}:pathname==='/api/bookings'?(()=>{submitted=route.request().postDataJSON();return {booking:{reference:'SERVICE-TIME-1',estimatedFare:submitted.estimatedFare},requiresOnlinePayment:true,persisted:true};})():{};
  return route.fulfill({json});
 });
 await page.goto('/booking-app.html');
 await page.locator('#name').fill('Service Duration Test');await page.locator('#phone').fill('(240) 555-0130');await page.locator('#confirmRiderBtn').click();
 if(multiStop){await page.locator('#multipleStopsToggle').check();await page.locator('#appointmentTime-2').fill('11:30');await page.locator('[data-route-stop="true"]').fill('300 Clinic Road, Bethesda, MD');}
 if(roundTrip){await page.locator('#tripType').selectOption('ROUND_TRIP');await page.locator('#returnTripDate').fill('2030-08-15');await page.locator('#returnTripTime').fill('10:45');}
 await page.locator('#pickup').fill('100 Main Street, Rockville, MD');await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');await page.locator('#tripDate').fill('2030-08-15');await page.locator('#appointmentTime').fill('10:00');
 await page.locator('#confirmPickupDropoffBtn').click();
 return {getSubmitted:()=>submitted};
}

test('service cards show route duration and each service uses its own planning adjustment',async({page})=>{
 await prepare(page);
 await expect(page.locator('[data-service="ambulatory"] .serviceCardEta')).toHaveText('~30 min drive');
 await expect(page.locator('[data-service="wheelchair"] .serviceCardEta')).toHaveText('~40 min drive');
 await expect(page.locator('[data-service="stretcher"] .serviceCardEta')).toHaveText('~48 min drive');
 await page.locator('[data-service="wheelchair"]').click();await expect(page.locator('#tripTime')).toHaveValue('09:05');
 await expect(page.locator('#estDuration')).toHaveText('~40 min trip');
 await page.locator('[data-service="ambulatory"]').click();await expect(page.locator('#tripTime')).toHaveValue('09:15');
 await page.locator('[data-service="wheelchair"]').click();await expect(page.locator('#tripTime')).toHaveValue('09:05');
 await expect(page.locator('[data-service="wheelchair"] .serviceCardEta')).toHaveText('~40 min drive');
 const requests=await page.evaluate(()=>window.__directionsRequests.filter(request=>request.origin.startsWith('100 Main')));
 expect(requests.every(request=>request.departure&&request.departure.startsWith('2030-08-15'))).toBe(true);
});

test('round-trip duration includes independently measured return travel and scheduled waiting through payment',async({page})=>{
 const state=await prepare(page,{roundTrip:true});
 await expect(page.locator('[data-service="ambulatory"] .serviceCardEta')).toHaveText('~1h drive');
 await expect(page.locator('[data-service="wheelchair"] .serviceCardEta')).toHaveText('~1h 18m drive');
 await page.locator('[data-service="wheelchair"]').click();
 await expect(page.locator('#waitMinutes')).toHaveValue('60');await expect(page.locator('#estDuration')).toHaveText('~2h 18m round trip');
 await expect(page.locator('#fareTravelBreakdown')).toContainText('1h 18m driving · 1h waiting');
 await expect(page.locator('#rideTimingSummary')).toContainText('1h waiting included in fare');
 await expect(page.locator('#rideTimingSummary')).toContainText('2h 18m trip total');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/booking-service-duration-mobile.png'});
 const overflow=await page.locator('#serviceChips').evaluate(element=>element.scrollWidth>element.clientWidth+1);expect(overflow).toBe(false);
 await page.locator('#continueRideBtn').click();await expect(page.locator('#fareConfirmDetails')).toContainText('2h 18m round trip');await page.locator('#fareConfirmAccept').click();
 await expect(page.locator('#paymentSummary')).toContainText('SERVICE-TIME-1');
 const payload=state.getSubmitted();
 expect(payload.fareInputs.durationMinutes).toBe(30);expect(payload.fareInputs.passengerLegs[0].miles).toBe(20);expect(payload.fareInputs.passengerLegs[1].miles).toBe(25);
 const fare=Fare.calculateBooking({...payload,createdAt:'2026-10-10T12:00:00Z'},payload.fareInputs,settings);
 expect(fare.journeyMinutes).toBe(137.5);expect(fare.discountedTotal).toBe(payload.estimatedFare);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/booking-service-duration-roundtrip.png'});
});

test('multi-stop duration and waiting use service travel and the next appointment',async({page})=>{
 await prepare(page,{multiStop:true});
 await expect(page.locator('[data-service="ambulatory"] .serviceCardEta')).toHaveText('~1h drive');
 await expect(page.locator('[data-service="wheelchair"] .serviceCardEta')).toHaveText('~1h 20m drive');
 await page.locator('[data-service="wheelchair"]').click();
 await expect(page.locator('#tripTime')).toHaveValue('09:05');await expect(page.locator('#stopPickupTime-1')).toHaveValue('10:20');await expect(page.locator('#waitMinutes')).toHaveValue('35');
 await expect(page.locator('#fareTravelBreakdown')).toContainText('1h 20m driving · 35 min waiting · 15 min rider assistance');
});

test('a return several days later is shown separately from driving time',async({page})=>{
 await prepare(page,{roundTrip:true});
 await page.locator('#rideSchedulePill').click();
 await page.locator('#returnTripDate').fill('2030-08-19');
 await page.locator('#confirmPickupDropoffBtn').click();
 await page.locator('[data-service="wheelchair"]').click();
 await expect(page.locator('[data-service="wheelchair"] .serviceCardEta')).toHaveText('~1h 18m drive');
 await expect(page.locator('#rideTimingSummary')).toContainText('Return Aug 19, 2030 at 10:45');
 await expect(page.locator('#rideTimingSummary')).toContainText('4d 1h waiting included in fare');
 await expect(page.locator('#rideTimingSummary')).toContainText('4d 2h 18m trip total');
 await expect(page.locator('#waitMinutes')).toHaveValue('5820');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/booking-travel-wait-separate.png'});
 expect(await page.locator('#serviceChips').evaluate(element=>element.scrollWidth>element.clientWidth+1)).toBe(false);
});

test('the default return date follows the outbound date while explicitly chosen later dates are retained',async({page})=>{
 await prepare(page);
 await page.locator('#rideSchedulePill').click();
 await page.locator('#tripType').selectOption('ROUND_TRIP');
 await expect(page.locator('#returnTripDate')).toHaveValue('2030-08-15');
 await page.locator('#tripDate').fill('');await page.locator('#tripDate').fill('2030-08-16');
 await expect(page.locator('#returnTripDate')).toHaveValue('2030-08-16');
 await expect(page.locator('#returnTripDate')).toHaveAttribute('min','2030-08-16');
 await page.locator('#returnTripDate').fill('2030-08-20');
 await page.locator('#tripDate').fill('2030-08-17');
 await expect(page.locator('#returnTripDate')).toHaveValue('2030-08-20');
});
