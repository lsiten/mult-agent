/**
 * @deprecated 已废弃，请使用新的 GatewayService 替代
 *
 * 该类将在 v2.1.0 中移除。新架构使用服务化设计：
 * - GatewayService: 管理 Gateway 进程生命周期
 * - ProcessManager: 通用进程管理
 * - HealthMonitor: 健康检查和监控
 * - CircuitBreaker: 断路器保护
 *
 * 迁移指南：
 * ```typescript
 * // 旧代码
 * const pythonManager = new PythonManager(config);
 * await pythonManager.start();
 *
 * // 新代码
 * const gatewayService = new GatewayService(config);
 * await gatewayService.start();
 * ```
 *
 * @see {GatewayService} src/services/gateway.service.ts
 * @see {ProcessManager} src/process/process-manager.ts
 * @see {HealthMonitor} src/health/health-monitor.ts
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { EnvironmentDetector, AppEnvironment } from './env-detector';
import { CircuitBreaker, CircuitState } from './circuit-breaker';
import { RotatingLogStream } from './rotating-log-stream';
import { MetricsCollector } from './metrics-collector';
import { EnvManager } from './env-manager';
import { sanitizeLog } from './utils/sanitize-log';

interface PythonManagerConfig {
  pythonPath: string;
  pythonRuntimePath: string;
  environment: AppEnvironment;
  hermesHome: string;
  authToken?: string;  // 可选的身份验证 Token
}

/**
 * @deprecated 使用 GatewayService 替代
 */
export class PythonManager {
  private config: PythonManagerConfig;
  private gatewayProcess: ChildProcessWithoutNullStreams | null = null;
  private logCallback?: (log: string) => void;
  private errorCallback?: (error: Error) => void;
  private rotatingLogStream?: RotatingLogStream;

  // 健康检查相关
  private readonly HEALTH_CHECK_URL = 'http://127.0.0.1:8642/health'; // 使用 IPv4 避免 IPv6 问题
  private readonly STARTUP_TIMEOUT_MS = 15000; // 15 秒
  private healthCheckInterval?: NodeJS.Timeout;

  // 自动重启相关
  private restartInProgress = false;
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly HEALTH_MONITOR_INTERVAL = 30000; // 30 秒

  // 优雅关闭相关
  private readonly GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000; // 5 秒

  // 断路器
  private circuitBreaker: CircuitBreaker;

  // 指标收集器
  private metricsCollector: MetricsCollector;

