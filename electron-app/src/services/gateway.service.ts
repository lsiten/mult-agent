/**
 * GatewayService
 *
 * 管理 Python Gateway 进程的完整生命周期
 * 组合 ProcessManager + HealthMonitor + CircuitBreaker
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Service } from '../core/service.interface';
import { ProcessManager } from '../process/process-manager';
import { HealthMonitor } from '../health/health-monitor';
import { CircuitBreaker, CircuitState } from '../circuit-breaker';
import { AppEnvironment } from '../env-detector';

export interface GatewayServiceConfig {
  pythonPath: string;
  pythonRuntimePath: string;
  environment: AppEnvironment;
  hermesHome: string;
  authToken?: string;
}

/**
 * GatewayService 类
 */
export class GatewayService implements Service {
  readonly id = 'gateway';
  readonly required = true;
  readonly dependencies = ['env', 'config'];

  private config: GatewayServiceConfig;
  private processManager: ProcessManager;
  private healthMonitor: HealthMonitor;
  private circuitBreaker: CircuitBreaker;
  private logCallback?: (log: string) => void;
  private errorCallback?: (error: Error) => void;
  private authToken?: string; // v2.1: Gateway Token (持久化)
  private auditToken?: string; // v2.1: 审计令牌（防止 bash 绕过）

  constructor(config: GatewayServiceConfig) {
    this.config = config;

    // 构建 Gateway 启动参数
    // pythonPath: Python 可执行文件 (python-runtime/bin/python3)
    // pythonRuntimePath: Python 源码目录 (resources/python)
    const gatewayRunPath = path.join(config.pythonRuntimePath, 'gateway', 'run.py');
    const env = this.buildEnvironment();

    // 初始化 ProcessManager
    this.processManager = new ProcessManager({
      command: config.pythonPath, // Python 可执行文件
      args: [gatewayRunPath],
      env,
      cwd: config.pythonRuntimePath, // 工作目录设为 Python 源码目录
    });

    // 初始化 HealthMonitor（启动阶段用 continuous 模式）
    this.healthMonitor = new HealthMonitor({
      url: 'http://127.0.0.1:8642/health',
      startupTimeout: 15000, // 15 秒
      interval: 30000, // 30 秒
      timeout: 5000, // 5 秒
      consecutiveFailuresThreshold: 3,
      mode: 'continuous', // 启动阶段持续轮询
    });

    // 初始化 CircuitBreaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    });

    // 设置进程输出回调
    this.processManager.setStdoutCallback((output) => {
      if (this.logCallback) {
        this.logCallback(output);
      }
    });

    this.processManager.setStderrCallback((output) => {
      if (this.logCallback) {
        this.logCallback(`[ERROR] ${output}`);
      }
    });

    this.processManager.setExitCallback((code) => {
      const msg = `Gateway process exited with code ${code}`;
      if (this.logCallback) {
        this.logCallback(msg);
      }

      // 非正常退出时触发错误回调
      if (code !== 0 && code !== null && this.errorCallback) {
        this.errorCallback(new Error(msg));
      }
    });

    // 设置健康监控事件
    this.healthMonitor.on('unhealthy', (error) => {
      console.warn('[GatewayService] Health check failed:', error);
      this.circuitBreaker.recordFailure();
    });

    this.healthMonitor.on('healthy', () => {
      console.log('[GatewayService] Health check recovered');
      this.circuitBreaker.recordSuccess();
      this.circuitBreaker.recordSuccess(); // 两次成功才恢复
    });

    this.healthMonitor.on('critical', ({ failures, error }) => {
      const msg = `Gateway health critical: ${failures} consecutive failures - ${error}`;
      console.error(`[GatewayService] ${msg}`);
      if (this.errorCallback) {
        this.errorCallback(new Error(msg));
      }
    });
  }

  /**
   * 设置日志回调
   */
  setLogCallback(callback: (log: string) => void): void {
    this.logCallback = callback;
  }

  /**
   * 设置错误回调
   */
  setErrorCallback(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    console.log('[GatewayService] Starting...');

    // 检查断路器状态
    const circuitState = this.circuitBreaker.getState();
    if (circuitState === CircuitState.OPEN) {
      throw new Error('Circuit breaker is OPEN, refusing to start');
    }

    try {
      // 0. 清理可能存在的旧 Gateway 实例
      await this.cleanupOldInstance();

      // 1. 启动进程
      await this.circuitBreaker.execute(async () => {
        this.processManager.start();
      });

      // 2. 等待健康检查通过（使用指数退避）
      await this.healthMonitor.waitUntilHealthy();

      // 3. 切换到按需模式（运行阶段）
      this.healthMonitor.setMode('on-demand');
      console.log('[GatewayService] Switched to on-demand health check mode');

      console.log('[GatewayService] Started successfully');
    } catch (error) {
      console.error('[GatewayService] Failed to start:', error);
      // 清理部分启动的资源
      await this.stop();
      throw error;
    }
  }

