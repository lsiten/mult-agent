const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/test-reset-button.js', // Test reset button functionality
  timeout: 90000,
  retries: 1,
  workers: 1, // Run tests serially for Electron

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
  ],
});
