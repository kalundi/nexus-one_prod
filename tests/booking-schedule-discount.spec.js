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
  await page.locator('#returnTripDate').fill('2030-08-15');
  await page.locator('#returnTripTime').fill('10:15');
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
 await page.locator('#returnTripDate').evaluate(input=>{input.value='2030-08-15';input.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#returnTripTime').evaluate(input=>{input.value='10:15';input.dispatchEvent(new Event('change',{bubbles:true}));});
 await expect(page.locator('#estSavingsLabel')).toHaveText('Member Savings (10%)');
 await expect(page.locator('#tripScheduleSavingsMessage')).toContainText('10% savings applied');
});

for(const signedIn of [false,true]) test(`round-trip charges both legs before ${signedIn?'member':'guest'} savings and payment`,async({page})=>{
 await prepareRide(page,{signedIn});
 const money=async id=>Number((await page.locator(`#${id}`).textContent()).replace(/[^0-9.]/g,''));
 const oneWaySubtotal=await money('estSubtotal');
 const oneWayTotal=await money('estFare');
 await page.locator('#fareConfirmCancel').click();
 const changeSchedule=async type=>page.locator('#tripType').evaluate((select,value)=>{
  select.value=value;
  select.dispatchEvent(new Event('change',{bubbles:true}));
 },type);
 const roundTripTotal=Number((oneWaySubtotal*2*1.03*(signedIn?.90:.95)).toFixed(2));
 for(let index=0;index<2;index++){
  await changeSchedule('ROUND_TRIP');
  expect(await money('estSubtotal')).toBeCloseTo(oneWaySubtotal*2,1);
  expect(await money('estFare')).toBeCloseTo(roundTripTotal,1);
  await changeSchedule('ONE_WAY');
  expect(await money('estSubtotal')).toBeCloseTo(oneWaySubtotal,1);
  expect(await money('estFare')).toBeCloseTo(oneWayTotal,1);
 }
 await changeSchedule('ROUND_TRIP');
 await page.locator('#returnTripDate').evaluate(input=>{input.value='2030-08-15';input.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#returnTripTime').evaluate(input=>{input.value='10:15';input.dispatchEvent(new Event('change',{bubbles:true}));});
 await expect(page.locator('#tripScheduleSavingsMessage')).toContainText('both outbound and return legs');
 const displayTotal=await page.locator('#estFare').textContent();
 await expect(page.locator('[data-service="wheelchair"] .serviceCardFare')).toHaveText(displayTotal);
 await expect(page.locator('#fareSummaryAmount')).toHaveText(displayTotal);
 let submitted;
 await page.route('**/api/bookings',route=>{
  submitted=route.request().postDataJSON();
  return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({booking:{reference:'ROUND-TRIP-1',estimatedFare:submitted.estimatedFare},requiresOnlinePayment:true,persisted:true})});
 });
 await page.locator('#reviewFareBtn').click();
 await expect(page.locator('#fareConfirmAmount')).toHaveText(displayTotal);
 await page.locator('#fareConfirmAccept').click();
 await expect(page.locator('#paymentSummary')).toContainText('ROUND-TRIP-1');
 expect(submitted.tripType).toBe('ROUND_TRIP');
 expect(submitted.estimatedFareBeforeDiscount).toBeCloseTo(oneWaySubtotal*2*1.03,1);
 expect(submitted.estimatedFare).toBeCloseTo(roundTripTotal,1);
 await expect(page.locator('#fullAmountLabel')).toHaveText(displayTotal);
 expect(submitted.estimatedFare).toBe(Number(submitted.estimatedFare.toFixed(2)));
 await expect(page.locator('#depositAmountLabel')).toHaveText(`$${(Math.round(Math.round(submitted.estimatedFare*100)/4)/100).toFixed(2)}`);
});
