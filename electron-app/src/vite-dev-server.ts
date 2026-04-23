/**
 * Vite Dev Server Manager
 *
 * 在开发模式下自动启动和管理 Vite 开发服务器
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { EnvManager } from './env-manager';

export class ViteDevServer {
  private process: ChildProcess | null = null;
  private isReady = false;
  private readonly webPath: string;
  private readonly port = 5173;
  private readonly startupTimeoutMs = 10000; // 10秒启动超时 (实际 ~1s，但留余量)
  private readonly checkIntervalMs = 100; // 快速检查间隔

  constructor() {
    // web 目录在 electron-app 的上一级
    this.webPath = path.join(__dirname, '..', '..', 'web');
  }

  /**
   * 启动 Vite dev server
   */
  async start(): Promise<void> {
    if (this.process) {
      console.log('[ViteDevServer] Already running');
      return;
    }

    console.log('[ViteDevServer] Starting Vite dev server...');
    console.log(`[ViteDevServer] Working directory: ${this.webPath}`);

    // 检查 web 目录是否存在
    const fs = require('fs');
    if (!fs.existsSync(this.webPath)) {
      throw new Error(`Web directory not found: ${this.webPath}`);
    }

    // 检查 package.json 是否存在
    const packageJsonPath = path.join(this.webPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`package.json not found in: ${this.webPath}`);
    }

    // 启动 Vite。必须固定 5173，否则 Vite 会在端口冲突时自动退到
    // 5174，但 Electron 仍加载 5173，导致窗口连接到旧的 dev server。
    this.process = spawn('npm', ['run', 'dev', '--', '--port', String(this.port), '--strictPort'], {
      cwd: this.webPath,
      env: EnvManager.getViteEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 监听输出以检测启动状态
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log(`[ViteDevServer] ${output.trim()}`);
      // 注意: 不从 stdout 设置 isReady，只通过 HTTP 健康检查
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();

      // 检测端口冲突
      if (error.includes('EADDRINUSE') || error.includes('port') && error.includes('5173')) {
        console.error(`[ViteDevServer] PORT CONFLICT: Port 5173 is already in use`);
      }

      // Vite 的一些信息输出到 stderr，但不一定是错误
      if (error.includes('error') || error.includes('Error')) {
        console.error(`[ViteDevServer] ERROR: ${error.trim()}`);
      } else {
        console.log(`[ViteDevServer] ${error.trim()}`);
      }
    });

    this.process.on('exit', (code: number | null, signal: string | null) => {
      console.log(`[ViteDevServer] Process exited with code ${code}, signal ${signal}`);
      this.process = null;
      this.isReady = false;
    });

    this.process.on('error', (error: Error) => {
      console.error('[ViteDevServer] Failed to start:', error);
      this.process = null;
      this.isReady = false;
    });

    // 等待服务器就绪
    await this.waitForReady();
  }

  /**
   * 等待 Vite dev server 就绪
   */
  private async waitForReady(): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (Date.now() - startTime < this.startupTimeoutMs) {
      attempt++;

      // 先检查进程是否还在运行
      if (!this.process) {
        throw new Error('Vite dev server process exited during startup');
      }

      // 尝试连接 (快速检查)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 500); // 减少单次超时

        const response = await fetch(`http://localhost:${this.port}`, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok || response.status === 404) {
          // 404 也算成功，说明服务器在运行只是路由不存在
          this.isReady = true;
          const elapsed = Date.now() - startTime;
          console.log(`[ViteDevServer] Ready after ${elapsed}ms (${attempt} attempts)`);
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // 每 10 次尝试记录一次，避免日志过多
        if (attempt % 10 === 0) {
          console.log(`[ViteDevServer] Health check attempt ${attempt} failed: ${lastError.message}`);
        }
      }

      // 快速检查间隔 (100ms)
      await new Promise(resolve => setTimeout(resolve, this.checkIntervalMs));
    }

    throw new Error(
      `Vite dev server failed to start within ${this.startupTimeoutMs}ms (${attempt} attempts)\n` +
      `Last error: ${lastError?.message || 'Unknown'}`
    );
  }

  /**
   * 停止 Vite dev server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    console.log('[ViteDevServer] Stopping Vite dev server...');

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      // 5 秒后强制 SIGKILL
      const killTimeoutId = setTimeout(() => {
        if (this.process) {
          console.log('[ViteDevServer] Force killing...');
          this.process.kill('SIGKILL');
        }
      }, 5000);

      this.process.once('exit', () => {
        clearTimeout(killTimeoutId);
        console.log('[ViteDevServer] Stopped');
        this.process = null;
        this.isReady = false;
        resolve();
      });

      // 发送 SIGTERM
      this.process.kill('SIGTERM');
    });
  }

  /**
   * 获取 dev server URL
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * 检查是否就绪
   */
  ready(): boolean {
    return this.isReady && this.process !== null;
  }

  /**
   * 获取进程状态
   */
  getStatus() {
    return {
      running: this.process !== null,
      ready: this.isReady,
      url: this.getUrl(),
      pid: this.process?.pid || null
    };
  }
}
