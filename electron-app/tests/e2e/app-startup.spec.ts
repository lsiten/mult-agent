/**
 * E2E 测试：应用启动流程
 *
 * 验证：
 * - 应用能够成功启动
 * - 窗口能够正确显示
 * - Gateway 健康检查通过
 */

import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';

test.describe('应用启动流程', () => {
  test('应该成功启动应用并显示窗口', async () => {
    test.setTimeout(90000);

    // 启动 Electron 应用
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        USE_NEW_LIFECYCLE: 'true',
      },
      timeout: 60000,
    });

    // 等待足够时间让 Gateway 和 Vite 启动
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 获取窗口
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThan(0);
    const window = windows[0];
    expect(window).toBeDefined();

    // 验证窗口标题
    const title = await window.title();
    expect(title).toBeTruthy();

    // 等待页面加载
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // 截图（调试用）
    await window.screenshot({ path: 'tests/e2e/screenshots/startup.png' });

    // 关闭应用
    await electronApp.close();
  });

  test('应该加载 Vite dev server（开发模式）', async () => {
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

    const window = await electronApp.firstWindow({ timeout: 45000 });

    // 验证 URL 是 localhost:5173
    const url = window.url();
    expect(url).toContain('localhost:5173');

    await electronApp.close();
  });

  test('Gateway 应该通过健康检查', async () => {
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

    // 等待 Gateway 启动
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // 调用 IPC 获取 Gateway 状态
    const window = await electronApp.firstWindow({ timeout: 45000 });
    const status = await window.evaluate(() => {
      return (window as any).electronAPI?.invoke('python:getStatus', {});
    });

    expect(status).toBeDefined();
    expect(status.ok).toBe(true);
    expect(status.data.running).toBe(true);
    expect(status.data.healthy).toBe(true);

    await electronApp.close();
  });
});
