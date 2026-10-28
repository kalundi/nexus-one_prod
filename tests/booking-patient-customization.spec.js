const { test, expect } = require('@playwright/test');

test('logged-in patient sees clean identity and saved booking defaults', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('nexusAccessToken', 'patient-booking-token');
    sessionStorage.setItem('nexusUser', JSON.stringify({ displayName: 'Anthony Muthoka', role: 'PATIENT' }));
  });
  await page.route('**/api/settings/public', route => route.fulfill({json:{pricing:{ambulatory:{base:75,includedMiles:5,perMile:3.55,waitPer15:12.5},wheelchair:{base:95,includedMiles:5,perMile:3.55,waitPer15:12.5}},fareRules:{}}}));
  await page.route('**/api/integrations/config', route => route.fulfill({json:{googleMapsEnabled:false,stripeEnabled:true}}));
  await page.route('**/api/auth/me', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'patient-1',displayName:'Anthony Muthoka',name:'Anthony Muthoka',email:'anthony@example.com',phone:'+12022702174',role:'PATIENT'}})}));
  await page.route('**/api/patient/preferences', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({preferences:{mobilityType:'WHEELCHAIR',remainsInWheelchair:true,transferAssistance:true,oxygenRequired:false,preferredLanguage:'English (US)',communicationPreference:'SMS',defaultPickup:'100 Main Street, Rockville, MD',accessibilityNotes:'Use the accessible entrance.'}})}));
  await page.goto('/booking-app.html', { waitUntil: 'domcontentloaded' });
  const banner = page.locator('#patientDefaultsBanner');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('heading')).toContainText('Anthony');
  await expect(banner).toContainText('Wheelchair transportation');
  await expect(banner).toContainText('Remain in wheelchair');
  await expect(banner).toContainText('Transfer assistance');
  await expect(banner).toContainText('Updates: SMS');
  await expect(page.locator('#pickup')).toHaveValue('100 Main Street, Rockville, MD');
  await expect(page.locator('#firstName')).toHaveValue('Anthony'); await expect(page.locator('#lastName')).toHaveValue('Muthoka');
  await expect(page.locator('[name="remainsInWheelchair"][value="yes"]')).toBeChecked();
  await expect(page.locator('#nexusAccountMount')).toHaveCount(0);
});
