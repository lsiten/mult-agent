# Hermes Electron Desktop Application

一个将Hermes Agent打包为独立桌面应用的Electron封装。

## 版本

**Current**: v1.1.0  
**Architecture**: Service-Oriented Architecture (SOA) with Layered Parallel Startup

## 特性

- ✅ **独立运行**: 内嵌Python运行时和所有服务
- ✅ **跨平台**: 支持macOS、Windows、Linux
- ✅ **完整功能**: Gateway、Dashboard、ChatUI全部集成
- ✅ **数据隔离**: 独立的用户数据目录
- ✅ **热更新开发**: 支持Python/TypeScript/React实时重载
- ⚡ **快速启动**: ~2.25秒启动时间（v1.1.0优化）
- 🏗️ **服务化架构**: 依赖管理、健康监控、断路器保护
- 🔒 **IPC验证**: Zod schema自动验证和限流

## 快速开始

### 开发模式（推荐）

```bash
# 安装依赖
npm install
cd ../web && npm install

# 一键启动（v1.1.0优化）
npm start
# - 自动启动 Vite dev server (~1s)
# - 自动启动 Gateway (~0.8s)
# - 自动启动 DevWatcher (Python热重载)
# - 总耗时 ~2.25秒 (分层并发启动)

# 手动模式（需要3个终端）
# 终端1: cd ../web && npm run dev
# 终端2: npm run build:main && npm run dev:electron
# 终端3: (不需要，DevWatcher自动处理)
```

### 打包分发

```bash
# macOS
npm run package:mac

# Windows
npm run package:win

# Linux
npm run package:linux
```

输出: `release/mac-arm64/Hermes Agent.app`

## 性能指标

### v1.1.0 (分层并发启动 + 按需健康检查)

| 指标 | v1.0.0 | v1.1.0 | 改进 |
|------|--------|--------|------|
| 总启动时间 | ~3s | ~2.25s | 25% ↓ |
| 启动方式 | 串行 | 分层并发 | 6 层并发 |
| CPU 占用 | 持续轮询 | 按需检查 | ~20% ↓ |
| 安全性 | 基础 | Token 认证 | 生产增强 |

**v1.1.0 关键优化**:
- **分层并发启动**: BFS 算法计算依赖层级，同层服务并发启动
- **按需健康检查**: 启动时持续轮询，运行时切换到按需模式
- **Gateway 认证**: 生产环境 32-byte token 保护，开发环境跳过
- **日志清理**: 自动清理 API keys、tokens、passwords（v1.0.0 已实现）

### v1.0.0 (基础架构)

| 指标 | 优化前 | v1.0.0 | 改进 |
|------|--------|--------|------|
| 总启动时间 | >15s | ~3s | 80% ↓ |
| Vite 启动 | 手动 | 1.05s | 自动化 |
| Gateway 启动 | 超时/失败 | 0.76s | 修复 |
| 开发流程 | 3 个终端 | 1 个命令 | 简化 |

## 开发模式对比

| 模式 | 命令 | Python | TypeScript | Web | 用途 |
|------|------|--------|-----------|-----|------|
| **一键启动** | `npm start` | ✅ 热重载 | 需重编译 | ✅ HMR | 日常开发（推荐）|
| **TypeScript监听** | `npm run dev:watch` | ✅ 热重载 | ✅ 自动 | ✅ HMR | TypeScript开发 |
| **打包模式** | `npm run dev:bundled` | 手动重建 | 手动重启 | 自动构建 | 测试生产构建 |
| **生产打包** | `npm run package:mac` | ✅ 嵌入 | ✅ 编译 | ✅ 构建 | 最终分发 |

### 符号链接模式 (推荐开发)

```bash
npm run dev
```

**优点**:
- Python代码修改立即生效
- 无需重新打包
- 快速迭代

**注意**:
- 修改后需刷新Electron (Cmd+R)
- Gateway重启: 关闭Electron再启动
- 不能用于打包分发

### 打包模式 (测试/生产)

```bash
npm run dev:bundled
```

**优点**:
- 完全模拟生产环境
- 所有代码嵌入app目录
- 可直接打包分发

## 热更新指南

### Python后端

**方式1: 符号链接模式 (✅ 推荐)**
```bash
npm run dev  # 使用符号链接
# 修改 ../../gateway/*.py
# Cmd+R 刷新Electron
```

**方式2: 文件监听模式**
```bash
# 终端1
npm run dev:watch:python  # 监听并自动同步

# 终端2  
npm run dev:bundled  # 启动应用
# 修改Python文件自动同步, Cmd+R刷新
```

### TypeScript主进程

```bash
npm run dev:watch
# 修改 src/*.ts 自动编译+重启
```

### React前端

```bash
# 终端1: Web开发服务器(HMR)
cd ../web && npm run dev:electron

# 终端2: Electron
npm run dev

# 修改 web/src/* 自动热更新
```

