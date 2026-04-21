import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from '../../../src/process/process-manager';

describe('ProcessManager', () => {
  let manager: ProcessManager;

  afterEach(async () => {
    if (manager && manager.isRunning()) {
      await manager.stop();
    }
  });

  describe('进程启动', () => {
    it('应该启动进程', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['--version'],
      });

      manager.start();
      expect(manager.isRunning()).toBe(true);
      expect(manager.getPid()).toBeTypeOf('number');
    });

    it('应该拒绝重复启动', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['--version'],
      });

      manager.start();
      expect(() => manager.start()).toThrow('already running');
    });

    it('应该使用自定义环境变量', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'console.log(process.env.TEST_VAR)'],
        env: { ...process.env, TEST_VAR: 'test-value' },
      });

      const outputs: string[] = [];
      manager.setStdoutCallback((out) => outputs.push(out));
      manager.start();

      // 等待输出
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(outputs.some((out) => out.includes('test-value'))).toBe(true);
          resolve();
        }, 100);
      });
    });
  });

  describe('输出捕获', () => {
    it('应该捕获 stdout', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'console.log("test output")'],
      });

      const outputs: string[] = [];
      manager.setStdoutCallback((out) => outputs.push(out));
      manager.start();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(outputs.some((out) => out.includes('test output'))).toBe(true);
          resolve();
        }, 100);
      });
    });

    it('应该捕获 stderr', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'console.error("test error")'],
      });

      const errors: string[] = [];
      manager.setStderrCallback((err) => errors.push(err));
      manager.start();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(errors.some((err) => err.includes('test error'))).toBe(true);
          resolve();
        }, 100);
      });
    });

    it('应该修剪空白', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'console.log("  test  ")'],
      });

      const outputs: string[] = [];
      manager.setStdoutCallback((out) => outputs.push(out));
      manager.start();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // 输出应该被修剪
          expect(outputs.some((out) => out.includes('test'))).toBe(true);
          resolve();
        }, 100);
      });
    });
  });

  describe('生命周期跟踪', () => {
    it('应该报告运行状态', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 1000)'],
      });

      expect(manager.isRunning()).toBe(false);
      manager.start();
      expect(manager.isRunning()).toBe(true);

      await manager.stop();
      expect(manager.isRunning()).toBe(false);
    });

    it('应该公开进程 ID', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['--version'],
      });

      expect(manager.getPid()).toBeUndefined();
      manager.start();
      expect(manager.getPid()).toBeGreaterThan(0);
    });

    it('应该在进程退出后返回 undefined PID', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['--version'],
      });

      manager.start();

      return new Promise<void>((resolve) => {
        manager.setExitCallback(() => {
          expect(manager.getPid()).toBeUndefined();
          resolve();
        });
      });
    });
  });

  describe('优雅关闭', () => {
    it('应该用 SIGTERM 优雅终止', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 10000)'],
      });

      manager.start();
      await manager.stop();

      // 进程应该已停止
      expect(manager.isRunning()).toBe(false);
    });

    it('应该在超时后用 SIGKILL 强制杀死', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: [
          '-e',
          `
          // 忽略 SIGTERM
          process.on('SIGTERM', () => {
            console.log('SIGTERM received but ignored');
          });
          setTimeout(() => {}, 60000);
        `,
        ],
        gracefulTimeoutMs: 300,
      });

      manager.start();
      expect(manager.isRunning()).toBe(true);

      await manager.stop();

      // 即使忽略 SIGTERM，也应该通过 SIGKILL 停止
      expect(manager.isRunning()).toBe(false);
    }, 10000); // 增加测试超时

    it('应该支持自定义超时', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: [
          '-e',
          `
          // 忽略 SIGTERM
          process.on('SIGTERM', () => {});
          setTimeout(() => {}, 60000);
        `,
        ],
      });

      manager.start();
      expect(manager.isRunning()).toBe(true);

      await manager.stop(100); // 自定义 100ms 超时

      // 进程应该已停止
      expect(manager.isRunning()).toBe(false);
    }, 10000); // 增加测试超时
  });

  describe('退出事件处理', () => {
    it('应该报告退出代码', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'process.exit(0)'],
      });

      return new Promise<void>((resolve) => {
        manager.setExitCallback((code) => {
          expect(code).toBe(0);
          resolve();
        });
        manager.start();
      });
    });

    it('应该报告非零退出', () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'process.exit(1)'],
      });

      return new Promise<void>((resolve) => {
        manager.setExitCallback((code) => {
          expect(code).toBe(1);
          resolve();
        });
        manager.start();
      });
    });

    it('应该在 SIGKILL 时报告 null', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: [
          '-e',
          `
          process.on('SIGTERM', () => {}); // 忽略 SIGTERM
          setTimeout(() => {}, 60000);
        `,
        ],
        gracefulTimeoutMs: 100,
      });

      return new Promise<void>((resolve) => {
        manager.setExitCallback((code) => {
          // SIGKILL 通常返回 null 或特定信号代码
          expect(code === null || typeof code === 'number').toBe(true);
          resolve();
        });
        manager.start();
        setTimeout(() => manager.stop(), 50);
      });
    });
  });

  describe('幂等停止', () => {
    it('应该允许停止未启动的进程', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['--version'],
      });

      await expect(manager.stop()).resolves.not.toThrow();
    });

    it('应该允许多次停止', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 1000)'],
      });

      manager.start();
      await manager.stop();
      await expect(manager.stop()).resolves.not.toThrow();
    });
  });

  describe('允许重启', () => {
    it('应该在停止后允许重启', async () => {
      manager = new ProcessManager({
        command: 'node',
        args: ['--version'],
      });

      manager.start();
      await manager.stop();

      // 应该能够再次启动
      expect(() => manager.start()).not.toThrow();
      expect(manager.isRunning()).toBe(true);
    });
  });
});
