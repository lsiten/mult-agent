# 新架构集成指南 (v2.0.0)

## 概览

新架构使用 **Service-Oriented Architecture (SOA)** + **Application 生命周期管理器** 替代直接实例化和手动管理各个组件。

### 架构对比

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| 组件管理 | 直接实例化 PythonManager, ViteDevServer, etc | Service 接口 + Application 注册表 |
| 启动顺序 | 手动顺序调用 | 拓扑排序自动计算 |
| 依赖声明 | 隐式（代码顺序） | 显式（dependencies 字段） |
| 错误处理 | 手动 try/catch | 自动回滚 + 断路器 |
| 服务健康检查 | 分散在各组件 | 统一 isHealthy() 接口 |
| 测试性 | 难以单元测试 | 可注入 mock service |
| 代码行数 | ~500 行 | ~150 行（main-new.ts） |

## 快速开始

### 1. 启动应用

```bash
# 默认使用新架构
npm start

# 强制使用旧架构（对比用）
npm run start:old

# 生产环境
npm run start:prod  # 使用新架构
```

### 2. 运行测试

```bash
# 完整架构验证
npm run test:architecture

# 仅单元测试
npm run test:unit

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

### 3. 切换架构

通过环境变量 `USE_NEW_LIFECYCLE` 控制:

| 值 | 行为 |
|----|------|
| `true` (默认) | 使用新架构 (main-new.ts) |
| `false` | 使用旧架构 (main-old.ts) |

**示例**:
```bash
USE_NEW_LIFECYCLE=true npm start   # 新架构
USE_NEW_LIFECYCLE=false npm start  # 旧架构
```

## 核心概念

### Service 接口

所有服务实现统一接口：

```typescript
export interface Service {
  readonly id: string;                // 唯一标识符
  readonly required: boolean;         // 是否必需（失败时是否阻止启动）
  readonly dependencies: string[];    // 依赖的服务 ID

  start(): Promise<void>;             // 启动服务
  stop(): Promise<void>;              // 停止服务
  isHealthy(): boolean;               // 健康检查

  onError?(error: Error): void;       // 错误回调（可选）
  getMetrics?(): Record<string, any>; // 指标收集（可选）
}
```

### 依赖图

```
env (EnvService)
  ↓
config (ConfigService)
  ↓
gateway (GatewayService)
  ↓
  ├─→ vite-dev (ViteDevService, 可选)
  │     ↓
  └─→ window (WindowService)
        ↓
      dev-watcher (DevWatcherService, 可选)
```

**启动顺序**: env → config → gateway → vite-dev → window → dev-watcher

**停止顺序**: dev-watcher → window → vite-dev → gateway → config → env

### Application 生命周期

```typescript
// 1. 创建 Application
const app = new Application();

// 2. 注册服务（顺序无关紧要，依赖关系由 dependencies 决定）
app.register(new EnvService());
app.register(new ConfigService());
app.register(new GatewayService());

// 3. 启动所有服务（自动计算拓扑顺序）
await app.start();

// 4. 运行时查询
const gateway = app.get<GatewayService>('gateway');
const status = app.getStatus();

// 5. 关闭应用（自动反向顺序）
await app.stop();
```

## 现有服务

### EnvService

- **ID**: `env`
- **依赖**: 无
- **功能**: 设置环境变量 (HERMES_HOME, PYTHONPATH, etc)

### ConfigService

- **ID**: `config`
- **依赖**: `['env']`
- **功能**: 加载和管理配置文件 (config.yaml)

### GatewayService

- **ID**: `gateway`
- **依赖**: `['env', 'config']`
- **功能**: 启动 Python Gateway 进程 + 健康监控 + 断路器保护

### ViteDevService

- **ID**: `vite-dev`
- **依赖**: `['gateway']`
- **必需**: `false` (可选，仅开发模式)
- **功能**: 启动 Vite 开发服务器

### WindowService

- **ID**: `window`
- **依赖**: `['gateway', 'vite-dev']`
- **功能**: 创建和管理 BrowserWindow

### DevWatcherService

- **ID**: `dev-watcher`
- **依赖**: `['gateway', 'window']`
- **必需**: `false` (可选，仅开发模式)
- **功能**: 监听 Python 文件变化并自动重启 Gateway

## 添加新服务

### 1. 创建 Service 类

```typescript
// src/services/my-service.service.ts
import { Service } from '../core/service.interface';

export class MyService implements Service {
  readonly id = 'my-service';
  readonly required = true;
  readonly dependencies = ['gateway']; // 依赖 Gateway

  async start(): Promise<void> {
    console.log('[MyService] Starting...');
    // 启动逻辑
  }

  async stop(): Promise<void> {
    console.log('[MyService] Stopping...');
    // 停止逻辑
  }

  isHealthy(): boolean {
    return true; // 健康检查逻辑
  }
}
```

### 2. 注册到 Application

```typescript
// src/main-new.ts
import { MyService } from './services/my-service.service';

const myService = new MyService();
application.register(myService);
```

### 3. 编写测试

```typescript
// tests/unit/services/my-service.test.ts
import { describe, test, expect } from 'vitest';
import { MyService } from '../../../src/services/my-service.service';

describe('MyService', () => {
  test('应该成功启动', async () => {
    const service = new MyService();
    await service.start();
    expect(service.isHealthy()).toBe(true);
  });
});
```

## 故障排查

### 应用无法启动

1. **检查依赖是否循环**:
   ```
   Error: Circular dependency detected: env -> config -> env
   ```
   → 检查各 Service 的 `dependencies` 字段

2. **检查服务启动失败**:
   ```
   [Application] ✗ gateway failed: Connection refused
   ```
   → 查看 Gateway 日志: `~/Library/.../logs/gateway.log`

3. **检查拓扑排序**:
   ```
   [Application] Start order: env -> config -> gateway -> ...
   ```
   → 确认顺序符合预期

### 测试失败

1. **运行特定测试**:
   ```bash
   npm run test:unit -- tests/unit/services/gateway.service.test.ts
   ```

2. **查看详细日志**:
   ```bash
   npm run test:unit -- --reporter=verbose
   ```

3. **调试测试**:
   ```bash
   npm run test:watch
   # 修改测试文件，自动重新运行
   ```

## 性能指标

| 指标 | 旧架构 | 新架构 | 改进 |
|------|--------|--------|------|
| 启动时间 | ~3s | ~3s | 持平 |
| 代码行数 (main.ts) | ~500 | ~150 | 70% ↓ |
| 测试覆盖率 | 0% | 76%+ | +76% |
| 可维护性 | 低（紧耦合） | 高（松耦合） | ↑↑ |
| 扩展性 | 难（修改 main.ts） | 易（添加 Service） | ↑↑ |

## 下一步

- [ ] 实现 IPC Registry（类型安全的 IPC 通信）
- [ ] 添加开发工具页面（服务仪表板 + 日志查看器）
- [ ] 添加 E2E 测试（Playwright）
- [ ] 完全移除旧架构代码
- [ ] 更新文档（架构图、开发指南）

---

**相关文档**:
- [Service Interface](../src/core/service.interface.ts)
- [Application Class](../src/core/application.ts)
- [测试指南](../tests/README.md)
- [开发工作流](../../.claude/rules/development-workflow.md)
