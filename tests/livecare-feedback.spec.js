const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('patient can rate a ride and send a suggestion', async ({ page }) => {
  let submitted;
  await page.route('**/api/patient-feedback', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ accepted: true, reference: 'FB-TEST-1234' }) });
  });
  await page.goto('/health');
  await page.setContent('<main id="main"><section id="liveCommand" hidden></section></main>');
  await page.addScriptTag({ path: path.resolve('livecare-feedback.js') });
  await expect(page.getByRole('heading', { name: 'How was your transportation experience?' })).toBeVisible();
  await page.locator('label[data-rating="5"]').click();
  await page.selectOption('[name="category"]', 'ACCESSIBILITY');
  await page.fill('[name="suggestion"]', 'Please keep wheelchair preferences selected for every future booking.');
  await page.fill('[name="bookingReference"]', 'NMT-20260822-1234');
  await page.check('[name="contactPermission"]');
  await page.getByRole('button', { name: 'Send feedback securely' }).click();
  await expect(page.getByText(/Feedback reference: FB-TEST-1234/)).toBeVisible();
  expect(submitted).toMatchObject({ rating: 5, category: 'ACCESSIBILITY', bookingReference: 'NMT-20260822-1234', contactPermission: true });
});

test('feedback requires a rating, topic, and meaningful suggestion', async ({ page }) => {
  await page.goto('/health');
  await page.setContent('<main id="main"><section id="liveCommand" hidden></section></main>');
  await page.addScriptTag({ path: path.resolve('livecare-feedback.js') });
  await page.getByRole('button', { name: 'Send feedback securely' }).click();
  expect(await page.locator('[name="rating"]').first().evaluate(input => input.validity.valueMissing)).toBe(true);
});
