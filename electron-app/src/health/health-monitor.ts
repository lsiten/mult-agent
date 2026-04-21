/**
 * HealthMonitor
 *
 * 服务健康检查监控器
 * 支持：
 * - 指数退避轮询
 * - 事件发射（healthy/unhealthy/critical）
 * - 延迟跟踪（平均、P95、P99）
 */

import * as http from 'http';
import { EventEmitter } from 'events';

export type HealthMonitorMode = 'continuous' | 'on-demand';

export interface HealthMonitorConfig {
  /** 健康检查 URL */
  url: string;
  /** 启动超时（毫秒） */
  startupTimeout: number;
  /** 周期检查间隔（毫秒） */
  interval: number;
  /** HTTP 请求超时（毫秒） */
  timeout: number;
  /** 连续失败阈值（达到后发出 critical 事件） */
  consecutiveFailuresThreshold: number;
  /** 运行模式（默认: continuous） */
  mode?: HealthMonitorMode;
}

export interface HealthCheckResult {
  success: boolean;
  latency: number; // 毫秒
  error?: string;
}

/**
 * HealthMonitor 类
 *
 * 继承 EventEmitter 以支持事件发射
 * 事件：
 * - 'healthy': 服务变为健康
 * - 'unhealthy': 服务变为不健康
 * - 'critical': 连续失败达到阈值
 */
export class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private intervalTimer?: NodeJS.Timeout;
  private latencyHistory: number[] = [];
  private consecutiveFailures = 0;
  private isHealthyState = false;
  private mode: HealthMonitorMode;

  private readonly MAX_LATENCY_SAMPLES = 100;

  constructor(config: HealthMonitorConfig) {
    super();
    this.config = config;
    this.mode = config.mode || 'continuous';
  }

  /**
   * 等待服务变为健康（带指数退避）
   *
   * @throws {Error} 如果在 startupTimeout 内未变健康
   */
  async waitUntilHealthy(): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;
    let delay = 50; // 初始延迟 50ms
    const maxDelay = 1000; // 最大延迟 1000ms

    while (Date.now() - startTime < this.config.startupTimeout) {
      attempt++;
      const result = await this.checkHealth();

      if (result.success) {
        const elapsed = Date.now() - startTime;
        console.log(
          `[HealthMonitor] Service became healthy after ${elapsed}ms (${attempt} attempts)`
        );
        this.isHealthyState = true;
        return;
      }

      // 指数退避
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }

    throw new Error(
      `Health check timeout after ${this.config.startupTimeout}ms (${attempt} attempts)`
    );
  }

  /**
   * 设置运行模式
   *
   * @param mode - 运行模式（continuous 或 on-demand）
   */
  setMode(mode: HealthMonitorMode): void {
    if (this.mode === mode) {
      return;
    }

    console.log(`[HealthMonitor] Switching mode: ${this.mode} -> ${mode}`);
    this.mode = mode;

    if (mode === 'on-demand') {
      // 切换到按需模式：停止轮询
      this.stopMonitoring();
    } else {
      // 切换到持续模式：启动轮询
      this.startMonitoring();
    }
  }

  /**
   * 获取当前模式
   */
  getMode(): HealthMonitorMode {
    return this.mode;
  }

  /**
   * 开始周期性监控
   */
  startMonitoring(): void {
    if (this.mode === 'on-demand') {
      console.warn('[HealthMonitor] Cannot start monitoring in on-demand mode');
      return;
    }

    if (this.intervalTimer) {
      console.warn('[HealthMonitor] Already monitoring');
      return;
    }

    console.log('[HealthMonitor] Starting continuous monitoring');
    this.intervalTimer = setInterval(async () => {
      const result = await this.checkHealth();

      if (result.success) {
        // 从不健康恢复
        if (!this.isHealthyState) {
          this.isHealthyState = true;
          this.consecutiveFailures = 0;
          this.emit('healthy');
        }
      } else {
        // 变为不健康
        if (this.isHealthyState) {
          this.isHealthyState = false;
          this.emit('unhealthy', result.error);
        }

        this.consecutiveFailures++;

        // 达到关键阈值
        if (
          this.consecutiveFailures ===
          this.config.consecutiveFailuresThreshold
        ) {
          this.emit('critical', {
            failures: this.consecutiveFailures,
            error: result.error,
          });
        }
      }
    }, this.config.interval);
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.intervalTimer) {
      console.log('[HealthMonitor] Stopping monitoring');
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }

  /**
   * 停止所有活动（包括监控和事件监听）
   */
  stop(): void {
    this.stopMonitoring();
    this.removeAllListeners();
  }

  /**
   * 执行一次健康检查（公共方法，支持按需调用）
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    return new Promise<HealthCheckResult>((resolve) => {
      const url = new URL(this.config.url);
      const req = http.get(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname,
          timeout: this.config.timeout,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            const latency = Date.now() - startTime;
            this.recordLatency(latency);

            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(body);
                if (data.status === 'ok') {
                  resolve({ success: true, latency });
                } else {
                  resolve({
                    success: false,
                    latency,
                    error: 'Invalid response format',
                  });
                }
              } catch {
                resolve({
                  success: false,
                  latency,
                  error: 'Invalid JSON response',
                });
              }
            } else {
              resolve({
                success: false,
                latency,
                error: `HTTP ${res.statusCode}`,
              });
            }
          });
        }
      );

      req.on('error', (err) => {
        const latency = Date.now() - startTime;
        resolve({
          success: false,
          latency,
          error: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const latency = Date.now() - startTime;
        resolve({
          success: false,
          latency,
          error: 'Timeout',
        });
      });
    });
  }

  /**
   * 记录延迟测量
   */
  private recordLatency(latency: number): void {
    this.latencyHistory.push(latency);

    // 保持滑动窗口大小
    if (this.latencyHistory.length > this.MAX_LATENCY_SAMPLES) {
      this.latencyHistory.shift();
    }
  }

  /**
   * 获取状态和指标
   */
  getStatus(): {
    healthy: boolean;
    consecutiveFailures: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
  } {
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const avg =
      sorted.length > 0
        ? sorted.reduce((sum, val) => sum + val, 0) / sorted.length
        : 0;

    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      healthy: this.isHealthyState,
      consecutiveFailures: this.consecutiveFailures,
      avgLatency: Math.round(avg),
      p95Latency: sorted[p95Index] || 0,
      p99Latency: sorted[p99Index] || 0,
    };
  }
}
