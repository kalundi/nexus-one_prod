const {test,expect}=require('@playwright/test');
const Fare=require('../nexus-fare.js');
test('existing trip displays an automatic estimate without asking for fare inputs',async({page})=>{
 test.setTimeout(25000);
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','fare-ui-test'));
 const settings={pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}};
 const booking={reference:'FARE-LEGACY',name:'Legacy Fare Test',status:'SUBMITTED',bookingSource:'BROKER',service:'wheelchair',pickup:'Home',destination:'Clinic',date:'2030-08-15',time:'10:00',pickupTime:'10:00',appointmentTime:'10:45',createdAt:'2030-08-12T20:00:00Z',tripType:'ONE_WAY',distanceMiles:25.28,estimatedDuration:null,estimatedFare:2258.52,brokerQuotedRate:1085,brokerAcceptedRate:1085,notes:''};
 let saveRequest;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/admin/bookings/FARE-LEGACY'&&route.request().method()==='PATCH'){
    const payload=route.request().postDataJSON();saveRequest=payload;
    Object.assign(booking,payload);
    booking.estimatedFare=Fare.calculateEstimate(booking,settings).discountedTotal;
  }
  const enriched={...booking,ourEstimate:Fare.calculateEstimate(booking,settings).discountedTotal};
  const body=path==='/api/auth/me'?{user:{role:'ADMIN',email:'staff@example.com'}}:
   path==='/api/settings/public'?settings:
   path==='/api/admin/bookings/FARE-LEGACY'?{booking:enriched}:
   path==='/api/portal/trips'?{trips:[enriched]}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-section-target="tripBoard"]').click();
 if(await page.locator('#tripBoardBody').evaluate(e=>e.hidden))await page.locator('#tripBoardToggle').click();
 await page.locator('#loadTrips').click();
 await expect(page.locator('#tripRows')).toContainText('$173.91');
 await expect(page.locator('#tripRows')).not.toContainText('$2258.52');
 await page.evaluate(()=>window.openTripEditor('FARE-LEGACY'));
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$173.91');
 await expect(page.locator('#dispatchEditFareMiles')).toHaveCount(0);
 await expect(page.locator('#dispatchEditRefreshFareRoute')).toHaveCount(0);
 await expect(page.locator('#dispatchEditBrokerQuotedRate')).toHaveValue('1085.00');
 await expect(page.locator('#dispatchEditBrokerAcceptedRate')).toHaveValue('1085.00');
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#dispatchEditSave').click();
 await expect.poll(()=>saveRequest?.recalculateEstimate).toBe(true);
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$173.91');
 expect(booking.brokerQuotedRate).toBe('1085.00');
 expect(booking.brokerAcceptedRate).toBe('1085.00');
});
