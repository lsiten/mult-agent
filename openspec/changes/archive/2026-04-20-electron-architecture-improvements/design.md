# Design: Electron Architecture Improvements

## Component Design

### 1. EnvManager

**职责**: 统一环境变量配置管理

```typescript
// electron-app/src/env-manager.ts
export class EnvManager {
  private static envLoaded = false;
  
  /**
   * 设置所有环境变量 (启动第一步调用)
   */
  static setup(options: { isDev: boolean }): void {
    if (this.envLoaded) return;
    
    // 1. 加载 .env 文件
    this.loadDotEnv();
    
    // 2. 设置 Electron 特定环境
    process.env.HERMES_ELECTRON_MODE = 'true';
    process.env.HERMES_HOME = app.getPath('userData');
    
    // 3. 开发模式特殊配置
    if (options.isDev) {
      process.env.VITE_DEV_URL = 'http://localhost:5173';
      process.env.GATEWAY_CORS_ORIGINS = 'http://localhost:5173';
    }
    
    // 4. 验证必需变量
    this.validate();
    
    this.envLoaded = true;
  }
  
  /**
   * 获取 Python 子进程环境变量
   */
  static getPythonEnv(): Record<string, string> {
    return {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      HERMES_ELECTRON_MODE: 'true',
      HERMES_HOME: process.env.HERMES_HOME!,
      // 开发模式: Gateway 自动配置 CORS
      ...(process.env.GATEWAY_CORS_ORIGINS ? {
        GATEWAY_CORS_ORIGINS: process.env.GATEWAY_CORS_ORIGINS
      } : {})
    };
  }
  
  private static loadDotEnv(): void {
    const envPath = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      });
    }
  }
  
  private static validate(): void {
    const required = ['HERMES_HOME'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length > 0) {
      throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }
  }
}
```

**集成**:
```typescript
// main.ts
app.whenReady().then(async () => {
  EnvManager.setup({ isDev }); // 第一步
  
  // 后续步骤...
  await dataMigration.migrate();
  await configManager.initialize();
});
```

---

### 2. DependencyChecker

**职责**: 启动前检查依赖完整性

```typescript
// electron-app/src/dependency-checker.ts
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
  private timeout = 2000; // 2秒超时
  
  async checkAll(): Promise<CheckResult> {
    const [npm, node, python, venv] = await Promise.all([
      this.checkCommand('npm', ['--version']),
      this.checkCommand('node', ['--version']),
      this.checkPython(),
      this.checkVenv()
    ]);
    
    return {
      npm,
      node,
      python,
      venv,
      allOk: npm.ok && node.ok && python.ok && venv.ok
    };
  }
  
  private async checkCommand(
    cmd: string, 
    args: string[]
  ): Promise<CheckItem> {
    try {
      const result = await this.execWithTimeout(cmd, args);
      return { 
        ok: true, 
        version: result.stdout.trim() 
      };
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async checkPython(): Promise<CheckItem> {
    const pythonPath = EnvironmentDetector.getPythonPath();
    
    // 1. 检查文件存在
    if (!fs.existsSync(pythonPath)) {
      return { 
        ok: false, 
        error: `Python not found at ${pythonPath}`,
        path: pythonPath
      };
    }
    
    // 2. 检查可执行
    try {
      const result = await this.execWithTimeout(pythonPath, ['--version']);
      return { 
        ok: true, 
        version: result.stdout.trim(),
        path: pythonPath
      };
    } catch (error) {
      return { 
        ok: false, 
        error: 'Python not executable',
        path: pythonPath
      };
    }
  }
  
  private async checkVenv(): Promise<CheckItem> {
    const venvPath = path.join(
      EnvironmentDetector.getPythonRuntimePath(),
      'bin'
    );
    
    if (!fs.existsSync(venvPath)) {
      return { 
        ok: false, 
        error: 'Virtual environment not found',
        path: venvPath
      };
    }
    
    return { ok: true, path: venvPath };
  }
  
  private execWithTimeout(
    cmd: string, 
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stdout = '';
      let stderr = '';
      
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('Timeout'));
      }, this.timeout);
      
      proc.stdout?.on('data', data => stdout += data);
      proc.stderr?.on('data', data => stderr += data);
      
      proc.on('close', code => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Exit code ${code}: ${stderr}`));
        }
      });
      
      proc.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
