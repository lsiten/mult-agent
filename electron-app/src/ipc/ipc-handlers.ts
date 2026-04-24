/**
 * IPC Handlers
 *
 * 所有 IPC 处理器的实现
 */

import { app, shell } from 'electron';
import { Application } from '../core/application';
import { GatewayService } from '../services/gateway.service';
import { ViteDevService } from '../services/vite-dev.service';
import { WindowService } from '../services/window.service';
import { ConfigService } from '../services/config.service';
import { SubAgentManagerService } from '../services/sub-agent-manager.service';
import { IpcHandlerConfig } from './ipc-registry';
import * as schemas from './ipc-schemas';

/**
 * Health check cache to avoid frequent checks
 */
interface HealthCheckCache {
  result: boolean;
  timestamp: number;
}

const healthCheckCache = new Map<string, HealthCheckCache>();
const HEALTH_CHECK_TTL = 5000; // 5 seconds

/**
 * Check health with caching
 */
async function checkHealthCached(
  serviceId: string,
  checker: () => Promise<{ success: boolean; latency: number; error?: string }>
): Promise<boolean> {
  const now = Date.now();
  const cached = healthCheckCache.get(serviceId);

  if (cached && now - cached.timestamp < HEALTH_CHECK_TTL) {
    console.log(`[IPC] Using cached health check for ${serviceId} (${now - cached.timestamp}ms old)`);
    return cached.result;
  }

  console.log(`[IPC] Performing health check for ${serviceId}...`);
  const checkResult = await checker();
  healthCheckCache.set(serviceId, { result: checkResult.success, timestamp: now });
  return checkResult.success;
}

/**
 * 创建所有 IPC 处理器
 */
