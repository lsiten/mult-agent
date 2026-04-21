# Proposal: Electron Architecture Improvements

## Overview

**Status**: Proposal  
**Created**: 2026-04-20  
**Base**: v1.0.0 (3s startup, auto-reload)

提升 Electron 架构的稳定性、安全性和可观测性，补齐边缘场景和开发体验短板。

---

## Motivation

v1.0.0 已实现核心优化 (启动时间 80% ↓)，但仍存在：

1. **环境变量管理零散** - 多处设置，易遗漏冲突
2. **依赖检查缺失** - 启动假设依赖就绪，失败信息不明确
3. **启动失败硬失败** - 无降级方案，用户无法诊断
4. **IPC 安全性不足** - 输入未验证 (如 `shell:openExternal`)
5. **监控数据未用** - MetricsCollector 收集了数据但无可视化
6. **DevWatcher 范围有限** - 只监听 3 个目录，缺 skills/config/.env

---

## Goals

### Phase 1: 稳定性 (高优先级)

- [ ] **EnvManager**: 统一环境变量配置
- [ ] **DependencyChecker**: 启动前检查 npm/python/venv
- [ ] **IPC 安全**: 输入验证 + URL 白名单
- [ ] **启动降级 UI**: 失败时显示诊断界面

### Phase 2: 体验 (中优先级)

- [ ] **DevWatcher 扩展**: 监听 skills/, config.yaml, .env
- [ ] **Vite 超时优化**: 15s → 5s (实际 1s 就绪)
- [ ] **npm start 优化**: 自动 setup + build
- [ ] **监控仪表板**: `/debug` 页面可视化 MetricsCollector

### Phase 3: 打磨 (低优先级)

- [ ] 打包体积优化 (tree-shaking, minify)
- [ ] 日志搜索功能
- [ ] 进程资源监控 (CPU/内存)

---

## Non-Goals

- ❌ 重构 v1.0.0 已优化的核心流程
- ❌ 改变启动时序 (已从 >15s 降至 ~3s)
- ❌ 替换 CircuitBreaker/MetricsCollector (运行良好)

---

## Architecture

### 1. EnvManager (新增)

```typescript
class EnvManager {
  static setup(): void {
    // 1. 加载 .env 文件
    this.loadEnvFile();
    
    // 2. 设置 Electron 环境
    process.env.HERMES_ELECTRON_MODE = 'true';
    process.env.HERMES_HOME = app.getPath('userData');
    
    // 3. 验证必需变量
    this.validateRequired([
      'ANTHROPIC_API_KEY',
      'HERMES_HOME'
    ]);
  }
  
  static getPythonEnv(): Record<string, string> {
    return {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      HERMES_ELECTRON_MODE: 'true',
      HERMES_HOME: process.env.HERMES_HOME!,
      // 开发模式特殊配置
      ...(isDev ? { CORS_ORIGINS: 'http://localhost:5173' } : {})
    };
  }
}
```

**集成点**: main.ts 启动序列第一步

---

### 2. DependencyChecker (新增)

```typescript
class DependencyChecker {
  async checkAll(): Promise<CheckResult> {
    return {
      npm: await this.checkCommand('npm', ['--version']),
      node: await this.checkCommand('node', ['--version']),
      python: await this.checkPython(),
      venv: await this.checkVenv()
    };
  }
  
  private async checkPython(): Promise<CheckItem> {
    const pythonPath = EnvironmentDetector.getPythonPath();
    // 检查文件存在 + 执行 --version
    return { ok: true, version: '3.11.0', path: pythonPath };
  }
}
```

**集成点**: app.whenReady 之后，启动服务之前

---

### 3. IPC 安全加固

```typescript
// Before
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url); // ⚠️ 直接打开
});

// After
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  // 1. 协议白名单
  const parsed = new URL(url);
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw new Error('Invalid protocol');
  }
  
  // 2. 域名白名单 (可选)
  const trustedDomains = ['github.com', 'anthropic.com', 'docs.python.org'];
  if (!trustedDomains.some(d => parsed.host.endsWith(d))) {
    // 显示确认对话框
    const result = await dialog.showMessageBox({
      type: 'question',
      message: `Open external link?`,
      detail: url,
      buttons: ['Cancel', 'Open']
    });
    if (result.response !== 1) return;
  }
  
  await shell.openExternal(url);
});
```

