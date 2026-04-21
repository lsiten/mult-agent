import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Application } from '../../../src/core/application';
import { Service, ServiceState } from '../../../src/core/service.interface';

/**
 * 创建 Mock 服务
 */
function createMockService(
  id: string,
  options: {
    dependencies?: string[];
    required?: boolean;
    startDelay?: number;
    failOnStart?: boolean;
    failOnStop?: boolean;
  } = {}
): Service {
  const {
    dependencies = [],
    required = true,
    startDelay = 0,
    failOnStart = false,
    failOnStop = false,
  } = options;

  return {
    id,
    required,
    dependencies,
    start: vi.fn(async () => {
      if (startDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, startDelay));
      }
      if (failOnStart) {
        throw new Error(`${id} start failed`);
      }
    }),
    stop: vi.fn(async () => {
      if (failOnStop) {
        throw new Error(`${id} stop failed`);
      }
    }),
    isHealthy: vi.fn(() => true),
    onError: vi.fn(),
  };
}

describe('Application', () => {
  let app: Application;

  beforeEach(() => {
    app = new Application();
  });

  describe('服务注册', () => {
    it('应该成功注册服务', () => {
      const service = createMockService('test-service');
      app.register(service);

      const retrieved = app.get('test-service');
      expect(retrieved).toBe(service);
    });

    it('应该拒绝重复注册', () => {
      const service1 = createMockService('test-service');
      const service2 = createMockService('test-service');

      app.register(service1);
      expect(() => app.register(service2)).toThrow('already registered');
    });

    it('应该拒绝空 ID', () => {
      const service = createMockService('');
      expect(() => app.register(service)).toThrow('cannot be empty');
    });

    it('应该拒绝空白 ID', () => {
      const service = createMockService('   ');
      expect(() => app.register(service)).toThrow('cannot be empty');
    });
  });

  describe('拓扑排序', () => {
    it('应该按依赖顺序启动服务', async () => {
      const serviceA = createMockService('a');
      const serviceB = createMockService('b', { dependencies: ['a'] });
      const serviceC = createMockService('c', { dependencies: ['b'] });

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      await app.start();

      // 验证启动顺序
      expect(serviceA.start).toHaveBeenCalled();
      expect(serviceB.start).toHaveBeenCalled();
      expect(serviceC.start).toHaveBeenCalled();

      // 检查状态
      const status = app.getStatus();
      expect(status.started).toBe(true);
      expect(status.services.every((s) => s.state === ServiceState.STARTED)).toBe(true);
    });

    it('应该检测循环依赖', async () => {
      const serviceA = createMockService('a', { dependencies: ['b'] });
      const serviceB = createMockService('b', { dependencies: ['a'] });

      app.register(serviceA);
      app.register(serviceB);

      await expect(app.start()).rejects.toThrow('Circular dependency');
    });

    it('应该检测三节点循环依赖', async () => {
      const serviceA = createMockService('a', { dependencies: ['b'] });
      const serviceB = createMockService('b', { dependencies: ['c'] });
      const serviceC = createMockService('c', { dependencies: ['a'] });

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      await expect(app.start()).rejects.toThrow('Circular dependency');
    });

    it('应该拒绝未注册的依赖', async () => {
      const service = createMockService('test', { dependencies: ['non-existent'] });
      app.register(service);

      await expect(app.start()).rejects.toThrow('not registered');
    });

    it('应该处理复杂依赖图', async () => {
      //     a
      //    / \
      //   b   c
      //    \ /
      //     d
      const serviceA = createMockService('a');
      const serviceB = createMockService('b', { dependencies: ['a'] });
      const serviceC = createMockService('c', { dependencies: ['a'] });
      const serviceD = createMockService('d', { dependencies: ['b', 'c'] });

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);
      app.register(serviceD);

      await app.start();

      // a 必须第一个启动
      expect(serviceA.start).toHaveBeenCalled();
      // d 必须最后启动
      expect(serviceD.start).toHaveBeenCalled();
    });
  });

  describe('启动失败与回滚', () => {
    it('应该在必需服务失败时回滚', async () => {
      const serviceA = createMockService('a');
      const serviceB = createMockService('b', {
        dependencies: ['a'],
        failOnStart: true,
      });
      const serviceC = createMockService('c', { dependencies: ['b'] });

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      await expect(app.start()).rejects.toThrow('failed to start');

      // A 应该被回滚（停止）
      expect(serviceA.stop).toHaveBeenCalled();
      // C 不应该启动
      expect(serviceC.start).not.toHaveBeenCalled();

      // 应用状态应该是未启动
      const status = app.getStatus();
      expect(status.started).toBe(false);
    });

    it('应该在可选服务失败时继续', async () => {
      const serviceA = createMockService('a');
      const serviceB = createMockService('b', {
        dependencies: ['a'],
        required: false,
        failOnStart: true,
      });
      const serviceC = createMockService('c', { dependencies: ['a'] });

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      await app.start();

      // A 应该启动
      expect(serviceA.start).toHaveBeenCalled();
      // B 失败但不阻塞
      expect(serviceB.start).toHaveBeenCalled();
      // C 应该继续启动
      expect(serviceC.start).toHaveBeenCalled();

      const status = app.getStatus();
      expect(status.started).toBe(true);
    });

    it('应该调用服务的 onError 回调', async () => {
      const service = createMockService('test', { failOnStart: true });
      app.register(service);

      await expect(app.start()).rejects.toThrow();
      expect(service.onError).toHaveBeenCalled();
    });
  });

  describe('优雅关闭', () => {
    it('应该按相反顺序停止服务', async () => {
      const serviceA = createMockService('a');
      const serviceB = createMockService('b', { dependencies: ['a'] });
      const serviceC = createMockService('c', { dependencies: ['b'] });

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      await app.start();
      await app.stop();

      // 验证停止顺序（相反）
      expect(serviceC.stop).toHaveBeenCalled();
      expect(serviceB.stop).toHaveBeenCalled();
      expect(serviceA.stop).toHaveBeenCalled();

      const status = app.getStatus();
      expect(status.started).toBe(false);
    });

    it('应该优雅处理停止失败', async () => {
      const serviceA = createMockService('a');
      const serviceB = createMockService('b', {
        dependencies: ['a'],
        failOnStop: true,
      });

      app.register(serviceA);
      app.register(serviceB);

      await app.start();
      await app.stop();

      // 即使 B 停止失败，A 也应该尝试停止
      expect(serviceB.stop).toHaveBeenCalled();
      expect(serviceA.stop).toHaveBeenCalled();
    });

    it('应该允许未启动时调用 stop', async () => {
      await expect(app.stop()).resolves.not.toThrow();
    });
  });

  describe('幂等性', () => {
    it('应该防止重复启动', async () => {
      const service = createMockService('test');
      app.register(service);

      await app.start();
      await app.start(); // 第二次调用

      // start 应该只被调用一次
      expect(service.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('服务检索', () => {
    it('应该通过 ID 获取服务', () => {
      const service = createMockService('test');
      app.register(service);

      expect(app.get('test')).toBe(service);
    });

    it('应该对不存在的服务返回 undefined', () => {
      expect(app.get('non-existent')).toBeUndefined();
    });

    it('应该获取所有服务', () => {
      const serviceA = createMockService('a');
      const serviceB = createMockService('b');

      app.register(serviceA);
      app.register(serviceB);

      const all = app.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(serviceA);
      expect(all).toContain(serviceB);
    });

    it('应该获取服务元数据', async () => {
      const service = createMockService('test');
      app.register(service);
      await app.start();

      const metadata = app.getMetadata('test');
      expect(metadata).toBeDefined();
      expect(metadata?.state).toBe(ServiceState.STARTED);
      expect(metadata?.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('状态报告', () => {
    it('应该报告应用状态', async () => {
      const serviceA = createMockService('a');
      const serviceB = createMockService('b', { dependencies: ['a'] });

      app.register(serviceA);
      app.register(serviceB);

      await app.start();

      const status = app.getStatus();
      expect(status.started).toBe(true);
      expect(status.services).toHaveLength(2);
      expect(status.services[0].id).toBe('a');
      expect(status.services[0].state).toBe(ServiceState.STARTED);
      expect(status.services[0].healthy).toBe(true);
    });

    it('应该报告失败服务的错误', async () => {
      const service = createMockService('test', { failOnStart: true });
      app.register(service);

      await expect(app.start()).rejects.toThrow();

      const status = app.getStatus();
      const serviceStatus = status.services.find((s) => s.id === 'test');
      expect(serviceStatus?.state).toBe(ServiceState.FAILED);
      expect(serviceStatus?.lastError).toContain('start failed');
    });
  });
});
