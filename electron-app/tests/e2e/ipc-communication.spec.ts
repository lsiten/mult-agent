/**
 * E2E 测试：IPC 通信
 *
 * 验证：
 * - Renderer 可以调用 IPC 处理器
 * - 输入验证正确工作
 * - 限流保护正确工作
 */

import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';

test.describe('IPC 通信', () => {
  test('应该成功调用 python:getStatus', async () => {
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

    // 等待 Gateway 启动
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 调用 IPC
    const result = await window.evaluate(() => {
      return (window as any).electronAPI?.invoke('python:getStatus', {
        includeMetrics: true,
      });
    });

    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.running).toBe(true);

    await electronApp.close();
  });

  test('应该验证 shell:openExternal 的 URL', async () => {
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

    // 测试无效 URL（ftp 协议不允许）
    const result = await window.evaluate(() => {
      return (window as any).electronAPI?.invoke('shell:openExternal', {
        url: 'ftp://example.com',
      });
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.error).toContain('protocols are allowed');

    await electronApp.close();
  });

  test('应该对 python:restart 应用限流', async () => {
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

    // 等待 Gateway 启动
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 调用 3 次重启（限制内）
    for (let i = 0; i < 3; i++) {
      const result = await window.evaluate(() => {
        return (window as any).electronAPI?.invoke('python:restart', {
          reason: 'E2E test',
        });
      });
      expect(result.ok).toBe(true);
    }

    // 第 4 次应该被限流
    const result = await window.evaluate(() => {
      return (window as any).electronAPI?.invoke('python:restart', {
        reason: 'E2E test',
      });
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');

    await electronApp.close();
  });

  test('应该正确处理 window:minimize', async () => {
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

    // 调用最小化
    const result = await window.evaluate(() => {
      return (window as any).electronAPI?.invoke('window:minimize', {});
    });

    expect(result.ok).toBe(true);
    expect(result.data.success).toBe(true);

    await electronApp.close();
  });

  test('应该返回 Gateway auth token', async () => {
    test.setTimeout(90000);

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'production', // 仅生产环境生成 token
        USE_NEW_LIFECYCLE: 'true',
      },
      timeout: 60000,
    });

    await new Promise(resolve => setTimeout(resolve, 8000));

    await new Promise(resolve => setTimeout(resolve, 8000));

    const window = await electronApp.firstWindow({ timeout: 45000 });

    const result = await window.evaluate(() => {
      return (window as any).electronAPI?.invoke('gateway:getAuthToken', {});
    });

    expect(result.ok).toBe(true);
    // 生产环境应该有 token
    if (process.env.NODE_ENV === 'production') {
      expect(result.data.token).toBeTruthy();
      expect(result.data.token.length).toBe(64); // 32 bytes * 2 (hex)
    }

    await electronApp.close();
  });
});
