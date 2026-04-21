const { _electron: electron } = require('playwright');

(async () => {
  const electronApp = await electron.launch({
    args: [
      '.',
      '--user-data-dir=/tmp/hermes-electron-debug',
      '--no-sandbox'
    ],
    env: {
      ...process.env,
      NODE_ENV: 'development'
    }
  });

  const window = await electronApp.firstWindow();

  // Wait for app to load
  await window.waitForTimeout(2000);

  console.log('\n=== Testing Skip Onboarding Flow ===\n');

  // Check if onboarding modal is present
  const modalExists = await window.locator('[role="dialog"], .fixed.inset-0.z-\\[9999\\]').count();
  console.log('Modal found:', modalExists > 0);

  if (modalExists > 0) {
    // Click Skip Guide button
    console.log('Clicking Skip Guide...');
    await window.locator('button:has-text("跳过引导"), button:has-text("Skip Guide")').click();
    await window.waitForTimeout(1000);
  }

  // Now check the layout structure
  console.log('\n=== Page Structure After Skip ===\n');

  const structure = await window.evaluate(() => {
    const root = document.querySelector('#root');
    if (!root) return { error: 'No #root element' };

    const getStructure = (el, depth = 0) => {
      if (depth > 5) return '...';

      const tag = el.tagName.toLowerCase();
      const classes = el.className || '';
      const styles = window.getComputedStyle(el);

      const info = {
        tag,
        classes: classes.toString(),
        display: styles.display,
        height: styles.height,
        overflow: styles.overflow,
        flexGrow: styles.flexGrow,
        flexShrink: styles.flexShrink,
        position: styles.position,
        actualHeight: el.offsetHeight + 'px',
        scrollHeight: el.scrollHeight + 'px',
        children: []
      };

      // Only traverse direct children
      for (let child of el.children) {
        info.children.push(getStructure(child, depth + 1));
      }

      return info;
    };

    return getStructure(root);
  });

  console.log(JSON.stringify(structure, null, 2));

  // Check specific problematic element
  console.log('\n=== Checking main content area ===\n');

  const mainInfo = await window.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return { error: 'No main element' };

    const styles = window.getComputedStyle(main);
    return {
      classes: main.className,
      display: styles.display,
      flexGrow: styles.flexGrow,
      height: styles.height,
      maxHeight: styles.maxHeight,
      overflow: styles.overflow,
      paddingTop: styles.paddingTop,
      actualHeight: main.offsetHeight + 'px',
      scrollHeight: main.scrollHeight + 'px',
      clientHeight: main.clientHeight + 'px'
    };
  });

  console.log(JSON.stringify(mainInfo, null, 2));

  // Check chat page structure
  console.log('\n=== Checking Chat Page Structure ===\n');

  // Navigate to chat
  await window.click('a[href="/chat"]');
  await window.waitForTimeout(1000);

  const chatStructure = await window.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return { error: 'No main element' };

    const chatContainer = main.firstElementChild;
    if (!chatContainer) return { error: 'No chat container' };

    const styles = window.getComputedStyle(chatContainer);
    return {
      tag: chatContainer.tagName.toLowerCase(),
      classes: chatContainer.className,
      display: styles.display,
      height: styles.height,
      overflow: styles.overflow,
      actualHeight: chatContainer.offsetHeight + 'px',
      scrollHeight: chatContainer.scrollHeight + 'px',
      parentHeight: main.offsetHeight + 'px'
    };
  });

  console.log(JSON.stringify(chatStructure, null, 2));

  await window.waitForTimeout(2000);
  await electronApp.close();
})();