## 架构概览 (v1.0.0)

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│           Hermes Agent Desktop (Electron)               │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌─────▼─────┐    ┌─────▼─────┐
   │  Main   │      │ Renderer  │    │  Python   │
   │ Process │◄─IPC─►│  Process  │    │  Gateway  │
   │(Node.js)│      │(Chromium) │    │ (子进程)  │
   └────┬────┘      └───────────┘    └─────┬─────┘
        │                                   │
        └───────── Application ─────────────┘
             Lifecycle Manager
```

### 服务架构

- **Application**: 服务生命周期管理器（依赖解析、拓扑排序、健康监控）
- **EnvService**: 环境变量管理
- **ConfigService**: 配置文件管理
- **GatewayService**: Python Gateway进程（ProcessManager + HealthMonitor + CircuitBreaker）
- **ViteDevService**: Vite开发服务器（开发模式自动启动）
- **WindowService**: BrowserWindow生命周期
- **DevWatcherService**: Python文件监听和热重载

### IPC 通信

- **IpcRegistry**: 集中式IPC处理器注册表
- **Zod Validation**: 自动输入验证
- **Rate Limiting**: 防止滥用（如python:restart限制3次/60秒）
- **Error Handling**: 统一错误响应格式 `{ok: boolean, data/error, code}`

## 目录结构

```
electron-app/
├── src/                      # Electron主进程TypeScript
│   ├── main.ts              # 应用入口 (257行，优化前512行)
│   ├── core/                # 核心抽象
│   │   ├── application.ts   # Application lifecycle manager
│   │   └── service.interface.ts  # Service接口定义
│   ├── services/            # 服务实现
│   │   ├── env.service.ts
│   │   ├── config.service.ts
│   │   ├── gateway.service.ts
│   │   ├── vite-dev.service.ts
│   │   ├── window.service.ts
│   │   └── dev-watcher.service.ts
│   ├── process/             # 进程管理
│   │   ├── process-manager.ts
│   │   ├── health-monitor.ts
│   │   └── circuit-breaker.ts
│   ├── ipc/                 # IPC通信
│   │   ├── ipc-registry.ts
│   │   ├── ipc-schemas.ts
│   │   └── ipc-handlers.ts
│   ├── env-manager.ts       # 环境管理
│   ├── config-manager.ts    # 配置管理
│   ├── data-migration.ts    # 数据迁移
│   └── preload.ts          # Preload脚本
├── dist/                    # 编译输出
│   ├── main.js
│   └── ...
├── resources/               # 运行时资源
│   ├── python/             # Python代码(符号链接)
│   │   ├── gateway/  → ../../gateway/
│   │   ├── agent/    → ../../agent/
│   │   └── tools/    → ../../tools/
│   └── python-runtime/     # Python虚拟环境
├── tests/                   # 测试
│   ├── unit/               # 单元测试 (82个)
│   ├── integration/        # 集成测试 (7个)
│   └── e2e/                # E2E测试 (Playwright)
├── release/                # 打包输出
│   └── mac-arm64/
│       └── Hermes Agent.app
├── scripts/                # 构建脚本
│   ├── setup-dev.js
│   ├── setup-prod.js
│   └── check-web-deps.js
└── docs/                   # 文档
    ├── MIGRATION.md
    └── DEV_GUIDE.md
```

## 数据存储

### 开发环境
```
~/Library/Application Support/hermes-agent-electron/
├── state.db           # 会话数据
├── config.yaml        # 用户配置
└── .env              # 环境变量
```

### 生产环境
数据路径由`app.getPath('userData')`决定:
- macOS: `~/Library/Application Support/hermes-agent-electron/`
- Windows: `%APPDATA%\hermes-agent-electron\`
- Linux: `~/.config/hermes-agent-electron/`

## 环境变量

开发模式自动设置:
```bash
HERMES_ELECTRON_MODE=true           # 标记Electron环境
HERMES_HOME=<userData>/             # 数据目录
PYTHONPATH=<app>/python             # Python模块路径
GATEWAY_ALLOW_ALL_USERS=true        # 禁用认证
GATEWAY_ENABLE_DASHBOARD=true       # 启用Dashboard
GATEWAY_PORT=8642                   # Gateway端口
```

## 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Gateway | 8642 | 核心API服务 |
| Dashboard | 8642 | 嵌入Gateway |
| Chat UI | Electron | 嵌入Renderer |

## Onboarding Wizard

首次启动应用时，会自动显示配置向导，引导用户完成必要的设置。

### 配置步骤

1. **语言选择**: 选择界面语言（中文/English）
2. **LLM提供商**: 配置大语言模型API密钥
   - 支持13个提供商（火山引擎、Kimi、通义千问、DeepSeek等）
   - OAuth提供商（如Qwen）显示终端命令提示
3. **可选功能**: 配置增强功能（可跳过）
   - Vision & Image Generation (FAL.ai)
   - Browser Automation (Local/CDP/Browserbase)
   - Web Search (Exa, Firecrawl)
4. **完成**: 显示配置摘要并启动应用

### Onboarding标记文件

配置完成后，会在配置目录创建标记文件：
```
<userData>/config/.onboarding-complete
```

### 重置Onboarding

如需重新显示配置向导：
```bash
# 删除标记文件
rm ~/Library/Application\ Support/hermes-agent-electron/config/.onboarding-complete

