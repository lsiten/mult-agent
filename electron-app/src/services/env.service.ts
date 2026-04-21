/**
 * EnvService
 *
 * 管理环境变量（包装 EnvManager）
 */

import { Service } from '../core/service.interface';
import { EnvManager } from '../env-manager';
import { AppEnvironment } from '../env-detector';

export interface EnvServiceConfig {
  environment: AppEnvironment;
}

/**
 * EnvService 类
 */
export class EnvService implements Service {
  readonly id = 'env';
  readonly required = true;
  readonly dependencies: string[] = [];

  private config: EnvServiceConfig;
  private initialized = false;

  constructor(config: EnvServiceConfig) {
    this.config = config;
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    console.log('[EnvService] Setting up environment...');

    // 设置环境变量
    EnvManager.setup({
      isDev: this.config.environment === AppEnvironment.DEVELOPMENT,
    });

    this.initialized = true;
    console.log('[EnvService] Environment setup complete');
    console.log('[EnvService] HERMES_HOME:', EnvManager.getHermesHome());
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    console.log('[EnvService] Stopped');
    this.initialized = false;
  }

  /**
   * 检查服务是否健康
   */
  isHealthy(): boolean {
    return this.initialized;
  }

  /**
   * 获取服务指标
   */
  getMetrics(): Record<string, any> {
    return {
      initialized: this.initialized,
      envCount: Object.keys(process.env).length,
      hermesHome: EnvManager.getHermesHome(),
    };
  }
}
