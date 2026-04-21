---
paths:
  - "electron-app/src/**/*.ts"
  - "electron-app/scripts/**/*.js"
  - "electron-app/package.json"
  - "electron-app/tsconfig.json"
  - "electron-app/resources/**/*"
  - "web/src/lib/api.ts"
  - "web/vite.config.ts"
---

# Electron 架构 (v1.1.0)

## 三进程架构

```
Main Process (Node.js)
    ├─ IPC ──→ Renderer Process (Chromium)
    └─ 管理 ──→ Python Gateway (子进程:8642)
```

## 服务依赖图 (v1.1.0)

```
Layer 0: env
Layer 1: config (依赖 env)
Layer 2: gateway (依赖 env, config)
Layer 3: vite-dev (依赖 gateway)
Layer 4: window (依赖 gateway, vite-dev)
Layer 5: dev-watcher (依赖 gateway)
```

**启动优化**: 同层服务并发启动（BFS算法）

## 核心服务

### GatewayService
- **职责**: 管理 Python Gateway 子进程
- **健康检查**: continuous (启动) → on-demand (运行)
- **认证**: 生产环境 32-byte token，开发环境跳过
- **关键方法**: `start()`, `stop()`, `restart()`, `getMetrics()`

### ViteDevService
- **职责**: 开发模式自动启动 Vite
- **端口**: 5173 (冲突时自动递增)
- **超时**: 15s

### WindowService
- **职责**: 管理 BrowserWindow 生命周期
- **URL**: 开发 `http://localhost:5173` | 生产 `file://dist/index.html`

### DevWatcherService
- **职责**: Python 文件热重载
- **监控**: `gateway/`, `agent/`, `tools/` 的 `.py` 文件
- **防抖**: 1 秒

## IPC 通信

### IpcRegistry 模式
```typescript
// 集中注册，自动验证
IpcRegistry.register({
  channel: 'python:getStatus',
  schema: z.object({ includeMetrics: z.boolean().optional() }),
  handler: async (event, input) => { /* ... */ }
})
```

**关键特性**:
- Zod schema 自动验证
- 限流保护 (如 `python:restart` 3次/60秒)
- 标准化响应格式 `{ok, data/error, code}`

### 健康检查缓存 (v1.1.0)
```typescript
// IPC 调用触发按需健康检查，5秒 TTL 缓存
await gateway.getHealthMonitor().checkHealth()
```

## 开发模式

### 一键启动
```bash
npm start  # 自动启动 Vite + Gateway + DevWatcher
```

### 热重载规则
| 修改内容 | 响应方式 | 需要重启 |
|---------|---------|---------|
| Python 代码 | DevWatcher 自动重启 Gateway | ❌ |
| TypeScript (Main) | 需手动重编译 | ✅ `npm run build:main` |
| React 组件 | Vite HMR | ❌ |
| config.yaml | 需重启 Gateway | ✅ |

## 数据目录

**路径**: `~/Library/Application Support/hermes-agent-electron/`

```
hermes-agent-electron/
├── config.yaml      # 用户配置
├── .env            # 环境变量
├── state.db        # SQLite 数据库
└── logs/           # 日志文件 (10MB轮转，7文件保留)
```

## 性能指标 (v1.1.0)

| 指标 | v1.0.0 | v1.1.0 | 优化 |
|------|--------|--------|------|
| 启动时间 | ~3s | ~2.25s | 25% ↓ |
| CPU 占用 | 持续轮询 | 按需检查 | ~20% ↓ |
| 启动方式 | 串行 | 分层并发 | 6 层 |

**关键优化**:
1. 分层并发启动 (BFS 算法)
2. 按需健康检查 (启动后切换模式)
3. Gateway 认证 (生产环境)
4. IPC 健康检查缓存 (5s TTL)

## 故障排查

### 窗口空白
```bash
lsof -i:5173              # Vite 是否运行
curl localhost:8642/health # Gateway 是否就绪
# 检查 config.yaml 中的 cors_origins
```

### Gateway 启动失败
```bash
lsof -i:8642              # 端口是否被占用
tail -f ~/Library/.../logs/gateway.log  # 查看启动日志
```

### Python 热重载失效
1. 确认 DevWatcher 在运行（查看启动日志）
2. 确认修改的是符号链接指向的源文件
3. 等待 1 秒防抖触发

## DevTools (Cmd+Shift+D)

- **状态**: 实时服务状态
- **性能**: 启动时间、P95延迟、错误率
- **日志**: 实时日志查看器
- **服务**: 服务依赖图
- **IPC**: 已注册的 IPC 处理器
- **分析**: 使用统计

## 关键约束

1. **禁止 `console.log`**: 使用 `logger.info()` 或通过 IPC 的日志系统
2. **Main 进程代码需重编译**: 修改后运行 `npm run build:main`
3. **IPC 必须通过 IpcRegistry**: 禁止直接 `ipcMain.handle()`
4. **服务必须声明依赖**: `Service.dependencies` 数组
5. **健康检查用 http 模块**: 不要用 fetch (Electron 兼容性)

