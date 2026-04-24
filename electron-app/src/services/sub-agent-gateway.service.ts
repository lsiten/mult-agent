/**
 * SubAgentGatewayService
 *
 * 管理 Sub Agent 子进程 Gateway 的完整生命周期
 * 每个 Sub Agent 运行独立的 Gateway 实例，完全隔离（等价于 CLI Profile）
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Service } from '../core/service.interface';
import { ProcessManager } from '../process/process-manager';
import { HealthMonitor } from '../health/health-monitor';
import { CircuitBreaker, CircuitState } from '../circuit-breaker';
import { AppEnvironment } from '../env-detector';

export interface SubAgentGatewayConfig {
  agentId: number;
  profileHome: string;
  pythonPath: string;
  pythonRuntimePath: string;
  environment: AppEnvironment;
  mainHermesHome: string; // 主 Agent 的 HERMES_HOME
  port: number; // 动态分配的端口
  gatewayToken: string; // 主 Gateway 的认证 token
}

/**
 * SubAgentGatewayService 类
 *
 * 每个 Sub Agent 一个实例，完全隔离的 Gateway 进程
 *
 * ⚠️ Profile 初始化由 Python 后端在创建 Agent 时完成，TypeScript 层只负责：
 * 1. 同步运行时文件（.runtime_token 和 .env）
 * 2. 启动 Sub Agent Gateway 进程
 * 3. 健康检查和生命周期管理
 */
export class SubAgentGatewayService implements Service {
  readonly id: string;
  readonly required = false; // Sub Agent 非必需，主 Agent 失败不影响其他服务
  readonly dependencies = ['gateway']; // 依赖主 Gateway 服务

  private config: SubAgentGatewayConfig;
  private processManager: ProcessManager;
  private healthMonitor: HealthMonitor;
  private circuitBreaker: CircuitBreaker;
  private logCallback?: (log: string) => void;
  private errorCallback?: (error: Error) => void;
  private auditToken: string;

  constructor(config: SubAgentGatewayConfig) {
    this.id = `sub-agent-gateway-${config.agentId}`;
    this.config = config;

    // 审计令牌（在 start() 中同步 token 后会重新读取）
    this.auditToken = this.readMainAuditToken();

    // 构建 Gateway 启动参数
    const gatewayRunPath = path.join(config.pythonRuntimePath, 'gateway', 'run.py');
    // 环境变量稍后在 start() 中设置（需要先同步 token）
    const env = {};

    // 初始化 ProcessManager（env 将在 start() 中更新）
    this.processManager = new ProcessManager({
      command: config.pythonPath,
      args: [gatewayRunPath],
      env,
      cwd: config.pythonRuntimePath,
    });

    // 初始化 HealthMonitor
    this.healthMonitor = new HealthMonitor({
      url: `http://127.0.0.1:${config.port}/health`,
      startupTimeout: 30000, // 30 秒启动超时
      interval: 30000, // 30 秒
      timeout: 5000, // 5 秒
      consecutiveFailuresThreshold: 3,
      mode: 'on-demand', // Sub Agent 默认按需检查
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
        this.logCallback(`[Sub Agent ${config.agentId}] ${output}`);
      }
    });

    this.processManager.setStderrCallback((output) => {
      if (this.logCallback) {
        this.logCallback(`[Sub Agent ${config.agentId}] [ERROR] ${output}`);
      }
    });

    this.processManager.setExitCallback((code) => {
      const msg = `Sub Agent ${config.agentId} Gateway exited with code ${code}`;
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
      console.warn(`[SubAgentGatewayService:${config.agentId}] Health check failed:`, error);
      this.circuitBreaker.recordFailure();
    });

    this.healthMonitor.on('healthy', () => {
      console.log(`[SubAgentGatewayService:${config.agentId}] Health check recovered`);
      this.circuitBreaker.recordSuccess();
      this.circuitBreaker.recordSuccess();
    });