  constructor(config: PythonManagerConfig) {
    this.config = config;
    console.log(`[PythonManager] Initialized in ${config.environment} mode`);
    console.log(`[PythonManager] Python path: ${config.pythonPath}`);
    console.log(`[PythonManager] HERMES_HOME: ${config.hermesHome}`);

    // 设置日志文件
    this.setupLogFile();

    // 初始化指标收集器
    this.metricsCollector = new MetricsCollector();

    // 初始化断路器
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 分钟
      onOpen: () => {
        this.logError('Circuit breaker OPEN - Gateway restart disabled');
        this.handleError(new Error(
          'Gateway health checks failed repeatedly. ' +
          'Please check logs and restart manually if needed.'
        ));
      },
      onHalfOpen: () => {
        this.log('Circuit breaker HALF_OPEN - Attempting recovery');
      },
      onClose: () => {
        this.log('Circuit breaker CLOSED - Gateway recovered');
      }
    });
  }

  public setLogCallback(callback: (log: string) => void): void {
    this.logCallback = callback;
  }

  public setErrorCallback(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  private setupLogFile(): void {
    const logsDir = path.join(this.config.hermesHome, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // 初始化轮转日志流
    this.rotatingLogStream = new RotatingLogStream({
      path: logsDir,
      filename: 'gateway.log',
      maxSize: 10 * 1024 * 1024,  // 10MB
      maxFiles: 7,                 // 保留 7 个文件
      compress: true
    });
  }

  private log(message: string, level: 'INFO' | 'ERROR' = 'INFO'): void {
    const logMessage = `[PythonManager] ${message}`;
    const timestamp = new Date().toISOString();
    const rawLog = `${timestamp} [${level}] ${logMessage}`;

    // 脱敏日志内容
    const sanitizedLog = sanitizeLog(rawLog);

    // 输出到控制台（已脱敏）
    if (level === 'ERROR') {
      console.error(sanitizedLog);
    } else {
      console.log(sanitizedLog);
    }

    // 发送到 renderer（已脱敏）
    if (this.logCallback) {
      this.logCallback(sanitizedLog);
    }

    // 写入轮转日志文件（已脱敏）
    if (this.rotatingLogStream) {
      try {
        this.rotatingLogStream.write(sanitizedLog + '\n');
      } catch (error) {
        // 不因日志写入失败而中断
        console.error('[PythonManager] Failed to write log:', error);
      }
    }
  }

  private logError(message: string): void {
    this.log(message, 'ERROR');
  }

  private handleError(error: Error): void {
    this.logError(`Error: ${error.message}`);
    this.metricsCollector.recordError(error.message);
    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }

  public async start(): Promise<void> {
    try {
      this.log('Starting Python process manager...');

      // 检查环境是否为符号链接（开发环境）
      if (this.config.environment === AppEnvironment.DEVELOPMENT) {
        if (!EnvironmentDetector.isSymlinkSetup()) {
          this.log('Warning: Running in dev mode but resources are not symlinked');
          this.log('Run: npm run setup:dev');
        }
      }

      // 检查 Python 源码
      if (!fs.existsSync(this.config.pythonPath)) {
        throw new Error(`Python code not found: ${this.config.pythonPath}`);
      }

      // 确定 Python 解释器
      const venvPython = path.join(this.config.pythonRuntimePath, 'bin', 'python3');
      const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

      this.log(`Using Python: ${pythonCmd}`);

      // 测试 Python 可用性
      try {
        const version = await this.execute(pythonCmd, ['--version']);
        this.log(`Python version: ${version}`);
      } catch (error) {
        throw new Error(`Python not available: ${error}`);
      }

      // 检查 Gateway 脚本
      const gatewayScript = path.join(this.config.pythonPath, 'gateway', 'run.py');
      if (!fs.existsSync(gatewayScript)) {
        throw new Error(`Gateway script not found: ${gatewayScript}`);
      }

      this.log(`Starting Gateway: ${gatewayScript}`);

      // 使用 EnvManager 获取 Python 环境变量
      const isDev = this.config.environment === AppEnvironment.DEVELOPMENT;
      const env: Record<string, string> = {
        ...EnvManager.getPythonEnv(),
        PYTHONPATH: this.config.pythonPath,
        GATEWAY_PORT: '8642',
        // 生产环境关闭开放访问和仪表板
        GATEWAY_ALLOW_ALL_USERS: isDev ? 'true' : 'false',
        GATEWAY_ENABLE_DASHBOARD: isDev ? 'true' : 'false',
        HERMES_DEV_MODE: isDev ? 'true' : 'false'
      };

      // 生产环境添加身份验证 Token
      if (!isDev && this.config.authToken) {
        env.GATEWAY_AUTH_TOKEN = this.config.authToken;
        this.log('Gateway auth token configured');
      }

      // 启动 Gateway 进程 (使用 --replace 自动替换旧进程)
      this.gatewayProcess = spawn(pythonCmd, [gatewayScript, '--replace'], {
        env,
        cwd: this.config.pythonPath
      });

      // 监听进程输出
      this.gatewayProcess.stdout.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          this.log(text, 'INFO');
        }
      });

      this.gatewayProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          this.logError(text);
        }
      });

      this.gatewayProcess.on('close', (code: number | null) => {
        this.log(`Gateway process exited with code ${code}`);
        this.gatewayProcess = null;

        // 非正常退出且不在重启中
        if (code !== 0 && !this.restartInProgress) {
          this.handleError(new Error(`Gateway exited unexpectedly with code ${code}`));
        }
      });

      this.gatewayProcess.on('error', (error: Error) => {
        this.logError(`Gateway process error: ${error.message}`);
        this.gatewayProcess = null;
        this.handleError(error);
      });

      // 等待 Gateway 健康检查通过
      this.log('Waiting for Gateway to be healthy...');
      await this.waitForHealthy();
      this.log('Gateway started successfully');

      // 启动健康监控
      this.startHealthMonitor();

    } catch (error) {
      this.logError(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async execute(command: string, args: string[] = []): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Process failed with code ${code}: ${errorOutput}`));
        }
      });

      proc.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  private async waitForHealthy(): Promise<void> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let backoff = 50; // 初始 50ms
    let attempt = 0;

    while (Date.now() - startTime < this.STARTUP_TIMEOUT_MS) {
      attempt++;
      const attemptStart = Date.now();

      try {
        // 使用 Node.js http 模块替代 fetch (Electron fetch 有 CORS 问题)
        await new Promise<void>((resolve, reject) => {
          const req = http.get(this.HEALTH_CHECK_URL, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                if (json.status === 'ok') {
                  resolve();
                } else {
                  reject(new Error('Invalid health check response'));
                }
              } catch (err) {
                reject(err);
              }
            });
          });

          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Health check timeout'));
          });
        });

        // 成功
        const totalTime = Date.now() - startTime;
        this.log(`Gateway started successfully in ${totalTime}ms (${attempt} attempts)`);
        this.metricsCollector.recordStartup(totalTime, attempt);
        return;

      } catch (error) {
        lastError = error as Error;
        // 继续重试
      }

      // 检查进程是否已退出
      if (!this.isRunning()) {
        throw new Error('Gateway process exited during startup');
      }

      // 指数退避: 50ms → 100ms → 200ms → 400ms → 800ms → 1000ms (max)
      await new Promise(r => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 1000);

      const elapsed = Date.now() - attemptStart;
      if (elapsed < 100) {
        this.log(`Health check attempt ${attempt} (${elapsed}ms)`);
      }
    }

    throw new Error(
      `Gateway failed to start within ${this.STARTUP_TIMEOUT_MS}ms after ${attempt} attempts. ` +
      `Last error: ${lastError?.message || 'Unknown'}`
    );
  }

  private startHealthMonitor(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, this.HEALTH_MONITOR_INTERVAL);

    this.log('Health monitor started');
  }

  private async checkHealth(): Promise<void> {
    if (this.restartInProgress) {
      return; // 正在重启中，跳过检查
    }

    // 使用断路器保护重启逻辑
    const checkStart = Date.now();
    try {
      await this.circuitBreaker.execute(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(this.HEALTH_CHECK_URL, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.status !== 'ok') {
          throw new Error(`Health check returned status: ${data.status}`);
        }

        // 健康检查成功
        const latency = Date.now() - checkStart;
        this.metricsCollector.recordHealthCheck(latency, true);

        if (this.consecutiveFailures > 0) {
          this.log('Gateway recovered');
          this.consecutiveFailures = 0;
        }
      });

    } catch (error) {
      // 记录失败的健康检查
      const latency = Date.now() - checkStart;
      this.metricsCollector.recordHealthCheck(latency, false);

      this.consecutiveFailures++;

      // 断路器打开时不记录错误（已经在断路器中处理）
      if (this.circuitBreaker.getState() !== CircuitState.OPEN) {
        this.log(`Health check error (${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}): ${error}`);
      }

      // 连续失败超过阈值且断路器未打开，尝试重启
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES &&
          this.circuitBreaker.getState() !== CircuitState.OPEN) {
        this.log('Gateway appears unhealthy, attempting restart...');
        await this.restart();
      }
    }
  }

  public async restart(): Promise<void> {
    if (this.restartInProgress) {
      this.log('Restart already in progress');
      return;
    }

    try {
      this.restartInProgress = true;
      this.log('Restarting Gateway...');
      this.metricsCollector.recordRestart();

      // 停止旧进程
      await this.stop();

      // 等待一小段时间
      await new Promise(r => setTimeout(r, 1000));

      // 启动新进程
      await this.start();

      this.consecutiveFailures = 0;
      this.log('Gateway restarted successfully');

    } catch (error) {
      this.logError(`Restart failed: ${error}`);
      // 不抛出异常，避免中断监控
    } finally {
      this.restartInProgress = false;
    }
  }

  public async stop(): Promise<void> {
    this.log('Stopping Gateway...');

    // 停止健康监控
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    if (!this.gatewayProcess) {
      return;
    }

    // 优雅关闭
    await this.gracefulShutdown();

    // 关闭日志流
    if (this.rotatingLogStream) {
      this.rotatingLogStream.close();
    }
  }

  private async gracefulShutdown(): Promise<void> {
    if (!this.gatewayProcess) {
      return;
    }

    this.log('Initiating graceful shutdown...');

    try {
      // 1. 发送 SIGTERM (优雅关闭信号)
      this.gatewayProcess.kill('SIGTERM');

      // 2. 等待进程退出 (最多 5 秒)
      const exitPromise = new Promise<void>((resolve) => {
        this.gatewayProcess?.once('exit', () => {
          this.log('Gateway exited gracefully');
          resolve();
        });
      });

      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          this.log('Graceful shutdown timeout');
          resolve();
        }, this.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
      });

      await Promise.race([exitPromise, timeoutPromise]);

      // 3. 如果还没退出，强制 SIGKILL
      if (this.gatewayProcess && !this.gatewayProcess.killed) {
        this.log('Forcing shutdown with SIGKILL...');
        this.gatewayProcess.kill('SIGKILL');

        // 再等待 1 秒
        await new Promise(r => setTimeout(r, 1000));
      }

    } finally {
      this.gatewayProcess = null;
      this.log('Gateway process stopped');
    }
  }

  public isRunning(): boolean {
    // 进程存在 且 未被杀死 且 断路器未断开（说明最近健康检查正常）
    const processAlive = this.gatewayProcess !== null && !this.gatewayProcess.killed;
    const healthOk = this.circuitBreaker.getState() !== CircuitState.OPEN;
    return processAlive && healthOk;
  }

  public getStatus(): {
    running: boolean;
    consecutiveFailures: number;
    restartInProgress: boolean;
    circuitState: string;
    metrics: any;
  } {
    return {
      running: this.isRunning(),
      consecutiveFailures: this.consecutiveFailures,
      restartInProgress: this.restartInProgress,
      circuitState: this.circuitBreaker.getState(),
      metrics: this.metricsCollector.getStats()
    };
  }
}
