const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const cp = (...values) => String.fromCodePoint(...values);
const mojibake = new RegExp([
  cp(0xfffd),
  cp(0xe2, 0x20ac, 0x201d),
  cp(0xe2, 0x20ac, 0x201c),
  cp(0xe2, 0x20ac, 0x00a6),
  cp(0xe2, 0x20ac, 0x2122),
  cp(0xe2, 0x20ac, 0x00a2),
  cp(0xe2, 0x2020, 0x2019),
  cp(0xe2, 0x0153, 0x201c),
  cp(0xe2, 0x2122, 0x00bf),
  cp(0xc3, 0xb1),
  cp(0xc3, 0xa7),
  cp(0xc2, 0xa9)
].join('|'), 'u');

// User story:
// As a Nexus visitor, patient, driver, dispatcher, or administrator,
// I want every visible label and message to use readable characters,
// so that encoding corruption never obscures transportation information.
test.describe('Readable text across Nexus experiences', () => {
  for (const route of [
    '/booking-app.html',
    '/livecare.html',
    '/driver-app.html',
    '/dispatch.html',
    '/admin.html',
    '/set-password.html'
  ]) {
    test(`${route} has no visible gibberish text`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);
      const visibleText = await page.locator('body').innerText();
      expect(visibleText, `Encoding corruption found on ${route}`).not.toMatch(mojibake);
    });
  }

  test('homepage application bundle uses the intended punctuation', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index-drvotlb1.js'), 'utf8');
    expect(source).not.toMatch(mojibake);
    expect(source).toContain('practical technology\u2014without replacing the human support');
    expect(source).toContain('Request received');
  });
});
