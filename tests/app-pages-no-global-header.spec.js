const { test, expect } = require('@playwright/test');

// A faithful copy of the live GET /api/settings/public payload. The booking
// app's init aborts (leaving the rider button disabled) unless this endpoint
// returns real pricing + fareRules, so the flow test below serves the real
// shape instead of an empty object.
const SETTINGS_PUBLIC = {"pricing":{"wheelchair":{"label":"Wheelchair Transportation","base":98,"includedMiles":8,"perMile":4.1,"waitPer15":12},"ambulatory":{"label":"Ambulatory Transportation","base":75,"includedMiles":5,"perMile":3.55,"waitPer15":12},"facility_transfer":{"label":"Facility-to-Facility Transfer (Routine IFT)","base":165,"includedMiles":8,"perMile":5.25,"waitPer15":35},"facility_transfer_critical":{"label":"Facility-to-Facility Transfer (High-Acuity IFT)","base":340,"includedMiles":8,"perMile":8.75,"waitPer15":50},"broda":{"label":"Broda Chair Transportation","base":165,"includedMiles":8,"perMile":5.5,"waitPer15":18},"stretcher":{"label":"Stretcher Transportation","base":455,"includedMiles":15,"perMile":7.95,"waitPer15":24},"bariatric":{"label":"Bariatric Transportation","base":430,"includedMiles":8,"perMile":9.95,"waitPer15":30},"bls":{"label":"BLS Ambulance","base":1125,"includedMiles":0,"perMile":18.5,"waitPer15":35},"als1":{"label":"ALS I Ambulance","base":1395,"includedMiles":0,"perMile":21.5,"waitPer15":40},"als2":{"label":"ALS II Ambulance","base":1450,"includedMiles":0,"perMile":24.5,"waitPer15":45}},"fareRules":{"minimumFare":0,"fuelSurchargePerMile":0.21,"vehicleFuelRatesPerMile":{"ambulance":0.7052,"bus":0.5595,"land_rover":0.2842,"gasoline_sedan":0.1399,"hybrid_sedan":0.0933,"electric_public":0.18,"electric_home":0.0642,"electric_depot":0.0525},"ambulatoryFuelProfile":"land_rover","vehicleFuelProfiles":{},"fuelPricingMode":"AUTO","fuelIndexSource":"EIA","fuelIndexSeriesId":"PET.EMM_EPM0_PTE_SUS_DPG.W","fuelIndexPricePerGallon":4.405,"fuelBaselinePricePerGallon":3.1,"fuelEfficiencyMpg":8.5,"fuelOperationalBufferPct":35,"tollCostPerTrip":0,"maintenanceCostPerMile":0,"insuranceCostPerTrip":0,"dispatchOverheadPerTrip":0,"cleaningCostPerTrip":0,"complianceCostPerTrip":0,"otherVariableCostPerTrip":0,"fuelLastUpdatedAt":"2026-11-02T06:01:24.928Z","afterHoursSurchargePct":0,"weekendSurchargePct":30,"holidaySurchargePct":30,"cancellationFee":50,"cancellationWindowHours":24,"cancellationLeadHours":72,"noShowFee":50,"freeWaitMinutes":15,"waitingPolicyVersion":2,"serviceTravelPolicyVersion":4,"serviceSpeedModel":"CRUISING_CEILING","cruisingReferenceSpeedMph":65,"minimumPlanningSpeedMph":5,"smartTiming":{"enabled":true,"checkInLeadMinutes":15,"reliabilityBufferMinutes":5,"minimumHistorySamples":10,"historyPercentile":85},"deadheadRatePct":50,"shortNoticeHours":24,"shortNoticeSurchargePct":30,"cardProcessingFeePct":3,"mileageRoundingRule":"TENTH_MILE","telemetryRefreshSeconds":20,"maxBookingDistanceMiles":500,"returnMilesThreshold":10,"returnMilesInclusionPct":100,"trafficOverageFeePerHour":45,"trafficOverageGraceMinutes":0,"servicePolicies":{"wheelchair":{"freeWaitMinutes":15,"speedReductionMph":10,"transitionBufferMinutes":15,"pickupPreparationMinutes":30,"dropoffHandoffMinutes":20,"cancellationFee":40,"noShowFee":60,"trafficOverageFeePerHour":25,"returnMilesInclusionPct":100,"afterHoursSurchargePct":25,"weekendSurchargePct":30,"holidaySurchargePct":30},"ambulatory":{"freeWaitMinutes":15,"speedReductionMph":0,"transitionBufferMinutes":10,"pickupPreparationMinutes":10,"dropoffHandoffMinutes":10,"cancellationFee":35,"noShowFee":50,"trafficOverageFeePerHour":20,"returnMilesInclusionPct":100,"afterHoursSurchargePct":20,"weekendSurchargePct":30,"holidaySurchargePct":30},"facility_transfer":{"freeWaitMinutes":15,"speedReductionMph":0,"transitionBufferMinutes":10,"pickupPreparationMinutes":30,"dropoffHandoffMinutes":20,"cancellationFee":85,"noShowFee":115,"trafficOverageFeePerHour":42,"returnMilesInclusionPct":100,"afterHoursSurchargePct":5,"weekendSurchargePct":30,"holidaySurchargePct":30},"facility_transfer_critical":{"freeWaitMinutes":15,"speedReductionMph":25,"transitionBufferMinutes":10,"pickupPreparationMinutes":45,"dropoffHandoffMinutes":35,"cancellationFee":180,"noShowFee":240,"trafficOverageFeePerHour":75,"returnMilesInclusionPct":100,"afterHoursSurchargePct":8,"weekendSurchargePct":30,"holidaySurchargePct":30},"broda":{"freeWaitMinutes":15,"speedReductionMph":0,"transitionBufferMinutes":10,"pickupPreparationMinutes":35,"dropoffHandoffMinutes":25,"cancellationFee":75,"noShowFee":95,"trafficOverageFeePerHour":35,"returnMilesInclusionPct":100,"afterHoursSurchargePct":25,"weekendSurchargePct":30,"holidaySurchargePct":30},"stretcher":{"freeWaitMinutes":15,"speedReductionMph":20,"transitionBufferMinutes":25,"pickupPreparationMinutes":40,"dropoffHandoffMinutes":30,"cancellationFee":120,"noShowFee":150,"trafficOverageFeePerHour":50,"returnMilesInclusionPct":100,"afterHoursSurchargePct":30,"weekendSurchargePct":30,"holidaySurchargePct":30},"bariatric":{"freeWaitMinutes":15,"speedReductionMph":35,"transitionBufferMinutes":25,"pickupPreparationMinutes":45,"dropoffHandoffMinutes":35,"cancellationFee":160,"noShowFee":200,"trafficOverageFeePerHour":65,"returnMilesInclusionPct":100,"afterHoursSurchargePct":30,"weekendSurchargePct":30,"holidaySurchargePct":30},"bls":{"freeWaitMinutes":15,"speedReductionMph":25,"transitionBufferMinutes":10,"pickupPreparationMinutes":45,"dropoffHandoffMinutes":35,"cancellationFee":200,"noShowFee":260,"trafficOverageFeePerHour":85,"returnMilesInclusionPct":100,"afterHoursSurchargePct":30,"weekendSurchargePct":30,"holidaySurchargePct":30},"als1":{"freeWaitMinutes":15,"speedReductionMph":25,"transitionBufferMinutes":10,"pickupPreparationMinutes":45,"dropoffHandoffMinutes":35,"cancellationFee":250,"noShowFee":325,"trafficOverageFeePerHour":95,"returnMilesInclusionPct":100,"afterHoursSurchargePct":30,"weekendSurchargePct":30,"holidaySurchargePct":30},"als2":{"freeWaitMinutes":15,"speedReductionMph":25,"transitionBufferMinutes":10,"pickupPreparationMinutes":45,"dropoffHandoffMinutes":35,"cancellationFee":300,"noShowFee":390,"trafficOverageFeePerHour":110,"returnMilesInclusionPct":100,"afterHoursSurchargePct":30,"weekendSurchargePct":30,"holidaySurchargePct":30}}},"activeServices":["AMBULANCE","WHEELCHAIR","STRETCHER","HOSPITAL_DISCHARGE","FACILITY_TRANSFER","FACILITY_TRANSFER_CRITICAL"],"organization":{"name":"Nexus Medical Transit","phone":"(888) 760-4990","email":"contact@nexusmt.com","website":"https://nexusmt.com","yardAddress":"22505 Gateway Center Dr, Clarksburg MD 20871","preTripInspectionMinutes":45}};

