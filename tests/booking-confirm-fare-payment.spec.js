const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  for (const outcome of ['payment', 'invoice', 'error']) {
    test(`Confirm Fare opens payment while saving: ${width}px, ${outcome}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/api/**', route => {
        const url = route.request().url();
        const body = url.includes('/integrations/config')
          ? { stripeEnabled:true, squareEnabled:false, googleMapsEnabled:false }
          : url.includes('/locations/search') ? { locations:[{lat:39.0458,lng:-76.6413}] }
          : url.includes('/fleet/live') ? { vehicles:[] } : {};
        return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
      });
      let releaseBooking;
      const ready = new Promise(resolve => { releaseBooking = resolve; });
      let submissions = 0;
      await page.route('**/api/bookings', async route => {
        submissions++;
        await ready;
        await route.fulfill({ status:outcome === 'error' ? 500 : 201, contentType:'application/json', body:JSON.stringify(
          outcome === 'error' ? { error:'Please try your booking again.' } : {
            booking:{reference:'TEST-2048',estimatedFare:309.41}, persisted:true,
            requiresOnlinePayment:outcome === 'payment', depositRequired:outcome === 'payment'
          }
        ) });
      });
      await page.goto('/booking-app.html', {waitUntil:'domcontentloaded'});
      await page.locator('#name').fill('Jordan Sample');
      await page.locator('#phone').fill('(240) 555-0148');
      await page.locator('#confirmRiderBtn').click();
      await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
      await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
      await page.locator('#tripDate').fill('2030-08-15');
      await page.locator('#appointmentTime').fill('10:30');
      await page.locator('#confirmPickupDropoffBtn').click();
      await page.locator('[data-service="wheelchair"]').click();
      await page.locator('#continueRideBtn').click();
      await page.locator('#fareConfirmAccept').click();
      await expect(page.locator('#paymentSection')).toBeVisible();
      await expect(page.locator('#payDepositBtn')).toBeVisible();
      await expect(page.locator('#payFullBtn')).toBeVisible();
      await expect(page.locator('#payDepositBtn')).toBeDisabled();
      await expect(page.locator('#payFullBtn')).toBeDisabled();
      await expect(page.locator('#paymentStatusMsg')).toContainText('Creating your booking');
      await expect(page.locator('body')).toHaveClass(/bookingPaymentMapView/);
      await page.locator('#paymentSheetHandle').click();
      await expect(page.locator('#payDepositBtn')).toBeHidden();
      releaseBooking();
      if (outcome === 'payment') {
        await expect(page.locator('#paymentSummary')).toContainText('TEST-2048');
        await expect(page.locator('#payDepositBtn')).toBeVisible();
        await expect(page.locator('#payDepositBtn')).toBeEnabled();
        await expect(page.locator('#payFullBtn')).toBeEnabled();
        await expect(page.locator('#depositAmountLabel')).toHaveText('$77.35');
        await expect(page.locator('#fullAmountLabel')).toHaveText('$309.41');
      } else {
        await expect(page.locator('#paymentSection')).toBeHidden();
        await expect(page.locator('body')).not.toHaveClass(/bookingPaymentMapView/);
        if (outcome === 'error') await expect(page.locator('#statusMsg')).toContainText('Please try your booking again.');
      }
      expect(submissions).toBe(1);
    });
  }
}
