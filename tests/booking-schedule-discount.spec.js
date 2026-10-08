const {test,expect}=require('@playwright/test');

async function prepareRide(page,{signedIn=false,tripType='ONE_WAY'}={}){
 if(signedIn)await page.addInitScript(()=>sessionStorage.setItem('nexusAccessToken','schedule-discount-test-token'));
 await page.route('**/api/**',route=>{
  const url=route.request().url();
  const payload=url.includes('/integrations/config')?{stripeEnabled:true,googleMapsEnabled:false}:
   url.includes('/locations/search')?{locations:[{lat:39.0458,lng:-76.6413}]}:
   url.includes('/fleet/live')?{vehicles:[]} : {};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('/booking-app.html');
 await page.locator('#name').fill('Schedule Discount Test');
 await page.locator('#phone').fill('(240) 555-0148');
 await page.locator('#confirmRiderBtn').click();
 await page.locator('#tripType').selectOption(tripType);
 if(tripType==='ROUND_TRIP'){
  await page.locator('#returnTripDate').fill('2030-08-16');
  await page.locator('#returnTripTime').fill('14:30');
 }
 if(tripType==='RECURRING'){
  await page.locator('#recurrenceEndDate').fill('2030-09-15');
  await page.locator('input[name="recurrenceDay"][value="MON"]').check();
 }
 await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
 await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
 await page.locator('#tripDate').fill('2030-08-15');
 await page.locator('#appointmentTime').fill('10:30');
 await page.locator('#confirmPickupDropoffBtn').click();
 await page.locator('[data-service="wheelchair"]').click();
 await page.locator('#continueRideBtn').click();
 await expect(page.locator('#fareConfirmDialog')).toBeVisible();
}

test('guest repeat rides receive 5% schedule savings',async({page})=>{
 await prepareRide(page,{tripType:'ROUND_TRIP'});
 await expect(page.locator('#tripScheduleSavingsMessage')).toContainText('5%');
 await expect(page.locator('#estSavingsLabel')).toHaveText('Schedule Savings (5%)');
 expect(await page.locator('#estMemberSavingsRow').evaluate(row=>row.hidden)).toBe(false);
 await expect(page.locator('#estMemberSavings')).toHaveText(/^\-\$\d+\.\d{2}$/);
});

test('signed-in repeat rides receive 10% schedule savings',async({page})=>{
 await prepareRide(page,{signedIn:true,tripType:'RECURRING'});
 await expect(page.locator('#tripScheduleSavingsMessage')).toContainText('10%');
 await expect(page.locator('#estSavingsLabel')).toHaveText('Member Savings (10%)');
});

test('signed-in one-way rides keep the existing 5% member savings',async({page})=>{
 await prepareRide(page,{signedIn:true});
 await expect(page.locator('#estSavingsLabel')).toHaveText('Member Savings (5%)');
});

test('guest one-way rides do not receive a one-way discount',async({page})=>{
 await prepareRide(page);
 await expect(page.locator('#tripScheduleSavingsMessage')).toContainText('Round-trip and recurring rides save 5%');
 await expect(page.locator('#estMemberSavingsRow')).toBeHidden();
});

test('changing schedule after estimating refreshes the signed-in savings rate',async({page})=>{
 await prepareRide(page,{signedIn:true});
 await page.locator('#fareConfirmCancel').click();
 await page.locator('#tripType').evaluate(select=>{select.value='ROUND_TRIP';select.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#returnTripDate').evaluate(input=>{input.value='2030-08-16';input.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#returnTripTime').evaluate(input=>{input.value='14:30';input.dispatchEvent(new Event('change',{bubbles:true}));});
 await expect(page.locator('#estSavingsLabel')).toHaveText('Member Savings (10%)');
 await expect(page.locator('#tripScheduleSavingsMessage')).toContainText('10% savings applied');
});