// Anthony's direction, 2026-11-02: the booking app, the patient app and the
// driver app must NOT carry the global site nav bar (the
// .nexusShellGlobalHeader shell with its "Primary navigation" links). Each
// app keeps only its own chrome. Every other page keeps the unified site
// header it has today.

// Satisfies auth-guard.js for guarded app pages (the driver app): a stored
// token plus a /api/auth/me payload carrying an allowed role. A single route
// handler is used so the auth response cannot fall through to the network.
async function mockAppAuth(page, role) {
  await page.addInitScript(() => { sessionStorage.setItem('nexusAccessToken', 'app-pages-test-token'); });
  await page.route('**/api/**', route => {
    const url = route.request().url();
    if (url.includes('/api/auth/me')) {
      // auth-guard.js requires a facility scope for FACILITY accounts.
      const user = { id: 7, role, displayName: 'App Pages Test', ...(role === 'FACILITY' ? { scopeId: 'NS049' } : {}) };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, trips: [], bookings: [], vehicles: [], users: [], requests: [], assignments: [] }) });
  });
}

const APP_PAGES = [
  {
    path: '/booking-app.html',
    chrome: 'header.top',
    chromeClass: 'top',
    extraChrome: ['#journeyHeader', 'nav.appTabBar[aria-label="Booking app navigation"]'],
    firstFlow: 'header.top',
    offsetMode: 'viewport'
  },
  {
    path: '/patient.html',
    chrome: 'header.topBar',
    chromeClass: 'topBar',
    extraChrome: ['nav.bottomNav[aria-label="Patient quick info"]'],
    firstFlow: '#loginView',
    offsetMode: 'viewport'
  },
  {
    // The driver app sits inside a phone frame with its own top margin, so
    // its offset is measured against the frame, not the viewport.
    path: '/driver-app.html',
    chrome: 'header.topBar',
    chromeClass: 'topBar',
    extraChrome: ['nav.bottomNav[aria-label="Driver navigation"]'],
    firstFlow: 'header.topBar',
    frame: 'div.phone',
    offsetMode: 'frame',
    auth: 'DRIVER'
  }
];

