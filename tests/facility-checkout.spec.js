const {test,expect}=require('@playwright/test');
const Demo=require('../netlify/functions/_shared/facility-demo.cjs');
const facility={id:'FC-ANNAPOLIS',name:'FutureCare Annapolis',address:'2700 Southaven Road, Annapolis, MD 21401'};
const settings={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15}};
for(const width of [1440,390])test(`facility embeds main booking and returns from checkout at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});let payload,paid=false;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{sessionStorage.setItem('nexusAccessToken','facility-fixture');window.google={maps:{TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'bestguess',PESSIMISTIC:'pessimistic'},UnitSystem:{IMPERIAL:1},DirectionsService:class{route(r,cb){cb({routes:[{legs:[{distance:{value:16093.44},duration:{value:1800,text:'30 min'},duration_in_traffic:{value:1800}}]}]},'OK');}}}};});
 await page.route('https://**',route=>route.abort());
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let json={};
  if(path==='/api/settings/public')json=settings;
  if(path==='/api/integrations/config')json={googleMapsEnabled:false,stripeEnabled:true};
  if(path==='/api/auth/me')json={user:{role:'FACILITY',scopeId:facility.id,email:'facility@nexusmt.com'}};
  if(path==='/api/booking/facilities')json={facilities:[facility]};
  if(path==='/api/facility-demo/state')json={admin:true,dashboard:Demo.dashboardFor({state:Demo.initialState()})};
  if(path==='/api/facility-demo/paid-bookings')json={facility,bookingUrl:'/booking-app.html?facility='+facility.id,trips:paid?[{reference:'FAC-PAID',name:payload.name,service:payload.service,trip_date:payload.date,trip_time:payload.time,pickup:payload.pickup,destination:payload.destination,status:'SUBMITTED',payment_status:'DEPOSIT_PAID'}]:[]};
  if(path==='/api/bookings'){payload=route.request().postDataJSON();json={booking:{reference:'FAC-PAID',estimatedFare:payload.estimatedFare,status:'PENDING_PAYMENT'},persisted:true,requiresOnlinePayment:true,depositRequired:true};}
  if(path==='/api/payments/stripe/checkout'){expect(route.request().postDataJSON().facilityPortal).toBe(true);paid=true;json={url:'http://127.0.0.1:4173/checkout-fixture'};}
  return route.fulfill({json});
 });
 await page.goto('/facility-demo.html');
 await expect(page.locator('#facilityBookingSection')).toBeVisible();
 await expect(page.locator('#paidBookingsStatus')).toContainText('0 paid bookings');
 await expect(page.locator('#newBooking')).toHaveText('Book a Ride');
 await expect(page.locator('#billingSection')).toBeHidden();
 const booking=page.frameLocator('#facilityBookingFrame');
 await expect(booking.locator('#bookingFacilityId')).toHaveValue(facility.id);
 await expect(booking.locator('#bookingFacilityHelp')).toContainText('facility is not invoiced');
 await expect(page).toHaveURL(/\/facility-demo.html$/);
 await booking.locator('#firstName').fill('Passenger'); await booking.locator('#lastName').fill('Fixture');
 await page.locator('#viewFacilityPaidBookings').click();await expect(page.locator('#paidBookingsSection')).toBeVisible();
 await page.locator('#newBooking').click();await expect(booking.locator('#firstName')).toHaveValue('Passenger'); await expect(booking.locator('#lastName')).toHaveValue('Fixture');
 await booking.locator('#phone').fill('(240) 555-0130');await booking.locator('#email').fill('fixture@example.com');await booking.locator('#serviceTypeSelect').selectOption('ambulatory');
 await booking.locator('#bookingFacilityField').scrollIntoViewIfNeeded();await page.screenshot({path:`output/facility-embedded-booking-${width}.png`});
 await booking.locator('#confirmRiderBtn').click();await booking.locator('#tripDate').fill('2030-10-15');await booking.locator('#appointmentTime').fill('13:15');
 await booking.locator('#pickup').fill(facility.address);await booking.locator('#destination').fill('2001 Medical Parkway, Annapolis, MD');await booking.locator('#confirmPickupDropoffBtn').click();await booking.locator('#continueRideBtn').click();await booking.locator('#fareConfirmAccept').click();
 await expect.poll(()=>payload?.facilityId).toBe(facility.id);await expect(booking.locator('#payDepositBtn')).toBeEnabled();await expect(booking.locator('#payFullBtn')).toBeEnabled();
 await booking.locator('#payDepositBtn').click();await expect(page).toHaveURL(/checkout-fixture/);
 await page.goto('/facility-demo.html?payment=success&bookingReference=FAC-PAID');await expect(page.locator('#facilityBookingFrame')).toHaveAttribute('src',/facilityPortal=1.*payment=success/);
 await page.locator('#viewFacilityPaidBookings').click();await expect(page.locator('#paidBookingRows')).toContainText('FAC-PAID');await expect(page.locator('#paidBookingRows')).toContainText('DEPOSIT PAID');await expect(page.locator('#paidBookingRows')).toContainText('Passenger Fixture');
 await page.screenshot({path:`output/facility-paid-bookings-confirmed-${width}.png`});expect(errors).toEqual([]);
});
for(const role of ['GUEST','PATIENT','ADMIN','DISPATCHER','DRIVER'])test(`associated facility stays hidden for ${role}, even with facility URL parameters`,async({page})=>{
 if(role!=='GUEST')await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','role-fixture'));
 let searches=0;
 await page.route('**/api/**',route=>{const p=new URL(route.request().url()).pathname;if(p==='/api/booking/facilities')searches++;return route.fulfill({json:p==='/api/settings/public'?settings:p==='/api/auth/me'?{user:{role,email:'fixture@example.com'}}:{}});});
 await page.goto('/booking-app.html?facility=FC-ANNAPOLIS&facilityPortal=1');await expect(page.locator('#bookingFacilityField')).toBeHidden();
 expect(await page.evaluate(()=>window.NexusBookingFacility.getFacilityId())).toBe(null);expect(searches).toBe(0);
});
test('manager login opens embedded booking automatically and logout removes the frame session',async({page})=>{
 await page.route('https://**',route=>route.abort());
 await page.route('**/api/**',route=>{
  const p=new URL(route.request().url()).pathname;
  const json=p==='/api/settings/public'?settings:p==='/api/integrations/config'?{googleMapsEnabled:false}:p==='/api/booking/facilities'?{facilities:[facility]}:p==='/api/facility-demo/booking-context'?{user:{role:'FACILITY',scopeId:facility.id},facility}:p==='/api/facility-demo/login'?{token:'scoped-manager-token',dashboard:Demo.dashboardFor({state:Demo.initialState()})}:p==='/api/facility-demo/state'?{dashboard:Demo.dashboardFor({state:Demo.initialState()})}:p==='/api/facility-demo/paid-bookings'?{facility,bookingUrl:'/booking-app.html?facility='+facility.id,trips:[]}:{};
  return route.fulfill({json});
 });
 await page.goto('/facility-demo.html');await page.locator('#loginEmail').fill('annapolis.demo@nexusmt.com');await page.locator('#loginPassword').fill('fixture-only-password');await page.locator('#loginButton').click();
 await expect(page.locator('#facilityBookingSection')).toBeVisible();await expect(page.frameLocator('#facilityBookingFrame').locator('#bookingFacilityId')).toHaveValue(facility.id);
 await expect(page.frameLocator('#facilityBookingFrame').locator('#bookingFacilityField')).toBeVisible();
 expect(await page.evaluate(()=>sessionStorage.getItem('nexusFacilityDemoToken'))).toBe('scoped-manager-token');
 await page.evaluate(()=>window.postMessage({type:'nexus:facility-checkout',url:'https://example.invalid/spoof'},location.origin));
 await expect(page).toHaveURL(/facility-demo.html$/);
 await page.locator('#logout').click();await expect(page.locator('#loginScreen')).toBeVisible();await expect(page.locator('#facilityBookingFrame')).toHaveAttribute('src','about:blank');
 expect(await page.evaluate(()=>sessionStorage.getItem('nexusFacilityDemoToken'))).toBe(null);
});
