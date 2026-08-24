const { test, expect } = require('@playwright/test');
const sharedPages = [
  '__deploy_temp/index.html',
  'about-nexus-medical-transit.html', 'admin.html', 'ai-operations.html', 'billing.html',
  'career-application.html', 'careers.html', 'contact-service-areas.html',
  'dialysis-transportation.html', 'dispatch.html', 'executive.html', 'facility.html', 'fleet.html',
  'hospital-discharge-transportation.html', 'keymark.html', 'legal.html', 'livecare.html',
  'maryland-medical-transportation.html', 'northern-virginia-medical-transportation.html',
  'operations.html', 'qa.html', 'secure-documents.html', 'stretcher-transportation.html',
  'washington-dc-medical-transportation.html', 'wheelchair-transportation.html'
];

test.describe.configure({ mode: 'parallel' });
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

for (const pagePath of sharedPages) {
  test(`mobile visitor sees consistent navigation and footer on /${pagePath}`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('nexusAccessToken', 'mobile-story-token'));
    await page.route('**/api/auth/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'mobile-story', displayName: 'Mobile Visitor', role: 'ADMIN' } })
    }));
    await page.goto(`/${pagePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(650);

    const header = page.locator('header').first();
    const brand = header.locator('.brand,.globalBrand').first();
    const logo = header.locator('a[aria-label*="Nexus"] img, .brand img, .globalBrand img').first();
    const language = header.locator('.nexusCompactLanguage').first();
    const book = header.locator('.nexusSharedBook').first();
    const account = header.locator('.nexusAccountButton').first();
    const menuButton = header.locator('.menuBtn,.mobileNavToggle').first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate(element => getComputedStyle(element).content)).toContain('nexus-mini-logo.png');
    await expect(language).toBeVisible();
    await expect(book).toBeVisible();
    await expect(account).toBeVisible();
    await expect(menuButton).toBeVisible();

    const controls = [brand, language, book, account, menuButton];
    const boxes = await Promise.all(controls.map(control => control.boundingBox()));
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390.5);
    }
    expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].x + boxes[0].width - 1);

    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const navigation = header.locator('#primary-navigation,.globalLinks.open,.links.open').first();
    await expect(navigation).toBeVisible();
    const coreLabels = ['Home', 'Services', 'Experience', 'Coverage', 'Facilities', 'LiveCare'];
    const leftEdges = [];
    for (const label of coreLabels) {
      const link = navigation.getByRole('link', { name: label, exact: true }).first();
      await expect(link).toBeVisible();
      leftEdges.push((await link.boundingBox()).x);
    }
    expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThanOrEqual(2);

    const footer = page.locator('footer.footerUnified').first();
    await expect(footer.locator('.footerBrandCompact .footerLogo')).toBeVisible();
    const footerToggles = footer.locator('.footerAccordionToggle');
    await expect(footerToggles).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(footerToggles.nth(index)).toHaveAttribute('aria-expanded', 'false');
      await expect(footer.locator('.footerAccordionPanel').nth(index)).toBeHidden();
    }
  });
}
