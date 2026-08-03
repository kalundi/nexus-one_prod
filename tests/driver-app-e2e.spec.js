const { test, expect } = require('@playwright/test');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function baseAssignment(overrides = {}) {
  return {
    id: overrides.reference || 'NMT-E2E-1001',
    reference: overrides.reference || 'NMT-E2E-1001',
    name: overrides.name || 'John Carter',
    service: overrides.service || 'WHEELCHAIR',
    pickup: overrides.pickup || 'Washington Hospital Center',
    destination: overrides.destination || 'Sibley Memorial Hospital',
    date: overrides.date || todayIso(),
    time: overrides.time || '09:30',
    status: overrides.status || 'assigned',
    statusLabel: overrides.statusLabel || 'Assigned',
    notes: overrides.notes || 'Door 3 pickup',
    paymentStatus: 'UNPAID'
  };
}

function normalizeStatusLabel(status) {
  const upper = String(status || '').toUpperCase().replace(/-/g, '_');
  return upper.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function assertVisibleEnglishLabels(page) {
  const visibleText = await page.locator('body').innerText();
  const unwanted = /(\uFFFD|Ã|Â|â€¦|â€”|â€“|â€|â€™|â€œ|â€\x9d|ðŸ)/;
  expect(visibleText).not.toMatch(unwanted);
}

test.describe('Driver app end-to-end labels and workflow', () => {
  test('login to logout flow keeps labels readable english', async ({ page }) => {
    const token = 'driver-e2e-token';
    const user = {
      id: 'driver-e2e-1',
      email: 'fletcher@nexusmt.com',
      displayName: 'Fletcher Kalundi',
      role: 'DRIVER',
      scopeId: null,
      mustChangePassword: false
    };

    const state = {
      assignments: [
        baseAssignment({
          reference: 'NMT-E2E-1001',
          name: 'John Carter',
          status: 'assigned',
          statusLabel: 'Assigned',
          date: todayIso()
        }),
        baseAssignment({
          reference: 'NMT-E2E-1002',
          id: 'NMT-E2E-1002',
          name: 'Sandra Ellis',
          service: 'AMBULATORY',
          pickup: 'MedStar Georgetown University Hospital',
          destination: 'Inova Fairfax Medical Campus',
          date: tomorrowIso(),
          time: '13:15',
          status: 'scheduled',
          statusLabel: 'Scheduled'
        })
      ]
    };

    await page.addInitScript(() => {
      localStorage.setItem('nxDriverShift_v3', JSON.stringify({
        onDuty: false,
        onBreak: false,
        vehicleUnit: 'SE-254-01',
        startedAt: null,
        breakMs: 0,
        breakStart: null,
        completedTrips: 0,
        inspectionDone: true
      }));
      localStorage.setItem('nxDriverMiles_v3', JSON.stringify({
        odoStart: 45000,
        odoEnd: null,
        legs: []
      }));
      localStorage.removeItem('nxDriverInsp_v3');
      sessionStorage.clear();
    });

    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const pathname = url.pathname;
      const method = req.method();

      if (pathname === '/api/auth/login' && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ token, user })
        });
        return;
      }

      if (pathname === '/api/auth/me' && method === 'GET') {
        const auth = req.headers().authorization || '';
        if (!auth.includes(token)) {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' })
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user })
        });
        return;
      }

      if (pathname === '/api/fleet/live' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            vehicles: [
              { unit: 'SE-254-01', type: 'SEDAN', status: 'AVAILABLE' }
            ]
          })
        });
        return;
      }

      if (pathname === '/api/driver/assignments' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ assignments: state.assignments })
        });
        return;
      }

      if (/^\/api\/bookings\/[^/]+\/accept$/.test(pathname) && method === 'POST') {
        const ref = decodeURIComponent(pathname.split('/')[3]);
        const hit = state.assignments.find((a) => a.reference === ref);
        if (!hit) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Booking not found' })
          });
          return;
        }
        hit.status = 'en-route';
        hit.statusLabel = 'En Route';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ booking: hit, message: 'Trip accepted' })
        });
        return;
      }

      if (/^\/api\/bookings\/[^/]+\/update$/.test(pathname) && method === 'POST') {
        const ref = decodeURIComponent(pathname.split('/')[3]);
        const body = JSON.parse(req.postData() || '{}');
        const hit = state.assignments.find((a) => a.reference === ref);
        if (!hit) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Booking not found' })
          });
          return;
        }
        const nextStatus = String(body.status || '').toLowerCase().replace(/_/g, '-');
        if (nextStatus) {
          hit.status = nextStatus;
          hit.statusLabel = normalizeStatusLabel(nextStatus);
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ booking: hit })
        });
        return;
      }

      if (pathname === '/api/gps' && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.goto('/driver-app.html');

    await expect(page.getByRole('heading', { name: 'Driver Sign In' })).toBeVisible();
    await expect(page.locator('#loginEmail')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await assertVisibleEnglishLabels(page);

    await page.locator('#loginEmail').fill('fletcher@nexusmt.com');
    await page.locator('#loginPassword').fill('Fletcher2026!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Good', { exact: false })).toBeVisible();
    const startShiftButton = page.getByRole('button', { name: /^(Start Shift|Continue to Shift)$/ });
    await expect(startShiftButton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log Off' })).toBeVisible();
    await assertVisibleEnglishLabels(page);

    await startShiftButton.click();
    await expect(page.getByText('On Duty', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Shift' })).toBeVisible();
    await assertVisibleEnglishLabels(page);

    await page.locator('button.navBtn[data-view="manifestView"]').click();
    await expect(page.getByText('Assigned trip queue')).toBeVisible();
    await expect(page.locator('#manifestList').getByText('John Carter').first()).toBeVisible();
    await assertVisibleEnglishLabels(page);

    await page.getByRole('button', { name: 'Accept' }).first().click();
    await expect(page.locator('#manifestList').getByText('EN ROUTE').first()).toBeVisible();

    await page.locator('.tripCard').first().click();
    await expect(page.getByText('Trip status')).toBeVisible();
    await expect(page.locator('#tripPickup')).toContainText('Washington Hospital Center');
    await expect(page.locator('#tripDestination')).toContainText('Sibley Memorial Hospital');
    await assertVisibleEnglishLabels(page);

    await page.locator('#tripComments').fill('Patient stable, no delay.');
    await page.locator('#btnSaveComments').click();
    await expect(page.locator('#btnSaveComments')).toHaveText('Saved');

    await page.locator('button.navBtn[data-view="milesView"]').click();
    await expect(page.getByText('Mileage record')).toBeVisible();
    await assertVisibleEnglishLabels(page);

    await page.locator('button.navBtn[data-view="dashView"]').click();
    await page.locator('#btnEndShift').click();
    await expect(page.getByText('Shift complete')).toBeVisible();
    await assertVisibleEnglishLabels(page);

    await page.locator('#btnConfirmEndShift').click();
    await expect(page.getByRole('button', { name: 'Log Off' })).toBeVisible();

    await page.getByRole('button', { name: 'Log Off' }).click();
    await expect(page.getByRole('heading', { name: 'Driver Sign In' })).toBeVisible();
    await assertVisibleEnglishLabels(page);
  });
});
