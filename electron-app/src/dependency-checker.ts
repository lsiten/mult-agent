/**
 * Dependency Checker
 *
 * 启动前检查依赖完整性
 * - npm, node, python, venv
 * - 并行检查，2 秒超时
 * - 返回详细错误信息
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentDetector } from './env-detector';

export interface CheckItem {
  ok: boolean;
  version?: string;
  error?: string;
  path?: string;
}

export interface CheckResult {
  npm: CheckItem;
  node: CheckItem;
  python: CheckItem;
  venv: CheckItem;
  allOk: boolean;
}

export class DependencyChecker {
  private readonly timeout = 2000; // 2 秒超时

  /**
   * 检查所有依赖 (并行)
   */
  async checkAll(): Promise<CheckResult> {
    console.log('[DependencyChecker] Checking dependencies...');
    const startTime = Date.now();

    const [npm, node, python, venv] = await Promise.all([
      this.checkCommand('npm', ['--version']),
      this.checkCommand('node', ['--version']),
      this.checkPython(),
      this.checkVenv()
    ]);

    const duration = Date.now() - startTime;
    const allOk = npm.ok && node.ok && python.ok && venv.ok;

    console.log(`[DependencyChecker] Check completed in ${duration}ms`);
    console.log(`[DependencyChecker] Results: ${allOk ? 'All OK' : 'Some failed'}`);

    if (!allOk) {
      this.logFailures({ npm, node, python, venv, allOk });
    }

    return { npm, node, python, venv, allOk };
  }

  /**
   * 检查命令是否可用
   */
  private async checkCommand(
    cmd: string,
    args: string[]
  ): Promise<CheckItem> {
    try {
      const result = await this.execWithTimeout(cmd, args);
      const version = result.stdout.trim();

      console.log(`[DependencyChecker] ${cmd}: ${version}`);
      return { ok: true, version };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DependencyChecker] ${cmd}: ${errorMsg}`);

      return {
        ok: false,
        error: errorMsg
      };
    }
  }

  /**
   * 检查 Python 可执行文件
   */
  private async checkPython(): Promise<CheckItem> {
    // 使用 venv 中的 Python (更可靠)
    const venvPath = EnvironmentDetector.getPythonRuntimePath();
    const pythonPath = path.join(venvPath, 'bin', 'python3');

    // 1. 检查文件存在
    if (!fs.existsSync(pythonPath)) {
      console.error(`[DependencyChecker] Python not found at ${pythonPath}`);
      return {
        ok: false,
        error: `Python not found`,
        path: pythonPath
      };
    }

    // 2. 执行 --version (不检查可执行权限，spawn 会自动处理)
    try {
      const result = await this.execWithTimeout(pythonPath, ['--version']);
      const version = result.stderr.trim() || result.stdout.trim(); // Python 3.4+ 输出到 stdout

      // 验证版本格式 (Python X.Y.Z)
      const versionMatch = version.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
      if (!versionMatch) {
        console.error(`[DependencyChecker] Invalid Python version format: ${version}`);
        return {
          ok: false,
          error: `Invalid version format: ${version}`,
          path: pythonPath
        };
      }

      const [, major, minor] = versionMatch;
      const majorNum = parseInt(major, 10);
      const minorNum = parseInt(minor, 10);

      // 检查 Python 3.8+ (最低要求)
      if (majorNum < 3 || (majorNum === 3 && minorNum < 8)) {
        console.error(`[DependencyChecker] Python version too old: ${version} (need 3.8+)`);
        return {
          ok: false,
          error: `Python ${version} is too old (need 3.8+)`,
          path: pythonPath
        };
      }

      console.log(`[DependencyChecker] Python: ${version} (${pythonPath})`);
      return {
        ok: true,
        version,
        path: pythonPath
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DependencyChecker] Python check failed: ${errorMsg}`);

      return {
        ok: false,
        error: `Failed to execute: ${errorMsg}`,
        path: pythonPath
      };
    }
  }

  /**
   * 检查 Python 虚拟环境
   */
  private async checkVenv(): Promise<CheckItem> {
    const venvPath = EnvironmentDetector.getPythonRuntimePath();
    const binPath = path.join(venvPath, 'bin');
    const pythonBinPath = path.join(binPath, 'python');

    // 1. 检查 venv 目录存在
    if (!fs.existsSync(venvPath)) {
      console.error(`[DependencyChecker] Venv not found: ${venvPath}`);
      return {
        ok: false,
        error: 'Virtual environment not found',
        path: venvPath
      };
    }

    // 2. 检查 bin 目录
    if (!fs.existsSync(binPath)) {
      console.error(`[DependencyChecker] Venv bin directory not found: ${binPath}`);
      return {
        ok: false,
        error: 'Venv bin directory missing',
        path: binPath
      };
    }

    // 3. 检查 python 可执行文件
    if (!fs.existsSync(pythonBinPath)) {
      console.error(`[DependencyChecker] Venv python not found: ${pythonBinPath}`);
      return {
        ok: false,
        error: 'Venv python executable missing',
        path: pythonBinPath
      };
    }

    console.log(`[DependencyChecker] Venv: OK (${venvPath})`);
    return {
      ok: true,
      path: venvPath
    };
  }

  /**
   * 执行命令，带超时控制
   */
  private execWithTimeout(
    cmd: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stdout = '';
      let stderr = '';
      let killed = false;

      // 超时控制 (SIGTERM + SIGKILL fallback)
      const timer = setTimeout(() => {
        if (!killed) {
          killed = true;
          proc.kill('SIGTERM');

          // 如果 SIGTERM 后 1 秒还未退出，强制 SIGKILL
          setTimeout(() => {
            if (!proc.killed) {
              try {
                proc.kill('SIGKILL');
              } catch (err) {
                console.error('[DependencyChecker] SIGKILL failed:', err);
              }
            }
          }, 1000);

          reject(new Error(`Timeout after ${this.timeout}ms`));
        }
      }, this.timeout);

      // 收集输出
      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // 进程退出
      proc.on('close', (code: number | null) => {
        clearTimeout(timer);

        if (killed) {
          return; // 已经 reject 过了
        }

        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
        }
      });

      // 启动失败
      proc.on('error', (err: Error) => {
        clearTimeout(timer);
        if (!killed) {
          reject(err);
        }
      });
    });
  }

  /**
   * 记录失败信息
   */
  private logFailures(result: CheckResult): void {
    console.error('[DependencyChecker] === Dependency Check Failed ===');

    if (!result.npm.ok) {
      console.error(`  npm: ${result.npm.error}`);
    }
    if (!result.node.ok) {
      console.error(`  node: ${result.node.error}`);
    }
    if (!result.python.ok) {
      console.error(`  python: ${result.python.error}`);
      if (result.python.path) {
        console.error(`    Path: ${result.python.path}`);
      }
    }
    if (!result.venv.ok) {
      console.error(`  venv: ${result.venv.error}`);
      if (result.venv.path) {
        console.error(`    Path: ${result.venv.path}`);
      }
    }

    console.error('[DependencyChecker] ================================');
  }
}
