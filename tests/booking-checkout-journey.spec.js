const { test, expect } = require('@playwright/test');

async function prepareRide(page) {
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/**', route => {
    const url=route.request().url();
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(
      url.includes('/integrations/config') ? {stripeEnabled:true,googleMapsEnabled:false} :
      url.includes('/locations/search') ? {locations:[{lat:39.0458,lng:-76.6413}]} :
      url.includes('/fleet/live') ? {vehicles:[]} : {}
    )});
  });
  await page.goto('/booking-app.html');
  await page.locator('#name').fill('Journey Test');
  await page.locator('#phone').fill('(240) 555-0148');
  await page.locator('#confirmRiderBtn').click();
  await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
  await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
  await page.locator('#tripDate').fill('2030-08-15');
  await page.locator('#appointmentTime').fill('10:30');
  await page.locator('#confirmPickupDropoffBtn').click();
  await page.locator('[data-service="wheelchair"]').click();
}

for (const mode of ['deposit','full']) test(`${mode} checkout retries failures and opens the returned checkout`,async({page})=>{
  await prepareRide(page);
  let bookings=0,checkoutAttempts=0;
  await page.route('**/api/bookings',route=>{
    bookings++;
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({booking:{reference:'JOURNEY-1',estimatedFare:100},requiresOnlinePayment:true,depositRequired:true,persisted:true})});
  });
  await page.route('**/api/payments/stripe/checkout',route=>{
    checkoutAttempts++;
    const payload=route.request().postDataJSON();
    expect(payload).toMatchObject({bookingReference:'JOURNEY-1',paymentMode:mode,amount:100});
    return route.fulfill({status:checkoutAttempts===1?502:200,contentType:'application/json',body:JSON.stringify(checkoutAttempts===1?{error:'Checkout temporarily unavailable. Try again.'}:{url:`http://127.0.0.1:4173/test-payment.html?mode=${mode}`})});
  });
  await page.locator('#continueRideBtn').click();
  await page.locator('#fareConfirmAccept').click();
  const button=page.locator(mode==='deposit'?'#payDepositBtn':'#payFullBtn');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('#paymentStatusMsg')).toContainText('Try again');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(new RegExp(`test-payment.html\\?mode=${mode}`));
  expect(bookings).toBe(1);
  expect(checkoutAttempts).toBe(2);
});

test('reapplying a percentage coupon keeps the same fare and submits its original base',async({page})=>{
  await prepareRide(page);
  const bases=[];
  await page.route('**/api/promotions/validate',route=>{
    const payload=route.request().postDataJSON();
    bases.push(payload.currentFare);
    const total=Number((payload.currentFare*.8).toFixed(2));
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({valid:true,total,savings:payload.currentFare-total,percentOff:20})});
  });
  await page.locator('#promotionCode').fill('TEST20');
  await page.locator('#applyPromotionBtn').click();
  await expect(page.locator('#promotionMessage')).toContainText('Coupon applied');
  const firstTotal=await page.locator('#estFare').textContent();
  await page.locator('#applyPromotionBtn').click();
  await expect(page.locator('#applyPromotionBtn')).toBeEnabled();
  expect(bases[1]).toBe(bases[0]);
  await expect(page.locator('#estFare')).toHaveText(firstTotal);
  let submitted;
  await page.route('**/api/bookings',route=>{
    submitted=route.request().postDataJSON();
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({booking:{reference:'COUPON-1',estimatedFare:Number((submitted.estimatedFare*.8).toFixed(2))},requiresOnlinePayment:true,persisted:true})});
  });
  await page.locator('#continueRideBtn').click();
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSummary')).toContainText('COUPON-1');
  expect(submitted.estimatedFare).toBe(bases[0]);
  await expect(page.locator('#fullAmountLabel')).toHaveText(firstTotal);
});

for(const scenario of [
  {result:'cancelled',status:'UNPAID',message:'Checkout was cancelled',canPay:true},
  {result:'success',status:'UNPAID',message:'Awaiting payment confirmation',canPay:false},
  {result:'success',status:'DEPOSIT_PAID',message:'Payment verified',canPay:false},
  {result:'success',status:'PAID_IN_FULL',message:'Payment verified',canPay:false}
]) test(`checkout return: ${scenario.result}, ${scenario.status}`,async({page})=>{
  // Production must ignore client-side simulated receipts and read the server status.
  await page.addInitScript(()=>sessionStorage.setItem('nexusPreviewPayment',JSON.stringify({reference:'RETURN-1',paymentStatus:'PAID_IN_FULL'})));
  await prepareRide(page);
  let bookings=0;
  await page.route('**/api/bookings',route=>{
    bookings++;
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({booking:{reference:'RETURN-1',estimatedFare:100},requiresOnlinePayment:true,persisted:true})});
  });
  await page.route('**/api/bookings/RETURN-1?**',route=>{
    expect(new URL(route.request().url()).searchParams.get('phone')).toContain('555');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({booking:{reference:'RETURN-1',estimatedFare:100,paymentStatus:scenario.status,status:'pending-payment'}})});
  });
  await page.route('**/api/payments/stripe/checkout',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:`http://127.0.0.1:4173/booking-app.html?payment=${scenario.result}&bookingReference=RETURN-1`})}));
  await page.locator('#continueRideBtn').click();
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSummary')).toContainText('RETURN-1');
  await page.locator('#payDepositBtn').click();
  await expect(page).toHaveURL(/bookingReference=RETURN-1/);
  await expect(page.locator('#paymentSection')).toBeVisible();
  await expect(page.locator('#paymentStatusMsg')).toContainText(scenario.message);
  if(scenario.canPay)await expect(page.locator('#payDepositBtn')).toBeEnabled();
  else await expect(page.locator('#payDepositBtn')).toBeHidden();
  expect(bookings).toBe(1);
});
