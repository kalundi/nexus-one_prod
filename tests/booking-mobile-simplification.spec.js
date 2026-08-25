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
  await page.locator('#toggleMoreRideOptions').click();
  await expect(page.locator('[data-service="bls"]')).toBeVisible();
  await expect(page.locator('#toggleMoreRideOptions')).toHaveAttribute('aria-expanded', 'true');
});

test('booking schedule remains stacked in wider mobile webviews', async ({ page }) => {
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
  expect(timeBox.y).toBeGreaterThanOrEqual(dateBox.y + dateBox.height);
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
