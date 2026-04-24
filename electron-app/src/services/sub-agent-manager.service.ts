/**
 * SubAgentManagerService
 *
 * 管理所有 Sub Agent Gateway 实例
 * - 动态创建/销毁 Sub Agent Gateway 服务
 * - 端口分配和冲突检测
 * - 统一生命周期管理
 */

import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { Service } from '../core/service.interface';
import { SubAgentGatewayService, SubAgentGatewayConfig } from './sub-agent-gateway.service';
import { AppEnvironment } from '../env-detector';

export interface SubAgentManagerConfig {
  pythonPath: string;
  pythonRuntimePath: string;
  environment: AppEnvironment;
  mainHermesHome: string; // 主 Agent 的 HERMES_HOME
  orgProfilesDir: string; // 组织 profiles 目录，如 ~/Library/.../org/profiles
  gatewayToken: string; // 主 Gateway 的认证 token
}

/**
 * SubAgentManagerService 类
 */
export class SubAgentManagerService implements Service {
  readonly id = 'sub-agent-manager';
  readonly required = false; // 非必需，主 Gateway 失败不影响
  readonly dependencies = ['gateway']; // 依赖主 Gateway 服务

  private config: SubAgentManagerConfig;
  private services: Map<number, SubAgentGatewayService> = new Map();
  private nextPort = 9000; // 动态端口范围: 9000-65535
  private logCallback?: (log: string) => void;
  private gatewayTokenGetter?: () => string; // Lazy getter for Gateway token

  constructor(config: SubAgentManagerConfig) {
    this.config = config;
  }

  /**
   * 设置日志回调
   */
  setLogCallback(callback: (log: string) => void): void {
    this.logCallback = callback;
  }

  /**
   * 设置 Gateway Token Getter（延迟获取）
   */
  setGatewayTokenGetter(getter: () => string): void {
    this.gatewayTokenGetter = getter;
  }

  /**
   * 启动服务（初始化，不启动任何子进程）
   */
  async start(): Promise<void> {
    console.log('[SubAgentManagerService] Started (no sub-agents spawned yet)');
  }

  /**
   * 停止服务（停止所有子进程）
   */
  async stop(): Promise<void> {
    console.log('[SubAgentManagerService] Stopping all sub-agents...');

    const stopPromises = Array.from(this.services.values()).map((service) => service.stop());
    await Promise.all(stopPromises);

    this.services.clear();
    console.log('[SubAgentManagerService] Stopped');
  }

  /**
   * 检查服务是否健康（Service 接口要求）
   */
  isHealthy(): boolean {
    // SubAgentManager 本身始终健康，子进程健康由各自的服务管理
    return true;
  }

  /**
   * 错误回调（Service 接口要求）
   */
  onError(error: Error): void {
    console.error('[SubAgentManagerService] Error:', error);
  }

  /**
   * 获取或启动 Sub Agent Gateway
   *
   * @param agentId Sub Agent ID
   * @returns Sub Agent Gateway 服务实例
   */
  async getOrStart(agentId: number): Promise<SubAgentGatewayService> {
    // 如果已存在且健康，直接返回
    if (this.services.has(agentId)) {
      const service = this.services.get(agentId)!;
      if (service.isHealthy()) {
        console.log(`[SubAgentManagerService] Reusing healthy sub-agent ${agentId}`);
        return service;
      } else {
        // 不健康，停止并重新创建
        console.warn(`[SubAgentManagerService] Sub-agent ${agentId} is unhealthy, restarting...`);
        await service.stop();
        this.services.delete(agentId);
      }
    }

    // 创建新实例
    console.log(`[SubAgentManagerService] Starting new sub-agent ${agentId}...`);

    // 解析 profile 目录
    const profileHome = this.resolveProfileHome(agentId);
    if (!profileHome) {
      throw new Error(`Failed to resolve profile home for agent ${agentId}`);
    }

    // 分配端口
    const port = await this.allocatePort();

    // 获取 Gateway token（延迟获取，确保主 Gateway 已启动）
    const gatewayToken = this.gatewayTokenGetter ? this.gatewayTokenGetter() : this.config.gatewayToken;
    if (!gatewayToken) {
      throw new Error('Gateway token not available. Ensure main Gateway is started.');
    }

    // 创建配置
    const config: SubAgentGatewayConfig = {
      agentId,
      profileHome,
      pythonPath: this.config.pythonPath,
      pythonRuntimePath: this.config.pythonRuntimePath,
      environment: this.config.environment,
      mainHermesHome: this.config.mainHermesHome,
      port,
      gatewayToken,
    };

    // 创建服务
    const service = new SubAgentGatewayService(config);

    // 设置日志回调
    if (this.logCallback) {
      service.setLogCallback(this.logCallback);
    }

    // 启动服务
    await service.start();

    // 保存到 Map
    this.services.set(agentId, service);

    console.log(`[SubAgentManagerService] Sub-agent ${agentId} started on port ${port}`);
    return service;
  }

