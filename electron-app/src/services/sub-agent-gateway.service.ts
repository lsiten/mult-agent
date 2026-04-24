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
      // 0. 确保 profile 目录存在
      await this.ensureProfileDirectory();

      // 1. 清理可能存在的旧实例
      await this.cleanupOldInstance();

      // 2. 重新读取审计令牌（在同步之后，确保使用最新的 token）
      this.auditToken = this.readProfileAuditToken();
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Using audit token from profile: ${this.auditToken.substring(0, 16)}...`);

      // 3. 更新 ProcessManager 的环境变量（现在 auditToken 已经是最新的）
      const env = this.buildEnvironment();
      (this.processManager as any).config.env = env;

      // 4. 启动进程
      await this.circuitBreaker.execute(async () => {
        this.processManager.start();
      });

      // 5. 等待健康检查通过
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
   * 确保 profile 目录存在
   */
  private async ensureProfileDirectory(): Promise<void> {
    const dirs = [
      this.config.profileHome,
      path.join(this.config.profileHome, 'logs'),
      path.join(this.config.profileHome, 'sessions'),
      path.join(this.config.profileHome, 'memories'),
      path.join(this.config.profileHome, 'skills'),
      path.join(this.config.profileHome, 'cron'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        console.log(`[SubAgentGatewayService:${this.config.agentId}] Created directory: ${dir}`);
      }
    }

    // 复制主 Gateway 的 .runtime_token 到 profile 目录
    // 总是覆盖，确保使用最新的 token（主 Gateway 重启后 token 会变化）
    const mainTokenPath = path.join(this.config.mainHermesHome, '.runtime_token');
    const profileTokenPath = path.join(this.config.profileHome, '.runtime_token');
    if (fs.existsSync(mainTokenPath)) {
      fs.copyFileSync(mainTokenPath, profileTokenPath);
      fs.chmodSync(profileTokenPath, 0o600);
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Synced runtime token to profile`);
    } else {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Main runtime token not found at ${mainTokenPath}`);
    }

    // ====================================================================
    // 复制主 Agent 的 .env 文件到 profile 目录
    // ⚠️ .env 包含 API keys，Sub Agent 必须继承才能正常工作
    // ====================================================================
    const mainEnvPath = path.join(this.config.mainHermesHome, '.env');
    const profileEnvPath = path.join(this.config.profileHome, '.env');
    if (fs.existsSync(mainEnvPath)) {
      fs.copyFileSync(mainEnvPath, profileEnvPath);
      fs.chmodSync(profileEnvPath, 0o600);
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Synced .env (API keys) to profile`);
    } else {
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Main .env not found at ${mainEnvPath}, Sub Agent may lack API keys`);
    }

    // 确保 profile 有 config.yaml（Sub Agent 必需）
    // 从主 Agent config 中选择性继承配置
    await this.ensureProfileConfig();
  }

  /**
   * 确保 profile 有正确的 config.yaml
   * 从主 Agent 配置中选择性继承，排除不适用的配置
   */
  private async ensureProfileConfig(): Promise<void> {
    const profileConfigPath = path.join(this.config.profileHome, 'config.yaml');
    const mainConfigPath = path.join(this.config.mainHermesHome, 'config.yaml');

    // 总是重新生成 config，确保与主配置同步（除了独立配置）
    console.log(`[SubAgentGatewayService:${this.config.agentId}] Generating config.yaml from main config`);

    let mainConfig: any = null;
    if (fs.existsSync(mainConfigPath)) {
      try {
        const yaml = require('js-yaml');
        const mainConfigContent = fs.readFileSync(mainConfigPath, 'utf-8');
        mainConfig = yaml.load(mainConfigContent);
      } catch (error) {
        console.warn(`[SubAgentGatewayService:${this.config.agentId}] Failed to parse main config:`, error);
      }
    }

    // 构建 Sub Agent 配置
    const subAgentConfig: any = {};

    if (mainConfig) {
      // ============================================================
      // 继承的配置（从主 Agent）
      // ============================================================
      const inheritedKeys = [
        'model',                    // 主模型
        'providers',                // Provider 配置
        'fallback_providers',       // 降级 Provider
        'credential_pool_strategies', // 凭证池策略
        'toolsets',                 // 工具集
        'agent',                    // Agent 核心配置
        'terminal',                 // 终端配置
        'browser',                  // 浏览器配置
        'checkpoints',              // 检查点配置
        'file_read_max_chars',      // 文件读取限制
        'compression',              // 压缩配置
        'bedrock',                  // AWS Bedrock
        'smart_model_routing',      // 智能路由
        'auxiliary',                // 辅助任务配置
        'display',                  // 显示配置
        'dashboard',                // Dashboard
        'privacy',                  // 隐私设置
        'tts',                      // 文本转语音
        'stt',                      // 语音转文本
        'voice',                    // 语音设置
        'human_delay',              // 人类延迟模拟
        'context',                  // 上下文引擎
        'memory',                   // 记忆配置
        'delegation',               // 委托配置
        'skills',                   // 技能配置
        'timezone',                 // 时区
        'approvals',                // 审批配置
        'command_allowlist',        // 命令白名单
        'quick_commands',           // 快捷命令
        'personalities',            // 个性配置
        'security',                 // 安全配置
        'cron',                     // 定时任务
        'code_execution',           // 代码执行
        'network',                  // 网络配置
        'tasks',                    // 任务配置
      ];

      for (const key of inheritedKeys) {
        if (mainConfig[key] !== undefined) {
          subAgentConfig[key] = mainConfig[key];
        }
      }

      // ============================================================
      // 排除的配置（不继承，Sub Agent 不需要）
      // ============================================================
      // - prefill_messages_file: 预填充消息（主 Agent 特定）
      // - honcho: Honcho 集成（主 Agent 特定）
      // - platforms.discord/telegram/slack/etc: 其他平台（Sub Agent 只用 api_server）
      // - discord/telegram/slack/whatsapp/mattermost: 平台特定配置

      // ============================================================
      // 独立配置（Sub Agent 特有，不从主 Agent 继承）
      // ============================================================

      // Logging: 使用 profile 独立日志目录
      subAgentConfig.logging = {
        level: mainConfig.logging?.level || 'INFO',
        max_size_mb: mainConfig.logging?.max_size_mb || 5,
        backup_count: mainConfig.logging?.backup_count || 3,
      };

      // Platforms: 只启用 api_server，使用动态分配的端口
      subAgentConfig.platforms = {
        api_server: {
          enabled: true,
          extra: {
            host: '127.0.0.1',
            port: this.config.port, // 动态分配的端口
            cors_origins: '*',      // Sub Agent 允许所有来源（内部使用）
          },
        },
      };

    } else {
      // ============================================================
      // 主配置不存在时的最小配置
      // ============================================================
      console.warn(`[SubAgentGatewayService:${this.config.agentId}] Main config not found, using minimal config`);

      subAgentConfig.model = 'claude-sonnet-4-6';
      subAgentConfig.agent = {
        max_turns: 90,
        gateway_timeout: 1800,
        tool_use_enforcement: 'auto',
      };
      subAgentConfig.logging = {
        level: 'INFO',
        max_size_mb: 5,
        backup_count: 3,
      };
      subAgentConfig.platforms = {
        api_server: {
          enabled: true,
          extra: {
            host: '127.0.0.1',
            port: this.config.port,
            cors_origins: '*',
          },
        },
      };
      subAgentConfig.toolsets = ['hermes-cli'];
      subAgentConfig.memory = {
        memory_enabled: true,
        user_profile_enabled: true,
      };
    }

    // 写入配置文件
    try {
      const yaml = require('js-yaml');
      const configYaml = yaml.dump(subAgentConfig, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });

      const header = `# Sub Agent Profile Config (Agent ID: ${this.config.agentId})
# 此配置从主 Agent 继承核心设置，但使用独立的端口和日志
# 生成时间: ${new Date().toISOString()}
# 端口: ${this.config.port}
# HERMES_HOME: ${this.config.profileHome}

`;

      fs.writeFileSync(profileConfigPath, header + configYaml, 'utf-8');
      console.log(`[SubAgentGatewayService:${this.config.agentId}] Created config.yaml with inherited settings`);
    } catch (error) {
      console.error(`[SubAgentGatewayService:${this.config.agentId}] Failed to write config:`, error);
      throw error;
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
}
