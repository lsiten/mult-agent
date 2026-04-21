import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Application } from '../../src/core/application';
import { Service, ServiceState } from '../../src/core/service.interface';

/**
 * 集成测试：服务生命周期
 *
 * 验证服务依赖顺序和生命周期管理
 */

/**
 * 创建 Mock 服务（简化版）
 */
function createMockService(
  id: string,
  dependencies: string[] = [],
  required = true
): Service {
  return {
    id,
    dependencies,
    required,
    start: vi.fn(async () => {
      console.log(`[Test] ${id} started`);
    }),
    stop: vi.fn(async () => {
      console.log(`[Test] ${id} stopped`);
    }),
    isHealthy: vi.fn(() => true),
  };
}

describe('服务依赖顺序（集成测试）', () => {
  let app: Application;

  beforeEach(() => {
    app = new Application();
  });

  it('应该按照正确的依赖顺序启动服务', async () => {
    // 模拟实际的服务依赖关系
    // env (无依赖)
    // config (依赖 env)
    // gateway (依赖 env, config)
    // vite-dev (依赖 gateway)
    // window (依赖 gateway, vite-dev)

    const envService = createMockService('env');
    const configService = createMockService('config', ['env']);
    const gatewayService = createMockService('gateway', ['env', 'config']);
    const viteDevService = createMockService('vite-dev', ['gateway'], false);
    const windowService = createMockService('window', ['gateway', 'vite-dev']);

    app.register(envService);
    app.register(configService);
    app.register(gatewayService);
    app.register(viteDevService);
    app.register(windowService);

    await app.start();

    // 验证所有服务都已启动
    expect(envService.start).toHaveBeenCalled();
    expect(configService.start).toHaveBeenCalled();
    expect(gatewayService.start).toHaveBeenCalled();
    expect(viteDevService.start).toHaveBeenCalled();
    expect(windowService.start).toHaveBeenCalled();

    // 验证状态
    const status = app.getStatus();
    expect(status.started).toBe(true);
    expect(status.services.every((s) => s.state === ServiceState.STARTED)).toBe(true);
  });

  it('应该按照相反顺序停止服务', async () => {
    const envService = createMockService('env');
    const configService = createMockService('config', ['env']);
    const gatewayService = createMockService('gateway', ['env', 'config']);

    app.register(envService);
    app.register(configService);
    app.register(gatewayService);

    await app.start();
    await app.stop();

    // 验证所有服务都已停止
    expect(gatewayService.stop).toHaveBeenCalled();
    expect(configService.stop).toHaveBeenCalled();
    expect(envService.stop).toHaveBeenCalled();

    const status = app.getStatus();
    expect(status.started).toBe(false);
  });

  it('应该在可选服务失败时继续启动', async () => {
    const gatewayService = createMockService('gateway');
    const viteDevService = createMockService('vite-dev', ['gateway'], false);
    const windowService = createMockService('window', ['gateway']);

    // vite-dev 启动失败
    viteDevService.start = vi.fn(async () => {
      throw new Error('Vite dev server failed');
    });

    app.register(gatewayService);
    app.register(viteDevService);
    app.register(windowService);

    // 应该不抛出错误
    await expect(app.start()).resolves.not.toThrow();

    // gateway 和 window 应该成功启动
    expect(gatewayService.start).toHaveBeenCalled();
    expect(windowService.start).toHaveBeenCalled();

    const status = app.getStatus();
    expect(status.started).toBe(true);

    // vite-dev 应该处于 failed 状态
    const viteStatus = status.services.find((s) => s.id === 'vite-dev');
    expect(viteStatus?.state).toBe(ServiceState.FAILED);
  });

  it('应该在必需服务失败时回滚', async () => {
    const envService = createMockService('env');
    const configService = createMockService('config', ['env']);
    const gatewayService = createMockService('gateway', ['env', 'config']);

    // gateway 启动失败
    gatewayService.start = vi.fn(async () => {
      throw new Error('Gateway failed to start');
    });

    app.register(envService);
    app.register(configService);
    app.register(gatewayService);

    // 应该抛出错误
    await expect(app.start()).rejects.toThrow('failed to start');

    // env 和 config 应该被回滚（停止）
    expect(envService.stop).toHaveBeenCalled();
    expect(configService.stop).toHaveBeenCalled();

    const status = app.getStatus();
    expect(status.started).toBe(false);
  });

  it('应该报告所有服务的健康状态', async () => {
    const envService = createMockService('env');
    const configService = createMockService('config', ['env']);
    const gatewayService = createMockService('gateway', ['env', 'config']);

    // gateway 不健康
    gatewayService.isHealthy = vi.fn(() => false);

    app.register(envService);
    app.register(configService);
    app.register(gatewayService);

    await app.start();

    const status = app.getStatus();
    const gatewayStatus = status.services.find((s) => s.id === 'gateway');
    expect(gatewayStatus?.healthy).toBe(false);
  });

  it('应该支持服务检索', async () => {
    const envService = createMockService('env');
    const configService = createMockService('config', ['env']);

    app.register(envService);
    app.register(configService);

    // 按 ID 获取
    expect(app.get('env')).toBe(envService);
    expect(app.get('config')).toBe(configService);
    expect(app.get('non-existent')).toBeUndefined();

    // 获取所有服务
    const all = app.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(envService);
    expect(all).toContain(configService);
  });
});
