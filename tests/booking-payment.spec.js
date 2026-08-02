const { test, expect } = require('@playwright/test');

test('shows the payment section after a successful booking submission', async ({ page }) => {

  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pricing: {
          ambulatory: {
            label: 'Ambulatory Transportation',
            base: 65,
            includedMiles: 5,
            perMile: 3.25,
            waitPer15: 20
          }
        },
        fareRules: { taxRatePct: 0 }
      })
    });
  });

  await page.route('**/api/integrations/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stripeEnabled: true,
        squareEnabled: false,
        googleMapsEnabled: false,
        googleMapsBrowserKey: ''
      })
    });
  });

  await page.route('**/api/locations/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ locations: [{ lat: 39.0458, lng: -76.6413 }] })
    });
  });

  await page.route('**/api/fleet/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ vehicles: [] })
    });
  });

  await page.route('**/api/bookings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        booking: {
          reference: 'BK-1001',
          estimatedFare: 95.0
        },
        clientMessage: 'Booking created successfully.',
        persisted: true
      })
    });
  });

  await page.route('**/api/payments/stripe/checkout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'http://127.0.0.1:4173/checkout' })
    });
  });

  page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));

  await page.goto('/booking-app.html', { waitUntil: 'load' });

  await page.locator('#name').fill('Ava Patel');
  await page.locator('#phone').fill('(240) 555-0101');
  await page.locator('#email').fill('ava@example.com');
  await page.locator('#confirmRiderBtn').click();

  await page.locator('#pickup').fill('155 Limpkin Avenue, Clarksburg, Maryland');
  await page.locator('#destination').fill('2000 Medical Parkway, Annapolis, Maryland');
  await page.locator('#confirmPickupDropoffBtn').click();

  await page.evaluate(() => {
    const rideTypeSection = document.querySelector('#rideTypeSection');
    if(rideTypeSection){
      rideTypeSection.classList.add('unlocked');
      rideTypeSection.classList.remove('sectionCollapsed');
      rideTypeSection.style.display = 'block';
    }
  });

  await page.locator('#tripDate').fill('2030-08-15');
  await page.locator('#tripTime').fill('10:30');

  await page.evaluate(() => {
    window.NexusBookingApp?.showPaymentOptions('BK-1001', 95);
  });

  await expect(page.locator('#paymentSection')).toBeVisible();
  await expect(page.locator('#paymentSummary')).toContainText('BK-1001');
  await expect(page.locator('#payDepositBtn')).toBeEnabled();
  await expect(page.locator('#depositAmountLabel')).toContainText('$');
  await expect(page.locator('#payFullBtn')).toBeEnabled();

  await page.evaluate(() => {
    window.NexusBookingApp?.startHostedPayment('stripe', 'full');
  });
  await expect(page.locator('#paymentStatusMsg')).toContainText('Preparing full payment checkout', { timeout: 10000 });
});

test('falls back to Square when Stripe is unavailable', async ({ page }) => {
  await page.route('**/api/settings/public', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pricing: {
          ambulatory: {
            label: 'Ambulatory Transportation',
            base: 65,
            includedMiles: 5,
            perMile: 3.25,
            waitPer15: 20
          }
        },
        fareRules: { taxRatePct: 0 }
      })
    });
  });

  await page.route('**/api/integrations/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stripeEnabled: false,
        squareEnabled: true,
        googleMapsEnabled: false,
        googleMapsBrowserKey: ''
      })
    });
  });

  await page.route('**/api/locations/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ locations: [{ lat: 39.0458, lng: -76.6413 }] })
    });
  });

  await page.route('**/api/fleet/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ vehicles: [] })
    });
  });

  await page.route('**/api/bookings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        booking: {
          reference: 'BK-1002',
          estimatedFare: 80.0
        },
        clientMessage: 'Booking created successfully.',
        persisted: true
      })
    });
  });

  await page.route('**/api/payments/square/checkout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'http://127.0.0.1:4173/square-checkout' })
    });
  });

  await page.goto('/booking-app.html', { waitUntil: 'load' });

  await page.locator('#name').fill('Ava Patel');
  await page.locator('#phone').fill('(240) 555-0102');
  await page.locator('#email').fill('ava2@example.com');
  await page.locator('#confirmRiderBtn').click();

  await page.locator('#pickup').fill('155 Limpkin Avenue, Clarksburg, Maryland');
  await page.locator('#destination').fill('2000 Medical Parkway, Annapolis, Maryland');
  await page.locator('#confirmPickupDropoffBtn').click();

  await page.evaluate(() => {
    const rideTypeSection = document.querySelector('#rideTypeSection');
    if(rideTypeSection){
      rideTypeSection.classList.add('unlocked');
      rideTypeSection.classList.remove('sectionCollapsed');
      rideTypeSection.style.display = 'block';
    }
  });

  await page.locator('#tripDate').fill('2030-08-16');
  await page.locator('#tripTime').fill('11:30');

  await page.evaluate(() => {
    window.NexusBookingApp?.showPaymentOptions('BK-1002', 80);
  });

  await expect(page.locator('#paymentSection')).toBeVisible();
  await expect(page.locator('#payDepositBtn')).toBeEnabled();
  await expect(page.locator('#payFullBtn')).toBeEnabled();
  await expect(page.locator('#payStripeBtn')).toBeHidden();
  await expect(page.locator('#paymentStatusMsg')).toContainText('Reserve your ride');

  await page.evaluate(() => {
    window.NexusBookingApp?.startHostedPayment('stripe', 'deposit');
  });
  await expect(page.locator('#paymentStatusMsg')).toContainText('Preparing deposit checkout', { timeout: 10000 });
});
