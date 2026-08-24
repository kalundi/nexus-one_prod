const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'
});

const publicPages = ['/__deploy_temp/index.html', '/livecare.html', '/keymark.html'];

for (const path of publicPages) {
  test(`${path} mobile navigation and footer fit iPhone 17 Pro Max`, async ({ page }) => {
    if (path === '/keymark.html') {
      await page.addInitScript(() => sessionStorage.setItem('nexusAccessToken', 'keymark-mobile-token'));
      await page.route('**/api/auth/me', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'admin-mobile',displayName:'Mobile Admin',role:'ADMIN'}})}));
    }
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const layout = await page.evaluate(() => {
      const header = document.querySelector('header');
      const footer = document.querySelector('footer');
      const rect = element => { if (!element) return null; const box = element.getBoundingClientRect(); return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height}; };
      const visible = element => element && getComputedStyle(element).display !== 'none' && rect(element).width > 0;
      const footerLinks = Array.from(footer?.querySelectorAll('a') || []).filter(visible).map(link => ({ text: link.textContent.trim(), ...rect(link) }));
      return {
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        header: rect(header),
        footer: rect(footer),
        footerLinks,
        overflowers: Array.from(document.querySelectorAll('body *')).map(element => ({element,box:element.getBoundingClientRect()})).filter(item => item.box.right > document.documentElement.clientWidth + 1 || item.box.left < -1).slice(0,8).map(item => ({tag:item.element.tagName,className:item.element.className?.toString?.() || '',left:item.box.left,right:item.box.right})),
        logoVisible: visible(header?.querySelector('img')),
        toggleVisible: visible(header?.querySelector('.menuBtn,.mobileNavToggle'))
      };
    });
    expect(layout.scrollWidth, `${path} has horizontal overflow: ${JSON.stringify(layout.overflowers)}`).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.header).not.toBeNull();
    expect(layout.header.left).toBeGreaterThanOrEqual(-0.5);
    expect(layout.header.right).toBeLessThanOrEqual(440.5);
    expect(layout.logoVisible).toBeTruthy();
    const bookingCta = page.locator('header .nexusSharedBook:visible, header .navBookRide:visible, header .navCta:visible').first();
    if (await bookingCta.count()) {
      const bookingBox = await bookingCta.boundingBox();
      expect(bookingBox.width, `${path} booking CTA is too wide`).toBeLessThanOrEqual(160.5);
      expect(bookingBox.height, `${path} booking CTA is too short`).toBeGreaterThanOrEqual(44);
    }
    if (path !== '/__deploy_temp/index.html') {
      const mobileControls = page.locator('header .nexusCompactLanguage:visible, header .nexusSharedBook:visible, header .mobileNavToggle:visible, header .menuBtn:visible');
      expect(await mobileControls.count()).toBe(3);
      await expect(page.locator('header .nexusSharedActions #nexusAccountMount')).toHaveCount(1);
      await expect(page.locator('header nav #nexusAccountMount')).toHaveCount(0);
    }
    expect(layout.footer).not.toBeNull();
    expect(layout.footer.left).toBeGreaterThanOrEqual(-0.5);
    expect(layout.footer.right).toBeLessThanOrEqual(440.5);
    const footerAccordions = page.locator('footer .footerAccordionToggle:visible');
    const footerAccordionCount = await footerAccordions.count();
    if (footerAccordionCount) expect(footerAccordionCount).toBe(3);
    else expect(layout.footerLinks.length).toBeGreaterThan(2);
    for (const link of layout.footerLinks) {
      expect(link.right, `${path} footer link clipped: ${link.text}`).toBeLessThanOrEqual(440.5);
    }
    await expect(page.locator('footer').getByText(/Access drives equity/i)).toBeVisible();
    if (footerAccordionCount) await page.getByRole('button', { name: 'Contact', exact: true }).click();
    await expect(page.locator('footer a[href^="tel:"]').first()).toBeVisible();
    const footerTapTargets = await page.locator('footer .footerCompactNav a, footer .footerContactBody a, footer .footerSocial a').evaluateAll(links => links.map(link => ({link,height:link.getBoundingClientRect().height})).filter(item => item.height > 0).map(item => ({text:item.link.textContent.trim() || item.link.getAttribute('aria-label'),height:item.height})));
    for (const link of footerTapTargets) expect(link.height, `${path} footer tap target too short: ${link.text}`).toBeGreaterThanOrEqual(44);

    const toggles = page.locator('header .menuBtn,header .mobileNavToggle');
    let toggle = null;
    for (let index = 0; index < await toggles.count(); index += 1) if (await toggles.nth(index).isVisible()) { toggle = toggles.nth(index); break; }
    if (toggle) {
      const box = await toggle.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const menu = path === '/__deploy_temp/index.html'
        ? page.locator('header #primary-navigation').first()
        : page.locator('header .globalLinks.open, header .links.open').first();
      await expect(menu).toBeVisible();
      expect(await menu.locator('a:visible, .nexusHomeGroup:visible').count()).toBeGreaterThan(0);
      const coreLinks = ['Home', 'Services', 'Experience', 'Coverage', 'Facilities', 'LiveCare'];
      const leftEdges = [];
      for (const label of coreLinks) {
        const link = menu.getByRole('link', { name: label, exact: true }).first();
        await expect(link).toBeVisible();
        leftEdges.push((await link.boundingBox()).x);
      }
      expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThanOrEqual(2);
      if (path !== '/__deploy_temp/index.html') await expect(page.locator('header .nexusSharedActions #nexusAccountMount')).toBeVisible();
      const home = menu.locator('.nexusHomeGroup summary').first();
      if (await home.count()) {
        const group = menu.locator('.nexusHomeGroup').first();
        if ((await group.getAttribute('open')) === null) await home.click();
        await expect(menu.locator('.nexusHomeMenu a:visible').first()).toBeVisible();
      }
    }
  });
}

