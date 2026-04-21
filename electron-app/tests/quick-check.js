#!/usr/bin/env node
/**
 * Quick Check Script
 *
 * Simplified test to verify onboarding modal appears
 * Useful for quick validation during development
 *
 * Run: node tests/quick-check.js
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const electronPath = require('electron');
const appPath = path.join(__dirname, '..');
const testUserDataDir = path.join(os.tmpdir(), 'hermes-electron-quick-test');

async function quickCheck() {
  console.log('\n🧪 Quick Onboarding Check\n');

  // Clean up test directory
  if (fs.existsSync(testUserDataDir)) {
    fs.rmSync(testUserDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testUserDataDir, { recursive: true });

  console.log('1. Launching Electron app...');

  // Launch Electron
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [
      appPath,
      `--user-data-dir=${testUserDataDir}`,
      '--no-sandbox',
    ],
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  console.log('   ✓ App launched');

  // Wait for initialization
  await page.waitForTimeout(2000);

  console.log('\n2. Checking for onboarding modal...');

  // Debug: Check page title
  const title = await page.title().catch(() => 'unknown');
  console.log(`   - Page title: "${title}"`);

  // Debug: Check for React root
  const hasReactRoot = await page.locator('#root').isVisible().catch(() => false);
  console.log(`   - React root visible: ${hasReactRoot}`);

  // Debug: Check if electronAPI is available
  const hasElectronAPI = await page.evaluate(() => {
    return typeof window.electronAPI !== 'undefined';
  }).catch(() => false);
  console.log(`   - electronAPI available: ${hasElectronAPI}`);

  // Debug: Try to call getOnboardingStatus directly
  if (hasElectronAPI) {
    const status = await page.evaluate(async () => {
      try {
        const result = await window.electronAPI.getOnboardingStatus();
        return result;
      } catch (e) {
        return { error: e.message };
      }
    }).catch(e => ({ error: e.message }));
    console.log(`   - Onboarding status:`, status);
  }

  // Debug: Check for any modals
  const modalCount = await page.locator('[class*="modal"], [role="dialog"], [class*="fixed"]').count();
  console.log(`   - Found ${modalCount} potential modal elements`);

  // Check if modal is visible
  const modal = page.locator('[class*="fixed inset-0 z-"][class*="9999"]');
  const isVisible = await modal.isVisible().catch(() => false);

  if (isVisible) {
    console.log('   ✓ Onboarding modal is VISIBLE');

    // Check for step indicator
    const stepText = await page.locator('text=/Step 1\\/4/i').textContent().catch(() => null);
    if (stepText) {
      console.log(`   ✓ Found step indicator: "${stepText.trim()}"`);
    }

    // Check for language selection
    const hasLanguageSelect = await page.locator('text=/Choose your language/i').isVisible().catch(() => false);
    if (hasLanguageSelect) {
      console.log('   ✓ Language selection visible');
    }

    console.log('\n✅ Quick check PASSED - Onboarding modal works!');
  } else {
    console.log('   ✗ Onboarding modal is NOT visible');
    console.log('\n❌ Quick check FAILED - Modal did not appear');

    // Debug: Take screenshot
    await page.screenshot({ path: 'quick-check-debug.png' });
    console.log('   → Screenshot saved to quick-check-debug.png');
  }

  console.log('\n3. Checking marker file...');

  const markerPath = path.join(testUserDataDir, 'config', '.onboarding-complete');
  const markerExists = fs.existsSync(markerPath);

  if (!markerExists) {
    console.log('   ✓ Marker file does NOT exist (correct for first launch)');
  } else {
    console.log('   ✗ Marker file EXISTS (should not exist on first launch)');
  }

  // Close app
  console.log('\n4. Closing app...');
  await electronApp.close();

  // Clean up
  if (fs.existsSync(testUserDataDir)) {
    fs.rmSync(testUserDataDir, { recursive: true, force: true });
  }

  console.log('   ✓ Cleanup complete\n');

  process.exit(isVisible ? 0 : 1);
}

quickCheck().catch((error) => {
  console.error('\n❌ Quick check crashed:', error);
  process.exit(1);
});
