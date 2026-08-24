const { test, expect } = require('@playwright/test');

test('signed-in patient can repeat a ride with saved accessibility defaults and a new schedule', async ({ page }) => {
  const user = { id: 'patient-1', displayName: 'Anthony Muthoka', name: 'Anthony Muthoka', email: 'anthony@example.com', phone: '+12022702174', role: 'PATIENT' };
  const preferences = { mobilityType: 'WHEELCHAIR', remainsInWheelchair: true, transferAssistance: true, oxygenRequired: false, preferredLanguage: 'English (US)', communicationPreference: 'SMS', defaultPickup: '100 Main Street, Rockville, MD', accessibilityNotes: 'Use the accessible entrance.' };
  const ride = { reference: 'NMT-RETURN-1', date: '2026-09-10', time: '09:30', status: 'CONFIRMED', pickup: '100 Main Street, Rockville, MD', destination: '200 Medical Center Drive, Bethesda, MD', service: 'WHEELCHAIR', notes: 'Use the accessible entrance.' };

  await page.addInitScript(() => {
    sessionStorage.setItem('nexusAccessToken', 'patient-retention-token');
    sessionStorage.setItem('nexusUser', JSON.stringify({ displayName: 'Anthony Muthoka', role: 'PATIENT' }));
  });
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) }));
  await page.route('**/api/patient/dashboard', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user, preferences, nextRide: ride, recentRides: [ride] }) }));
  await page.route('**/api/patient/preferences', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preferences }) }));
  await page.route('**/api/portal/trips', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [ride] }) }));

  await page.goto('/livecare.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#patientPulseTitle')).toHaveText('Welcome back, Anthony');
  await expect(page.locator('#patientService')).toHaveText('WHEELCHAIR');
  const repeatButton = page.getByRole('button', { name: 'Repeat this ride' });
  await expect(repeatButton).toBeVisible();
  await repeatButton.click();

  await expect(page).toHaveURL(/\/booking-app\.html\?repeat=1$/);
  await expect(page.locator('#pickup')).toHaveValue(ride.pickup);
  await expect(page.locator('#destination')).toHaveValue(ride.destination);
  await expect(page.locator('#service')).toHaveValue('wheelchair');
  await expect(page.locator('#tripDate')).toHaveValue('');
  await expect(page.locator('#tripTime')).toHaveValue('');
  await expect(page.locator('#appointmentTime')).toHaveValue('');
  await expect(page.locator('#patientDefaultsBanner')).toContainText('Wheelchair transportation');
  await expect(page.locator('#repeatRideNotice')).toContainText('Choose a new appointment date and time');
});
