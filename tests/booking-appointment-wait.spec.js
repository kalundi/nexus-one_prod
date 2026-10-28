const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
const settings={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15}};
test('slow account initialization preserves passenger details already entered',async({page})=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/integrations/config')await gate;return route.fulfill({json:path==='/api/settings/public'?settings:{}});});
 await page.goto('/booking-app.html',{waitUntil:'domcontentloaded'});
 await page.locator('#firstName').fill('Early');await page.locator('#lastName').fill('Passenger');await page.locator('#email').fill('early@example.com');
 release();await page.waitForResponse('**/api/settings/public');await page.locator('#serviceTypeSelect').selectOption('ambulatory');
 await expect(page.locator('#firstName')).toHaveValue('Early');await expect(page.locator('#lastName')).toHaveValue('Passenger');await expect(page.locator('#email')).toHaveValue('early@example.com');
});
for(const embedded of [false,true])for(const signedIn of [false,true])test(`appointment waiting and savings: embedded=${embedded}, signedIn=${signedIn}`,async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(signedIn=>{
  if(signedIn)sessionStorage.setItem('nexusAccessToken','fixture');
  window.google={maps:{TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'bestguess'},UnitSystem:{IMPERIAL:1},DirectionsService:class{route(r,cb){cb({routes:[{legs:[{distance:{value:16093.44},duration:{value:1800},duration_in_traffic:{value:1800}}]}]},'OK');}}}};
 },signedIn);
 let submitted;
 await page.route('https://**',r=>r.abort());
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const json=path==='/api/settings/public'?settings:path==='/api/integrations/config'?{googleMapsEnabled:false}:path==='/api/auth/me'?{user:{role:'PATIENT',email:'fixture@example.com'}}:path==='/api/bookings'?(submitted=route.request().postDataJSON(),{error:'Fixture booking failure'}):{};
  return route.fulfill({status:path==='/api/bookings'?500:200,json});
 });
 if(embedded){
  await page.goto('/legal.html');
  await page.evaluate(()=>{document.body.innerHTML='<iframe id="booking" style="width:100%;height:800px;border:0" src="/booking-app.html?facilityPortal=1"></iframe>';});
 }else await page.goto('/booking-app.html');
 const ui=embedded?page.frameLocator('#booking'):page;
 await ui.locator('#firstName').fill('Fixture');await ui.locator('#lastName').fill('Passenger');
 await ui.locator('#phone').fill('(240) 555-0130');await ui.locator('#email').fill('fixture@example.com');
 await ui.locator('#serviceTypeSelect').selectOption('ambulatory');await ui.locator('#confirmRiderBtn').click();
 await ui.locator('#tripType').selectOption('ROUND_TRIP');await ui.locator('#tripDate').fill('2030-10-30');
 await ui.locator('#appointmentTime').fill('10:02');await ui.locator('#returnTripDate').fill('2030-10-30');await ui.locator('#returnTripTime').fill('11:03');
 await ui.locator('#pickup').fill('100 Main Street, Rockville, MD');await ui.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
 await ui.locator('#confirmPickupDropoffBtn').click();
 await expect(ui.locator('#waitMinutes')).toHaveValue('61');
 await expect(ui.locator('#waitPricingHint')).toContainText('61 minutes waiting − 15 free = 46 billable');
 await ui.locator('#continueRideBtn').click();
 await expect(ui.locator('#fareConfirmFuel')).toContainText('Discount applied: $');
 await expect(ui.locator('#fareConfirmFuel')).not.toContainText('Fuel');
 if(!signedIn)await expect(ui.locator('#fareConfirmFuel')).toContainText('not receiving the 5% member discount');
 else await expect(ui.locator('#fareConfirmFuel')).not.toContainText('not receiving');
 await ui.locator('#fareConfirmAccept').click();
 await expect(ui.locator('#statusMsg')).toContainText('Fixture booking failure');
 await expect(ui.locator('body')).not.toHaveClass(/bookingRideMarketplaceView|bookingPaymentMapView/);
 await expect(ui.locator('#statusMsg')).toBeInViewport();
 const fare=Fare.calculateBooking(submitted,submitted.fareInputs,settings);
 expect(fare.waitMinutes).toBe(61);expect(fare.billableWaitMinutes).toBe(46);expect(fare.waitCharge).toBe(48);
});