export function createIpcHandlers(
  application: Application
): IpcHandlerConfig[] {
  return [
    // ============================================================
    // Shell 相关
    // ============================================================
    {
      channel: 'shell:openExternal',
      schema: schemas.ShellOpenExternalSchema,
      handler: async (_event, input) => {
        await shell.openExternal(input.url);
        return { success: true };
      },
    },

    // ============================================================
    // Python / Gateway 相关
    // ============================================================
    {
      channel: 'python:getStatus',
      schema: schemas.PythonGetStatusSchema,
      handler: async (_event, input) => {
        console.log('[IPC] python:getStatus called with input:', input);
        const gatewayService = application.get<GatewayService>('gateway');
        if (!gatewayService) {
          console.log('[IPC] python:getStatus: No gateway service');
          return { running: false };
        }

        // Trigger on-demand health check with caching
        const healthMonitor = gatewayService.getHealthMonitor();
        const isHealthy = await checkHealthCached('gateway', async () => {
          return await healthMonitor.checkHealth();
        });

        const metrics = gatewayService.getMetrics();
        console.log('[IPC] python:getStatus: metrics =', metrics);
        console.log('[IPC] python:getStatus: health check result =', isHealthy);
        console.log('[IPC] python:getStatus: includeMetrics =', input.includeMetrics);

        if (input.includeMetrics) {
          console.log('[IPC] python:getStatus: Returning full metrics');
          return { ...metrics, healthy: isHealthy };
        }
        console.log('[IPC] python:getStatus: Returning basic status');
        return {
          running: metrics.running,
          healthy: isHealthy,
        };
      },
    },

    {
      channel: 'python:restart',
      schema: schemas.PythonRestartSchema,
      rateLimit: { maxAttempts: 3, windowMs: 60000 }, // 3 次 / 60 秒
      handler: async (_event, input) => {
        const gatewayService = application.get<GatewayService>('gateway');
        if (!gatewayService) {
          throw new Error('GatewayService not initialized');
        }
        if (input.reason) {
          console.log(`[IPC] Restarting Gateway: ${input.reason}`);
        }

        // Check if Gateway is running - start if stopped, restart if running
        const metrics = gatewayService.getMetrics();
        if (!metrics.running) {
          console.log('[IPC] Gateway is stopped, calling start() instead of restart()');
          await gatewayService.start();
        } else {
          console.log('[IPC] Gateway is running, calling restart()');
          await gatewayService.restart();
        }

        return { success: true };
      },
    },

    {
      channel: 'gateway:getAuthToken',
      schema: schemas.GatewayGetAuthTokenSchema,
      handler: () => {
        // v2.1.1: 动态从 Gateway Service 读取 token（不使用闭包变量）
        const gatewayService = application.get<GatewayService>('gateway');
        if (!gatewayService) {
          console.warn('[IPC] gateway:getAuthToken: Gateway service not found');
          return { token: null };
        }
        try {
          const token = gatewayService.getAuthToken();
          console.log('[IPC] gateway:getAuthToken: returning token', token ? `${token.substring(0, 16)}...` : '(none)');
          return { token };
        } catch (error) {
          console.error('[IPC] gateway:getAuthToken: Failed to get token:', error);
          return { token: null };
        }
      },
    },

    // ============================================================
    // Vite Dev Server 相关
    // ============================================================
    {
      channel: 'vite:getStatus',
      schema: schemas.ViteGetStatusSchema,
      handler: (_event, input) => {
        const viteService = application.get<ViteDevService>('vite-dev');
        if (!viteService) {
          return { running: false };
        }
        const metrics = viteService.getMetrics();
        if (input.includeUrl) {
          return metrics;
        }
        return {
          running: metrics.running,
          ready: metrics.ready,
        };
      },
    },

    // ============================================================
    // Config 相关
    // ============================================================
    // TODO: config:get 和 config:set 需要 ConfigManager 支持 get/set 方法
    // 暂时移除，后续实现

    // ============================================================
    // Window 相关
    // ============================================================
    {
      channel: 'window:minimize',
      schema: schemas.WindowMinimizeSchema,
      handler: () => {
        const windowService = application.get<WindowService>('window');
        const window = windowService?.getWindow();
        if (window && !window.isDestroyed()) {
          window.minimize();
          return { success: true };
        }
        return { success: false };
      },
    },

    {
      channel: 'window:close',
      schema: schemas.WindowCloseSchema,
      handler: (_event, input) => {
        const windowService = application.get<WindowService>('window');
        const window = windowService?.getWindow();
        if (window && !window.isDestroyed()) {
          if (input.force) {
            window.destroy();
          } else {
            window.close();
          }
          return { success: true };
        }
        return { success: false };
      },
    },

    // ============================================================
    // Onboarding 相关
    // ============================================================
    {
      channel: 'onboarding:getStatus',
      schema: schemas.OnboardingGetStatusSchema,
      handler: () => {
        const configService = application.get<ConfigService>('config');
        if (!configService) {
          return { needsOnboarding: false };
        }
        return {
          needsOnboarding: configService.getManager().needsOnboarding(),
        };
      },
    },

    {
      channel: 'onboarding:markComplete',
      schema: schemas.OnboardingMarkCompleteSchema,
      handler: () => {
        const configService = application.get<ConfigService>('config');
        if (!configService) {
          throw new Error('ConfigService not initialized');
        }
        configService.getManager().markOnboardingComplete();
        return { success: true };
      },
    },

    {
      channel: 'onboarding:reset',
      schema: schemas.OnboardingResetSchema,
      handler: () => {
        const configService = application.get<ConfigService>('config');
        if (!configService) {
          throw new Error('ConfigService not initialized');
        }
        const configManager = configService.getManager();
        const fs = require('fs');
        const path = require('path');
        const markerPath = path.join(
          configManager.getConfigDir(),
          '.onboarding-complete'
        );
        if (fs.existsSync(markerPath)) {
          fs.unlinkSync(markerPath);
        }
        // 通知前端
        const windowService = application.get<WindowService>('window');
        if (windowService) {
          const mainWindow = windowService.getWindow();
          if (mainWindow) {
            mainWindow.webContents.send('onboarding:status', {
              needsOnboarding: true,
            });
          }
        }
        return { success: true };
      },
    },

    // ============================================================
    // App 相关
    // ============================================================
    {
      channel: 'app:getPath',
      schema: schemas.AppGetPathSchema,
      handler: (_event, input) => {
        if (input.name) {
          return { path: app.getPath(input.name) };
        }
        return { path: app.getAppPath() };
      },
    },

    // ============================================================
    // Diagnostic 相关
    // ============================================================
    {
      channel: 'diagnostic:getDependencies',
      schema: schemas.DiagnosticGetDependenciesSchema,
      handler: async () => {
        // TODO: 实现依赖检查
        // 暂时返回空结果
        return { allOk: true, checks: [] };
      },
    },

    {
      channel: 'diagnostic:getLogs',
      schema: schemas.DiagnosticGetLogsSchema,
      handler: async (_event, input) => {
        const fs = require('fs');
        const path = require('path');
        const logsDir = path.join(app.getPath('userData'), 'logs');

        try {
          // 读取所有日志文件
          const logFiles = ['gateway.log', 'agent.log', 'errors.log'];
          const lines = input.lines || 100;
          let allContent = '';

          for (const logFileName of logFiles) {
            const logFile = path.join(logsDir, logFileName);
            if (fs.existsSync(logFile)) {
              const content = fs.readFileSync(logFile, 'utf-8');
              const fileLines = content.split('\n');
              const recentLines = fileLines.slice(-Math.floor(lines / logFiles.length));
              allContent += `\n=== ${logFileName} ===\n${recentLines.join('\n')}\n`;
            }
          }

          return { data: allContent || 'No logs available' };
        } catch (error: any) {
          console.error('[IPC] Failed to read logs:', error);
          return { data: `Error reading logs: ${error.message}` };
        }
      },
    },

    {
      channel: 'diagnostic:getLogsPath',
      schema: schemas.DiagnosticGetLogsPathSchema,
      handler: () => {
        const path = require('path');
        return { path: path.join(app.getPath('userData'), 'logs') };
      },
    },

    {
      channel: 'diagnostic:retry',
      schema: schemas.DiagnosticRetrySchema,
      rateLimit: { maxAttempts: 3, windowMs: 5000 }, // 3 次 / 5 秒
      handler: async () => {
        console.log('[IPC] Retrying startup...');
        const gatewayService = application.get<GatewayService>('gateway');
        if (gatewayService) {
          await gatewayService.restart();
          // 重新加载窗口
          const windowService = application.get<WindowService>('window');
          const viteService = application.get<ViteDevService>('vite-dev');
          if (windowService && viteService) {
            const mainWindow = windowService.getWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              const isDev = viteService.getMetrics().isDev;
              if (isDev) {
                mainWindow.loadURL(viteService.getUrl());
              } else {
                const { EnvironmentDetector } = require('../env-detector');
                mainWindow.loadFile(EnvironmentDetector.getWebPath());
              }
            }
          }
          return { success: true };
        }
        return { success: false };
      },
    },

    // ============================================================
    // Sub Agent Gateway 相关
    // ============================================================
    {
      channel: 'sub-agent:getOrStart',
      schema: schemas.SubAgentGetOrStartSchema,
      handler: async (_event, input) => {
        const startTime = Date.now();
        console.log(`[IPC] sub-agent:getOrStart(${input.agentId}) called`);

        const subAgentManager = application.get<SubAgentManagerService>('sub-agent-manager');
        if (!subAgentManager) {
          throw new Error('SubAgentManagerService not initialized');
        }

        try {
          const service = await subAgentManager.getOrStart(input.agentId);
          const elapsed = Date.now() - startTime;
          console.log(`[IPC] sub-agent:getOrStart completed in ${elapsed}ms (port=${service.getPort()})`);

          return {
            success: true,
            port: service.getPort(),
            agentId: service.getAgentId(),
          };
        } catch (error) {
          const elapsed = Date.now() - startTime;
          console.error(`[IPC] Failed to start sub-agent ${input.agentId} after ${elapsed}ms:`, error);
          throw error;
        }
      },
    },

    {
      channel: 'sub-agent:stop',
      schema: schemas.SubAgentStopSchema,
      handler: async (_event, input) => {
        const subAgentManager = application.get<SubAgentManagerService>('sub-agent-manager');
        if (!subAgentManager) {
          throw new Error('SubAgentManagerService not initialized');
        }

        await subAgentManager.stopSubAgent(input.agentId);
        return { success: true };
      },
    },

    {
      channel: 'sub-agent:getPort',
      schema: schemas.SubAgentGetPortSchema,
      handler: (_event, input) => {
        const subAgentManager = application.get<SubAgentManagerService>('sub-agent-manager');
        if (!subAgentManager) {
          throw new Error('SubAgentManagerService not initialized');
        }

        const port = subAgentManager.getPort(input.agentId);
        if (port === null) {
          return { found: false, port: null };
        }
        return { found: true, port };
      },
    },

    {
      channel: 'sub-agent:getAllMetrics',
      schema: schemas.SubAgentGetAllMetricsSchema,
      handler: () => {
        const subAgentManager = application.get<SubAgentManagerService>('sub-agent-manager');
        if (!subAgentManager) {
          throw new Error('SubAgentManagerService not initialized');
        }

        const metrics = subAgentManager.getAllMetrics();
        return { metrics };
      },
    },

    // ====================================================================
    // Sub Agent: 同步主 Agent 配置
    // ====================================================================
    {
      channel: 'sub-agent:syncFromMaster',
      schema: schemas.SubAgentStopSchema, // 复用 { agentId: number } schema
      handler: async (_event, input) => {
        console.log(`[IPC] sub-agent:syncFromMaster(${input.agentId}) called`);

        const subAgentManager = application.get<SubAgentManagerService>('sub-agent-manager');
        if (!subAgentManager) {
          throw new Error('SubAgentManagerService not initialized');
        }

        // 获取 Sub Agent 服务（通过 getPort 检查存在性）
        const port = subAgentManager.getPort(input.agentId);
        if (port === null) {
          throw new Error(`Sub Agent ${input.agentId} not found or not running. Please start it first.`);
        }

        // 停止 → 重启（重启时会自动同步 config.yaml + .env + .runtime_token）
        console.log(`[IPC] Restarting Sub Agent ${input.agentId} to sync config...`);
        await subAgentManager.stopSubAgent(input.agentId);
        const service = await subAgentManager.getOrStart(input.agentId);

        return {
          success: true,
          message: 'Configuration synced successfully. Sub Agent restarted with latest config.',
          port: service.getPort(),
        };
      },
    },

    // ====================================================================
    // Electron: 服务状态和 IPC 信息
    // ====================================================================
    {
      channel: 'electron:getServices',
      schema: schemas.ElectronGetServicesSchema,
      handler: () => {
        const allMetadata = application.getAllMetadata();
        const services = allMetadata.map((meta) => ({
          id: meta.service.id,
          name: meta.service.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Service',
          status: meta.state === 'started' ? 'running' :
                  meta.state === 'stopped' ? 'stopped' :
                  meta.state === 'failed' ? 'error' : 'stopped',
          dependencies: meta.service.dependencies || [],
        }));
        return { services };
      },
    },

    {
      channel: 'electron:getIPCHandlers',
      schema: schemas.ElectronGetIPCHandlersSchema,
      handler: () => {
        // 返回当前注册的所有 IPC handlers
        const handlers = createIpcHandlers(application).map((h) => ({
          channel: h.channel,
          description: h.schema?.description || null,
        }));
        return { handlers };
      },
    },
  ];
}
