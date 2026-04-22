# Hermes Agent v2

**AI Agent 桌面应用** - Python 核心 + Electron 跨平台桌面界面

一个现代化的 AI Agent 平台，提供完整的桌面应用体验：实时对话、技能安装、会话管理、系统监控。

---

## ✨ 核心特性

- **🖥️ 原生桌面应用** - Electron + React 构建的跨平台桌面应用
- **⚡ 实时流式对话** - 支持 SSE (Server-Sent Events) 的流式输出体验
- **🔧 技能生态系统** - 在线搜索、一键安装、实时进度追踪
- **💬 会话管理** - 持久化会话历史、全文搜索、分组展示
- **📊 系统监控** - Gateway 状态、日志查看、性能分析
- **🌍 国际化** - 中英文双语支持，一键切换
- **🔒 安全认证** - Gateway Token 三层防护（环境变量 + Token 验证 + 父进程验证）

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18.0
- **Python** ≥ 3.11
- **pnpm** (推荐) 或 npm

### 一键启动（推荐）

```bash
cd electron-app && npm start
```

**一条命令完成所有准备**：
1. ✅ 检查并安装前端依赖（如果 `web/node_modules` 不存在）
2. ✅ 设置开发环境（复制 Python 运行时）
3. ✅ 编译 TypeScript Main Process
4. ✅ 启动 Gateway（Python，端口 8642）
5. ✅ 启动 Vite（前端，端口 5173）
6. ✅ 启动 DevWatcher（Python 热重载，1秒防抖）
7. ✅ 打开 Electron 窗口

**启动时间**: ~2.25s

---

### 首次安装依赖（可选）

如果想手动控制依赖安装：

```bash
# 1. 安装 Electron 依赖
cd electron-app
npm install  # 或 pnpm install

# 2. 安装前端依赖
cd ../web
npm install  # 或 pnpm install

# 3. 安装 Python 依赖（如果需要独立运行 Gateway）
cd ../
pip install -r requirements.txt  # 建议使用 venv
```

> **注意**: `npm start` 会自动处理前端依赖，无需手动安装。Python 依赖内置在 `electron-app/resources/python-runtime/` 中。

---

## 📂 项目结构

```
hermes-agent-v2/
├── electron-app/           # Electron 主进程 + 桌面应用
│   ├── src/
│   │   ├── main.ts        # Electron 主入口
│   │   ├── preload.ts     # IPC 桥接层
│   │   └── services/      # Gateway、Vite、DevWatcher 服务
│   ├── resources/         # Python 运行时 + 静态资源
│   └── package.json
│
├── web/                   # React 前端（Vite + TypeScript）
│   ├── src/
│   │   ├── pages/         # 页面组件（Status、Chat、Skills 等）
│   │   ├── components/    # UI 组件
│   │   ├── hooks/         # React Hooks
│   │   ├── stores/        # Zustand 状态管理
│   │   ├── i18n/          # 国际化配置
│   │   └── lib/           # 工具函数 + API 客户端
│   └── package.json
│
├── gateway/               # Python Gateway 服务
│   ├── run.py            # Gateway 启动入口
│   ├── platforms/        # API 路由（REST + SSE）
│   └── delivery.py       # 消息分发
│
├── agent/                # Agent 核心逻辑
│   ├── __init__.py       # Agent 主循环
│   └── skill_utils.py    # 技能工具
│
├── tools/                # 工具函数库
├── skills/               # 技能目录
├── hermes_state.py       # SQLite 状态管理
└── .claude/              # Claude Code 规则配置
```

---

## 🔧 架构说明

### Electron 三层架构

```
┌─────────────────────────────────────────┐
│  Main Process (Node.js)                 │
│  - 服务编排（Gateway、Vite、DevWatcher）│
│  - IPC 通信                             │
│  - 窗口管理                             │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────────────┐  ┌───▼──────────────┐
│ Renderer       │  │ Python Gateway   │
│ (Chromium)     │  │ (子进程:8642)    │
│ - React 前端   │  │ - REST API       │
│ - SSE 客户端   │  │ - SSE Stream     │
└────────────────┘  └──────────────────┘
```

### 数据流

```
用户输入 → React 前端 → API 客户端 (fetchJSON)
    ↓
Gateway Token 注入 (IPC 获取)
    ↓
HTTP 请求 → Gateway (8642) → Agent 核心
    ↓                              ↓
SSE Stream ← ← ← ← ← ← ← ← ← ← 工具调用 + LLM
    ↓
EventSource → React 状态更新 → UI 渲染
```

### 认证机制

**三层防护**：

1. **环境变量** - `HERMES_ELECTRON_MODE=1`（标识 Electron 模式）
2. **Gateway Token** - 32 字节随机 token（存储在 `~/.hermes/.gateway-token`）
3. **父进程验证** - 确保 Gateway 只能从 Electron 启动

**Token 传递**：

- **普通请求**: `Authorization: Bearer <token>` header
- **SSE 请求**: `?token=<token>` URL 参数（EventSource 不支持自定义 headers）

---

## 🛠️ 开发指南

### 热重载机制

| 修改内容 | 响应方式 | 需要重启 |
|---------|---------|---------|
| **Python 代码** | DevWatcher 自动重启 Gateway（1秒防抖） | ❌ |
| **TypeScript (Main)** | 需手动重编译 | ✅ `pnpm build:main` |
| **React 组件** | Vite HMR | ❌ |
| **config.yaml** | 需重启 Gateway | ✅ |

### 常用命令

