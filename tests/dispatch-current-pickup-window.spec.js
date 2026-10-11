const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:12}},fareRules:{waitingPolicyVersion:2,freeWaitMinutes:15,fuelSurchargePerMile:.24,cardProcessingFeePct:3,shortNoticeHours:24,shortNoticeSurchargePct:30,servicePolicies:{wheelchair:{afterHoursSurchargePct:25}}}};

test('dispatch hides the 24-hour surcharge for the October 14 mock trip and matches Booking',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-11T16:00:00Z'));
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','pickup-window-test'));
 const booking={reference:'MOCK-20261010-02',name:'MOCK TRIP — Patient Pricing Test',status:'MOCK',bookingSource:'MOCK',service:'wheelchair',pickup:'MOCK TRIP pickup — Clarksburg, MD',destination:'MOCK TRIP destination — Bethesda, MD',date:'2026-10-14',time:'05:30',pickupTime:'05:30',appointmentTime:'05:30',createdAt:'2026-10-10T14:00:00Z',tripType:'ROUND_TRIP',returnTripDate:'2026-10-14',returnTripTime:'09:00',distanceMiles:12,estimatedDuration:'21 min',estimatedFare:492.17,ourEstimate:434.63,fareInputs:{miles:12,durationMinutes:21,trafficDurationMinutes:21,stopWaitMinutes:0,deadheadSegments:[12,10],discountPct:5},notes:'MOCK TRIP — PRICING TEST ONLY. Pricing booking timestamp: 2026-10-13T20:00:00Z (simulated test clock).'};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const body=path==='/api/auth/me'?{user:{role:'ADMIN',email:'staff@example.com'}}:path==='/api/settings/public'?settings:path==='/api/admin/bookings/'+booking.reference?{booking}:path==='/api/portal/trips'?{trips:[booking]}:{};
  return route.fulfill({status:200,json:body});
 });
 await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-section-target="tripBoard"]').click();
 if(await page.locator('#tripBoardBody').evaluate(element=>element.hidden))await page.locator('#tripBoardToggle').click();
 await page.locator('#loadTrips').click();
 await expect(page.locator('#tripRows')).toContainText('$434.63');
 await page.evaluate(()=>window.openTripEditor('MOCK-20261010-02'));
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$434.63');
 await page.locator('#dispatchEditCalculation > summary').click();
 await expect(page.locator('#dispatchEditFareBreakdown')).not.toContainText('within the next 24 hours');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('$168.00');

 // Move the same quote into the actual 24-hour window without changing saved
 // timestamps, and verify both scheduled legs and the full fare update.
 await page.clock.setFixedTime(new Date('2026-10-13T20:00:00Z'));
 await page.locator('#dispatchEditAppointmentTime').dispatchEvent('change');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('Pickup within the next 24 hours');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('$58.80');
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$492.17');

 const comparison=await page.evaluate(({booking,settings})=>{
  const dispatchFare=NexusFare.calculateEstimate(booking,settings);
  const bookingFare=NexusFare.calculate({service:booking.service,rate:settings.pricing.wheelchair,rules:settings.fareRules,date:booking.date,time:booking.pickupTime,miles:12,tripType:booking.tripType,returnDate:booking.returnTripDate,returnTime:booking.returnTripTime,waitMinutes:dispatchFare.waitMinutes,metrics:booking.fareInputs});
  return {dispatch:dispatchFare.discountedTotal,booking:NexusFare.applySavings(bookingFare.total,5).total,charge:bookingFare.shortNoticeCharge};
 },{booking,settings});
 expect(comparison).toEqual({dispatch:492.17,booking:492.17,charge:58.8});

 await page.clock.setFixedTime(new Date('2026-10-14T16:00:00Z'));
 await page.locator('#dispatchEditAppointmentTime').dispatchEvent('change');
 await expect(page.locator('#dispatchEditFareBreakdown')).not.toContainText('within the next 24 hours');
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$434.63');
});
