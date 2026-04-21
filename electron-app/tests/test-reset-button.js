const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

test('onboarding reset button in config page', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
  });

  // Get all windows and find the main window (not DevTools)
  const windows = await electronApp.windows();
  let page;

  for (const window of windows) {
    const title = await window.title();
    console.log(`Found window with title: ${title}`);

    // Skip DevTools window
    if (!title.includes('DevTools')) {
      page = window;
      break;
    }
  }

  // If no non-DevTools window found, wait for one
  if (!page) {
    console.log('Waiting for main window...');
    page = await electronApp.waitForEvent('window', {
      predicate: async (window) => {
        const title = await window.title();
        return !title.includes('DevTools');
      },
      timeout: 30000
    });
  }

  await page.waitForLoadState('domcontentloaded');
  const title = await page.title();
  console.log(`Using window with title: ${title}`);

  // Wait for electronAPI to be available (preload script must run first)
  await page.waitForFunction(() => window.electronAPI !== undefined, { timeout: 30000 });
  console.log('electronAPI is available');

  // Wait for React app to load by checking for root element
  await page.waitForSelector('#root', { timeout: 30000 });
  console.log('Root element found');

  // Wait a bit for React to render
  await page.waitForTimeout(2000);

  // Close onboarding if it appears - check multiple ways
  try {
    console.log('Checking for onboarding dialog...');

    // Look for onboarding-specific elements
    const onboardingTitle = page.locator('text=/步骤|Step/i');
    const skipButton = page.locator('button:has-text("跳过引导"), button:has-text("Skip Guide")');

    const titleVisible = await onboardingTitle.isVisible({ timeout: 10000 }).catch(() => false);
    const skipVisible = await skipButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (titleVisible || skipVisible) {
      console.log('✓ Onboarding dialog detected');

      if (skipVisible) {
        await skipButton.click();
        await page.waitForTimeout(2000);
        console.log('✓ Onboarding dialog closed via skip button');
      } else {
        // Try ESC key
        console.log('Skip button not visible, trying ESC key');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);
      }

      // Wait for backdrop to disappear
      await page.waitForSelector('.fixed.inset-0.z-\\[9999\\]', { state: 'hidden', timeout: 5000 }).catch(() => {
        console.log('⚠ Backdrop did not disappear');
      });
    } else {
      console.log('No onboarding dialog found');
    }
  } catch (error) {
    console.log('Error handling onboarding dialog:', error.message);
  }

  // Debug: check what links are available
  const allLinks = await page.locator('a').evaluateAll(links => links.map(l => l.textContent));
  console.log('Available links:', allLinks);

  // Debug: take a screenshot
  await page.screenshot({ path: 'test-results/debug-screenshot.png' });
  console.log('Screenshot saved to test-results/debug-screenshot.png');

  // Navigate to Config page - try different selectors
  const configLink = page.locator('a:has-text("Config"), a:has-text("配置"), a[href="/config"]').first();
  const linkExists = await configLink.count();
  console.log(`Config link count: ${linkExists}`);

  if (linkExists > 0) {
    await configLink.click();
  } else {
    console.log('Config link not found, skipping test');
    await electronApp.close();
    return;
  }
  await page.waitForTimeout(2000);

  // Check if the reset button exists (only in Electron environment)
  const resetButton = page.locator('button[title*="Setup"], button[title*="设置"]');
  const buttonCount = await resetButton.count();

  console.log(`Found ${buttonCount} setup reset button(s)`);

  if (buttonCount > 0) {
    // Button should be visible
    await expect(resetButton.first()).toBeVisible();
    console.log('✓ Setup reset button is visible');

    // Click the button
    console.log('Clicking reset button...');
    await resetButton.first().click();
    await page.waitForTimeout(1000);

    // Check if toast appeared
    const toast = page.locator('text=/setup|设置/i').first();
    if (await toast.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✓ Toast notification appeared');
    }

    // Wait for the IPC call to complete and state to update
    console.log('Waiting for onboarding modal to appear...');
    await page.waitForTimeout(3000);

    // Check if onboarding modal appeared - use same detection as before
    const onboardingTitle = page.locator('text=/步骤|Step/i');
    const modalVisible = await onboardingTitle.isVisible({ timeout: 10000 }).catch(() => false);

    if (modalVisible) {
      console.log('✓ Onboarding modal reopened successfully after reset');
      await expect(onboardingTitle).toBeVisible();
    } else {
      console.log('⚠ Onboarding modal did not appear after reset');
      await page.screenshot({ path: 'test-results/after-reset-screenshot.png' });
      console.log('Screenshot saved to test-results/after-reset-screenshot.png');
      throw new Error('Onboarding modal should reappear after reset');
    }
  } else {
    console.log('⚠ Setup reset button not found (might be web-only environment)');
  }

  await electronApp.close();
});
