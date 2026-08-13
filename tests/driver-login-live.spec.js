const { test, expect } = require('@playwright/test');

/**
 * Live Driver login journey.
 *
 * Standards:
 * - Never hard-code production credentials in source control.
 * - Requires NEXUS_LIVE_DRIVER_EMAIL and NEXUS_LIVE_DRIVER_PASSWORD.
 * - Captures trace/video for the complete journey and screenshots at key checkpoints.
 * - Uses the same public entry point a driver uses: Livecare -> Driver sign in -> Driver App.
 * - Validates minimum-necessary DRIVER access and rejects privileged portal access.
 */

const LIVE_BASE_URL = process.env.NEXUS_LIVE_BASE_URL || 'https://nexusmt.com';
const DRIVER_EMAIL = process.env.NEXUS_LIVE_DRIVER_EMAIL;
const DRIVER_PASSWORD = process.env.NEXUS_LIVE_DRIVER_PASSWORD;

const hasLiveCredentials = Boolean(DRIVER_EMAIL && DRIVER_PASSWORD);

test.use({
  baseURL: LIVE_BASE_URL,
  trace: 'on',
  video: 'on',
  screenshot: 'only-on-failure',
  viewport: { width: 1440, height: 1100 },
  ignoreHTTPSErrors: false
});

test.describe('Driver live authentication and permission journey @live', () => {
  test.skip(!hasLiveCredentials, 'Set NEXUS_LIVE_DRIVER_EMAIL and NEXUS_LIVE_DRIVER_PASSWORD to run the live driver test.');

  test('driver signs in from Livecare and receives only driver-scoped access', async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await test.step('Open the public Livecare entry point', async () => {
      await page.goto('/livecare', { waitUntil: 'domcontentloaded' });
      const accessRegion = page.getByRole('region', { name: 'How are you using Livecare?' });
      await expect(accessRegion).toBeVisible();
      await expect(accessRegion.getByRole('button', { name: 'Driver sign in' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('01-livecare-entry.png'), fullPage: true });
    });

    await test.step('Choose Driver secure access', async () => {
      const driverButton = page.getByRole('button', { name: 'Driver sign in' });
      await expect(driverButton).toBeVisible();
      await driverButton.click();
      await expect(page.locator('#staffAccess')).toBeVisible();
      await expect(page.locator('#expectedRole')).toHaveValue('DRIVER');
      await page.screenshot({ path: testInfo.outputPath('02-driver-signin.png'), fullPage: true });
    });

    await test.step('Authenticate with the issued driver account', async () => {
      await page.locator('#identifier').fill(DRIVER_EMAIL);
      await page.locator('#password').fill(DRIVER_PASSWORD);

      const loginResponsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST'
      );

      await page.locator('#staffSubmit').click();
      const loginResponse = await loginResponsePromise;
      expect(loginResponse.ok(), `Login API returned ${loginResponse.status()}`).toBeTruthy();

      await page.waitForURL(/\/driver-app(?:\.html)?(?:[?#].*)?$/, { timeout: 30000 });
      await expect(page.locator('html')).toHaveAttribute('data-authorized-role', 'DRIVER');
      await page.screenshot({ path: testInfo.outputPath('03-driver-dashboard.png'), fullPage: true });
    });

    await test.step('Verify the authenticated driver session', async () => {
      const meResponse = await page.request.get(`${LIVE_BASE_URL}/api/auth/me`, {
        headers: {
          authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem('nexusAccessToken') || '')}`
        }
      });
      expect(meResponse.ok()).toBeTruthy();
      const me = await meResponse.json();
      expect(String(me?.user?.role || '').toUpperCase()).toBe('DRIVER');
    });

    await test.step('Verify driver-scoped assignment functionality', async () => {
      const token = await page.evaluate(() => sessionStorage.getItem('nexusAccessToken') || '');
      expect(token).not.toBe('');

      const assignmentsResponse = await page.request.get(`${LIVE_BASE_URL}/api/driver/assignments`, {
        headers: { authorization: `Bearer ${token}` }
      });
      expect(assignmentsResponse.ok(), `Assignments API returned ${assignmentsResponse.status()}`).toBeTruthy();
      const payload = await assignmentsResponse.json();
      expect(Array.isArray(payload.assignments)).toBeTruthy();

      // The UI must remain usable even when the driver currently has zero assigned trips.
      await expect(page.locator('body')).toContainText(/Dashboard|Trip Manifest|Assigned|No assigned trips/i);
    });

    await test.step('Verify privileged portals are not available to a DRIVER', async () => {
      for (const protectedPath of ['/admin', '/dispatch', '/executive', '/billing']) {
        const permissionPage = await page.context().newPage();
        await permissionPage.goto(`${LIVE_BASE_URL}${protectedPath}`, { waitUntil: 'domcontentloaded' });
        await permissionPage.waitForTimeout(1000);
        const authorizedRole = await permissionPage.locator('html').getAttribute('data-authorized-role');
        expect(authorizedRole, `DRIVER unexpectedly authorized for ${protectedPath}`).not.toBe('DRIVER');
        await permissionPage.close();
      }
    });

    await test.step('Record browser console health', async () => {
      await testInfo.attach('browser-console-errors', {
        body: Buffer.from(consoleErrors.join('\n') || 'No console errors captured.'),
        contentType: 'text/plain'
      });
    });
  });
});
