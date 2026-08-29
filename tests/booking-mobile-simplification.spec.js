const { test, expect } = require('@playwright/test');

test('mobile booking schedule does not overlap and optional choices stay compact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(()=>Boolean(window.NexusBookingApp));
  await page.locator('#pickupDropoffSection').evaluate((section) => {
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
    const ride = document.querySelector('#rideTypeSection');
    ride.classList.add('unlocked', 'currentBookingCard');
    section.classList.remove('progressiveHidden', 'collapsed', 'sectionCollapsed');
  });

  const dateBox = await page.locator('#tripDate').boundingBox();
  const timeBox = await page.locator('#appointmentTime').boundingBox();
  expect(dateBox).not.toBeNull();
  expect(timeBox).not.toBeNull();
  expect(timeBox.y).toBeGreaterThanOrEqual(dateBox.y + dateBox.height);
  expect(dateBox.x + dateBox.width).toBeLessThanOrEqual(390);
  expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(390);

  await expect(page.locator('.accessibilityBar')).not.toHaveAttribute('open', '');
  await expect(page.locator('.secondaryRideOption')).toHaveCount(6);
  await expect(page.locator('.secondaryRideOption').first()).toBeHidden();
  await page.locator('#toggleMoreRideOptions').click();
  await expect(page.locator('[data-service="bls"]')).toBeVisible();
  await expect(page.locator('#toggleMoreRideOptions')).toHaveAttribute('aria-expanded', 'true');
});

test('booking schedule expands into columns when a wider webview has room', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(()=>Boolean(window.NexusBookingApp));
  await page.locator('#pickupDropoffSection').evaluate((section) => {
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
    section.classList.remove('progressiveHidden', 'collapsed', 'sectionCollapsed');
  });

  const dateBox = await page.locator('#tripDate').boundingBox();
  const timeBox = await page.locator('#appointmentTime').boundingBox();
  expect(dateBox).not.toBeNull();
  expect(timeBox).not.toBeNull();
  expect(Math.abs(timeBox.y - dateBox.y)).toBeLessThanOrEqual(8);
  expect(dateBox.width).toBeGreaterThan(180);
  expect(timeBox.width).toBeGreaterThan(180);
});

test('mobile booking confirms the fare before opening payment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/bookings',async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({booking:{reference:'BK-WHEELCHAIR-1',estimatedFare:293.70,status:'PENDING_PAYMENT'},clientMessage:'Booking created successfully.',persisted:true,requiresOnlinePayment:true,depositRequired:true})}));
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });

  const riderCard = page.locator('#riderDetailsSection');
  const routeCard = page.locator('#pickupDropoffSection');
  await expect(riderCard).toBeVisible();
  await expect(routeCard).toBeHidden();
  await expect(page.locator('#bookingLoginSection')).toBeVisible();
  await expect(page.locator('#bookingLoginSection #authActionBtn')).toHaveCount(1);
  await expect(page.locator('.bottomBar #authActionBtn')).toHaveCount(0);
  await expect(page.locator('#rideTypeSection')).toBeHidden();
  const initialBox = await riderCard.boundingBox();
  expect(initialBox.height).toBeGreaterThanOrEqual(620);
  expect(initialBox.width).toBeLessThanOrEqual(390);

  await page.locator('#name').fill('Jamie Patient');
  await page.locator('#phone').fill('(240) 555-0101');
  await page.locator('#confirmRiderBtn').click();
  await expect(routeCard).toBeVisible();
  await expect(riderCard).toBeHidden();
  await page.locator('#pickup').fill('100 Main Street');
  await page.locator('#destination').fill('200 Medical Center Drive');
  await page.locator('#tripDate').fill('2030-08-15');
  await page.locator('#appointmentTime').fill('10:30');
  await page.locator('#confirmPickupDropoffBtn').click();
  await expect(page.locator('#confirmPickupDropoffBtn')).toHaveText('Confirm Details', { timeout:30000 });
  await expect(page.locator('#rideTypeSection')).toBeVisible({ timeout:30000 });
  await expect(page.locator('#serviceChips')).toHaveClass(/rideMarketplace/);
  await expect(page.locator('#continueRideBtn')).toHaveText('Book My Ride');
  await expect(page.locator('#continueRideBtn')).toHaveCSS('position','sticky');
  await expect(page.locator('#mobilityQuestions')).toBeHidden();
  await expect(page.locator('#rideTypeSection .estimate')).toBeHidden();
  await page.locator('[data-service="wheelchair"]').click();
  await expect(page.locator('#continueRideBtn')).toHaveText('Book My Ride');
  await expect(page.locator('#continueRideBtn')).toHaveAttribute('aria-label','Book My Ride: Wheelchair');
  await page.locator('#continueRideBtn').click();
  await expect(page.locator('#fareConfirmDialog')).toBeVisible({timeout:15000});
  await expect(page.locator('.journeyStep').nth(3)).toHaveClass(/current/);
  await page.locator('#fareConfirmAccept').click();
  await expect(page.locator('#paymentSection')).toBeVisible({timeout:15000});
  await expect(page.locator('#paymentSummary')).toContainText('BK-WHEELCHAIR-1');
  await expect(page.locator('#fareSummarySection')).toBeHidden();
  await expect(page.locator('#fareConfirmDialog')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/bookingPaymentMapView/);
  await expect(page.locator('#paymentSection .paymentActions')).toBeVisible();
});

