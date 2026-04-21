export interface Metrics {
  // 启动相关
  gatewayStartupTime: number;
  gatewayStartAttempts: number;
  lastStartTime: number;

  // 健康检查
  healthCheckLatencies: number[];
  healthCheckSuccesses: number;
  healthCheckFailures: number;

  // 进程管理
  restartCount: number;
  lastRestartTime: number;
  uptimeMs: number;

  // 错误追踪
  errorCount: number;
  lastError: string | null;
  lastErrorTime: number;
}

export class MetricsCollector {
  private metrics: Metrics;

  constructor() {
    this.metrics = {
      gatewayStartupTime: 0,
      gatewayStartAttempts: 0,
      lastStartTime: 0,
      healthCheckLatencies: [],
      healthCheckSuccesses: 0,
      healthCheckFailures: 0,
      restartCount: 0,
      lastRestartTime: 0,
      uptimeMs: 0,
      errorCount: 0,
      lastError: null,
      lastErrorTime: 0
    };
  }

  // 记录启动
  public recordStartup(duration: number, attempts: number): void {
    this.metrics.gatewayStartupTime = duration;
    this.metrics.gatewayStartAttempts = attempts;
    this.metrics.lastStartTime = Date.now();
  }

  // 记录健康检查
  public recordHealthCheck(latency: number, success: boolean): void {
    // 保留最近 100 个延迟记录
    this.metrics.healthCheckLatencies.push(latency);
    if (this.metrics.healthCheckLatencies.length > 100) {
      this.metrics.healthCheckLatencies.shift();
    }

    if (success) {
      this.metrics.healthCheckSuccesses++;
    } else {
      this.metrics.healthCheckFailures++;
    }
  }

  // 记录重启
  public recordRestart(): void {
    this.metrics.restartCount++;
    this.metrics.lastRestartTime = Date.now();
  }

  // 记录错误
  public recordError(error: string): void {
    this.metrics.errorCount++;
    this.metrics.lastError = error;
    this.metrics.lastErrorTime = Date.now();
  }

  // 计算统计数据
  public getStats() {
    const totalHealthChecks = this.metrics.healthCheckSuccesses + this.metrics.healthCheckFailures;
    const errorRate = totalHealthChecks > 0
      ? this.metrics.healthCheckFailures / totalHealthChecks
      : 0;

    const avgLatency = this.metrics.healthCheckLatencies.length > 0
      ? this.metrics.healthCheckLatencies.reduce((a, b) => a + b, 0) / this.metrics.healthCheckLatencies.length
      : 0;

    const p95Latency = this.calculatePercentile(this.metrics.healthCheckLatencies, 0.95);
    const p99Latency = this.calculatePercentile(this.metrics.healthCheckLatencies, 0.99);

    const uptimeMs = this.metrics.lastStartTime > 0
      ? Date.now() - this.metrics.lastStartTime
      : 0;

    return {
      ...this.metrics,
      uptimeMs,
      totalHealthChecks,
      errorRate: (errorRate * 100).toFixed(2) + '%',
      avgHealthCheckLatency: Math.round(avgLatency),
      p95HealthCheckLatency: Math.round(p95Latency),
      p99HealthCheckLatency: Math.round(p99Latency),
      uptimeFormatted: this.formatUptime(uptimeMs)
    };
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  public reset(): void {
    this.metrics = {
      gatewayStartupTime: 0,
      gatewayStartAttempts: 0,
      lastStartTime: 0,
      healthCheckLatencies: [],
      healthCheckSuccesses: 0,
      healthCheckFailures: 0,
      restartCount: 0,
      lastRestartTime: 0,
      uptimeMs: 0,
      errorCount: 0,
      lastError: null,
      lastErrorTime: 0
    };
  }
}