test('booking mobile navigation stays readable above the safe area', async ({ page }) => {
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await expect(page.locator('#nexusAccountMount')).toHaveCount(0);
  const layout = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.appTabBar button')).map(button => button.getBoundingClientRect());
    const header = document.querySelector('header.top').getBoundingClientRect();
    return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, header, tabs: tabs.map(box => ({left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height})) };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.header.right).toBeLessThanOrEqual(440.5);
  expect(layout.tabs).toHaveLength(3);
  for (const tab of layout.tabs) {
    expect(tab.width).toBeGreaterThanOrEqual(44);
    expect(tab.height).toBeGreaterThanOrEqual(44);
    expect(tab.left).toBeGreaterThanOrEqual(0);
    expect(tab.right).toBeLessThanOrEqual(440.5);
  }
});

test('mobile footer keeps brand visible and reveals other sections on demand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/livecare.html');
  const footer = page.locator('footer.footerUnified');
  await expect(footer.locator('.footerBrandCompact .footerLogo')).toBeVisible();
  const toggles = footer.locator('.footerAccordionToggle');
  await expect(toggles).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(toggles.nth(index)).toHaveAttribute('aria-expanded', 'false');
    await expect(footer.locator('.footerAccordionPanel').nth(index)).toBeHidden();
  }
  await toggles.nth(0).click();
  await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(footer.locator('.footerAccordionPanel').nth(0)).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'false');
});

for (const width of [320, 375, 390, 414, 428, 440]) {
  test(`shared mobile header adapts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 428 ? 926 : 900 });
    await page.goto('/livecare.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    const controls = page.locator('header .nexusCompactLanguage:visible, header .nexusSharedBook:visible, header .mobileNavToggle:visible, header .menuBtn:visible');
    expect(await controls.count()).toBe(3);
    const layout = await controls.evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, center: box.top + box.height / 2 }; }));
    for (const control of layout) {
      expect(control.left).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeLessThanOrEqual(width + 0.5);
    }
    const languageBox = await page.locator('header .nexusCompactLanguage').boundingBox();
    const bookingBox = await page.locator('header .nexusSharedBook').boundingBox();
    expect(Math.abs((languageBox.y + languageBox.height / 2) - (bookingBox.y + bookingBox.height / 2))).toBeLessThanOrEqual(2);
    await expect(page.locator('header .nexusSharedActions #nexusAccountMount')).toHaveCount(1);
    expect(await page.locator('header .nexusCompactLanguage').getAttribute('data-language-label')).toMatch(/English \(US\)/);
    await expect(page.locator('header .nexusSharedBook')).toHaveText(/Book/i);
  });
}