    this.healthMonitor.on('critical', ({ failures, error }) => {
      const msg = `Sub Agent ${config.agentId} health critical: ${failures} consecutive failures - ${error}`;
      console.error(`[SubAgentGatewayService:${config.agentId}] ${msg}`);
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
    console.log(`[SubAgentGatewayService:${this.config.agentId}] Starting on port ${this.config.port}...`);

    // 检查断路器状态
    const circuitState = this.circuitBreaker.getState();
    if (circuitState === CircuitState.OPEN) {
      throw new Error(`Sub Agent ${this.config.agentId} circuit breaker is OPEN, refusing to start`);
    }

    try {
      // 1. 确保 profile 目录存在并同步运行时文件
      // ⚠️ Profile 初始化（目录、Skills、SOUL.md、Workspace）已由 Python 后端完成
      await this.ensureProfileDirectory();

      // 2. 清理可能存在的旧实例
      await this.cleanupOldInstance();

      // 3. 重新读取审计令牌（在同步之后，确保使用最新的 token）
      this.auditToken = this.readProfileAuditToken();
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Using audit token from profile: ${this.auditToken.substring(0, 16)}...`);

      // 4. 更新 ProcessManager 的环境变量（现在 auditToken 已经是最新的）
      const env = this.buildEnvironment();
      (this.processManager as any).config.env = env;

      // 5. 启动进程
      await this.circuitBreaker.execute(async () => {
        this.processManager.start();
      });

      // 6. 等待健康检查通过
      await this.healthMonitor.waitUntilHealthy();

      console.log(`[SubAgentGatewayService:${this.config.agentId}] Started successfully on port ${this.config.port}`);
    } catch (error) {
      console.error(`[SubAgentGatewayService:${this.config.agentId}] Failed to start:`, error);
      // 清理部分启动的资源
      await this.stop();
      throw error;
    }
  }

  /**
   * 确保 profile 目录存在并同步运行时文件
   *
   * ⚠️ Profile 初始化（目录结构、Skills、SOUL.md、Workspace）已由 Python 后端在创建 Agent 时完成。
   * TypeScript 层只需：
   * 1. 验证目录存在性
   * 2. 同步运行时文件（.runtime_token 和 .env，每次启动时更新）
   * 3. 清理历史遗留问题（冗余 org/ 子目录）
   */
  private async ensureProfileDirectory(): Promise<void> {
    // 验证 Profile 目录存在（由 Python 后端创建）
    if (!fs.existsSync(this.config.profileHome)) {
      throw new Error(
        `Profile directory not found: ${this.config.profileHome}. ` +
        `Agent should be provisioned via Python backend before starting.`
      );
    }

    console.log(`[SubAgentGatewayService:${this.config.agentId}] Profile directory verified: ${this.config.profileHome}`);

    // ====================================================================
    // 同步运行时文件（每次启动时更新）
    // ====================================================================

    // 1. 复制主 Gateway 的 .runtime_token
    // 总是覆盖，确保使用最新的 token（主 Gateway 重启后 token 会变化）
    const mainTokenPath = path.join(this.config.mainHermesHome, '.runtime_token');
    const profileTokenPath = path.join(this.config.profileHome, '.runtime_token');
    if (fs.existsSync(mainTokenPath)) {
      fs.copyFileSync(mainTokenPath, profileTokenPath);
      fs.chmodSync(profileTokenPath, 0o600);
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Synced runtime token`);
    } else {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Main runtime token not found at ${mainTokenPath}`);
    }

    // 2. 验证 .env 文件存在
    // ⚠️ .env 由 Python 后端在 Profile 创建时复制，此处仅验证
    // 如果缺失则从主 Agent 同步（通常只在升级或 Profile 损坏时需要）
    const mainEnvPath = path.join(this.config.mainHermesHome, '.env');
    const profileEnvPath = path.join(this.config.profileHome, '.env');
    if (!fs.existsSync(profileEnvPath)) {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] .env missing in profile, syncing from main Agent...`);
      if (fs.existsSync(mainEnvPath)) {
        fs.copyFileSync(mainEnvPath, profileEnvPath);
        fs.chmodSync(profileEnvPath, 0o600);
        console.log(`[SubAgentGatewayService:${this.config.agentId}] Synced .env (API keys)`);
      } else {
        console.warn(`[SubAgentGatewayService:${this.config.agentId}] Main .env not found, Sub Agent may lack API keys`);
      }
    } else {
      console.log(`[SubAgentGatewayService:${this.config.agentId}] .env verified`);
    }

