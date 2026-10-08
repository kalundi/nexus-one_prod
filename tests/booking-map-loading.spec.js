const { test, expect } = require('@playwright/test');

const mapSdk = `window.google = { maps: {
  DirectionsService: class {},
  Map: class { constructor(element) { element.innerHTML = '<div data-testid="google-map">Google street map</div>'; } },
  LatLngBounds: class { extend() {} }
} };`;

test('late fallback location results do not replace an initialized Google map', async ({ page }) => {
  let releaseLocations;
  const locationsReady = new Promise(resolve => { releaseLocations = resolve; });
  let pendingLocations = 0;
  let completedLocations = 0;
  await page.route('https://maps.googleapis.com/**', route => route.fulfill({ contentType: 'application/javascript', body: mapSdk }));
  await page.route('**/api/**', async route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/locations/search') {
      pendingLocations++;
      await locationsReady;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ locations: [{ lat: 39, lng: -76 }] }) });
      completedLocations++;
      return;
    }
    const body = path === '/api/integrations/config'
      ? { googleMapsEnabled: true, googleMapsBrowserKey: 'test-key' } : {};
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  try {
    await page.goto('/booking-app.html?liveMap=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#confirmRiderBtn')).toBeEnabled();
    await expect(page.getByTestId('google-map')).toBeAttached();
    await expect.poll(() => pendingLocations).toBeGreaterThan(0);
    releaseLocations();
    await expect.poll(() => completedLocations).toBe(pendingLocations);
    await expect(page.getByTestId('google-map')).toBeAttached();
    await expect(page.locator('.telemetryFallbackMap')).toHaveCount(0);
  } finally {
    releaseLocations();
  }
});

test('Google map recovers when its script finishes after the startup timeout', async ({ page }) => {
  let releaseSdk;
  const sdkReady = new Promise(resolve => { releaseSdk = resolve; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://maps.googleapis.com/**', async route => {
    await sdkReady;
    return route.fulfill({ contentType: 'application/javascript', body: mapSdk });
  });
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/integrations/config'
      ? { googleMapsEnabled: true, googleMapsBrowserKey: 'test-key' }
      : path === '/api/locations/search' ? { locations: [{ lat: 39, lng: -76 }] } : {};
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  try {
    await page.goto('/booking-app.html?liveMap=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#confirmRiderBtn')).toBeEnabled({ timeout: 3000 });
    await expect(page.locator('#telemetryStatus')).toContainText('temporarily unavailable', { timeout: 12000 });
    releaseSdk();
    await expect(page.getByTestId('google-map')).toBeAttached();
    await expect(page.locator('.telemetryFallbackMap')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    releaseSdk();
  }
});