  /**
   * 清理可能存在的旧 Gateway 实例
   */
  private async cleanupOldInstance(): Promise<void> {
    console.log('[GatewayService] Checking for existing Gateway instances...');

    // 方法 1: 检查 PID 文件
    const pidFilePath = path.join(this.config.hermesHome, 'gateway.pid');
    try {
      const fs = await import('fs/promises');
      const pidStr = await fs.readFile(pidFilePath, 'utf-8');
      const pid = parseInt(pidStr.trim(), 10);
      if (pid && !isNaN(pid)) {
        console.log(`[GatewayService] Found PID file: ${pid}`);
        await this.killProcess(pid);
      }
      await fs.unlink(pidFilePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn('[GatewayService] Failed to read PID file:', error);
      }
    }

    // 方法 2: 检查端口 8642 是否被占用
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // 使用 lsof 查找占用 8642 端口的进程
      const { stdout } = await execAsync('lsof -ti:8642 2>/dev/null || true');
      const pids = stdout.trim().split('\n').filter(Boolean).map(Number);

      if (pids.length > 0) {
        console.log(`[GatewayService] Found ${pids.length} process(es) on port 8642:`, pids);
        for (const pid of pids) {
          await this.killProcess(pid);
        }
      } else {
        console.log('[GatewayService] Port 8642 is available');
      }
    } catch (error) {
      console.warn('[GatewayService] Failed to check port 8642:', error);
    }
  }

  /**
   * 终止指定进程
   */
  private async killProcess(pid: number): Promise<void> {
    try {
      // 检查进程是否存在
      process.kill(pid, 0);
      console.log(`[GatewayService] Terminating process ${pid}...`);

      // 发送 SIGTERM
      process.kill(pid, 'SIGTERM');

      // 等待进程退出
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          try {
            process.kill(pid, 0);
          } catch {
            clearInterval(checkInterval);
            console.log(`[GatewayService] Process ${pid} terminated`);
            resolve();
          }
        }, 100);

        // 最多等待 5 秒，然后强制 SIGKILL
        setTimeout(() => {
          clearInterval(checkInterval);
          try {
            process.kill(pid, 'SIGKILL');
            console.log(`[GatewayService] Force killed process ${pid}`);
          } catch {}
          resolve();
        }, 5000);
      });
    } catch (err: any) {
      if (err.code === 'ESRCH') {
        console.log(`[GatewayService] Process ${pid} not found`);
      } else {
        console.warn(`[GatewayService] Failed to kill process ${pid}:`, err);
      }
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    console.log('[GatewayService] Stopping...');

    // 停止健康监控（包括所有监听器）
    this.healthMonitor.stop();

    // 停止进程
    if (this.processManager.isRunning()) {
      await this.processManager.stop();
    }

    // 清理 PID 文件，确保下次启动不会检测到"已有实例"
    const pidFilePath = path.join(this.config.hermesHome, 'gateway.pid');
    try {
      const fs = await import('fs/promises');
      await fs.unlink(pidFilePath);
      console.log('[GatewayService] Cleaned up PID file');
    } catch (error: any) {
      // 忽略文件不存在的错误
      if (error.code !== 'ENOENT') {
        console.warn('[GatewayService] Failed to cleanup PID file:', error);
      }
    }

    console.log('[GatewayService] Stopped');
  }

  /**
   * 检查服务是否健康
   */
  isHealthy(): boolean {
    return (
      this.processManager.isRunning() &&
      this.healthMonitor.getStatus().healthy &&
      this.circuitBreaker.getState() !== CircuitState.OPEN
    );
  }

  /**
   * 错误回调
   */
  onError(error: Error): void {
    console.error('[GatewayService] Error:', error);
    this.circuitBreaker.recordFailure();
  }

  /**
   * 获取 HealthMonitor 实例（用于按需健康检查）
   */
  getHealthMonitor(): HealthMonitor {
    return this.healthMonitor;
  }

  /**
   * 获取服务指标
   */
  getMetrics(): Record<string, any> {
    const healthStatus = this.healthMonitor.getStatus();
    const circuitState = this.circuitBreaker.getState();

    const running = this.processManager.isRunning();
    const pid = this.processManager.getPid();

    console.log('[GatewayService] getMetrics: processManager.isRunning() =', running);
    console.log('[GatewayService] getMetrics: processManager.getPid() =', pid);
    console.log('[GatewayService] getMetrics: healthMonitor.healthy =', healthStatus.healthy);

    return {
      running,
      pid,
      healthy: healthStatus.healthy,
      healthCheckMode: this.healthMonitor.getMode(),
      consecutiveFailures: healthStatus.consecutiveFailures,
      avgLatency: healthStatus.avgLatency,
      p95Latency: healthStatus.p95Latency,
      p99Latency: healthStatus.p99Latency,
      circuitState,
    };
  }

  /**
   * 重启服务
   */
  async restart(): Promise<void> {
    console.log('[GatewayService] Restarting...');
    await this.stop();
    await this.start();
  }

  /**
   * 获取 Gateway 认证 Token（用于前端 IPC）
   */
  getAuthToken(): string {
    if (!this.authToken) {
      throw new Error('Gateway token not initialized. Call start() first.');
    }
    return this.authToken;
  }

  /**
   * 构建环境变量
   */
  private buildEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // ====================================================================
    // v2.1: 生成审计令牌并写入文件（防止 bash 绕过）
    // ====================================================================
    if (!this.auditToken) {
      this.auditToken = crypto.randomBytes(32).toString('hex');
    }
    // v2.1.1: 统一使用 Electron 数据目录，不再使用 .hermes
    const tokenPath = path.join(this.config.hermesHome, '.runtime_token');
    const tokenDir = path.dirname(tokenPath);

    // 确保目录存在
    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
    }

    // 写入审计令牌文件（600 权限）
    fs.writeFileSync(tokenPath, this.auditToken, { mode: 0o600 });
    env.HERMES_AUDIT_TOKEN = this.auditToken;
    console.log(`[GatewayService] Audit token generated and saved to ${tokenPath}`);

    // ====================================================================
    // v2.1: Gateway Token 持久化（避免重启导致前端缓存失效）
    // ====================================================================
    if (!this.authToken) {
      const gatewayTokenPath = path.join(this.config.hermesHome, '.gateway-token');
      const gatewayTokenDir = path.dirname(gatewayTokenPath);

      // 确保目录存在
      if (!fs.existsSync(gatewayTokenDir)) {
        fs.mkdirSync(gatewayTokenDir, { recursive: true, mode: 0o700 });
      }

      // 尝试从文件读取已有 Token
      if (fs.existsSync(gatewayTokenPath)) {
        try {
          this.authToken = fs.readFileSync(gatewayTokenPath, 'utf-8').trim();
          console.log('[GatewayService] Gateway token loaded from disk');
        } catch (error) {
          console.warn('[GatewayService] Failed to read gateway token, generating new one:', error);
        }
      }

      // 如果没有读取到或读取失败，生成新 Token
      if (!this.authToken) {
        this.authToken = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(gatewayTokenPath, this.authToken, { mode: 0o600 });
        console.log(`[GatewayService] Gateway token generated and saved to ${gatewayTokenPath}`);
      }
    }

    // ====================================================================
    // v2.1: 统一环境变量命名为 HERMES_GATEWAY_TOKEN
    // ====================================================================
    env.HERMES_GATEWAY_TOKEN = this.authToken;
    console.log('[GatewayService] HERMES_GATEWAY_TOKEN configured');

    // 清理旧的环境变量名（v2.0 遗留）
    delete env.GATEWAY_AUTH_TOKEN;
    delete env.GATEWAY_ELECTRON_MODE;

    // 设置 HERMES_HOME
    env.HERMES_HOME = this.config.hermesHome;

    // 设置 PYTHONPATH
    env.PYTHONPATH = this.config.pythonRuntimePath;

    // 设置 Gateway 配置
    env.GATEWAY_PORT = '8642';
    env.GATEWAY_HOST = '127.0.0.1'; // 强制使用 IPv4

    // v2.1: 强制启用 Electron 模式（触发三层验证）
    env.HERMES_ELECTRON_MODE = '1';

    // 开发/生产模式特定配置
    const isDev = this.config.environment === AppEnvironment.DEVELOPMENT;
    env.GATEWAY_ALLOW_ALL_USERS = isDev ? 'true' : 'false';
    env.GATEWAY_ENABLE_DASHBOARD = isDev ? 'true' : 'false';
    env.HERMES_DEV_MODE = isDev ? 'true' : 'false';

    // CORS 配置 - Electron-only 架构
    // 开发: * (允许任意 origin，便于 Vite 端口变化)
    // 生产: file:// (Electron loadFile)
    env.API_SERVER_ENABLED = 'true';
    env.API_SERVER_HOST = '127.0.0.1';
    env.API_SERVER_PORT = '8642';
    env.API_SERVER_CORS_ORIGINS = isDev ? '*' : 'file://';

    // 禁用 Python 字节码缓存，确保代码修改立即生效
    env.PYTHONDONTWRITEBYTECODE = '1';

    return env;
  }
}
