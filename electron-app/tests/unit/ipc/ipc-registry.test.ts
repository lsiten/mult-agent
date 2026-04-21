/**
 * IPC Registry 单元测试
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { IpcRegistry, IpcHandlerConfig } from '../../../src/ipc/ipc-registry';
import { z } from 'zod';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

describe('IpcRegistry', () => {
  let registry: IpcRegistry;

  beforeEach(() => {
    registry = new IpcRegistry();
    vi.clearAllMocks();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('注册处理器', () => {
    test('应该成功注册处理器', () => {
      const config: IpcHandlerConfig = {
        channel: 'test:handler',
        handler: async () => ({ result: 'ok' }),
      };

      registry.register(config);
      expect(registry.getHandlers()).toContain('test:handler');
    });

    test('应该拒绝重复注册', () => {
      const config: IpcHandlerConfig = {
        channel: 'test:handler',
        handler: async () => ({ result: 'ok' }),
      };

      registry.register(config);
      expect(() => registry.register(config)).toThrow('already registered');
    });

    test('应该支持批量注册', () => {
      const configs: IpcHandlerConfig[] = [
        { channel: 'test:one', handler: async () => 1 },
        { channel: 'test:two', handler: async () => 2 },
      ];

      registry.registerAll(configs);
      expect(registry.getHandlers()).toEqual(['test:one', 'test:two']);
    });
  });

  describe('输入验证', () => {
    test('应该验证输入符合 schema', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const config: IpcHandlerConfig = {
        channel: 'test:validate',
        schema,
        handler: async (_event, input) => input,
      };

      registry.register(config);

      // 获取 electron ipcMain.handle 的 mock
      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      // 测试有效输入
      const validInput = { name: 'Alice', age: 25 };
      const result = await registeredHandler({} as any, validInput);
      expect(result).toEqual({
        ok: true,
        data: validInput,
      });
    });

    test('应该拒绝无效输入', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const config: IpcHandlerConfig = {
        channel: 'test:validate',
        schema,
        handler: async (_event, input) => input,
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      // 测试无效输入
      const invalidInput = { name: 'Alice', age: 'not a number' };
      const result = await registeredHandler({} as any, invalidInput);
      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining('Invalid input'),
        code: 'VALIDATION_ERROR',
      });
    });

    test('应该允许无 schema 的处理器', async () => {
      const config: IpcHandlerConfig = {
        channel: 'test:no-schema',
        handler: async (_event, input) => ({ received: input }),
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      const result = await registeredHandler({} as any, { anything: 'goes' });
      expect(result).toEqual({
        ok: true,
        data: { received: { anything: 'goes' } },
      });
    });
  });

  describe('限流', () => {
    test('应该允许限制次数内的请求', async () => {
      const config: IpcHandlerConfig = {
        channel: 'test:rate-limit',
        handler: async () => ({ success: true }),
        rateLimit: { maxAttempts: 3, windowMs: 1000 },
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      // 前 3 次应该成功
      for (let i = 0; i < 3; i++) {
        const result = await registeredHandler({} as any, {});
        expect(result.ok).toBe(true);
      }
    });

    test('应该拒绝超过限制的请求', async () => {
      const config: IpcHandlerConfig = {
        channel: 'test:rate-limit',
        handler: async () => ({ success: true }),
        rateLimit: { maxAttempts: 3, windowMs: 1000 },
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      // 前 3 次成功
      for (let i = 0; i < 3; i++) {
        await registeredHandler({} as any, {});
      }

      // 第 4 次应该被限流
      const result = await registeredHandler({} as any, {});
      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining('Rate limit exceeded'),
        code: 'RATE_LIMITED',
      });
    });

    test('应该在时间窗口过后重置限流', async () => {
      const config: IpcHandlerConfig = {
        channel: 'test:rate-limit',
        handler: async () => ({ success: true }),
        rateLimit: { maxAttempts: 2, windowMs: 100 }, // 100ms 窗口
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      // 前 2 次成功
      await registeredHandler({} as any, {});
      await registeredHandler({} as any, {});

      // 第 3 次被限流
      let result = await registeredHandler({} as any, {});
      expect(result.ok).toBe(false);

      // 等待窗口过期
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 应该恢复正常
      result = await registeredHandler({} as any, {});
      expect(result.ok).toBe(true);
    });

    test('应该支持重置限流记录', async () => {
      const config: IpcHandlerConfig = {
        channel: 'test:rate-limit',
        handler: async () => ({ success: true }),
        rateLimit: { maxAttempts: 1, windowMs: 1000 },
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      // 第 1 次成功
      await registeredHandler({} as any, {});

      // 第 2 次被限流
      let result = await registeredHandler({} as any, {});
      expect(result.ok).toBe(false);

      // 重置限流
      registry.resetRateLimit('test:rate-limit');

      // 应该恢复正常
      result = await registeredHandler({} as any, {});
      expect(result.ok).toBe(true);
    });
  });

  describe('错误处理', () => {
    test('应该捕获处理器中的错误', async () => {
      const config: IpcHandlerConfig = {
        channel: 'test:error',
        handler: async () => {
          throw new Error('Something went wrong');
        },
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      const result = await registeredHandler({} as any, {});
      expect(result).toEqual({
        ok: false,
        error: 'Something went wrong',
        code: 'HANDLER_ERROR',
      });
    });

    test('应该处理非 Error 对象的异常', async () => {
      const config: IpcHandlerConfig = {
        channel: 'test:error',
        handler: async () => {
          throw 'string error'; // eslint-disable-line
        },
      };

      registry.register(config);

      const { ipcMain } = await import('electron');
      const handleFn = vi.mocked(ipcMain.handle);
      const registeredHandler = handleFn.mock.calls[0][1];

      const result = await registeredHandler({} as any, {});
      expect(result).toEqual({
        ok: false,
        error: 'Unknown error',
        code: 'HANDLER_ERROR',
      });
    });
  });

  describe('清理', () => {
    test('应该清除所有处理器', () => {
      const configs: IpcHandlerConfig[] = [
        { channel: 'test:one', handler: async () => 1 },
        { channel: 'test:two', handler: async () => 2 },
      ];

      registry.registerAll(configs);
      expect(registry.getHandlers()).toHaveLength(2);

      registry.clear();
      expect(registry.getHandlers()).toHaveLength(0);
    });
  });
});
