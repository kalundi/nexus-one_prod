const {test,expect}=require('@playwright/test');
test('Trip Management recalculates our estimate without changing negotiated rates',async({page})=>{
 test.setTimeout(25000);
 await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','fare-ui-test'));
 const fareInputs={miles:20,durationMinutes:30,trafficDurationMinutes:30,stopWaitMinutes:0,deadheadSegments:[12,10],discountPct:0};
 const booking={reference:'FARE-TEST',name:'Fare Test',status:'SUBMITTED',bookingSource:'BROKER',service:'wheelchair',pickup:'Home',destination:'Clinic',date:'2030-08-15',time:'10:00',pickupTime:'10:00',appointmentTime:'10:45',createdAt:'2030-08-14T20:00:00Z',tripType:'ONE_WAY',distanceMiles:20,estimatedDuration:'30 min; traffic 30 min',estimatedFare:2258.52,brokerQuotedRate:1085,brokerAcceptedRate:1085,notes:'Fare inputs: '+JSON.stringify(fareInputs)};
 let savedInputs;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/admin/bookings/FARE-TEST'&&route.request().method()==='PATCH'){
    const payload=route.request().postDataJSON();savedInputs=payload.fareInputs;
    Object.assign(booking,payload,{estimatedFare:275.42,notes:payload.notes.replace(/Fare inputs: \{.*\}/,'')+' | Fare inputs: '+JSON.stringify(savedInputs)});
  }
  const body=path==='/api/auth/me'?{user:{role:'ADMIN',email:'staff@example.com'}}:
   path==='/api/settings/public'?{pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:18.75}},fareRules:{}}:
   path==='/api/admin/bookings/FARE-TEST'?{booking}:
   path==='/api/portal/trips'?{trips:[booking]}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/dispatch.html',{waitUntil:'domcontentloaded'});
 await page.locator('[data-section-target="tripBoard"]').click();
 if(await page.locator('#tripBoardBody').evaluate(e=>e.hidden))await page.locator('#tripBoardToggle').click();
 await page.evaluate(()=>window.openTripEditor('FARE-TEST'));
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$194.57');
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('Saved estimate: $2258.52');
 await expect(page.locator('#dispatchEditFareDuration')).toHaveValue('30');
 await page.locator('#dispatchEditFareMiles').fill('30');
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$236.80');
 await page.locator('#dispatchEditFareStops').fill('16');
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('$275.42');
 await expect(page.locator('#dispatchEditBrokerQuotedRate')).toHaveValue('1085.00');
 await expect(page.locator('#dispatchEditBrokerAcceptedRate')).toHaveValue('1085.00');
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#dispatchEditSave').click();
 await expect(page.locator('#dispatchEditFareBreakdown')).toContainText('Saved estimate: $275.42');
 expect(savedInputs.miles).toBe(30);
 expect(savedInputs.stopWaitMinutes).toBe(16);
 expect(booking.brokerQuotedRate).toBe('1085.00');
 expect(booking.brokerAcceptedRate).toBe('1085.00');
 await page.evaluate(()=>window.openTripEditor('FARE-TEST'));
 await page.locator('#dispatchEditPickup').fill('Another home');
 await expect(page.locator('#dispatchEditOurEstimate')).toHaveValue('Needs fare inputs');
});
