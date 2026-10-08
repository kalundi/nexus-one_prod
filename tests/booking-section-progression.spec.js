const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`sections reach payment when Google Maps never loads: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://maps.googleapis.com/**', () => {});
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const body = path === '/api/integrations/config'
        ? { stripeEnabled: true, googleMapsEnabled: true, googleMapsBrowserKey: 'test-key' }
        : path === '/api/locations/search' ? { locations: [{ lat: 39.0458, lng: -76.6413 }] }
        : path === '/api/bookings' ? {
          booking: { reference: 'PROGRESSION-1', estimatedFare: 100 },
          requiresOnlinePayment: true, depositRequired: true, persisted: true
        } : {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/booking-app.html?liveMap=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#confirmRiderBtn')).toBeEnabled({ timeout: 3000 });
    await page.locator('#name').fill('Section Progression Test');
    await page.locator('#phone').fill('(240) 555-0148');
    await page.locator('#confirmRiderBtn').click();
    await expect(page.locator('#pickup')).toBeVisible();
    await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
    await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
    await page.locator('#tripDate').fill('2030-08-15');
    await page.locator('#appointmentTime').fill('10:30');
    await page.locator('#confirmPickupDropoffBtn').click();
    await expect(page.locator('[data-service="wheelchair"]')).toBeVisible();
    await page.locator('[data-service="wheelchair"]').click();
    await page.locator('#continueRideBtn').click();
    await expect(page.locator('#fareConfirmDialog')).toBeVisible({ timeout: 15000 });
    await page.locator('#fareConfirmAccept').click();
    await expect(page.locator('#paymentSection')).toBeVisible();
    await expect(page.locator('#paymentSummary')).toContainText('PROGRESSION-1');
    await expect(page.locator('#payDepositBtn')).toBeEnabled();
    await expect(page.locator('#payFullBtn')).toBeEnabled();
    expect(errors).toEqual([]);
  });
}
