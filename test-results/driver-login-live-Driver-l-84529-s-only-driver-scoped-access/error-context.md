# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: driver-login-live.spec.js >> Driver live authentication and permission journey @live >> driver signs in from Livecare and receives only driver-scoped access
- Location: tests\driver-login-live.spec.js:32:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "https://nexusmt.com/livecare.html"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - link "Skip to main content" [ref=f1e2] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=f1e3]:
    - generic [ref=f1e4]:
      - link "Nexus Medical Transit home" [ref=f1e5] [cursor=pointer]:
        - /url: /
        - img "Nexus Medical Transit" [ref=f1e6]
      - navigation "Primary navigation" [ref=f1e7]:
        - link "Home" [ref=f1e8] [cursor=pointer]:
          - /url: /
        - link "Livecare" [ref=f1e9] [cursor=pointer]:
          - /url: /livecare
      - generic [ref=f1e10]:
        - generic [ref=f1e11]:
          - generic [ref=f1e12]: Language
          - combobox "Select language" [ref=f1e13] [cursor=pointer]:
            - option "English (US)" [selected]
            - option "English (UK)"
            - option "French"
            - option "Spanish"
        - link "Call Nexus (888) 639-5766" [ref=f1e14] [cursor=pointer]:
          - /url: tel:+18886395766
          - generic [ref=f1e15]: Call Nexus
          - strong [ref=f1e16]: (888) 639-5766
        - link "Book a Ride" [ref=f1e17] [cursor=pointer]:
          - /url: /booking-app.html
  - complementary [ref=f1e20]:
    - generic:
      - generic [ref=f1e21]:
        - generic [ref=f1e22]: 7 vehicles · All Services · all statuses
        - generic [ref=f1e23]: Updated 10:45:05 PM
        - generic [ref=f1e24]: Focused vehicle AMB-254-01 · broader network remains visible
      - generic [ref=f1e25]:
        - button "Switch user" [ref=f1e26]
        - button "Refresh" [ref=f1e27]
    - heading "Livecare moving vehicle map" [level=2] [ref=f1e28]
    - generic [ref=f1e29]:
      - application "Interactive live map showing only the vehicles and rides authorized for this user" [ref=f1e30]:
        - generic:
          - button "AMB-254-01 undefined" [ref=f1e32]:
            - generic [ref=f1e33]: "N"
            - generic [ref=f1e34]: AMB-254-01
          - button "AMB-254-02 undefined" [ref=f1e35]:
            - generic [ref=f1e36]: "N"
            - generic [ref=f1e37]: AMB-254-02
          - button "SE-254-01 undefined" [ref=f1e38]:
            - generic [ref=f1e39]: "N"
            - generic [ref=f1e40]: SE-254-01
          - button "SH-254-01 undefined" [ref=f1e41]:
            - generic [ref=f1e42]: "N"
            - generic [ref=f1e43]: SH-254-01
          - button "ST-254-01 undefined" [ref=f1e44]:
            - generic [ref=f1e45]: "N"
            - generic [ref=f1e46]: ST-254-01
          - button "SUV-254-01 undefined" [ref=f1e47]:
            - generic [ref=f1e48]: "N"
            - generic [ref=f1e49]: SUV-254-01
          - button "WV-254-01 undefined" [ref=f1e50]:
            - generic [ref=f1e51]: "N"
            - generic [ref=f1e52]: WV-254-01
        - generic [ref=f1e53]:
          - strong [ref=f1e54]: AMB-254-01
          - generic [ref=f1e55]: Nexus transport
          - generic [ref=f1e56]: Operational route · 0%
          - generic [ref=f1e57]: Monitoring
        - generic [ref=f1e58]:
          - button "Zoom in" [ref=f1e59]: +
          - button "Zoom out" [ref=f1e60]: −
          - button "Show all vehicles" [ref=f1e61]: ⌖
        - generic [ref=f1e62]: © OpenStreetMap contributors
      - generic "Filter vehicles by status" [ref=f1e63]:
        - button "Move status panel. Drag to reposition; double-click to reset." [ref=f1e64]:
          - generic: Move
        - button "Moving" [ref=f1e65] [cursor=pointer]
        - button "Patient" [ref=f1e68] [cursor=pointer]
        - button "Available" [ref=f1e71] [cursor=pointer]
        - button "Attention" [ref=f1e74] [cursor=pointer]
    - generic "Filter map by transportation service" [ref=f1e77]:
      - generic [ref=f1e78]:
        - button "All Services" [pressed] [ref=f1e79] [cursor=pointer]
        - button "Ambulance" [ref=f1e80] [cursor=pointer]
        - button "Wheelchair" [ref=f1e81] [cursor=pointer]
        - button "Ambulatory" [ref=f1e82] [cursor=pointer]
        - button "Stretcher" [ref=f1e83] [cursor=pointer]
        - button "Bariatric" [ref=f1e84] [cursor=pointer]
        - button "Hospital Discharge" [ref=f1e85] [cursor=pointer]
        - button "Facility Transfer" [ref=f1e86] [cursor=pointer]
        - button "All Services" [pressed] [ref=f1e87] [cursor=pointer]
        - button "Ambulance" [ref=f1e88] [cursor=pointer]
        - button "Wheelchair" [ref=f1e89] [cursor=pointer]
        - button "Ambulatory" [ref=f1e90] [cursor=pointer]
        - button "Stretcher" [ref=f1e91] [cursor=pointer]
        - button "Bariatric" [ref=f1e92] [cursor=pointer]
        - button "Hospital Discharge" [ref=f1e93] [cursor=pointer]
        - button "Facility Transfer" [ref=f1e94] [cursor=pointer]
  - button "TrustedSite Certified" [ref=f1e95] [cursor=pointer]
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | /**
  4   |  * Live Driver login journey.
  5   |  *
  6   |  * Standards:
  7   |  * - Never hard-code production credentials in source control.
  8   |  * - Requires NEXUS_LIVE_DRIVER_EMAIL and NEXUS_LIVE_DRIVER_PASSWORD.
  9   |  * - Captures trace/video for the complete journey and screenshots at key checkpoints.
  10  |  * - Uses the same public entry point a driver uses: Livecare -> Driver sign in -> Driver App.
  11  |  * - Validates minimum-necessary DRIVER access and rejects privileged portal access.
  12  |  */
  13  | 
  14  | const LIVE_BASE_URL = process.env.NEXUS_LIVE_BASE_URL || 'https://nexusmt.com';
  15  | const DRIVER_EMAIL = process.env.NEXUS_LIVE_DRIVER_EMAIL;
  16  | const DRIVER_PASSWORD = process.env.NEXUS_LIVE_DRIVER_PASSWORD;
  17  | 
  18  | const hasLiveCredentials = Boolean(DRIVER_EMAIL && DRIVER_PASSWORD);
  19  | 
  20  | test.use({
  21  |   baseURL: LIVE_BASE_URL,
  22  |   trace: 'on',
  23  |   video: 'on',
  24  |   screenshot: 'only-on-failure',
  25  |   viewport: { width: 1440, height: 1100 },
  26  |   ignoreHTTPSErrors: false
  27  | });
  28  | 
  29  | test.describe('Driver live authentication and permission journey @live', () => {
  30  |   test.skip(!hasLiveCredentials, 'Set NEXUS_LIVE_DRIVER_EMAIL and NEXUS_LIVE_DRIVER_PASSWORD to run the live driver test.');
  31  | 
  32  |   test('driver signs in from Livecare and receives only driver-scoped access', async ({ page }, testInfo) => {
  33  |     const consoleErrors = [];
  34  |     page.on('console', (msg) => {
  35  |       if (msg.type() === 'error') consoleErrors.push(msg.text());
  36  |     });
  37  | 
  38  |     await test.step('Open the public Livecare entry point', async () => {
  39  |       await page.goto('/livecare', { waitUntil: 'domcontentloaded' });
  40  |       const accessRegion = page.getByRole('region', { name: 'How are you using Livecare?' });
  41  |       await expect(accessRegion).toBeVisible();
  42  |       await expect(accessRegion.getByRole('button', { name: 'Driver sign in' })).toBeVisible();
  43  |       await page.screenshot({ path: testInfo.outputPath('01-livecare-entry.png'), fullPage: true });
  44  |     });
  45  | 
  46  |     await test.step('Choose Driver secure access', async () => {
  47  |       const driverButton = page.getByRole('button', { name: 'Driver sign in' });
  48  |       await expect(driverButton).toBeVisible();
  49  |       await driverButton.click();
  50  |       await expect(page.locator('#staffAccess')).toBeVisible();
  51  |       await expect(page.locator('#expectedRole')).toHaveValue('DRIVER');
  52  |       await page.screenshot({ path: testInfo.outputPath('02-driver-signin.png'), fullPage: true });
  53  |     });
  54  | 
  55  |     await test.step('Authenticate with the issued driver account', async () => {
  56  |       await page.locator('#identifier').fill(DRIVER_EMAIL);
  57  |       await page.locator('#password').fill(DRIVER_PASSWORD);
  58  | 
  59  |       const loginResponsePromise = page.waitForResponse(
  60  |         (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST'
  61  |       );
  62  | 
  63  |       await page.locator('#staffSubmit').click();
  64  |       const loginResponse = await loginResponsePromise;
  65  |       expect(loginResponse.ok(), `Login API returned ${loginResponse.status()}`).toBeTruthy();
  66  | 
> 67  |       await page.waitForURL(/\/driver-app(?:\.html)?(?:[?#].*)?$/, { timeout: 30000 });
      |                  ^ TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
  68  |       await expect(page.locator('html')).toHaveAttribute('data-authorized-role', 'DRIVER');
  69  |       await page.screenshot({ path: testInfo.outputPath('03-driver-dashboard.png'), fullPage: true });
  70  |     });
  71  | 
  72  |     await test.step('Verify the authenticated driver session', async () => {
  73  |       const meResponse = await page.request.get(`${LIVE_BASE_URL}/api/auth/me`, {
  74  |         headers: {
  75  |           authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem('nexusAccessToken') || '')}`
  76  |         }
  77  |       });
  78  |       expect(meResponse.ok()).toBeTruthy();
  79  |       const me = await meResponse.json();
  80  |       expect(String(me?.user?.role || '').toUpperCase()).toBe('DRIVER');
  81  |     });
  82  | 
  83  |     await test.step('Verify driver-scoped assignment functionality', async () => {
  84  |       const token = await page.evaluate(() => sessionStorage.getItem('nexusAccessToken') || '');
  85  |       expect(token).not.toBe('');
  86  | 
  87  |       const assignmentsResponse = await page.request.get(`${LIVE_BASE_URL}/api/driver/assignments`, {
  88  |         headers: { authorization: `Bearer ${token}` }
  89  |       });
  90  |       expect(assignmentsResponse.ok(), `Assignments API returned ${assignmentsResponse.status()}`).toBeTruthy();
  91  |       const payload = await assignmentsResponse.json();
  92  |       expect(Array.isArray(payload.assignments)).toBeTruthy();
  93  | 
  94  |       // The UI must remain usable even when the driver currently has zero assigned trips.
  95  |       await expect(page.locator('body')).toContainText(/Dashboard|Trip Manifest|Assigned|No assigned trips/i);
  96  |     });
  97  | 
  98  |     await test.step('Verify privileged portals are not available to a DRIVER', async () => {
  99  |       for (const protectedPath of ['/admin', '/dispatch', '/executive', '/billing']) {
  100 |         const permissionPage = await page.context().newPage();
  101 |         await permissionPage.goto(`${LIVE_BASE_URL}${protectedPath}`, { waitUntil: 'domcontentloaded' });
  102 |         await permissionPage.waitForTimeout(1000);
  103 |         const authorizedRole = await permissionPage.locator('html').getAttribute('data-authorized-role');
  104 |         expect(authorizedRole, `DRIVER unexpectedly authorized for ${protectedPath}`).not.toBe('DRIVER');
  105 |         await permissionPage.close();
  106 |       }
  107 |     });
  108 | 
  109 |     await test.step('Record browser console health', async () => {
  110 |       await testInfo.attach('browser-console-errors', {
  111 |         body: Buffer.from(consoleErrors.join('\n') || 'No console errors captured.'),
  112 |         contentType: 'text/plain'
  113 |       });
  114 |     });
  115 |   });
  116 | });
  117 | 
```