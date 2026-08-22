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
  await page.setContent(`<style>${css}</style><div id="root"><header class="${headerClass}"><div class="${navClass}"><div class="${actionsClass}"><label class="nexusLanguageControl headerLanguageGlobal headerLanguage nexusCompactLanguage"><span class="sr">Language</span><select data-nexus-language aria-label="Language"><option value="en-US" selected>English (US)</option><option value="en-GB">English (UK)</option><option value="fr">Français</option><option value="es">Español</option></select></label><a class="call globalPhone nexusSharedCall" href="tel:+18886395766"><span aria-hidden="true">☎</span><span><small>Call Nexus</small><b>(888) 639-5766</b></span></a></div></div></header></div>`);
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
      height: language.getBoundingClientRect().height,
      radius: getComputedStyle(language).borderRadius,
      textFits: textWidth + horizontalSpace <= language.getBoundingClientRect().width,
      callVisible: visible(call),
      call: visible(call) ? rect(call) : null
    };
  });

  expect(result.selectedText.length).toBeGreaterThan(0);
  expect(result.height).toBe(38);
  expect(result.radius).toBe('999px');
  expect(result.textFits, `${path} ${viewport.width}px language text is clipped: ${JSON.stringify(result)}`).toBeTruthy();
  expect(result.language.left).toBeGreaterThanOrEqual(0);
  expect(result.language.right).toBeLessThanOrEqual(result.viewportWidth + 0.5);
  expect(result.select.left, `${path} ${viewport.width}px native language control escaped left: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(result.language.left - 0.5);
  expect(result.select.right, `${path} ${viewport.width}px native language control escaped right: ${JSON.stringify(result)}`).toBeLessThanOrEqual(result.language.right + 0.5);
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

test('every legacy language-control class uses the homepage pill', async ({ page }) => {
  const css = fs.readFileSync('platform.css', 'utf8');
  const variants = [
    'nexusLanguageControl headerLanguageGlobal',
    'nexusLanguageControl headerLanguage nexusCompactLanguage',
    'nexusLanguageControl nexusCompactLanguage'
  ];
  for (const languageClass of variants) {
    await page.setContent(`<style>${css}</style><div id="root"><header class="top globalTop"><div class="globalActions"><label class="${languageClass}" data-language-label="English (US)"><select data-nexus-language><option>English (US)</option></select></label></div></header></div>`);
    const style = await page.locator('header [data-nexus-language]').evaluate(select => {
      const wrapper = select.closest('.nexusLanguageControl,.headerLanguage');
      const computed = getComputedStyle(wrapper);
      const box = wrapper.getBoundingClientRect();
      return { width: box.width, height: box.height, radius: computed.borderRadius, background: computed.backgroundColor };
    });
    expect(style).toEqual({ width: 140, height: 38, radius: '999px', background: 'rgb(255, 255, 255)' });
  }
});

test('authenticated Livecare keeps map telemetry, content, and footer visible', async ({ page }) => {
  await page.setViewportSize({width:1280,height:900});
  const css=fs.readFileSync('platform.css','utf8');
  await page.setContent(`<style>${css}</style><body class="livecare-focus-mode"><section class="livecareMapHero"><div class="livecareExperience"><div class="livecareMapPanel"><div class="mapTopBar"><div>Vehicle status</div><button class="mapRefresh">Refresh</button></div><div class="liveFleetMapShell mapOnlyShell"><div class="liveFleetMap"></div></div></div></div></section><main id="main">Patient transportation details</main><footer class="footer">Nexus footer</footer></body>`);
  await expect(page.locator('main#main')).toBeVisible();
  await expect(page.locator('footer.footer')).toBeVisible();
  const geometry=await page.evaluate(()=>{
    const map=document.querySelector('.livecareMapPanel').getBoundingClientRect();
    const telemetry=document.querySelector('.mapTopBar>div').getBoundingClientRect();
    return {mapLeft:map.left,mapRight:map.right,telemetryLeft:telemetry.left,telemetryRight:telemetry.right,viewport:document.documentElement.clientWidth};
  });
  expect(geometry.mapLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.mapRight).toBeLessThanOrEqual(geometry.viewport+.5);
  expect(geometry.telemetryLeft).toBeGreaterThanOrEqual(geometry.mapLeft);
  expect(geometry.telemetryRight).toBeLessThanOrEqual(geometry.mapRight);
});
