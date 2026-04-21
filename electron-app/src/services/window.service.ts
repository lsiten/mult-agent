/**
 * WindowService
 *
 * 管理 BrowserWindow 生命周期
 */

import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import { Service } from '../core/service.interface';
import { AppEnvironment } from '../env-detector';

export interface WindowServiceConfig {
  environment: AppEnvironment;
  webPath: string;
  preloadPath: string;
  viteUrl?: string; // 开发模式的 Vite URL
}

/**
 * WindowService 类
 */
export class WindowService implements Service {
  readonly id = 'window';
  readonly required = true;
  readonly dependencies = ['gateway', 'vite-dev'];

  private config: WindowServiceConfig;
  private window: BrowserWindow | null = null;
  private isDev: boolean;

  constructor(config: WindowServiceConfig) {
    this.config = config;
    this.isDev = config.environment === AppEnvironment.DEVELOPMENT;
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    console.log('[WindowService] Creating window...');

    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: this.config.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // 加载 URL
    if (this.isDev && this.config.viteUrl) {
      console.log('[WindowService] Loading Vite dev server:', this.config.viteUrl);
      await this.window.loadURL(this.config.viteUrl);
      this.window.webContents.openDevTools();
    } else {
      console.log('[WindowService] Loading production build:', this.config.webPath);
      if (fs.existsSync(this.config.webPath)) {
        await this.window.loadFile(this.config.webPath);
      } else {
        throw new Error(`Web build not found: ${this.config.webPath}`);
      }
    }

    // 监听窗口关闭
    this.window.on('closed', () => {
      this.window = null;
    });

    console.log('[WindowService] Window created');
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      console.log('[WindowService] Closing window...');
      this.window.close();
      this.window = null;
      console.log('[WindowService] Window closed');
    }
  }

  /**
   * 检查服务是否健康
   */
  isHealthy(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  /**
   * 获取窗口实例
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }

  /**
   * 获取服务指标
   */
  getMetrics(): Record<string, any> {
    return {
      created: this.window !== null,
      destroyed: this.window?.isDestroyed() || false,
      visible: this.window?.isVisible() || false,
      focused: this.window?.isFocused() || false,
    };
  }
}
