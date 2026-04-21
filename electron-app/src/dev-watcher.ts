import { watch, FSWatcher } from 'fs';
import * as path from 'path';
import * as fs from 'fs';
import { PythonManager } from './python-manager';
import { BrowserWindow } from 'electron';
import { EnvManager } from './env-manager';

interface WatchConfig {
  path: string;
  pattern?: string;
  action: 'restart' | 'reload';
  description: string;
}

interface DevWatcherConfig {
  pythonManager: PythonManager;
  mainWindow: BrowserWindow;
  pythonPath: string;
}

export class DevWatcher {
  private config: DevWatcherConfig;
  private watchers: FSWatcher[] = [];
  private restartTimer: NodeJS.Timeout | null = null; // 统一的重启定时器
  private pendingChanges: Set<string> = new Set(); // 记录待处理的变更
  private readonly DEBOUNCE_MS = 1000; // 1秒防抖

  constructor(config: DevWatcherConfig) {
    this.config = config;
  }

  public start(): void {
    console.log('[DevWatcher] Starting file watchers...');

    // 监听 Python 源码变化
    this.watchPythonFiles();

    // 监听配置文件变化
    this.watchConfigFiles();

    console.log('[DevWatcher] Watchers started');
  }

  private watchPythonFiles(): void {
    const pythonPath = this.config.pythonPath;

    // Python 源码目录配置
    const watchConfigs: WatchConfig[] = [
      {
        path: path.join(pythonPath, 'gateway'),
        pattern: '.py',
        action: 'restart',
        description: 'Gateway code'
      },
      {
        path: path.join(pythonPath, 'agent'),
        pattern: '.py',
        action: 'restart',
        description: 'Agent code'
      },
      {
        path: path.join(pythonPath, 'tools'),
        pattern: '.py',
        action: 'restart',
        description: 'Tools code'
      },
      {
        path: path.join(pythonPath, 'skills'),
        pattern: '.py',
        action: 'restart',
        description: 'Skills code'
      }
    ];

    watchConfigs.forEach(config => {
      try {
        // 检查目录是否存在
        if (!fs.existsSync(config.path)) {
          console.log(`[DevWatcher] Skipping ${config.description} (not found): ${config.path}`);
          return;
        }

        const watcher = watch(
          config.path,
          { recursive: true },
          (_eventType, filename) => {
            if (!filename) return;

            // 检查文件模式
            if (config.pattern && !filename.endsWith(config.pattern)) {
              return;
            }

            // 忽略 __pycache__ 和 .pyc 文件
            if (filename.includes('__pycache__') || filename.endsWith('.pyc')) {
              return;
            }

            const changePath = `${config.description}/${filename}`;
            console.log(`[DevWatcher] ${changePath} changed`);

            // 统一添加到待处理队列
            this.pendingChanges.add(changePath);
            this.debouncedRestart();
          }
        );

        this.watchers.push(watcher);
        console.log(`[DevWatcher] Watching ${config.description}: ${config.path}`);
      } catch (error) {
        console.error(`[DevWatcher] Failed to watch ${config.description}:`, error);
      }
    });
  }

  private watchConfigFiles(): void {
    const hermesHome = EnvManager.getHermesHome();

    // 配置文件列表
    const configFiles: WatchConfig[] = [
      {
        path: path.join(hermesHome, 'config.yaml'),
        action: 'reload',
        description: 'config.yaml'
      },
      {
        path: path.join(hermesHome, '.env'),
        action: 'restart',
        description: '.env'
      }
    ];

    configFiles.forEach(config => {
      try {
        // 检查文件是否存在
        if (!fs.existsSync(config.path)) {
          console.log(`[DevWatcher] ${config.description} not found, skipping watch`);
          return;
        }

        const watcher = watch(config.path, (_eventType) => {
          console.log(`[DevWatcher] ${config.description} changed`);

          // 统一添加到待处理队列
          this.pendingChanges.add(config.description);
          this.debouncedRestart();
        });

        this.watchers.push(watcher);
        console.log(`[DevWatcher] Watching ${config.description}: ${config.path}`);
      } catch (error) {
        console.error(`[DevWatcher] Failed to watch ${config.description}:`, error);
      }
    });
  }

  /**
   * 统一的防抖重启方法（处理并发变更）
   */
  private debouncedRestart(): void {
    // 防抖：多个文件快速修改时只重启一次
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    this.restartTimer = setTimeout(async () => {
      try {
        // 记录所有待处理的变更
        const changes = Array.from(this.pendingChanges);
        this.pendingChanges.clear();

        console.log(`[DevWatcher] ${changes.length} file(s) changed, restarting Gateway...`);
        console.log(`[DevWatcher] Changed files: ${changes.join(', ')}`);

        await this.config.pythonManager.restart();
        console.log('[DevWatcher] Gateway restarted successfully');

        // 通知渲染进程
        if (!this.config.mainWindow.isDestroyed()) {
          this.config.mainWindow.webContents.send('dev:python-reloaded', {
            timestamp: new Date().toISOString(),
            changes
          });
        }
      } catch (error) {
        console.error('[DevWatcher] Failed to restart Gateway:', error);
      } finally {
        // 清理定时器引用
        this.restartTimer = null;
      }
    }, this.DEBOUNCE_MS);
  }

  public stop(): void {
    console.log('[DevWatcher] Stopping file watchers...');

    // 清理定时器
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    // 清理待处理变更
    this.pendingChanges.clear();

    // 关闭所有监听器
    this.watchers.forEach(watcher => {
      try {
        watcher.close();
      } catch (error) {
        console.error('[DevWatcher] Failed to close watcher:', error);
      }
    });
    this.watchers = [];

    console.log('[DevWatcher] Watchers stopped');
  }
}
