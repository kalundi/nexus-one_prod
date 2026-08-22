const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const viewports = [
  { width: 320, height: 800 },
  { width: 375, height: 800 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 }
];

async function mountHeaderFixture(page, portal = false) {
  const headerClass=portal?'top globalTop':'topbar';
  const navClass=portal?'shell nav globalNav':'shell nav';
  const actionsClass=portal?'globalActions nexusSharedActions':'navRight nexusSharedActions';
  await page.goto('/health');
  const css=fs.readFileSync('platform.css','utf8');
  await page.setContent(`<style>${css}</style><div id="root"><header class="${headerClass}"><div class="${navClass}"><div class="${actionsClass}"><label class="nexusLanguageControl headerLanguage nexusCompactLanguage"><span class="sr">Language</span><select data-nexus-language aria-label="Language"><option value="en-US" selected>English (US)</option><option value="en-GB">English (UK)</option><option value="fr">Français</option><option value="es">Español</option></select></label><a class="call globalPhone nexusSharedCall" href="tel:+18886395766"><span aria-hidden="true">☎</span><span><small>Call Nexus</small><b>(888) 639-5766</b></span></a></div></div></header></div>`);
  await page.evaluate(fs.readFileSync('platform.js','utf8'));
}

async function expectHeaderActionsToFit(page, path, viewport, fixture = null) {
  await page.setViewportSize(viewport);
  if (fixture) await mountHeaderFixture(page,fixture==='portal');
  else await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header [data-nexus-language]');
  await page.waitForTimeout(750);

  const result = await page.evaluate(() => {
    const select = document.querySelector('header [data-nexus-language]');
    const language = select?.closest('.nexusLanguageControl,.headerLanguage');
    const call = document.querySelector('header .nexusSharedCall,header .globalPhone,header .call');
    const header = document.querySelector('header');
    const visible = element => element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0;
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    };
    const selectedText = language?.dataset.languageLabel || '';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const style = language ? getComputedStyle(language, ':before') : null;
    if (context && style) context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const textWidth = context ? context.measureText(selectedText).width : 0;
    const horizontalSpace = style ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0;
    return {
      viewportWidth: document.documentElement.clientWidth,
      header: rect(header),
      language: rect(language),
      select: rect(select),
      selectedText,
      textFits: textWidth + horizontalSpace <= language.getBoundingClientRect().width,
      callVisible: visible(call),
      call: visible(call) ? rect(call) : null
    };
  });

  expect(result.selectedText.length).toBeGreaterThan(0);
  expect(result.textFits, `${path} ${viewport.width}px language text is clipped: ${JSON.stringify(result)}`).toBeTruthy();
  expect(result.language.left).toBeGreaterThanOrEqual(0);
  expect(result.language.right).toBeLessThanOrEqual(result.viewportWidth + 0.5);
  if (result.callVisible) {
    const separatedHorizontally = result.language.right + 4 <= result.call.left || result.call.right + 4 <= result.language.left;
    const separatedVertically = result.language.bottom + 4 <= result.call.top || result.call.bottom + 4 <= result.language.top;
    expect(separatedHorizontally || separatedVertically, `${path} ${viewport.width}px actions overlap: ${JSON.stringify(result)}`).toBeTruthy();
    expect(result.call.left).toBeGreaterThanOrEqual(0);
    expect(result.call.right).toBeLessThanOrEqual(result.viewportWidth + 0.5);
  }
}

for (const viewport of viewports) {
  test(`homepage header actions fit at ${viewport.width}px`, async ({ page }) => {
    await expectHeaderActionsToFit(page, '/', viewport, 'homepage');
  });
}

test('shared portal header actions fit without overlap', async ({ page }) => {
  for (const viewport of viewports) {
    await expectHeaderActionsToFit(page, '/livecare.html', viewport, 'portal');
  }
});
