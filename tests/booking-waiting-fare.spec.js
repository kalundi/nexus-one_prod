const { test, expect } = require('@playwright/test');

for (const scenario of [
  { name: 'no waiting', minutes: 0, charge: 0, total: '103.00' },
  { name: 'free allowance', minutes: 120, charge: 0, total: '103.00' },
  { name: 'started 15 minute block', minutes: 121, charge: 20, total: '123.60' },
  { name: 'two waiting blocks', minutes: 150, charge: 40, total: '144.20' },
  { name: 'round trip adds waiting once before savings', minutes: 150, charge: 40, roundTrip: true, total: '234.84' },
  { name: 'multi-stop waiting is included', minutes: 0, stopMinutes: 180, charge: 80, total: '185.40' },
  { name: 'additional and stop waits share one allowance', minutes: 30, stopMinutes: 120, charge: 40, total: '144.20' },
  { name: 'service-specific free waiting overrides shared allowance', minutes: 45, freeMinutes: 30, charge: 20, total: '123.60' },
  { name: 'zero service allowance bills waiting immediately', minutes: 15, freeMinutes: 0, charge: 20, total: '123.60' },
  { name: 'changing waiting time refreshes fare and service choice', initialMinutes: 0, minutes: 150, charge: 40, total: '144.20' }
]) test(scenario.name, async ({ page }) => {
  let submitted;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/integrations/config' ? { stripeEnabled: true, googleMapsEnabled: false }
      : path === '/api/settings/public' ? {
        pricing: { wheelchair: { base: 100, includedMiles: 99999, perMile: 0, waitPer15: 20 } },
        fareRules: { freeWaitMinutes: 120, minimumFare: 0, fuelSurchargePerMile: 0, returnMilesInclusionPct: 0,
          servicePolicies: { wheelchair: { freeWaitMinutes: scenario.freeMinutes ?? null } } }
      } : path === '/api/locations/search' ? { locations: [{ lat: 39, lng: -76 }] }
      : path === '/api/bookings' ? (() => {
        submitted = route.request().postDataJSON();
        return { booking: { reference: 'WAIT-1', estimatedFare: submitted.estimatedFare }, requiresOnlinePayment: true, persisted: true };
      })() : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/booking-app.html');
  await page.locator('#name').fill('Waiting Fare Test');
  await page.locator('#phone').fill('(240) 555-0148');
  await page.locator('#confirmRiderBtn').click();
  if (scenario.stopMinutes) {
    await page.locator('#multipleStopsToggle').check();
    await page.locator('#stopWaitMinutes-1').selectOption(String(scenario.stopMinutes));
    await page.locator('#appointmentTime-2').fill('17:00');
    await page.locator('[data-route-stop="true"]').fill('300 Clinic Road, Bethesda, MD');
  }
  if (scenario.roundTrip) {
    await page.locator('#tripType').selectOption('ROUND_TRIP');
    await page.locator('#returnTripDate').fill('2030-08-15');
    await page.locator('#returnTripTime').fill('16:00');
  }
  await page.locator('#waitMinutes').fill(String(scenario.initialMinutes ?? scenario.minutes));
  await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
  await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
  await page.locator('#tripDate').fill('2030-08-15');
  await page.locator('#appointmentTime').fill('10:30');
  await page.locator('#confirmPickupDropoffBtn').click();
  await page.locator('[data-service="wheelchair"]').click();
  if (scenario.initialMinutes != null) {
    await page.locator('#waitMinutes').evaluate((input, minutes) => {
      input.value = String(minutes);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, scenario.minutes);
  }
  await expect(page.locator('#estFare')).toHaveText(`$${scenario.total}`);
  await expect(page.locator('[data-service="wheelchair"] .serviceCardFare')).toHaveText(`$${scenario.total}`);
  if (scenario.minutes || scenario.stopMinutes) {
    await expect(page.locator('#estWaitCharge')).toHaveText(`$${scenario.charge.toFixed(2)}`);
  } else await expect(page.locator('#estWaitRow')).toBeHidden();
  await page.locator('#continueRideBtn').click();
  await expect(page.locator('#fareConfirmAmount')).toHaveText(`$${scenario.total}`);
  if (scenario.minutes || scenario.stopMinutes) await expect(page.locator('#fareConfirmWaiting')).toContainText(`$${scenario.charge.toFixed(2)}`);
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSummary')).toContainText('WAIT-1');
  expect(submitted.waitMinutes).toBe(scenario.minutes);
  expect(submitted.waitingCharge).toBe(scenario.charge);
  if (scenario.stopMinutes) expect(submitted.stopWaitMinutes).toEqual([scenario.stopMinutes]);
  expect(submitted.estimatedFare).toBeCloseTo(Number(scenario.total), 2);
  await expect(page.locator('#fullAmountLabel')).toHaveText(`$${scenario.total}`);
  await expect(page.locator('#depositAmountLabel')).toHaveText(`$${(Number(scenario.total) * .25).toFixed(2)}`);
});
