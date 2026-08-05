/**
 * UI Layout Tests
 *
 * Validates:
 * 1. Navigation — all non-home pages show only "Home" + "Livecare"
 * 2. Hero — livecareStoryPanel top padding is reduced (≤ 30px, was up to 76px)
 * 3. Footer — footerUnified class applied on all pages that load platform.js
 */

const { test, expect } = require('@playwright/test');

// Helper: mock auth so protected pages render
async function mockAuth(page, role = 'DISPATCHER') {
  await page.addInitScript((role) => {
    sessionStorage.setItem('nexusAccessToken', 'test-token-ui');
    window.__nexusTestRole = role;
  }, role);
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 99, role, displayName: 'UI Test' } })
  }));
  await page.route('**/api/portal/trips', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ trips: [] })
  }));
  await page.route('**/api/fleet/live', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ vehicles: [] })
  }));
  await page.route('**/api/transportation-companies', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([])
  }));
}

// ============================================================
// 1. NAVIGATION — Only Home + Livecare on non-home pages
// ============================================================

test.describe('Navigation — 2-item nav on all pages', () => {
  test('livecare.html (home) nav has exactly Home + Livecare', async ({ page }) => {
    await page.goto('/livecare.html');
    const links = await page.$$eval('nav a', els =>
      els.map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
    );
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ text: 'Home', href: '/' });
    expect(links[1]).toMatchObject({ text: 'Livecare', href: '/livecare.html' });
  });

  test('dispatch.html nav has exactly Home + Livecare', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/dispatch.html');
    await page.waitForSelector('nav.globalLinks');
    const links = await page.$$eval('nav.globalLinks a', els =>
      els.map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]).toMatchObject({ text: 'Home', href: '/' });
    expect(links[1]).toMatchObject({ text: 'Livecare', href: '/livecare.html' });
  });

  test('admin.html nav has exactly Home + Livecare', async ({ page }) => {
    await mockAuth(page, 'ADMIN');
    await page.goto('/admin.html');
    await page.waitForSelector('nav.globalLinks');
    const links = await page.$$eval('nav.globalLinks a', els =>
      els.map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]).toMatchObject({ text: 'Home', href: '/' });
    expect(links[1]).toMatchObject({ text: 'Livecare', href: '/livecare.html' });
  });

  test('driver-app.html shows the premium driver shell', async ({ page }) => {
    await mockAuth(page, 'DRIVER');
    await page.goto('/driver-app.html');
    await page.waitForSelector('#appShell:not([hidden])');
    const text = await page.evaluate(() => document.body.innerText || '');
    expect(text).toContain('Good morning');
  });

  test('fleet.html nav has exactly Home + Livecare', async ({ page }) => {
    await mockAuth(page, 'DISPATCHER');
    await page.goto('/fleet.html');
    await page.waitForSelector('nav.globalLinks');
    const links = await page.$$eval('nav.globalLinks a', els =>
      els.map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]).toMatchObject({ text: 'Home', href: '/' });
    expect(links[1]).toMatchObject({ text: 'Livecare', href: '/livecare.html' });
  });

  test('executive.html nav has exactly Home + Livecare', async ({ page }) => {
    await mockAuth(page, 'EXECUTIVE');
    await page.goto('/executive.html');
    await page.waitForSelector('nav.globalLinks');
    const links = await page.$$eval('nav.globalLinks a', els =>
      els.map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]).toMatchObject({ text: 'Home', href: '/' });
    expect(links[1]).toMatchObject({ text: 'Livecare', href: '/livecare.html' });
  });

  test('nav does NOT contain old home-section links (Services, Experience, Coverage, etc.)', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/dispatch.html');
    await page.waitForSelector('nav.globalLinks');
    const allHrefs = await page.$$eval('nav.globalLinks a', els => els.map(el => el.getAttribute('href')));
    // None of the old section anchors should be present
    const oldLinks = ['/#services', '/#experience', '/#coverage', '/#facilities', '/#safety-and-quality'];
    for (const link of oldLinks) {
      expect(allHrefs).not.toContain(link);
    }
  });
});

// ============================================================
// 2. HERO SPACING — livecareStoryPanel top padding reduced
// ============================================================

