/**
 * ViteDevService
 *
 * 管理 Vite 开发服务器（仅开发模式）
 */

import { Service } from '../core/service.interface';
import { ViteDevServer } from '../vite-dev-server';
import { AppEnvironment } from '../env-detector';

export interface ViteDevServiceConfig {
  environment: AppEnvironment;
  webPath: string;
}

/**
 * ViteDevService 类
 */
export class ViteDevService implements Service {
  readonly id = 'vite-dev';
  readonly required = false; // 可选服务（仅开发模式）
  readonly dependencies = ['gateway'];

  private server?: ViteDevServer;
  private isDev: boolean;

  constructor(config: ViteDevServiceConfig) {
    this.isDev = config.environment === AppEnvironment.DEVELOPMENT;
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    // 仅在开发模式启动
    if (!this.isDev) {
      console.log('[ViteDevService] Skipped (production mode)');
      return;
    }

    console.log('[ViteDevService] Starting Vite dev server...');

    this.server = new ViteDevServer();
    await this.server.start();

    console.log('[ViteDevService] Vite dev server started');
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (this.server) {
      console.log('[ViteDevService] Stopping Vite dev server...');
      await this.server.stop();
      this.server = undefined;
      console.log('[ViteDevService] Vite dev server stopped');
    }
  }

  /**
   * 检查服务是否健康
   */
  isHealthy(): boolean {
    if (!this.isDev) {
      return true; // 生产模式始终健康
    }
    return this.server?.ready() || false;
  }

  /**
   * 获取 Vite URL
   */
  getUrl(): string {
    return this.server?.getUrl() || '';
  }

  /**
   * 获取服务指标
   */
  getMetrics(): Record<string, any> {
    return {
      isDev: this.isDev,
      running: this.server !== undefined,
      ready: this.server?.ready() || false,
      url: this.getUrl(),
    };
  }
}