# 重启应用
```

### 组件架构

- **主进程**: `src/config-manager.ts`
  - `needsOnboarding()`: 检查是否需要显示向导
  - `markOnboardingComplete()`: 标记配置完成
- **IPC通信**: `src/main.ts`, `src/preload.ts`
  - `onboarding:getStatus`: 查询状态
  - `onboarding:markComplete`: 标记完成
  - `onboarding:status`: 状态事件
- **渲染进程**: `web/src/components/OnboardingModal.tsx`
  - 4步配置流程组件
  - 实时保存配置（增量保存，防止数据丢失）
  - 表单验证和错误处理

## 常见问题

### Q: Python代码修改不生效
A: 
1. 检查是否使用符号链接: `ls -la app/python/`
2. 如果是打包模式,运行: `npm run bundle:python`
3. 重启Electron: Cmd+R

### Q: 端口被占用
A:
```bash
lsof -ti:8642 | xargs kill -9
```

### Q: 打包后应用无法启动
A:
1. 检查Python运行时: `app/python-runtime/`
2. 检查日志: Console.app搜索"Hermes Agent"
3. 重新打包: `npm run clean && npm run package:mac`

### Q: 数据迁移问题
A: 应用会自动检测并迁移旧数据位置:
- 旧路径: `hermes-electron/config/`
- 新路径: `hermes-agent-electron/`

## 构建要求

- Node.js >= 18
- Python >= 3.10
- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools
- Linux: gcc, make

## 自动化测试

### 测试框架

- **Vitest**: 单元测试和集成测试
- **Playwright**: E2E测试（Electron支持）
- **Coverage**: v8 (目标 80%)

### 运行测试

```bash
# 单元测试
npm run test:unit          # 82个单元测试

# 集成测试
npm run test:integration   # 7个Gateway集成测试（需Gateway运行）

# E2E测试（已创建，环境问题阻塞）
npm run test:e2e

# 覆盖率（版本不兼容）
npm run test:coverage

# 监听模式
npm run test:watch
```

### 测试覆盖

**单元测试** (82个)
- ✅ Application lifecycle (拓扑排序、依赖管理)
- ✅ ProcessManager (进程启动、优雅关闭、SIGTERM/SIGKILL)
- ✅ HealthMonitor (指数退避、健康检查)
- ✅ CircuitBreaker (CLOSED/OPEN/HALF_OPEN状态机)
- ✅ IpcRegistry (输入验证、限流)

**集成测试** (7个，需Gateway)
- ⚠️ Gateway认证 (/health无需认证，API需Bearer token)
- ⚠️ CORS配置 (允许Vite dev server)

**E2E测试** (已创建，环境问题)
- 📝 应用启动流程
- 📝 DevTools页面（快捷键、日志、服务、IPC）
- 📝 IPC通信（python:getStatus、限流）
- 📝 Onboarding wizard

### 已知问题

E2E测试在Playwright环境下失败：
- `app.getPath('userData')` 返回 `~/Library/Application Support/Electron`
- 正确路径应为 `~/Library/Application Support/hermes-agent-electron`
- 导致Gateway无法启动，窗口无法创建

详见 [tests/README.md](./tests/README.md) 和 [MIGRATION.md](./MIGRATION.md#testing)

## 相关文档

- [MIGRATION.md](./MIGRATION.md) - v1.0.0迁移指南
- [DEV_GUIDE.md](./DEV_GUIDE.md) - 完整开发工作流
- [TEST_GUIDE.md](./TEST_GUIDE.md) - 自动化测试文档
- [Architecture Rules](../.claude/rules/architecture-electron.md) - 架构详解
- [主项目README](../README.md) - Hermes Agent文档

## 版本历史

### v1.0.0 (2026-04-20)

**重大变更**
- 实现Service-Oriented Architecture (SOA)
- Application lifecycle manager with dependency resolution
- IPC Registry with Zod validation and rate limiting
- 启动时间优化: >15s → ~3s (80% improvement)

**新增**
- EnvService, ConfigService, GatewayService, ViteDevService, WindowService
- DevWatcherService for Python hot reload
- ProcessManager, HealthMonitor, CircuitBreaker
- 82个单元测试 (92% pass rate)
- DevTools page with logs, services, IPC inspection

**修复**
- Gateway健康检查从fetch改为http模块 (Electron兼容性)
- HERMES_HOME路径统一
- 符号链接零复制开发模式

详见 [CHANGELOG.md](./CHANGELOG.md)

### v0.2.0

- Onboarding wizard
- 数据迁移

### v0.1.0

- 初始Electron封装

## License

与主项目相同