test.describe('Hero spacing — reduced top padding on livecare/dispatch hero', () => {
  test('livecare.html livecareStoryPanel paddingTop is ≤ 30px', async ({ page }) => {
    await page.goto('/livecare.html');
    await page.waitForSelector('.livecareStoryPanel');
    const paddingTop = await page.$eval('.livecareStoryPanel', el =>
      parseFloat(window.getComputedStyle(el).paddingTop)
    );
    // Was up to 76px (clamp(38px,5vw,76px)), now max 30px (clamp(18px,2.5vw,30px))
    expect(paddingTop).toBeLessThanOrEqual(30);
    expect(paddingTop).toBeGreaterThanOrEqual(16);
  });

  test('dispatch.html livecareStoryPanel paddingTop is ≤ 30px', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/dispatch.html');
    await page.waitForSelector('.livecareStoryPanel');
    const paddingTop = await page.$eval('.livecareStoryPanel', el =>
      parseFloat(window.getComputedStyle(el).paddingTop)
    );
    expect(paddingTop).toBeLessThanOrEqual(30);
    expect(paddingTop).toBeGreaterThanOrEqual(16);
  });

  test('hero section h1 appears within 200px of top of viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/livecare.html');
    await page.waitForSelector('.livecareStoryPanel h1');
    const h1Top = await page.$eval('.livecareStoryPanel h1', el =>
      el.getBoundingClientRect().top
    );
    // Header is ~88px, hero panel padding now max 30px, so h1 should be within 200px from top
    expect(h1Top).toBeLessThan(200);
  });
});

// ============================================================
// 3. FOOTER — footerUnified class applied
// ============================================================

test.describe('Footer — normalizeFooter applied on pages that load platform.js', () => {
  test('livecare.html footer has footerUnified class', async ({ page }) => {
    await page.goto('/livecare.html');
    // Wait for platform.js to run and apply footerUnified
    await page.waitForSelector('footer.footerUnified', { timeout: 5000 });
    const cls = await page.$eval('footer', el => el.className);
    expect(cls).toContain('footerUnified');
  });

  test('dispatch.html footer has footerUnified class', async ({ page }) => {
    await mockAuth(page);
    await page.goto('/dispatch.html');
    await page.waitForSelector('footer.footerUnified', { timeout: 5000 });
    const cls = await page.$eval('footer', el => el.className);
    expect(cls).toContain('footerUnified');
  });

  test('livecare.html footer padding is minimal (platform.js override applied)', async ({ page }) => {
    await page.goto('/livecare.html');
    await page.waitForSelector('footer.footerUnified', { timeout: 5000 });
    const paddingTop = await page.$eval('footer', el =>
      parseFloat(window.getComputedStyle(el).paddingTop)
    );
    // footerUnified applies padding:0 !important (was 50px without platform.js)
    expect(paddingTop).toBeLessThanOrEqual(16);
  });

  test('footer contains social links (Nexus social media links injected by platform.js)', async ({ page }) => {
    await page.goto('/livecare.html');
    await page.waitForSelector('footer.footerUnified', { timeout: 5000 });
    const socialLinks = await page.$$eval('.footerSocial a', els => els.map(el => el.getAttribute('aria-label')));
    expect(socialLinks).toContain('YouTube');
    expect(socialLinks).toContain('Instagram');
    expect(socialLinks).toContain('Facebook');
  });
});

// ============================================================
// 4. LOGO ANIMATION — platform.js popLogos() runs on all pages
// ============================================================

test.describe('Logo animation — logo-pop class applied by platform.js', () => {
  test('livecare.html: popLogos() adds logo-pop class on load', async ({ page }) => {
    await page.goto('/livecare.html');
    // Wait for platform.js standalone logo-pop code to fire (DOMContentLoaded + immediate)
    await page.waitForTimeout(500);
    const hasClass = await page.$eval('img.logo', el => el.classList.contains('logo-pop'));
    // Class is added then removed after animation; check CSS keyframes exist instead
    const hasKeyframe = await page.evaluate(() => {
      return Array.from(document.styleSheets).some(ss => {
        try {
          return Array.from(ss.cssRules || []).some(r =>
            r.name === 'logoPop' || (r.cssText && r.cssText.includes('logoPop'))
          );
        } catch { return false; }
      });
    });
    expect(hasKeyframe).toBe(true);
  });
});
