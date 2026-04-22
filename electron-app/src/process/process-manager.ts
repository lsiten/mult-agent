/**
 * ProcessManager
 *
 * 通用进程启动、监控、终止管理器
 * 支持优雅关闭（SIGTERM → SIGKILL）
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { sanitizeLog } from '../utils/sanitize-log';

export interface ProcessManagerConfig {
  /** 可执行文件路径 */
  command: string;
  /** 命令行参数 */
  args: string[];
  /** 环境变量 */
  env?: NodeJS.ProcessEnv;
  /** 工作目录 */
  cwd?: string;
  /** 优雅关闭超时（毫秒） */
  gracefulTimeoutMs?: number;
}

export interface ProcessOutputCallback {
  (output: string): void;
}

export interface ProcessExitCallback {
  (exitCode: number | null): void;
}

/**
 * ProcessManager 类
 */
export class ProcessManager {
  private config: ProcessManagerConfig;
  private process: ChildProcessWithoutNullStreams | null = null;
  private stdoutCallback?: ProcessOutputCallback;
  private stderrCallback?: ProcessOutputCallback;
  private exitCallback?: ProcessExitCallback;

  private readonly DEFAULT_GRACEFUL_TIMEOUT_MS = 5000;

  constructor(config: ProcessManagerConfig) {
    this.config = {
      gracefulTimeoutMs: this.DEFAULT_GRACEFUL_TIMEOUT_MS,
      ...config,
    };
  }

  /**
   * 设置 stdout 回调
   */
  setStdoutCallback(callback: ProcessOutputCallback): void {
    this.stdoutCallback = callback;
  }

  /**
   * 设置 stderr 回调
   */
  setStderrCallback(callback: ProcessOutputCallback): void {
    this.stderrCallback = callback;
  }

  /**
   * 设置退出回调
   */
  setExitCallback(callback: ProcessExitCallback): void {
    this.exitCallback = callback;
  }

  /**
   * 启动进程
   *
   * @throws {Error} 如果进程已在运行
   */
  start(): void {
    if (this.process) {
      throw new Error('Process already running');
    }

    const { command, args, env, cwd } = this.config;

    console.log('[ProcessManager] Spawning:', command, args.join(' '));
    console.log('[ProcessManager] cwd:', cwd || process.cwd());

    this.process = spawn(command, args, {
      env: env || process.env,
      cwd: cwd || process.cwd(),
    });

    // 监听 stdout
    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text && this.stdoutCallback) {
          // 脱敏后传递给回调
          const sanitized = sanitizeLog(text);
          this.stdoutCallback(sanitized);
        }
      });
    }

    // 监听 stderr
    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text && this.stderrCallback) {
          // 脱敏后传递给回调
          const sanitized = sanitizeLog(text);
          this.stderrCallback(sanitized);
        }
      });
    }

    // 监听退出
    this.process.on('close', (code: number | null) => {
      console.log('[ProcessManager] Process closed with code:', code);
      this.process = null;
      if (this.exitCallback) {
        this.exitCallback(code);
      }
    });
  }

  /**
   * 停止进程（优雅关闭）
   *
   * 先发送 SIGTERM，等待 gracefulTimeoutMs 后发送 SIGKILL
   */
  async stop(gracefulTimeoutMs?: number): Promise<void> {
    if (!this.process) {
      // 幂等：如果进程未运行，直接返回
      return;
    }

    const timeout =
      gracefulTimeoutMs !== undefined
        ? gracefulTimeoutMs
        : this.config.gracefulTimeoutMs!;

    const pid = this.process.pid;

    // 发送 SIGTERM
    this.process.kill('SIGTERM');

    // 等待进程退出或超时
    const exitPromise = new Promise<void>((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      const exitHandler = () => {
        resolve();
      };

      this.process.once('close', exitHandler);
    });

    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, timeout)
    );

    await Promise.race([exitPromise, timeoutPromise]);

    // 如果进程仍在运行，发送 SIGKILL
    if (this.process && this.process.pid === pid) {
      this.process.kill('SIGKILL');
      // 等待进程真正退出
      await new Promise<void>((resolve) => {
        if (!this.process) {
          resolve();
          return;
        }
        this.process.once('close', () => resolve());
      });
    }

    this.process = null;
  }

  /**
   * 检查进程是否正在运行
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * 获取进程 ID
   *
   * @returns 进程 ID，如果进程未运行返回 undefined
   */
  getPid(): number | undefined {
    return this.process?.pid;
  }
}
