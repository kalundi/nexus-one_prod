const { test, expect } = require('@playwright/test');

test('applicant submits to the Nexus careers API and receives a reference', async ({ page }) => {
  let submitted;
  await page.route('**/api/careers/applications', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ received: true, applicationId: 'APP-1001' }) });
  });
  await page.goto('/career-application.html');
  await page.locator('[name="first-name"]').fill('Jordan');
  await page.locator('[name="last-name"]').fill('Lee');
  await page.locator('[name="email"]').fill('jordan@example.com');
  await page.locator('[name="phone"]').fill('+1 202 555 0144');
  await page.locator('[name="city"]').fill('Rockville');
  await page.locator('[name="state"]').selectOption({ label: 'Maryland' });
  await page.locator('[name="position"]').selectOption('driver');
  await page.locator('[name="employment-preference"]').selectOption({ label: 'Full-time' });
  await page.locator('[name="authorized-to-work"]').check();
  await page.locator('[name="experience-years"]').selectOption({ index: 2 });
  await page.locator('[name="interest"]').fill('I want to help patients reach essential care safely.');
  await page.locator('[name="certification"]').check();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.locator('#careerApplicationStatus')).toContainText('APP-1001');
  expect(submitted.firstName).toBe('Jordan');
  expect(submitted.authorizedToWork).toBe(true);
  expect(submitted.certification).toBe(true);
});

test('administrator reviews an applicant and sends a tracked email response', async ({ page }) => {
  const application = { id: 'app-1', first_name: 'Jordan', last_name: 'Lee', email: 'jordan@example.com', phone: '+12025550144', city: 'Rockville', state: 'Maryland', position: 'driver', employment_preference: 'Full-time', experience_years: '1–2 years', interest: 'Patient service matters.', status: 'NEW', created_at: '2026-08-24T12:00:00Z', resume_name: 'jordan-resume.pdf' };
  let reviewPayload, responsePayload;
  await page.addInitScript(() => { sessionStorage.setItem('nexusAccessToken', 'admin-token'); sessionStorage.setItem('nexusUser', JSON.stringify({ id: 'admin-1', role: 'ADMIN', displayName: 'Administrator' })); });
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'admin-1', role: 'ADMIN', displayName: 'Administrator' } }) }));
  await page.route('**/api/admin/career-applications', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [application] }) }));
  await page.route('**/api/admin/career-applications/app-1', async route => { reviewPayload = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ application: { ...application, status: reviewPayload.status } }) }); });
  await page.route('**/api/admin/career-applications/app-1/response', async route => { responsePayload = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent: true }) }); });
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Career applicants/ }).click();
  await page.getByRole('button', { name: /Jordan Lee/ }).click();
  await expect(page.locator('#applicantDetail')).toContainText('jordan@example.com');
  await page.locator('#applicantReviewStatus').selectOption('INTERVIEW');
  await page.locator('#applicantInternalNotes').fill('Strong driving background.');
  await page.getByRole('button', { name: 'Save review' }).click();
  expect(reviewPayload.status).toBe('INTERVIEW');
  await page.locator('#applicantResponseMessage').fill('We would like to schedule an interview.');
  await page.getByRole('button', { name: 'Send email response' }).click();
  expect(responsePayload.message).toContain('schedule an interview');
});
