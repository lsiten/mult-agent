/**
 * E2E 测试：DevTools 页面
 *
 * 验证：
 * - DevTools 页面可以通过快捷键 Cmd+Shift+D 打开
 * - 日志标签可以显示日志内容
 * - 服务标签可以显示服务状态
 * - IPC 标签可以显示 IPC 处理器列表
 */

import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';

test.describe('DevTools 页面', () => {
  test('应该能通过快捷键打开 DevTools 页面', async () => {
    test.setTimeout(90000);

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        USE_NEW_LIFECYCLE: 'true',
      },
      timeout: 60000,
    });

    await new Promise(resolve => setTimeout(resolve, 8000));

    await new Promise(resolve => setTimeout(resolve, 8000));

    const window = await electronApp.firstWindow({ timeout: 45000 });
    await window.waitForLoadState('domcontentloaded', { timeout: 60000 });

    // 按下 Cmd+Shift+D (macOS) 或 Ctrl+Shift+D (Windows/Linux)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await window.keyboard.press(`${modifier}+Shift+D`);

    // 等待导航到 /dev-tools
    await window.waitForURL('**/dev-tools', { timeout: 5000 });

    // 验证 DevTools 页面标题
    const heading = await window.locator('h1').first();
    const headingText = await heading.textContent();
    expect(headingText).toContain('Development Tools');

    // 截图
    await window.screenshot({ path: 'tests/e2e/screenshots/devtools-page.png' });

    await electronApp.close();
  });

  test('日志标签应该显示日志内容', async () => {
    test.setTimeout(90000);

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        USE_NEW_LIFECYCLE: 'true',
      },
      timeout: 30000,
    });

    await new Promise(resolve => setTimeout(resolve, 8000));

    const window = await electronApp.firstWindow({ timeout: 30000 });
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // 导航到 DevTools
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await window.keyboard.press(`${modifier}+Shift+D`);
    await window.waitForURL('**/dev-tools', { timeout: 5000 });

    // 点击日志标签
    const logsTab = window.locator('button:has-text("日志"), button:has-text("Logs")').first();
    await logsTab.click();

    // 等待日志内容加载
    await window.waitForTimeout(2000);

    // 验证侧边栏存在（文件选择器）
    const sidebar = window.locator('text=/agent|errors|gateway/').first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // 截图
    await window.screenshot({ path: 'tests/e2e/screenshots/devtools-logs.png' });

    await electronApp.close();
  });

  test('服务标签应该显示服务状态', async () => {
    test.setTimeout(60000);

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        USE_NEW_LIFECYCLE: 'true',
      },
      timeout: 30000,
    });

    await new Promise(resolve => setTimeout(resolve, 8000));

    const window = await electronApp.firstWindow({ timeout: 30000 });
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // 导航到 DevTools
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await window.keyboard.press(`${modifier}+Shift+D`);
    await window.waitForURL('**/dev-tools', { timeout: 5000 });

    // 点击服务标签
    const servicesTab = window.locator('button:has-text("服务"), button:has-text("Services")').first();
    await servicesTab.click();

    // 等待服务列表加载
    await window.waitForTimeout(1000);

    // 验证至少有一个服务显示
    const serviceItems = window.locator('text=/Environment Service|Gateway Service|Vite Dev Server/');
    await expect(serviceItems.first()).toBeVisible({ timeout: 5000 });

    // 截图
    await window.screenshot({ path: 'tests/e2e/screenshots/devtools-services.png' });

    await electronApp.close();
  });

  test('IPC 标签应该显示处理器列表', async () => {
    test.setTimeout(60000);

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        USE_NEW_LIFECYCLE: 'true',
      },
      timeout: 30000,
    });

    await new Promise(resolve => setTimeout(resolve, 8000));

    const window = await electronApp.firstWindow({ timeout: 30000 });
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // 导航到 DevTools
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await window.keyboard.press(`${modifier}+Shift+D`);
    await window.waitForURL('**/dev-tools', { timeout: 5000 });

    // 点击 IPC 标签
    const ipcTab = window.locator('button:has-text("IPC")').first();
    await ipcTab.click();

    // 等待 IPC 列表加载
    await window.waitForTimeout(1000);

    // 验证显示 IPC 处理器
    const ipcHandlers = window.locator('code:has-text("python:getStatus"), code:has-text("python:restart")');
    await expect(ipcHandlers.first()).toBeVisible({ timeout: 5000 });

    // 验证显示处理器数量
    const title = window.locator('h3:has-text("IPC"), h3:has-text("15")');
    await expect(title.first()).toBeVisible({ timeout: 5000 });

    // 截图
    await window.screenshot({ path: 'tests/e2e/screenshots/devtools-ipc.png' });

    await electronApp.close();
  });

  test('状态标签应该嵌入 StatusPage', async () => {
    test.setTimeout(60000);

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        USE_NEW_LIFECYCLE: 'true',
      },
      timeout: 30000,
    });

    await new Promise(resolve => setTimeout(resolve, 8000));

    const window = await electronApp.firstWindow({ timeout: 30000 });
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // 导航到 DevTools
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await window.keyboard.press(`${modifier}+Shift+D`);
    await window.waitForURL('**/dev-tools', { timeout: 5000 });

    // 默认应该显示状态标签
    await window.waitForTimeout(2000);

    // 验证显示 Agent 和 Gateway 信息
    const statusInfo = window.locator('text=/Agent|Gateway|Active Sessions/');
    await expect(statusInfo.first()).toBeVisible({ timeout: 5000 });

    // 截图
    await window.screenshot({ path: 'tests/e2e/screenshots/devtools-status.png' });

    await electronApp.close();
  });
});