for (const app of APP_PAGES) {
  test(`${app.path} has no global shell nav bar and keeps its own chrome`, async ({ page }) => {
    if (app.auth) await mockAppAuth(page, app.auth);
    await page.goto(app.path, { waitUntil: 'domcontentloaded' });
    if (app.auth) {
      await page.waitForFunction(() => document.documentElement.dataset.authState === 'authorized');
      await expect(page).toHaveURL(new RegExp(app.path.replace(/[./]/g, '\\$&') + '$'));
    }
    await expect(page.locator('.nexusShellGlobalHeader')).toHaveCount(0);
    await expect(page.locator('.nexusShellLinks')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Primary navigation"]')).toHaveCount(0);
    await expect(page.locator(app.chrome)).toHaveCount(1);
    for (const selector of app.extraChrome) {
      await expect(page.locator(selector)).toHaveCount(1);
    }
    const firstHeaderClass = await page.evaluate(() => {
      const header = document.querySelector('header');
      return header ? header.className : null;
    });
    expect(firstHeaderClass).toContain(app.chromeClass);
  });

  test(`${app.path} starts at the very top on a phone-width screen (no leftover offset)`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (app.auth) await mockAppAuth(page, app.auth);
    await page.goto(app.path, { waitUntil: 'domcontentloaded' });
    if (app.auth) {
      await page.waitForFunction(() => document.documentElement.dataset.authState === 'authorized');
    }
    await expect(page.locator('.nexusShellGlobalHeader')).toHaveCount(0);
    const geometry = await page.evaluate(({ elSel, frameSel }) => {
      const el = document.querySelector(elSel);
      const frame = frameSel ? document.querySelector(frameSel) : null;
      return {
        bodyPaddingTop: getComputedStyle(document.body).paddingTop,
        top: el ? el.getBoundingClientRect().top : null,
        frameTop: frame ? frame.getBoundingClientRect().top : 0
      };
    }, { elSel: app.firstFlow, frameSel: app.frame || null });
    expect(geometry.bodyPaddingTop).toBe('0px');
    expect(geometry.top).not.toBeNull();
    // Viewport mode: the app chrome starts within a few px of the screen top.
    // Frame mode: the app chrome is flush with the top of its phone frame.
    const limit = app.offsetMode === 'frame' ? 1 : 24;
    expect(Math.round(geometry.top - geometry.frameTop)).toBeLessThanOrEqual(limit);
  });
}

