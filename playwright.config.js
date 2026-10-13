// Tests for the site: `npm test`. See tests/ and the "Tests" section of tools/README.md.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60000,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 800 },
    serviceWorkers: 'block',            // only the offline test runs the service worker, in its own context
  },
  webServer: {
    command: 'node tests/serve.js 4173',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
