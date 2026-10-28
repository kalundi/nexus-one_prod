const {test,expect}=require('@playwright/test');
const Demo=require('../netlify/functions/_shared/facility-demo.cjs');
const facility={id:'FC-ANNAPOLIS',name:'FutureCare Annapolis',address:'2700 Southaven Road, Annapolis, MD 21401'};
const settings={organization:{yardAddress:'Company yard'},pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5}},fareRules:{smartTiming:{enabled:true},waitingPolicyVersion:2,freeWaitMinutes:15}};
for(const width of [1440,390])test(`facility link uses main booking and checkout then shows paid trip at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});let payload,paid=false;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{sessionStorage.setItem('nexusAccessToken','facility-fixture');window.google={maps:{TravelMode:{DRIVING:'DRIVING'},TrafficModel:{BEST_GUESS:'bestguess',PESSIMISTIC:'pessimistic'},UnitSystem:{IMPERIAL:1},DirectionsService:class{route(r,cb){cb({routes:[{legs:[{distance:{value:16093.44},duration:{value:1800,text:'30 min'},duration_in_traffic:{value:1800}}]}]},'OK');}}}};});
 await page.route('https://**',route=>route.abort());
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let json={};
  if(path==='/api/settings/public')json=settings;
  if(path==='/api/integrations/config')json={googleMapsEnabled:false,stripeEnabled:true};
  if(path==='/api/auth/me')json={user:{role:'ADMIN',email:'test@example.com'}};
  if(path==='/api/booking/facilities')json={facilities:[facility]};
  if(path==='/api/facility-demo/state')json={admin:true,dashboard:Demo.dashboardFor({state:Demo.initialState()})};
  if(path==='/api/facility-demo/paid-bookings')json={facility,bookingUrl:'/booking-app.html?facility='+facility.id,trips:paid?[{reference:'FAC-PAID',name:payload.name,service:payload.service,trip_date:payload.date,trip_time:payload.time,pickup:payload.pickup,destination:payload.destination,status:'SUBMITTED',payment_status:'DEPOSIT_PAID'}]:[]};
  if(path==='/api/bookings'){payload=route.request().postDataJSON();json={booking:{reference:'FAC-PAID',estimatedFare:payload.estimatedFare,status:'PENDING_PAYMENT'},persisted:true,requiresOnlinePayment:true,depositRequired:true};}
  if(path==='/api/payments/stripe/checkout'){paid=true;json={url:'http://127.0.0.1:4173/checkout-fixture'};}
  return route.fulfill({json});
 });
 await page.goto('/facility-demo.html');
 await expect(page.locator('#paidBookingsSection')).toBeVisible();
 await expect(page.locator('#paidBookingsStatus')).toContainText('0 paid bookings');
 await expect(page.locator('#newBooking')).toHaveText('Book a Ride');
 await expect(page.locator('#billingSection')).toBeHidden();
 await page.screenshot({path:`output/facility-paid-bookings-${width}.png`});
 await page.locator('#newBooking').click();
 await expect(page).toHaveURL(/booking-app.html\?facility=FC-ANNAPOLIS/);
 await expect(page.locator('#bookingFacilityId')).toHaveValue(facility.id);
 await expect(page.locator('#bookingFacilityHelp')).toContainText('facility is not invoiced');
 await page.locator('#name').fill('Passenger Fixture');await page.locator('#phone').fill('(240) 555-0130');await page.locator('#serviceTypeSelect').selectOption('ambulatory');
 await page.locator('#bookingFacilityField').scrollIntoViewIfNeeded();await page.screenshot({path:`output/booking-associated-facility-${width}.png`});
 await page.locator('#confirmRiderBtn').click();await page.locator('#tripDate').fill('2030-10-15');await page.locator('#appointmentTime').fill('13:15');
 await page.locator('#pickup').fill(facility.address);await page.locator('#destination').fill('2001 Medical Parkway, Annapolis, MD');await page.locator('#confirmPickupDropoffBtn').click();await page.locator('#continueRideBtn').click();await page.locator('#fareConfirmAccept').click();
 await expect.poll(()=>payload?.facilityId).toBe(facility.id);await expect(page.locator('#payDepositBtn')).toBeEnabled();await expect(page.locator('#payFullBtn')).toBeEnabled();
 await page.locator('#payDepositBtn').click();await expect(page).toHaveURL(/checkout-fixture/);
 await page.goto('/facility-demo.html');await expect(page.locator('#paidBookingRows')).toContainText('FAC-PAID');await expect(page.locator('#paidBookingRows')).toContainText('DEPOSIT PAID');await expect(page.locator('#paidBookingRows')).toContainText('Passenger Fixture');
 await page.screenshot({path:`output/facility-paid-bookings-confirmed-${width}.png`});expect(errors).toEqual([]);
});
test('facility search allows optional association and makes failed linked selection explicit',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/settings/public'?settings:{facilities:[]}}));
 await page.goto('/booking-app.html?facility=missing');await expect(page.locator('#bookingFacilityStatus')).toContainText('unavailable');
 expect(await page.evaluate(()=>window.NexusBookingFacility.validate())).toBe(false);
 await page.locator('#bookingFacilitySearch').fill('FutureCare');await page.locator('#bookingFacilityFind').click();await expect(page.locator('#bookingFacilityStatus')).toContainText('No matching');
 expect(await page.evaluate(()=>window.NexusBookingFacility.validate())).toBe(true);
});
