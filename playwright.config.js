const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    viewport: { width: 1280, height: 1400 },
    ignoreHTTPSErrors: true
  },
  webServer: {
    command: 'npx http-server -p 4173',
    port: 4173,
    reuseExistingServer: true,
    timeout: 120000
  }
});