test('booking app progress bar advances and the form completes to the payment summary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', route => {
    const url = route.request().url();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      url.includes('/settings/public') ? SETTINGS_PUBLIC :
      url.includes('/integrations/config') ? { stripeEnabled: true, googleMapsEnabled: false } :
      url.includes('/locations/search') ? { locations: [{ lat: 39.0458, lng: -76.6413 }] } :
      url.includes('/fleet/live') ? { vehicles: [] } : {}
    ) });
  });
  await page.goto('/booking-app.html');
  await expect(page.locator('.nexusShellGlobalHeader')).toHaveCount(0);
  const progress = page.locator('#journeyHeader');
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await page.locator('#firstName').fill('NoNav');
  await page.locator('#lastName').fill('Test');
  await page.locator('#phone').fill('(240) 555-0148');
  await page.locator('#email').fill('nonav.test@example.com');
  await page.locator('#serviceTypeSelect').selectOption('ambulatory');
  await page.locator('#confirmRiderBtn').click();
  await page.locator('#pickup').fill('100 Main Street, Rockville, MD');
  await page.locator('#destination').fill('200 Medical Center Drive, Bethesda, MD');
  await page.locator('#tripDate').fill('2030-08-15');
  await page.locator('#appointmentTime').fill('10:30');
  await page.locator('#confirmPickupDropoffBtn').click();
  const afterTrip = Number(await progress.getAttribute('aria-valuenow'));
  expect(afterTrip).toBeGreaterThan(1);
  await page.locator('[data-service="wheelchair"]').click();
  await page.route('**/api/bookings', route => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ booking: { reference: 'NONAV-1', estimatedFare: 100 }, requiresOnlinePayment: true, persisted: true })
  }));
  await page.locator('#continueRideBtn').click();
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSummary')).toContainText('NONAV-1');
});

test('facility portal (back office) keeps its unified site header', async ({ page }) => {
  // Spot-check that a non-app page is untouched: the facility portal renders
  // its unified header (header.top.globalTop) exactly as before and never
  // carried the app shell bar. (The homepage itself is a React app whose
  // bundle does not load in this local harness — a pre-existing asset-case
  // issue — so the facility portal stands in as the back-office check; this
  // change edits no shared file, so other pages' headers cannot move.)
  await mockAppAuth(page, 'FACILITY');
  await page.goto('/facility.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.authState === 'authorized');
  await expect(page.locator('header.top.globalTop')).toHaveCount(1);
  await expect(page.locator('.nexusShellGlobalHeader')).toHaveCount(0);
});

test('livecare keeps its unified site header', async ({ page }) => {
  await page.goto('/livecare.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('header.top.globalTop')).toHaveCount(1);
  await expect(page.locator('header.top.globalTop nav a').first()).toBeAttached();
  await expect(page.locator('.nexusShellGlobalHeader')).toHaveCount(0);
});
