const { test, expect } = require('@playwright/test');

test('dispatch page exposes a broker call-in intake form', async ({ page }) => {
  let brokerRequestCalled = false;

  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 1, role: 'DISPATCHER', displayName: 'Test Dispatcher' } })
    });
  });

  await page.route('**/api/portal/trips', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ trips: [] })
    });
  });

  await page.route('**/api/broker-requests', async route => {
    brokerRequestCalled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clientMessage: 'Broker request received', request: { id: 42 } })
    });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('nexusAccessToken', 'test-token');
  });

  await page.goto('/dispatch.html');
  await page.waitForSelector('#brokerIntakeForm');

  await page.fill('#brokerName', 'Test Broker');
  await page.fill('#brokerPickup', '123 Main St');
  await page.fill('#brokerDestination', '456 Oak Ave');
  await page.fill('#brokerTripDate', '2026-08-02');
  await page.fill('#brokerTripTime', '14:30');
  await page.selectOption('#brokerService', 'facility_transfer');
  await page.fill('#brokerQuotedRate', '85');
  await page.fill('#brokerCalculatedRate', '80');
  await page.fill('#brokerSubmitterEmail', 'dispatcher@example.com');

  await page.click('#submitBrokerRequest');

  await expect(page.locator('#brokerIntakeMessage')).toContainText('Broker request received');
  expect(brokerRequestCalled).toBe(true);
});

test('dispatch intake tabs auto-populate references and calculate platform rates', async ({ page }) => {
  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 2, role: 'DISPATCHER', displayName: 'Test Dispatcher' } })
    });
  });

  await page.route('**/api/portal/trips', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ trips: [] })
    });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('nexusAccessToken', 'test-token');
  });

  await page.goto('/dispatch.html');
  await page.waitForSelector('[data-intake-tab="customer"]');

  await page.click('[data-intake-tab="customer"]');
  await page.fill('#customerPickup', '100 Main St');
  await page.fill('#customerDestination', '200 Oak Ave');
  await page.selectOption('#customerService', 'wheelchair');
  await page.check('#customerReturnTrip');
  await page.fill('#customerWaitMinutes', '30');

  const referenceValue = await page.locator('#customerReference').inputValue();
  await expect(page.locator('#customerReference')).not.toHaveValue('');
  await expect(page.locator('#customerReference')).toHaveValue(referenceValue);

  const rateValue = await page.locator('#customerCalculatedRate').inputValue();
  expect(Number(rateValue)).toBeGreaterThan(0);
});
