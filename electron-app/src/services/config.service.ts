/**
 * ConfigService
 *
 * 管理应用配置（包装 ConfigManager）
 */

import { Service } from '../core/service.interface';
import { ConfigManager } from '../config-manager';

/**
 * ConfigService 类
 */
export class ConfigService implements Service {
  readonly id = 'config';
  readonly required = true;
  readonly dependencies = ['env'];

  private manager: ConfigManager;
  private initialized = false;

  constructor() {
    this.manager = new ConfigManager();
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    console.log('[ConfigService] Initializing configuration...');
    await this.manager.initialize();
    this.initialized = true;
    console.log('[ConfigService] Configuration initialized');
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    console.log('[ConfigService] Stopped');
    this.initialized = false;
  }

  /**
   * 检查服务是否健康
   */
  isHealthy(): boolean {
    return this.initialized;
  }

  /**
   * 获取 ConfigManager 实例
   */
  getManager(): ConfigManager {
    return this.manager;
  }

  /**
   * 获取服务指标
   */
  getMetrics(): Record<string, any> {
    return {
      initialized: this.initialized,
    };
  }
}
