/**
 * Simplified Onboarding Tests
 *
 * Basic smoke tests to verify onboarding modal appears and can be dismissed
 */

const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const electronPath = require('electron');
const appPath = path.join(__dirname, '..');
const testUserDataDir = path.join(os.tmpdir(), 'hermes-electron-simple-test');

test.describe('Onboarding - Smoke Tests', () => {
  let electronApp;
  let page;

  test.beforeEach(async () => {
    // Clean up
    if (fs.existsSync(testUserDataDir)) {
      try {
        fs.rmSync(testUserDataDir, { recursive: true, force: true, maxRetries: 3 });
      } catch (e) {
        console.log('  Warning: Could not clean test dir:', e.message);
      }
    }
    fs.mkdirSync(testUserDataDir, { recursive: true });

    // Launch app
    electronApp = await electron.launch({
      executablePath: electronPath,
      args: [appPath, `--user-data-dir=${testUserDataDir}`, '--no-sandbox'],
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Wait for React app to initialize
    await page.waitForTimeout(2000);

    // Wait for electronAPI to be ready
    await page.waitForFunction(
      () => typeof window.electronAPI !== 'undefined',
      { timeout: 15000 }
    ).catch(() => console.log('Warning: electronAPI not detected'));

    // Additional wait for React render
    await page.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    // Don't clean up immediately - let OS handle it
  });

  test('modal appears on first launch', async () => {
    // Check by step progress indicator
    const stepIndicator = page.locator('text=/Step 1\\/4/i');
    await expect(stepIndicator).toBeVisible({ timeout: 10000 });

    console.log('✓ Onboarding modal visible on first launch');
  });

  test('can dismiss modal with Skip Guide button', async () => {
    await page.waitForTimeout(500);

    // Find Skip Guide button
    const skipButton = page.locator('button').filter({ hasText: /Skip|跳过/ }).first();
    await expect(skipButton).toBeVisible({ timeout: 10000 });

    await skipButton.click();
    await page.waitForTimeout(1000);

    // Modal should be gone
    const stepIndicator = page.locator('text=/Step 1\\/4/i');
    await expect(stepIndicator).not.toBeVisible();

    console.log('✓ Can dismiss modal with Skip button');
  });

  test('modal does not appear on second launch', async () => {
    // First launch - skip through
    const skipButton = page.locator('button').filter({ hasText: /Skip|跳过/ }).first();
    await skipButton.click();
    await page.waitForTimeout(1000);

    // Close and relaunch
    await electronApp.close();

    electronApp = await electron.launch({
      executablePath: electronPath,
      args: [appPath, `--user-data-dir=${testUserDataDir}`, '--no-sandbox'],
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Modal should NOT appear
    const stepIndicator = page.locator('text=/Step 1\\/4/i');
    await expect(stepIndicator).not.toBeVisible({ timeout: 5000 });

    console.log('✓ Modal does not appear on second launch');
  });
});

console.log('\n=== Onboarding Smoke Tests ===\n');