```

**集成**:
```typescript
// main.ts
const checker = new DependencyChecker();
const result = await checker.checkAll();

if (!result.allOk) {
  // 显示降级 UI
  mainWindow.loadFile(path.join(__dirname, 'diagnostic.html'));
  
  ipcMain.handle('diagnostic:getDependencies', () => result);
  return; // 不继续启动
}
```

---

### 3. IPC 安全层

**职责**: 验证 IPC 输入，防止滥用

```typescript
// electron-app/src/ipc-validators.ts
export class IpcValidators {
  private static ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];
  private static TRUSTED_DOMAINS = [
    'github.com',
    'anthropic.com',
    'docs.python.org',
    'localhost' // 开发环境
  ];
  
  /**
   * 验证并打开外部 URL
   */
  static async validateAndOpenUrl(url: string): Promise<void> {
    // 1. 解析 URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }
    
    // 2. 协议白名单
    if (!this.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(`Protocol not allowed: ${parsed.protocol}`);
    }
    
    // 3. localhost 直接通过 (开发环境)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      await shell.openExternal(url);
      return;
    }
    
    // 4. 域名白名单
    const isTrusted = this.TRUSTED_DOMAINS.some(domain => 
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    
    if (!isTrusted) {
      // 显示确认对话框
      const result = await dialog.showMessageBox({
        type: 'question',
        title: 'Open External Link',
        message: 'Open this link in your default browser?',
        detail: url,
        buttons: ['Cancel', 'Open'],
        defaultId: 0,
        cancelId: 0
      });
      
      if (result.response !== 1) {
        return; // 用户取消
      }
    }
    
    // 5. 打开 URL
    await shell.openExternal(url);
  }
}
```

**集成**:
```typescript
// main.ts
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  try {
    await IpcValidators.validateAndOpenUrl(url);
    return { ok: true };
  } catch (error) {
    return { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});
```

---

### 4. 启动降级 UI

**职责**: 启动失败时提供诊断界面

```html
<!-- electron-app/diagnostic.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Hermes Agent - Startup Diagnostics</title>
  <style>
    body { 
      font-family: system-ui; 
      padding: 40px; 
      max-width: 800px; 
      margin: 0 auto;
    }
    .error { color: #d73a49; }
    .success { color: #28a745; }
    pre { 
      background: #f6f8fa; 
      padding: 16px; 
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>Startup Failed</h1>
  <p>Hermes Agent failed to start. Check the diagnostics below:</p>
  
  <h2>Dependencies</h2>
  <div id="dependencies"></div>
  
  <h2>Recent Logs</h2>
  <pre id="logs">Loading...</pre>
  
  <button onclick="retry()">Retry Startup</button>
  
  <script>
    async function loadDiagnostics() {
      const deps = await window.electronAPI.getDependencies();
      const html = Object.entries(deps).map(([name, item]) => {
        if (name === 'allOk') return '';
        const status = item.ok ? 
          `<span class="success">✓ ${item.version || 'OK'}</span>` :
          `<span class="error">✗ ${item.error}</span>`;
        return `<p><strong>${name}</strong>: ${status}</p>`;
      }).join('');
      document.getElementById('dependencies').innerHTML = html;
      
      const logs = await window.electronAPI.getLogs();
      document.getElementById('logs').textContent = logs;
    }
    
    async function retry() {
      await window.electronAPI.retryStartup();
    }
    
    loadDiagnostics();
  </script>
</body>
</html>
```

**IPC 接口**:
```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  getDependencies: () => ipcRenderer.invoke('diagnostic:getDependencies'),
  getLogs: () => ipcRenderer.invoke('diagnostic:getLogs'),
  retryStartup: () => ipcRenderer.invoke('diagnostic:retry')
});
```

---

### 5. DevWatcher 扩展

**设计变更**:
```typescript
// dev-watcher.ts
interface WatchConfig {
  path: string;
  pattern: string;
  action: 'restart' | 'reload';
}

export class DevWatcher {
  private watchConfigs: WatchConfig[] = [
    { path: 'gateway', pattern: '**/*.py', action: 'restart' },
    { path: 'agent', pattern: '**/*.py', action: 'restart' },
    { path: 'tools', pattern: '**/*.py', action: 'restart' },
    { path: 'skills', pattern: '**/*.py', action: 'restart' },    // 新增
    { path: '../config.yaml', pattern: '', action: 'reload' },    // 新增
    { path: '../.env', pattern: '', action: 'restart' }           // 新增
  ];
  
  private watchPath(config: WatchConfig): void {
    const fullPath = path.join(this.basePath, config.path);
    
    const watcher = watch(fullPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      
      // 匹配 pattern
      if (config.pattern && !filename.endsWith(config.pattern.replace('**/*', ''))) {
        return;
      }
      
      console.log(`[DevWatcher] ${config.path}/${filename} changed`);
      
      if (config.action === 'restart') {
        this.debouncedRestart();
      } else if (config.action === 'reload') {
        this.reloadConfig();
      }
    });
    
    this.watchers.push(watcher);
  }
  
  private async reloadConfig(): Promise<void> {
    // 通过 Gateway API 重新加载配置，而不是重启进程
    try {
      await fetch('http://127.0.0.1:8642/api/reload-config', {
        method: 'POST'
      });
      console.log('[DevWatcher] Config reloaded');
    } catch (error) {
      console.error('[DevWatcher] Failed to reload config:', error);
      // Fallback: 重启
      this.debouncedRestart();
    }
  }
}
```

---

### 6. 监控仪表板

**前端页面**:
```typescript
// web/src/pages/DebugPage.tsx
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

