/**
 * Main Process (New Architecture)
 *
 * 使用 Application 类管理服务生命周期
 */

import { app, dialog } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import { Application } from './core/application';
import { EnvService } from './services/env.service';
import { ConfigService } from './services/config.service';
import { GatewayService } from './services/gateway.service';
import { ViteDevService } from './services/vite-dev.service';
import { WindowService } from './services/window.service';
import { DevWatcherService } from './services/dev-watcher.service';
import { DataMigration } from './data-migration';
import { EnvironmentDetector, AppEnvironment } from './env-detector';
import { DependencyChecker, CheckResult } from './dependency-checker';
import { IpcRegistry } from './ipc/ipc-registry';
import { createIpcHandlers } from './ipc/ipc-handlers';

// 全局应用实例
let application: Application | null = null;
let gatewayAuthToken: string = '';
let dependencyCheckResult: CheckResult | null = null;
let ipcRegistry: IpcRegistry | null = null;

/**
 * 设置 IPC 处理器（使用新的 IPC Registry）
 */
function setupIpcHandlers(): void {
  if (!application) {
    throw new Error('Application not initialized');
  }

  // 创建 IPC Registry
  ipcRegistry = new IpcRegistry();

  // 注册所有处理器
  const handlers = createIpcHandlers(application, gatewayAuthToken);
  ipcRegistry.registerAll(handlers);

  console.log(`[Main] Registered ${handlers.length} IPC handlers`);
}

// 旧的 IPC handlers 已删除，使用新的 IPC Registry

/**
 * 初始化应用
 */
async function initializeApplication(): Promise<void> {
  console.log('[Main] Initializing application with new architecture...');

  const env = EnvironmentDetector.detect();
  const isDev = env === AppEnvironment.DEVELOPMENT;

  // 检查资源是否就绪
  const resourceCheck = EnvironmentDetector.checkResources();
  if (!resourceCheck.ready) {
    const errors = resourceCheck.errors.join('\n');
    console.error('[Main] Resources not ready:', errors);

    if (isDev) {
      dialog.showErrorBox(
        'Development Setup Required',
        'Resources not found. Please run:\n\n' +
        'npm run setup:dev\n\n' +
        'Errors:\n' + errors
      );
    } else {
      dialog.showErrorBox(
        'Application Error',
        'Application resources are corrupted or missing.\n\n' +
        'Please reinstall the application.\n\n' +
        'Errors:\n' + errors
      );
    }
    app.quit();
    return;
  }

  // 生成认证 token (生产环境)
  if (env === AppEnvironment.PRODUCTION) {
    gatewayAuthToken = crypto.randomBytes(32).toString('hex');
    console.log('[Main] Generated Gateway auth token');
  }

  // 创建 Application 实例
  application = new Application();

  // 注册所有服务
  const envService = new EnvService({
    environment: env,
  });

  const configService = new ConfigService();

  const gatewayService = new GatewayService({
    pythonPath: path.join(EnvironmentDetector.getPythonRuntimePath(), 'bin', 'python3'), // Python 可执行文件
    pythonRuntimePath: EnvironmentDetector.getPythonPath(), // Python 源码目录
    environment: env,
    hermesHome: app.getPath('userData'),
    authToken: gatewayAuthToken || undefined,
  });

  const viteDevService = new ViteDevService({
    environment: env,
    webPath: EnvironmentDetector.getWebPath(),
  });

  const windowService = new WindowService({
    environment: env,
    webPath: EnvironmentDetector.getWebPath(),
    preloadPath: path.join(__dirname, 'preload.js'),
    viteUrl: isDev ? 'http://localhost:5173' : undefined,
  });

  const devWatcherService = new DevWatcherService({
    environment: env,
  });

  // 设置 Gateway 日志回调
  gatewayService.setLogCallback((log: string) => {
    const windowService = application?.get<WindowService>('window');
    if (windowService) {
      const mainWindow = windowService.getWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python:log', log);
      }
    }
  });

  gatewayService.setErrorCallback((error: Error) => {
    const windowService = application?.get<WindowService>('window');
    if (windowService) {
      const mainWindow = windowService.getWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('python:error', {
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });

  // 注册服务
  application.register(envService);
  application.register(configService);
  application.register(gatewayService);
  application.register(viteDevService);
  application.register(windowService);
  application.register(devWatcherService);

  // 启动所有服务
  try {
    await application.start();
    console.log('[Main] Application started successfully');
  } catch (error) {
    console.error('[Main] Failed to start application:', error);
    dialog.showErrorBox(
      'Startup Failed',
      `Failed to start application:\n\n${error instanceof Error ? error.message : 'Unknown error'}`
    );
    app.quit();
  }
}

/**
 * App ready handler
 */
app.whenReady().then(async () => {
  console.log('[Main] App ready');

  // 检查功能开关
  const useNewLifecycle = process.env.USE_NEW_LIFECYCLE !== 'false';
  console.log('[Main] USE_NEW_LIFECYCLE:', useNewLifecycle);

  if (!useNewLifecycle) {
    console.log('[Main] Using old architecture (fallback mode)');
    // 导入并使用旧的 main.ts 逻辑
    // 这里暂时只是占位，实际应该导入旧逻辑
    dialog.showErrorBox(
      'Configuration Error',
      'Old architecture fallback not yet implemented.\nPlease set USE_NEW_LIFECYCLE=true'
    );
    app.quit();
    return;
  }

  // 数据迁移
  console.log('[Main] Checking for data migration...');
  try {
    const migration = new DataMigration();
    await migration.migrate();
  } catch (error) {
    console.error('[Main] Migration failed:', error);
  }

  // 依赖检查
  const checker = new DependencyChecker();
  dependencyCheckResult = await checker.checkAll();

  if (!dependencyCheckResult.allOk) {
    console.error('[Main] Dependency check failed');
    const diagnosticPath = path.join(__dirname, '..', 'diagnostic.html');
    console.log('[Main] Loading diagnostic UI:', diagnosticPath);
    // 显示诊断界面将由 WindowService 处理
  }

  // 初始化应用（必须在 setupIpcHandlers 之前）
  await initializeApplication();

  // 注册 IPC 处理器（需要 application 实例）
  setupIpcHandlers();

  console.log('[Main] Initialization complete');
});

/**
 * App window-all-closed handler
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * App activate handler (macOS)
 */
app.on('activate', () => {
  const windowService = application?.get<WindowService>('window');
  if (!windowService?.isHealthy()) {
    // 在 macOS 上点击 Dock 图标时重新创建窗口
    // TODO: 实现窗口重新创建
  }
});

/**
 * App before-quit handler
 */
app.on('before-quit', async (event) => {
  if (application) {
    console.log('[Main] Stopping application...');
    event.preventDefault(); // 阻止默认退出

    try {
      await application.stop();
      console.log('[Main] Application stopped');
      app.exit(0);
    } catch (error) {
      console.error('[Main] Error stopping application:', error);
      app.exit(1);
    }
  }
});