  /**
   * 停止指定 Sub Agent Gateway
   *
   * @param agentId Sub Agent ID
   */
  async stopSubAgent(agentId: number): Promise<void> {
    const service = this.services.get(agentId);
    if (!service) {
      console.warn(`[SubAgentManagerService] Sub-agent ${agentId} not found`);
      return;
    }

    console.log(`[SubAgentManagerService] Stopping sub-agent ${agentId}...`);
    await service.stop();
    this.services.delete(agentId);
    console.log(`[SubAgentManagerService] Sub-agent ${agentId} stopped`);
  }

  /**
   * 获取所有 Sub Agent 服务指标
   */
  getAllMetrics(): Array<Record<string, any>> {
    return Array.from(this.services.values()).map((service) => service.getMetrics());
  }

  /**
   * 获取指定 Sub Agent 的端口
   *
   * @param agentId Sub Agent ID
   * @returns 端口号，如果不存在返回 null
   */
  getPort(agentId: number): number | null {
    const service = this.services.get(agentId);
    return service ? service.getPort() : null;
  }

  /**
   * 解析 Sub Agent 的 profile 目录
   *
   * @param agentId Sub Agent ID
   * @returns Profile 目录绝对路径，失败返回 null
   */
  private resolveProfileHome(agentId: number): string | null {
    // 读取组织架构数据库，获取 profile 路径
    // 简化实现：假设 profile 目录为 org/profiles/org-{agentId}
    const profileHome = path.join(this.config.orgProfilesDir, `org-${agentId}`);

    // 检查目录是否存在
    if (!fs.existsSync(profileHome)) {
      console.warn(`[SubAgentManagerService] Profile directory not found: ${profileHome}`);
      return null;
    }

    // 检查 organization.json 是否存在
    const orgJsonPath = path.join(profileHome, 'organization.json');
    if (!fs.existsSync(orgJsonPath)) {
      console.warn(`[SubAgentManagerService] organization.json not found in profile: ${profileHome}`);
      return null;
    }

    return profileHome;
  }

  /**
   * 分配可用端口
   *
   * @returns 可用端口号
   * @throws 如果无法找到可用端口
   */
  private async allocatePort(): Promise<number> {
    const maxAttempts = 100;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const port = this.nextPort;
      this.nextPort++;
      if (this.nextPort > 65535) {
        this.nextPort = 9000; // 循环回 9000
      }

      // 检查端口是否可用
      if (await this.isPortAvailable(port)) {
        console.log(`[SubAgentManagerService] Allocated port ${port}`);
        return port;
      }

      attempts++;
    }

    throw new Error(`Failed to allocate port after ${maxAttempts} attempts`);
  }

  /**
   * 检查端口是否可用
   *
   * @param port 端口号
   * @returns 是否可用
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const server = net.createServer();

      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false); // 端口已被占用
        } else {
          resolve(false); // 其他错误，认为不可用
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true); // 端口可用
      });

      server.listen(port, '127.0.0.1');
    });
  }
}