**影响**: preload.ts 无需修改，仅 main.ts IPC handler 加固

---

### 4. 启动降级 UI

```
启动失败 → 显示 DiagnosticScreen
                ↓
    ┌───────────┼───────────┐
    │           │           │
依赖检查     查看日志     手动重启
(npm/python)  (tail)     (retry button)
```

**实现**:
```typescript
// main.ts
try {
  await viteDevServer.start();
  await pythonManager.start();
} catch (error) {
  // 加载降级 UI
  mainWindow.loadFile(path.join(__dirname, 'diagnostic.html'));
  
  // 提供 IPC 接口
  ipcMain.handle('diagnostic:getDependencies', () => 
    dependencyChecker.checkAll()
  );
  ipcMain.handle('diagnostic:getLogs', () => 
    fs.readFileSync(gatewayLogPath, 'utf-8')
  );
  ipcMain.handle('diagnostic:retry', async () => {
    await pythonManager.restart();
  });
}
```

---

### 5. DevWatcher 扩展

```typescript
// Before
const dirsToWatch = [
  'gateway',
  'agent', 
  'tools'
];

// After
const watchConfig = [
  { path: 'gateway', pattern: '**/*.py', action: 'restart' },
  { path: 'agent', pattern: '**/*.py', action: 'restart' },
  { path: 'tools', pattern: '**/*.py', action: 'restart' },
  { path: 'skills', pattern: '**/*.py', action: 'restart' },     // 新增
  { path: '../config.yaml', action: 'reload' },                  // 新增
  { path: '../.env', action: 'restart' }                         // 新增
];
```

**行为差异**:
- `restart`: 重启 Gateway 进程
- `reload`: 仅重新加载配置 (通过 Gateway API)

---

### 6. 监控仪表板 (/debug)

前端新增页面:

```typescript
// web/src/pages/DebugPage.tsx
export function DebugPage() {
  const metrics = useMetrics(); // 从 IPC 获取
  
  return (
    <div>
      <Section title="Gateway">
        启动时间: {metrics.gatewayStartupTime}ms
        重启次数: {metrics.restartCount}
        健康检查 P95: {metrics.healthCheckP95}ms
      </Section>
      
      <Section title="Circuit Breaker">
        状态: {metrics.circuitState}
        失败次数: {metrics.failures}
      </Section>
      
      <Section title="Logs">
        <LogStream /> {/* WebSocket 实时流 */}
      </Section>
    </div>
  );
}
```

---

## Implementation Plan

### Week 1: 稳定性

- Day 1-2: EnvManager + DependencyChecker
- Day 3-4: IPC 安全加固
- Day 5: 启动降级 UI

### Week 2: 体验

- Day 1: DevWatcher 扩展
- Day 2: Vite 超时优化 + npm start 改进
- Day 3-4: 监控仪表板 UI
- Day 5: 集成测试

---

## Testing Strategy

1. **单元测试**
   - EnvManager.validateRequired()
   - DependencyChecker.checkCommand()
   - IPC URL 验证逻辑

2. **集成测试**
   - 依赖缺失场景 (移除 npm/python)
   - 启动失败降级流程
   - DevWatcher 监听新路径

3. **E2E 测试**
   - 完整启动流程 (happy path)
   - 降级 UI 交互 (失败路径)
   - 监控仪表板数据展示

---

## Risks & Mitigations

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| EnvManager 改变现有环境变量逻辑 | 中 | 保持兼容，仅集中管理 |
| 依赖检查延长启动时间 | 低 | 并行检查，超时 2s |
| 降级 UI 增加复杂度 | 低 | 仅失败时加载，正常路径不受影响 |
| IPC 白名单误杀合法 URL | 中 | 提供确认对话框 fallback |

---

## Success Metrics

- ✅ 启动可靠性: 依赖不满足时明确提示，不再神秘崩溃
- ✅ 安全性: IPC 通道有输入验证
- ✅ 可观测性: `/debug` 页面可查看实时指标
- ✅ DX: DevWatcher 覆盖更多场景 (config/env 变化)
- ✅ 启动时间: 不劣化 (< 3.5s)

---

## Future Work

- 进程资源监控 (CPU/内存占用)
- Gateway API 调用追踪
- 日志全文搜索和过滤
- 自动故障诊断 (AI 辅助)
