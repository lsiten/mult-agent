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
  application: Application,
  gatewayAuthToken: string
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
        await gatewayService.restart();
        return { success: true };
      },
    },

    {
      channel: 'gateway:getAuthToken',
      schema: schemas.GatewayGetAuthTokenSchema,
      handler: () => {
        return { token: gatewayAuthToken || null };
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
  ];
}
