const { test, expect } = require('@playwright/test');

test('mobile booking schedule does not overlap and optional choices stay compact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#rideTypeSection').evaluate((section) => {
    section.hidden = false;
    section.classList.add('unlocked', 'currentBookingCard');
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
  await page.locator('#serviceCatalogDetails summary').click();
  await page.locator('#toggleMoreRideOptions').click();
  await expect(page.locator('[data-service="bls"]')).toBeVisible();
  await expect(page.locator('#toggleMoreRideOptions')).toHaveAttribute('aria-expanded', 'true');
});

test('booking schedule expands into columns when a wider webview has room', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#rideTypeSection').evaluate((section) => {
    section.hidden = false;
    section.classList.add('unlocked', 'currentBookingCard');
    section.classList.remove('progressiveHidden', 'collapsed', 'sectionCollapsed');
  });

  const dateBox = await page.locator('#tripDate').boundingBox();
  const timeBox = await page.locator('#appointmentTime').boundingBox();
  expect(dateBox).not.toBeNull();
  expect(timeBox).not.toBeNull();
  expect(Math.abs(timeBox.y - dateBox.y)).toBeLessThanOrEqual(2);
  expect(dateBox.width).toBeGreaterThan(180);
  expect(timeBox.width).toBeGreaterThan(180);
});

test('mobile booking opens one screen-filling patient card at a time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });

  const riderCard = page.locator('#riderDetailsSection');
  await expect(riderCard).toBeVisible();
  await expect(page.locator('#bookingLoginSection')).toBeHidden();
  await expect(page.locator('#pickupDropoffSection')).toBeHidden();
  await expect(page.locator('#rideTypeSection')).toBeHidden();
  const initialBox = await riderCard.boundingBox();
  expect(initialBox.height).toBeGreaterThanOrEqual(620);
  expect(initialBox.width).toBeLessThanOrEqual(390);

  await page.locator('#name').fill('Mobile Patient');
  await page.locator('#phone').fill('(240) 555-0101');
  await page.locator('#confirmRiderBtn').click();

  await expect(page.locator('#pickupDropoffSection')).toBeVisible();
  await expect(riderCard).toBeHidden();
  await expect(page.locator('#rideTypeSection')).toBeHidden();
  const routeBox = await page.locator('#pickupDropoffSection').boundingBox();
  expect(routeBox.height).toBeGreaterThanOrEqual(620);
});

test('patient answers plain-language mobility questions instead of choosing industry codes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#rideTypeSection').evaluate((section) => {
    document.querySelectorAll('.currentBookingCard').forEach((card) => card.classList.remove('currentBookingCard'));
    section.classList.add('unlocked', 'currentBookingCard');
  });

  await expect(page.locator('#mobilityQuestions')).toBeVisible();
  await expect(page.locator('#serviceCatalogDetails')).not.toHaveAttribute('open', '');
  await page.locator('input[name="quickWheelchair"][value="yes"]').check();
  await expect(page.locator('#service')).toHaveValue('wheelchair');
  await expect(page.locator('#mobilityRecommendation')).toContainText('Wheelchair');
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
