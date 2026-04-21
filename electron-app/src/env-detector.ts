import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export enum AppEnvironment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production'
}

export class EnvironmentDetector {
  private static _env?: AppEnvironment;

  /**
   * 检测当前运行环境
   */
  static detect(): AppEnvironment {
    if (this._env) {
      return this._env;
    }

    // 已打包 = 生产环境
    if (app.isPackaged) {
      this._env = AppEnvironment.PRODUCTION;
    } else {
      this._env = AppEnvironment.DEVELOPMENT;
    }

    return this._env;
  }

  /**
   * 获取资源根目录
   */
  static getResourcesPath(): string {
    if (this.detect() === AppEnvironment.PRODUCTION) {
      // 生产: Hermes Agent.app/Contents/Resources/resources/
      return path.join(process.resourcesPath, 'resources');
    } else {
      // 开发: electron-app/resources/
      return path.join(__dirname, '../resources');
    }
  }

  /**
   * 获取 Python 源码路径
   */
  static getPythonPath(): string {
    const resourcesPath = this.getResourcesPath();
    return path.join(resourcesPath, 'python');
  }

  /**
   * 获取 Python Runtime 路径
   */
  static getPythonRuntimePath(): string {
    const resourcesPath = this.getResourcesPath();
    return path.join(resourcesPath, 'python-runtime');
  }

  /**
   * 获取 Web 前端路径或 URL
   */
  static getWebPath(): string {
    if (this.detect() === AppEnvironment.PRODUCTION) {
      // 生产: resources/web/index.html
      const resourcesPath = this.getResourcesPath();
      return path.join(resourcesPath, 'web', 'index.html');
    } else {
      // 开发: Vite dev server
      return 'http://localhost:5173';
    }
  }

  /**
   * 检查资源是否就绪
   */
  static checkResources(): { ready: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查 Python 源码
    const pythonPath = this.getPythonPath();
    if (!fs.existsSync(pythonPath)) {
      errors.push(`Python code not found: ${pythonPath}`);
    }

    // 检查 Gateway 入口
    const gatewayScript = path.join(pythonPath, 'gateway', 'run.py');
    if (!fs.existsSync(gatewayScript)) {
      errors.push(`Gateway script not found: ${gatewayScript}`);
    }

    // 检查 Python Runtime
    const pythonRuntimePath = this.getPythonRuntimePath();
    if (!fs.existsSync(pythonRuntimePath)) {
      errors.push(`Python runtime not found: ${pythonRuntimePath}`);
    }

    return {
      ready: errors.length === 0,
      errors
    };
  }

  /**
   * 检查是否为开发环境的符号链接
   */
  static isSymlinkSetup(): boolean {
    if (this.detect() === AppEnvironment.PRODUCTION) {
      return false; // 生产环境不应该有符号链接
    }

    try {
      const pythonPath = this.getPythonPath();
      const gatewayPath = path.join(pythonPath, 'gateway');

      if (fs.existsSync(gatewayPath)) {
        const stats = fs.lstatSync(gatewayPath);
        return stats.isSymbolicLink();
      }
    } catch (error) {
      // 忽略错误
    }

    return false;
  }
}