test('Uber ride card keeps the legacy mobility questionnaire hidden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#rideTypeSection').evaluate((section) => {
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
  });

  await expect(page.locator('#mobilityQuestions')).toBeHidden();
  await page.locator('[data-service="wheelchair"]').click();
  await expect(page.locator('#service')).toHaveValue('wheelchair');
  await expect(page.locator('.bookingHelpCall')).toBeVisible();
  await expect(page.locator('.bookingHelpCall')).toHaveAttribute('href', 'tel:+18886395766');
});

test('review card uses plain language and the patient-entered details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#fareSummarySection').evaluate((section) => {
    const values = { name:'Jamie Patient', pickup:'100 Main Street', destination:'200 Medical Center Drive', tripDate:'2030-08-15', appointmentTime:'10:30' };
    Object.entries(values).forEach(([id, value]) => {
      const field = document.getElementById(id);
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles:true }));
    });
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
  });

  await expect(page.locator('#fareSummarySection')).toBeVisible();
  await expect(page.locator('#reviewRider')).toHaveText('Jamie Patient');
  await expect(page.locator('#reviewRoute')).toContainText('100 Main Street');
  await expect(page.locator('#reviewSchedule')).toContainText('2030-08-15 at 10:30');
  await expect(page.locator('#reviewService')).not.toHaveText('-');
});

test('active Book My Ride state shows only the three patient decision cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.locator('body').evaluate(body => {
    body.classList.add('bookingFinalView', 'bookingReadyView');
    body.classList.remove('showCompletedSections');
    ['bookingLoginSection','riderDetailsSection','pickupDropoffSection','rideTypeSection','rateSettingsSection'].forEach(id => document.getElementById(id)?.classList.add('sectionHiddenInFinal'));
    ['telemetrySection','fareSummarySection'].forEach(id => document.getElementById(id)?.classList.add('unlocked'));
    document.getElementById('distanceEtaSection').hidden = false;
    document.getElementById('completedSectionsToggleWrap').hidden = false;
    document.getElementById('toggleCompletedSectionsBtn').textContent = 'Make changes';
    document.getElementById('submitBtn').disabled = false;
  });

  await expect(page.locator('#submitBtn')).toBeEnabled();
  await expect(page.locator('#telemetryMap')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Distance & ETA' })).toBeVisible();
  await expect(page.locator('#fareSummarySection')).toBeVisible();
  await expect(page.locator('#reviewFareBtn')).toBeVisible();
  await expect(page.locator('#riderDetailsSection')).toBeHidden();
  await expect(page.locator('#pickupDropoffSection')).toBeHidden();
  await expect(page.locator('#rideTypeSection')).toBeHidden();
  await expect(page.locator('#toggleCompletedSectionsBtn')).toHaveText('Make changes');

  await page.locator('body').evaluate(body => {
    body.classList.add('showCompletedSections');
    document.getElementById('toggleCompletedSectionsBtn').textContent = 'Hide changes';
    const rider = document.getElementById('riderDetailsSection');
    rider.classList.remove('sectionHiddenInFinal');
    rider.classList.add('unlocked', 'currentBookingCard');
  });
  await expect(page.locator('#riderDetailsSection')).toBeVisible();
  await expect(page.locator('#toggleCompletedSectionsBtn')).toHaveText('Hide changes');
});