```bash
# 🚀 启动开发
cd electron-app
npm start                    # 一键启动（推荐）
npm run dev                  # 启动并监听 TypeScript 变化

# 🔨 构建
npm run build:main           # 编译 Main Process TypeScript
npm run setup:dev            # 设置开发环境（复制 Python 运行时）

# 📦 生产打包
npm run package:mac          # 打包 macOS 应用
npm run package:mac:optimized # 打包（优化 Python，体积更小）
npm run package:win          # 打包 Windows
npm run package:linux        # 打包 Linux

# 🧹 清理
npm run clean                # 清理构建产物
npm run clean:all            # 清理所有（包括前端）

# 🧪 测试
npm run test:unit            # 单元测试
npm run test:integration     # 集成测试
npm run test:e2e             # E2E 测试

# 📊 前端独立开发
cd ../web
npm run dev                  # 启动 Vite (5173)
npm run build                # 生产构建
npm run lint                 # ESLint 检查

# 🐍 Python 独立开发
python gateway/run.py        # 独立启动 Gateway (8642)
pytest tests/                # 运行测试
```

> **提示**: 
> - `npm start` 已包含依赖检查、环境设置、编译、启动全流程
> - 修改 Python 代码会自动热重载（DevWatcher，1秒防抖）
> - 修改 TypeScript Main Process 需要运行 `npm run build:main` 并重启

### 数据目录

| 系统 | 路径 |
|------|------|
| **macOS** | `~/Library/Application Support/hermes-agent-electron/` |
| **Windows** | `%APPDATA%/hermes-agent-electron/` |
| **Linux** | `~/.config/hermes-agent-electron/` |

```
hermes-agent-electron/
├── config.yaml         # 用户配置
├── .env               # 环境变量
├── .gateway-token     # Gateway Token（32字节，自动生成）
├── .hermes/           # Hermes 数据目录
│   └── skills/        # 用户安装的技能
├── state.db           # SQLite 数据库（会话、消息、分析）
└── logs/              # 日志文件（10MB轮转，保留7个）
    ├── gateway.log    # Gateway 日志
    ├── agent.log      # Agent 日志
    └── electron.log   # Electron 日志
```

**关键文件说明**：
- `.gateway-token`: 启动时自动生成，持久化以保持前端缓存有效
- `state.db`: 包含所有会话历史、消息、技能安装记录
- `logs/`: 自动轮转，单文件最大 10MB，保留最近 7 个

---

## 📚 技术栈

### 前端

- **框架**: React 18 + TypeScript
- **构建**: Vite 6
- **路由**: React Router 7
- **状态管理**: Zustand
- **UI 组件**: shadcn/ui + Radix UI
- **样式**: TailwindCSS
- **国际化**: 自定义 i18n Hook
- **图标**: Lucide Icons

### 后端

- **语言**: Python 3.11+
- **Web 框架**: aiohttp (异步 HTTP + SSE)
- **数据库**: SQLite（hermes_state.py 封装）
- **日志**: Python logging + 轮转

### 桌面

- **框架**: Electron 33
- **进程通信**: IPC (contextBridge)
- **服务编排**: 自定义 Service 架构（依赖图 + 并发启动）

---

## 🐛 故障排查

### 窗口空白

```bash
# 检查 Vite 是否运行
lsof -i:5173

# 检查 Gateway 是否就绪
curl localhost:8642/health
```

### Gateway 启动失败

```bash
# 检查端口占用
lsof -i:8642

# 查看启动日志
tail -f ~/Library/Application\ Support/hermes-agent-electron/logs/gateway.log
```

### Python 热重载失效

1. 确认 DevWatcher 在运行（查看启动日志）
2. 确认修改的是符号链接指向的源文件
3. 等待 1 秒防抖触发

### 401 认证错误

1. 检查 Gateway Token 是否正确传递（控制台查看 `[API]` 日志）
2. 检查 `HERMES_ELECTRON_MODE=1` 环境变量
3. 重启应用刷新 token

---

## 📖 文档

详细文档位于 `.claude/` 目录：

| 文件 | 说明 |
|------|------|
| [CLAUDE.md](.claude/CLAUDE.md) | 项目总览 + 快速参考 |
| [architecture-electron.md](.claude/rules/architecture-electron.md) | Electron 架构详解 |
| [architecture-hermes-core.md](.claude/rules/architecture-hermes-core.md) | Python 核心架构 |
| [i18n-guidelines.md](.claude/rules/i18n-guidelines.md) | 国际化规范 |
| [development-workflow.md](.claude/rules/development-workflow.md) | 开发工作流 |

---

## 🎯 性能基准 (v1.1.0)

| 指标 | v1.0.0 | v1.1.0 | 优化 |
|------|--------|--------|------|
| 启动时间 | ~3s | ~2.25s | ⬇️ 25% |
| CPU 占用 | 持续轮询 | 按需检查 | ⬇️ 20% |

**关键优化**：
- 分层并发启动（BFS 算法）
- 按需健康检查（启动后切换模式）
- Gateway 认证（Token 生成 + 持久化）
- IPC 缓存（5s TTL）

---

## 🤝 贡献指南

欢迎贡献！请遵循以下规范：

1. **代码风格**
   - TypeScript: ESLint + Prettier
   - Python: Black + isort
   - 200-400 行/文件（硬限制：800 行）

2. **提交规范**
   - `feat:` 新功能
   - `fix:` 修复
   - `refactor:` 重构
   - `docs:` 文档
   - `test:` 测试

3. **测试要求**
   - 工具函数：单元测试
   - Gateway API：集成测试
   - 关键流程：E2E 测试

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 🙏 致谢

- **原项目**: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- **UI 组件**: [shadcn/ui](https://ui.shadcn.com)
- **图标**: [Lucide Icons](https://lucide.dev)
- **构建工具**: [Vite](https://vite.dev) + [Electron Vite](https://electron-vite.org)

---

**当前版本**: v1.1.0  
**最后更新**: 2026-04-22  
**维护者**: 雷诗城
