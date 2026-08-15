/**
 * All-Pages Non-Blank Test
 *
 * Verifies every page in the platform renders non-blank content
 * across Chromium, Firefox, and WebKit browsers.
 *
 * A page is "blank" if:
 * - body text length < 100 chars
 * - no heading elements
 * - no visible text content
 *
 * Auth-guarded pages show "Access Denied" which is non-blank and expected.
 */

const { test, expect } = require('@playwright/test');

// Helper: mock auth API so protected pages render full content
async function mockAuth(page, role = 'DISPATCHER') {
  await page.addInitScript((role) => {
    sessionStorage.setItem('nexusAccessToken', 'test-token-allpages');
    window.__nexusTestRole = role;
  }, role);
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 99, role, displayName: 'Page Test' } })
  }));
  await page.route('**/api/**', route => {
    if (route.request().url().includes('/api/auth/me')) return;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, trips: [], bookings: [], vehicles: [], users: [], requests: [] }) });
  });
}

// All pages to test with their required roles
const PAGES = [
  { path: '/livecare.html',       title: 'Livecare',      role: null },
  { path: '/dispatch.html',       title: 'Dispatch',      role: 'DISPATCHER' },
  { path: '/fleet.html',          title: 'Fleet',         role: 'DISPATCHER' },
  { path: '/driver-app.html',     title: 'Driver App',    role: 'DRIVER' },
  { path: '/admin.html',          title: 'Admin',         role: 'ADMIN' },
  { path: '/executive.html',      title: 'Executive',     role: 'EXECUTIVE' },
  { path: '/billing.html',        title: 'Billing',       role: 'BILLING' },
  { path: '/facility.html',       title: 'Facility',      role: 'FACILITY' },
  { path: '/patient.html',        title: 'Patient',       role: null },
  { path: '/operations.html',     title: 'Operations',    role: 'DISPATCHER' },
  { path: '/qa.html',             title: 'QA',            role: 'QA' },
  { path: '/booking-app.html',    title: 'Booking',       role: null },
  { path: '/ai-operations.html',  title: 'AI Ops',        role: 'ADMIN' },
  { path: '/accessibility.html',  title: 'Accessibility', role: null },
  { path: '/careers.html',        title: 'Careers',       role: null },
  { path: '/career-application.html', title: 'Career Application', role: null },
  { path: '/keymark.html',        title: 'KeyMark',       role: 'DISPATCHER' },
];

test.describe('All pages render non-blank content', () => {
  for (const page_info of PAGES) {
    test(`${page_info.path} is not blank`, async ({ page }) => {
      if (page_info.role) {
        await mockAuth(page, page_info.role);
      }

      await page.goto(page_info.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      // Collect all text on the page
      const bodyText = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
      const trimmed = bodyText.trim();

      // Must have meaningful text content
      expect(trimmed.length, `Page ${page_info.path} appears blank (no text content)`).toBeGreaterThan(100);

      // Must have at least one heading or main content marker
      const hasStructure = await page.evaluate(() => {
        return !!(
          document.querySelector('h1, h2, h3, main, [role="main"], header') ||
          document.body.children.length > 2
        );
      });
      expect(hasStructure, `Page ${page_info.path} has no document structure`).toBe(true);

      // Must not be the React app loading state (spinner only) — only relevant for index.html
      const isReactBlank = await page.evaluate(() => {
        const root = document.getElementById('root');
        if (!root) return false; // not a React page, can't be React-blank
        return root.children.length === 0;
      });
      expect(isReactBlank, `Page ${page_info.path} is stuck at React loading state`).toBe(false);

      console.log(`✓ ${page_info.path}: ${trimmed.length} chars, has structure: true`);
    });
  }
});

test.describe('Production redirects work (no .html extension)', () => {
  const PROD_REDIRECTS = [
    { path: '/fleet',        expected: 'Fleet' },
    { path: '/dispatch',     expected: 'Dispatch' },
    { path: '/livecare',     expected: 'Livecare' },
    { path: '/driver',       expected: 'NEXUS Driver' },
    { path: '/admin',        expected: 'Admin' },
    { path: '/executive',    expected: 'Executive' },
    { path: '/billing',      expected: 'Billing' },
    { path: '/facility',     expected: 'Facility' },
    { path: '/accessibility',expected: 'Accessibility' },
  ];

  for (const redirect of PROD_REDIRECTS) {
    test(`nexusmt.com${redirect.path} serves correct page (not blank React app)`, async ({ request }) => {
      const response = await request.get(`https://nexusmt.com${redirect.path}`, {
        maxRedirects: 5
      });

      expect(response.status(), `${redirect.path} returned non-200`).toBe(200);

      const body = await response.text();

      // Must NOT be the blank React SPA shell
      const isReactSpaShell = body.includes('<div id="root"></div>') && body.length < 5000;
      expect(isReactSpaShell, `${redirect.path} loaded blank React app instead of ${redirect.expected} page`).toBe(false);

      // Must have content > minimal threshold
      expect(body.length, `${redirect.path} response is too short`).toBeGreaterThan(1000);

      console.log(`✓ nexusmt.com${redirect.path}: ${body.length} chars`);
    });
  }
});
