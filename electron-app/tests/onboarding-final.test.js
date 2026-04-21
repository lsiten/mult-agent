/**
 * Onboarding E2E Tests - Final Version
 *
 * Verified working tests for onboarding wizard
 */

const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const electronPath = require('electron');
const appPath = path.join(__dirname, '..');
const testUserDataDir = path.join(os.tmpdir(), 'hermes-electron-final-test');

test.describe('Onboarding Wizard', () => {
  let electronApp;
  let page;

  test.beforeEach(async () => {
    // Clean up
    if (fs.existsSync(testUserDataDir)) {
      try {
        fs.rmSync(testUserDataDir, { recursive: true, force: true, maxRetries: 3 });
      } catch (e) {
        // Ignore cleanup errors
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
    await page.waitForTimeout(2000);

    // Wait for React to initialize
    await page.waitForFunction(
      () => typeof window.electronAPI !== 'undefined',
      { timeout: 15000 }
    ).catch(() => {});

    await page.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('shows onboarding modal on first launch', async () => {
    // Verify modal is visible by checking step indicator
    const stepIndicator = page.locator('text=/Step 1\\/4/i');
    await expect(stepIndicator).toBeVisible({ timeout: 15000 });

    console.log('✓ Onboarding modal appears on first launch');
  });

  test('can dismiss modal with Skip Guide button', async () => {
    // Wait for modal to be ready
    await page.waitForTimeout(1000);

    // Find and click Skip Guide button
    const skipButton = page.locator('button').filter({ hasText: /Skip Guide|跳过指引/ }).first();
    await expect(skipButton).toBeVisible({ timeout: 15000 });

    await skipButton.click();
    await page.waitForTimeout(2000);

    // Verify modal is gone
    const stepIndicator = page.locator('text=/Step 1\\/4/i');
    await expect(stepIndicator).not.toBeVisible();

    console.log('✓ Can dismiss modal with Skip Guide button');
  });

  test('can close modal with ESC key', async () => {
    // Wait for modal
    const stepIndicator = page.locator('text=/Step 1\\/4/i');
    await expect(stepIndicator).toBeVisible({ timeout: 15000 });

    // Press ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // Verify modal is gone
    await expect(stepIndicator).not.toBeVisible();

    console.log('✓ Can close modal with ESC key');
  });
});

console.log('\n=== Onboarding E2E Tests ===\n');
