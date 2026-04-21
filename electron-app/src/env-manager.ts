/**
 * Environment Manager
 *
 * 统一管理所有环境变量配置
 * - 加载 .env 文件
 * - 设置 Electron 特定环境
 * - 验证必需变量
 * - 为子进程提供环境配置
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export class EnvManager {
  private static envLoaded = false;
  private static hermesHome: string = '';

  /**
   * 设置所有环境变量 (应用启动第一步调用)
   */
  static setup(options: { isDev: boolean }): void {
    if (this.envLoaded) {
      console.log('[EnvManager] Already initialized');
      return;
    }

    console.log('[EnvManager] Setting up environment...');

    // 1. 设置 HERMES_HOME
    this.hermesHome = app.getPath('userData');
    process.env.HERMES_HOME = this.hermesHome;

    // 2. 加载 .env 文件
    this.loadDotEnv();

    // 3. 设置 Electron 特定环境
    process.env.HERMES_ELECTRON_MODE = 'true';

    // 4. 开发模式特殊配置
    if (options.isDev) {
      process.env.VITE_DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';
      process.env.GATEWAY_CORS_ORIGINS = process.env.GATEWAY_CORS_ORIGINS || 'http://localhost:5173';
      console.log('[EnvManager] Development mode enabled');
      console.log(`[EnvManager] VITE_DEV_URL: ${process.env.VITE_DEV_URL}`);
      console.log(`[EnvManager] GATEWAY_CORS_ORIGINS: ${process.env.GATEWAY_CORS_ORIGINS}`);
    }

    // 5. 验证必需变量
    this.validate();

    this.envLoaded = true;
    console.log('[EnvManager] Environment setup complete');
    console.log(`[EnvManager] HERMES_HOME: ${this.hermesHome}`);
  }

  /**
   * 获取 Python 子进程环境变量
   */
  static getPythonEnv(): Record<string, string> {
    const env: Record<string, string> = {
      // 继承主进程环境
      ...process.env as Record<string, string>,

      // Python 特定配置
      PYTHONUNBUFFERED: '1',
      HERMES_ELECTRON_MODE: 'true',
      HERMES_HOME: this.hermesHome,
    };

    // 开发模式: Gateway 自动配置 CORS
    if (process.env.GATEWAY_CORS_ORIGINS) {
      env.GATEWAY_CORS_ORIGINS = process.env.GATEWAY_CORS_ORIGINS;
    }

    return env;
  }

  /**
   * 获取 Vite 子进程环境变量
   */
  static getViteEnv(): Record<string, string> {
    return {
      ...process.env as Record<string, string>,
      FORCE_COLOR: '1' // 保留颜色输出
    };
  }

  /**
   * 获取 HERMES_HOME 路径
   */
  static getHermesHome(): string {
    return this.hermesHome;
  }

  /**
   * 加载 .env 文件
   */
  private static loadDotEnv(): void {
    const envPath = path.join(this.hermesHome, '.env');

    if (!fs.existsSync(envPath)) {
      console.log(`[EnvManager] No .env file found at ${envPath}`);
      return;
    }

    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      let loadedCount = 0;

      content.split('\n').forEach((line, lineNum) => {
        // 跳过注释和空行
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          return;
        }

        // 解析 KEY=VALUE
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (!match) {
          console.warn(`[EnvManager] Invalid .env line ${lineNum + 1}: ${line}`);
          return;
        }

        const [, key, value] = match;
        const cleanKey = key.trim();
        let cleanValue = value.trim();

        // 处理引号和转义
        if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
            (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
          const quote = cleanValue[0];
          cleanValue = cleanValue.slice(1, -1);

          // 处理转义字符（仅双引号支持转义）
          if (quote === '"') {
            cleanValue = cleanValue
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
          }
        }

        // 只设置未定义的变量 (优先级: 系统环境变量 > .env)
        if (process.env[cleanKey]) {
          console.log(`[EnvManager] Skipping ${cleanKey} (already set in system environment)`);
        } else {
          process.env[cleanKey] = cleanValue;
          loadedCount++;
        }
      });

      console.log(`[EnvManager] Loaded ${loadedCount} variables from .env`);
    } catch (error) {
      console.error('[EnvManager] Failed to load .env file:', error);
    }
  }

  /**
   * 验证必需的环境变量
   */
  private static validate(): void {
    const required = ['HERMES_HOME'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // 可选但推荐的变量
    const recommended = ['ANTHROPIC_API_KEY'];
    const missingRecommended = recommended.filter(key => !process.env[key]);

    if (missingRecommended.length > 0) {
      console.warn(
        `[EnvManager] Missing recommended variables: ${missingRecommended.join(', ')}`
      );
      console.warn('[EnvManager] Some features may not work without API keys');
    }
  }

  /**
   * 导出环境变量到日志 (用于调试，不包含敏感信息)
   */
  static getSafeEnvSummary(): Record<string, string> {
    const safeKeys = [
      'HERMES_HOME',
      'HERMES_ELECTRON_MODE',
      'VITE_DEV_URL',
      'GATEWAY_CORS_ORIGINS',
      'NODE_ENV',
      'PYTHONUNBUFFERED'
    ];

    const summary: Record<string, string> = {};
    safeKeys.forEach(key => {
      if (process.env[key]) {
        summary[key] = process.env[key]!;
      }
    });

    // 检查敏感变量是否存在 (不显示值)
    const sensitiveKeys = [
      'ANTHROPIC_API_KEY',
      'OPENROUTER_API_KEY',
      'OPENAI_API_KEY'
    ];

    sensitiveKeys.forEach(key => {
      if (process.env[key]) {
        summary[key] = '<set>';
      } else {
        summary[key] = '<not set>';
      }
    });

    return summary;
  }
}
