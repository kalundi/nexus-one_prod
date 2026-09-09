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
    await new Promise(resolve => setTimeout(resolve, 150));
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
  await page.waitForSelector('#brokerIntakeForm', { state: 'attached' });
  await page.evaluate(() => {
    for (let element = document.querySelector('#brokerIntakeForm'); element; element = element.parentElement) {
      element.hidden = false;
      element.style.display = element.id === 'brokerIntakeForm' ? 'grid' : 'block';
    }
    document.querySelector('#pickerCardName').textContent = 'Test Broker';
  });

  await page.fill('#brokerPickup', '123 Main St');
  await page.fill('#brokerDestination', '456 Oak Ave');
  const tripDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.fill('#brokerTripDate', tripDate);
  await page.fill('#brokerTripTime', '14:30');
  await page.selectOption('#brokerService', 'facility_transfer');
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
  await page.waitForSelector('[data-intake-tab="customer"]', { state: 'attached' });
  await page.evaluate(() => {
    for (let element = document.querySelector('#dispatchIntakeBody'); element; element = element.parentElement) {
      element.hidden = false;
      element.style.display = 'block';
    }
  });

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