export function DebugPage() {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<any>(null);
  
  useEffect(() => {
    // 定期获取指标
    const interval = setInterval(async () => {
      const status = await window.electronAPI.getPythonStatus();
      setMetrics(status.metrics);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!metrics) return <div>Loading...</div>;
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        {t('debug.title')}
      </h1>
      
      <div className="grid grid-cols-2 gap-6">
        <Card title="Gateway">
          <MetricRow label="Startup Time" value={`${metrics.gatewayStartupTime}ms`} />
          <MetricRow label="Restart Count" value={metrics.restartCount} />
          <MetricRow label="Uptime" value={formatUptime(metrics.uptimeMs)} />
        </Card>
        
        <Card title="Health Check">
          <MetricRow label="Success Rate" 
            value={`${metrics.healthCheckSuccessRate}%`} />
          <MetricRow label="P95 Latency" 
            value={`${metrics.healthCheckP95}ms`} />
        </Card>
        
        <Card title="Circuit Breaker" className="col-span-2">
          <MetricRow label="State" 
            value={<Badge color={getStateColor(metrics.circuitState)}>
              {metrics.circuitState}
            </Badge>} />
          <MetricRow label="Failures" value={metrics.failures} />
        </Card>
      </div>
      
      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4">Recent Errors</h2>
        <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
          {metrics.lastError || 'No errors'}
        </pre>
      </div>
    </div>
  );
}
```

**路由**:
```typescript
// web/src/App.tsx
<Route path="/debug" element={<DebugPage />} />
```

---

## File Changes

### New Files
- `electron-app/src/env-manager.ts` (~150 lines)
- `electron-app/src/dependency-checker.ts` (~200 lines)
- `electron-app/src/ipc-validators.ts` (~100 lines)
- `electron-app/diagnostic.html` (~80 lines)
- `web/src/pages/DebugPage.tsx` (~150 lines)

### Modified Files
- `electron-app/src/main.ts`: 集成新组件
- `electron-app/src/python-manager.ts`: 使用 EnvManager
- `electron-app/src/dev-watcher.ts`: 扩展监听配置
- `electron-app/src/preload.ts`: 添加诊断 IPC
- `web/src/App.tsx`: 添加 /debug 路由
- `web/src/i18n/en.ts` + `zh.ts`: 添加 debug 翻译

---

## Migration Path

1. **向后兼容**: 新组件不改变现有成功路径
2. **渐进集成**: 每个组件独立添加，不互相依赖
3. **开关控制**: 可通过环境变量禁用新功能 (调试用)

```typescript
// 可选: 通过环境变量控制
if (process.env.ENABLE_DEPENDENCY_CHECK !== 'false') {
  const result = await dependencyChecker.checkAll();
  // ...
}
```