    // ====================================================================
    // 清理历史遗留问题
    // ====================================================================

    // 清理冗余的 org/ 子目录（如果存在）
    const invalidOrgDir = path.join(this.config.profileHome, 'org');
    if (fs.existsSync(invalidOrgDir)) {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Found invalid org/ subdirectory, removing...`);
      fs.rmSync(invalidOrgDir, { recursive: true, force: true });
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Removed invalid org/ subdirectory`);
    }
  }

  /**
   * 读取主 Gateway 的审计令牌
   */
  private readMainAuditToken(): string {
    const tokenPath = path.join(this.config.mainHermesHome, '.runtime_token');
    try {
      if (fs.existsSync(tokenPath)) {
        return fs.readFileSync(tokenPath, 'utf-8').trim();
      }
    } catch (error) {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Failed to read main audit token:`, error);
    }
    // 如果无法读取，生成新的（通常不应该发生）
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 读取 profile 目录的审计令牌（在同步之后调用）
   */
  private readProfileAuditToken(): string {
    const tokenPath = path.join(this.config.profileHome, '.runtime_token');
    try {
      if (fs.existsSync(tokenPath)) {
        return fs.readFileSync(tokenPath, 'utf-8').trim();
      }
    } catch (error) {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Failed to read profile audit token:`, error);
    }
    // 如果无法读取，使用主 Agent 的 token
    console.warn(`[SubAgentGatewayService:${this.config.agentId}] Profile token not found, using main token`);
    return this.readMainAuditToken();
  }

  /**
   * 清理可能存在的旧实例
   */
  private async cleanupOldInstance(): Promise<void> {
    console.log(`[SubAgentGatewayService:${this.config.agentId}] Checking for existing instances...`);

    // 检查 PID 文件
    const pidFilePath = path.join(this.config.profileHome, 'gateway.pid');
    try {
      const fs = await import('fs/promises');
      const pidStr = await fs.readFile(pidFilePath, 'utf-8');
      const pid = parseInt(pidStr.trim(), 10);
      if (pid && !isNaN(pid)) {
        console.log(`[SubAgentGatewayService:${this.config.agentId}] Found PID file: ${pid}`);
        await this.killProcess(pid);
      }
      await fs.unlink(pidFilePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`[SubAgentGatewayService:${this.config.agentId}] Failed to read PID file:`, error);
      }
    }

    // 检查端口是否被占用
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(`lsof -ti:${this.config.port} 2>/dev/null || true`);
      const pids = stdout.trim().split('\n').filter(Boolean).map(Number);

      if (pids.length > 0) {
        console.log(`[SubAgentGatewayService:${this.config.agentId}] Found ${pids.length} process(es) on port ${this.config.port}:`, pids);
        for (const pid of pids) {
          await this.killProcess(pid);
        }
      } else {
        console.log(`[SubAgentGatewayService:${this.config.agentId}] Port ${this.config.port} is available`);
      }
    } catch (error) {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Failed to check port ${this.config.port}:`, error);
    }
  }

  /**
   * 终止指定进程
   */
  private async killProcess(pid: number): Promise<void> {
    try {
      process.kill(pid, 0);
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Terminating process ${pid}...`);

      process.kill(pid, 'SIGTERM');

      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          try {
            process.kill(pid, 0);
          } catch {
            clearInterval(checkInterval);
            console.log(`[SubAgentGatewayService:${this.config.agentId}] Process ${pid} terminated`);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          try {
            process.kill(pid, 'SIGKILL');
            console.log(`[SubAgentGatewayService:${this.config.agentId}] Force killed process ${pid}`);
          } catch {}
          resolve();
        }, 5000);
      });
    } catch (err: any) {
      if (err.code === 'ESRCH') {
        console.log(`[SubAgentGatewayService:${this.config.agentId}] Process ${pid} not found`);
      } else {
        console.warn(`[SubAgentGatewayService:${this.config.agentId}] Failed to kill process ${pid}:`, err);
      }
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    console.log(`[SubAgentGatewayService:${this.config.agentId}] Stopping...`);

    // 停止健康监控
    this.healthMonitor.stop();

    // 停止进程
    if (this.processManager.isRunning()) {
      await this.processManager.stop();
    }

    // 清理 PID 文件
    const pidFilePath = path.join(this.config.profileHome, 'gateway.pid');
    try {
      const fs = await import('fs/promises');
      await fs.unlink(pidFilePath);
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Cleaned up PID file`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`[SubAgentGatewayService:${this.config.agentId}] Failed to cleanup PID file:`, error);
      }
    }

    console.log(`[SubAgentGatewayService:${this.config.agentId}] Stopped`);
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
    console.error(`[SubAgentGatewayService:${this.config.agentId}] Error:`, error);
    this.circuitBreaker.recordFailure();
  }

  /**
   * 获取 HealthMonitor 实例
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

    return {
      agentId: this.config.agentId,
      port: this.config.port,
      running,
      pid,
      healthy: healthStatus.healthy,
      healthCheckMode: this.healthMonitor.getMode(),
      consecutiveFailures: healthStatus.consecutiveFailures,
      avgLatency: healthStatus.avgLatency,
      circuitState,
    };
  }

  /**
   * 获取 Sub Agent ID
   */
  getAgentId(): number {
    return this.config.agentId;
  }

  /**
   * 获取端口
   */
  getPort(): number {
    return this.config.port;
  }

  /**
   * 构建环境变量
   */
  private buildEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // ====================================================================
    // Sub Agent 核心隔离: HERMES_HOME 指向 profile 目录
    // ====================================================================
    env.HERMES_HOME = this.config.profileHome;
    console.log(`[SubAgentGatewayService:${this.config.agentId}] HERMES_HOME = ${this.config.profileHome}`);

    // ⚠️ 工作空间环境变量由 Python 后端在 config.yaml 中设置
    // Python 后端在 Profile 初始化时已写入这些环境变量

    // ====================================================================
    // Sub Agent 标记：跳过 config.yaml 端口配置，使用环境变量
    // ====================================================================
    env.HERMES_SUB_AGENT_MODE = '1';
    env.API_SERVER_PORT = String(this.config.port);
    env.API_SERVER_HOST = '127.0.0.1';

    // ====================================================================
    // 跳过父进程检查（父进程是主 Electron，不是子进程自己）
    // ====================================================================
    env.HERMES_SKIP_PARENT_CHECK = '1';

    // ====================================================================
    // 审计令牌（复用主 Gateway 的令牌）
    // ====================================================================
    env.HERMES_AUDIT_TOKEN = this.auditToken;
    console.log(`[SubAgentGatewayService:${this.config.agentId}] Setting HERMES_AUDIT_TOKEN env: ${this.auditToken.substring(0, 16)}...`);

    // ====================================================================
    // Gateway 认证 Token（复用主 Gateway 的 token）
    // ====================================================================
    env.HERMES_GATEWAY_TOKEN = this.config.gatewayToken;

    // ====================================================================
    // 继承 Electron 模式标记
    // ====================================================================
    env.HERMES_ELECTRON_MODE = '1';

    // ====================================================================
    // PYTHONPATH
    // ====================================================================
    env.PYTHONPATH = this.config.pythonRuntimePath;

    // ====================================================================
    // Gateway 配置（使用动态分配的端口）
    // ====================================================================
    env.GATEWAY_PORT = String(this.config.port);
    env.GATEWAY_HOST = '127.0.0.1';

    // ====================================================================
    // CORS 配置
    // ====================================================================
    const isDev = this.config.environment === AppEnvironment.DEVELOPMENT;
    env.API_SERVER_CORS_ORIGINS = isDev ? '*' : 'file://';

    // ====================================================================
    // 启用 Dashboard API 路由（必需，否则所有 /api/ 端点返回 404）
    // ====================================================================
    env.GATEWAY_ENABLE_DASHBOARD = '1';

    // ====================================================================
    // 禁用 Python 字节码缓存
    // ====================================================================
    env.PYTHONDONTWRITEBYTECODE = '1';

    return env;
  }

  /**
   * 构建工作空间结构（从 org.db 查询层级信息）
   */
}
