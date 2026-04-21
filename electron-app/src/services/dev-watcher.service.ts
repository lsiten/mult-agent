/**
 * DevWatcherService
 *
 * 管理开发模式下的 Python 文件监听和热重载
 *
 * 注意：由于 DevWatcher 依赖 PythonManager 和 BrowserWindow，
 * 在新架构中暂时禁用，将来重构为独立的文件监听器
 */

import { Service } from '../core/service.interface';
import { AppEnvironment } from '../env-detector';

export interface DevWatcherServiceConfig {
  environment: AppEnvironment;
}

/**
 * DevWatcherService 类
 */
export class DevWatcherService implements Service {
  readonly id = 'dev-watcher';
  readonly required = false; // 可选服务
  readonly dependencies = ['gateway', 'window'];

  private isDev: boolean;

  constructor(config: DevWatcherServiceConfig) {
    this.isDev = config.environment === AppEnvironment.DEVELOPMENT;
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    // 仅在开发模式启动
    if (!this.isDev) {
      console.log('[DevWatcherService] Skipped (production mode)');
      return;
    }

    console.log('[DevWatcherService] Skipped (needs refactor)');
    // TODO: 重构 DevWatcher 以适配新架构
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    console.log('[DevWatcherService] Stopped');
  }

  /**
   * 检查服务是否健康
   */
  isHealthy(): boolean {
    return true;
  }

  /**
   * 获取服务指标
   */
  getMetrics(): Record<string, any> {
    return {
      isDev: this.isDev,
      enabled: false, // 暂时禁用
    };
  }
}
