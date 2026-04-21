# Hermes Agent 项目总览

## 1. 项目定位

Hermes Agent 是一个以 Python Agent 为核心的多入口智能代理平台。

它不是单一应用，而是一套围绕统一 Agent 能力构建的系统，主要提供以下几类使用方式：

- CLI 交互式终端
- 消息平台网关
- Web 管理与配置界面
- Electron 桌面端
- 研究/训练与批处理环境

整体上可以把它理解为：

```text
用户入口
  -> Hermes Agent 核心
  -> 工具系统 / 技能系统 / 记忆系统
  -> 会话与状态持久化
  -> 输出到 CLI / Gateway / Web / Electron
```

## 2. 总体架构

### 2.1 核心链路

项目主干链路如下：

```text
用户入口
  -> AIAgent
  -> model_tools / toolsets / tools
  -> SessionDB / 配置 / 记忆
  -> 平台输出或界面渲染
```

其中：

- `AIAgent` 是统一的会话执行核心
- `model_tools.py` 负责工具发现、桥接和调度
- `toolsets.py` 负责把工具按场景组合成工具集
- `tools/` 是具体工具实现目录
- `hermes_state.py` 负责会话、消息和检索存储

### 2.2 多入口结构

Hermes Agent 的外层并不是单一前端，而是多入口接入：

- CLI：本地终端交互
- Gateway：Telegram、Discord、Slack、WhatsApp、Signal 等消息平台
- Web：浏览器管理界面
- Electron：桌面封装
- Research/Environments：训练、实验和批处理

这意味着大部分产品能力不是写死在某一个前端中，而是沉淀在 Python 核心层，再由不同入口复用。

## 3. 目录级项目地图

### 3.1 根目录主干

```text
mult-agent/
├── run_agent.py          # Agent 主执行入口
├── model_tools.py        # 工具发现与调用桥接
├── toolsets.py           # 工具集定义
├── hermes_state.py       # 会话与检索存储
├── agent/                # Agent 内部能力
├── hermes_cli/           # CLI 子命令、配置、Web 服务
├── gateway/              # 消息平台网关
├── tools/                # 具体工具实现
├── web/                  # React Web 前端
├── electron-app/         # Electron 桌面应用
├── cron/                 # 定时任务系统
├── plugins/              # 插件扩展
├── environments/         # 研究/训练环境
├── experiments/          # 实验脚本
└── tests/                # Python 测试
```

### 3.2 关键目录职责

#### `agent/`

负责 Agent 内部能力，不直接作为产品入口，但为 `AIAgent` 提供核心支撑。

典型内容包括：

- 系统提示组装
- 上下文压缩
- Prompt caching
- 模型元数据
- 记忆与技能指令支持

#### `tools/`

这是项目能力扩展的核心目录之一。

特点：

- 一个工具通常对应一个文件
- 工具通过注册机制暴露给 Agent
- 支持文件、终端、网页、浏览器、MCP、委托执行等多类能力

Hermes 的“会调用工具的 Agent”能力，主要由这里实现。

#### `hermes_cli/`

CLI 命令入口和控制层，负责：

- `hermes` 命令分发
- 配置读写
- provider/model 管理
- 技能与工具配置
- Web dashboard 的后端服务

这层更像“产品入口与控制面板”，而不是底层 Agent 本身。

#### `gateway/`

负责把 Agent 接入不同消息平台。

这一层处理：

- 平台适配器
- 消息收发
- 会话缓存
- 平台配对与权限
- 多平台统一转发逻辑

如果要理解“为什么 Hermes 能同时活在 Telegram / Discord / Slack 中”，重点看这里。

#### `web/`

浏览器侧的管理 UI。

主要负责：

- 配置编辑
- 环境变量/API Key 管理
- 状态监控
- 会话列表与操作
- 定时任务、技能、插件等管理页面

它本身不承载 Agent 核心逻辑，而是调用 Python Web API。

#### `electron-app/`

Electron 桌面封装层。

它做的事情不是重新实现一套业务，而是把现有 Hermes 能力桌面化：

- 启动 Python Gateway
- 启动或连接 Web 前端
- 管理窗口生命周期
- 通过 IPC 暴露桌面专属能力
- 处理桌面环境下的配置、迁移和启动优化

#### `cron/`

负责定时任务调度与自动化投递，用于无人值守任务执行。

#### `environments/` 与 `experiments/`

研究和实验方向模块，用于：

- RL 环境
- benchmark
- batch runner
- 研究型脚本

这部分不是普通产品功能入口，但对仓库的长期能力演进很重要。

## 4. 核心执行主线

### 4.1 Agent 主体

最核心的执行主体是 `run_agent.py` 中的 `AIAgent`。

它主要负责：

- 接收用户消息
- 拼装系统提示与上下文
- 选择并暴露工具
- 调用模型
- 处理工具调用结果
- 维护会话推进过程

可以把 `AIAgent` 理解成整套系统的统一大脑。

### 4.2 工具系统

工具系统由三层组成：

1. `tools/`
2. `model_tools.py`
3. `toolsets.py`

职责分工如下：

- `tools/`：提供具体工具实现
- `model_tools.py`：负责发现内置工具、MCP 工具、插件工具，并统一输出给模型
- `toolsets.py`：根据场景限制工具暴露范围

这套设计使 Hermes 能在不同平台、不同模式下复用同一套 Agent 能力，同时又控制工具边界。

### 4.3 会话与状态

`hermes_state.py` 是多入口共享的状态层。

这里承载：

- 会话数据
- 历史消息
- 搜索索引
- 跨会话检索

它让 CLI、Gateway、Web 等入口拥有统一的数据基础。

## 5. 各入口启动方式

### 5.1 CLI

入口：

- `hermes`
- `hermes_cli.main:main`

适用场景：

- 本地开发
- 调试 Agent 行为
- 直接使用命令式能力

### 5.2 Agent 直接执行

入口：

- `hermes-agent`
- `run_agent.py`

适用场景：

- 直接运行 Agent
- 脚本化调用
- 研究与自动化场景

### 5.3 Gateway

入口：

- `gateway/run.py`

适用场景：

- 对接 Telegram、Discord、Slack 等平台
- 跨设备或远程使用 Hermes

### 5.4 Web

入口分为两部分：

- 后端：`hermes_cli/web_server.py`
- 前端：`web/`

适用场景：

- 浏览器配置管理
- Dashboard
- 会话和系统状态查看

### 5.5 Electron

入口：

- `electron-app/src/main.ts`
- `electron-app/package.json`

开发模式下，Electron 通常会：

1. 检查并准备运行资源
2. 启动 Python Gateway
3. 启动或连接 Vite dev server
4. 创建桌面窗口

因此它本质上是“桌面外壳 + Python 服务 + Web UI”的组合。

## 6. Web 与 Electron 的关系

这部分容易混淆，需要单独说明。

### 6.1 Web 的定位

`web/` 是前端界面工程，使用 React + Vite + TypeScript 构建。

它负责页面、交互和浏览器端状态管理，但不负责 Agent 核心执行。

### 6.2 Electron 的定位

`electron-app/` 并不是另一套独立业务前端，而是桌面端运行容器。

它复用了 Hermes 的 Web UI，并在桌面环境下额外管理：

- Python 子进程
- 本地资源目录
- 桌面窗口
- Electron IPC
- 启动优化与生命周期

### 6.3 两者协作方式

开发时：

- `web/` 跑 Vite dev server
- Electron 加载本地 dev server 页面
- Python Gateway 提供后端能力

生产时：

- Web 前端构建为静态资源
- Electron 打包这些资源
- Electron 继续拉起内置 Python 服务

## 7. 技术栈概览

### 7.1 Python 核心

- Python 3.11+
- setuptools
- OpenAI / Anthropic SDK
- httpx
- pydantic
- rich
- prompt_toolkit
- FastAPI / Uvicorn（可选 Web 能力）

### 7.2 Web 前端

- React 19
- TypeScript
- Vite 7
- React Router 7
- Tailwind CSS 4
- Zustand

### 7.3 Electron

- Electron 28
- TypeScript
- electron-builder
- Vitest
- Playwright

## 8. 适合的阅读顺序

如果要快速熟悉项目，建议按下面顺序阅读：

### 路线 A：理解整体主线

1. `README.md`
2. `pyproject.toml`
3. `run_agent.py`
4. `model_tools.py`
5. `toolsets.py`
6. `hermes_state.py`

### 路线 B：理解产品入口

1. `hermes_cli/main.py`
2. `gateway/run.py`
3. `hermes_cli/web_server.py`
4. `web/src/App.tsx`
5. `electron-app/src/main.ts`

### 路线 C：理解 Electron 桌面端

1. `electron-app/README.md`
2. `electron-app/package.json`
3. `electron-app/src/main.ts`
4. `electron-app/src/core/application.ts`
5. `electron-app/src/services/`
6. `electron-app/src/ipc/`

## 9. 开发时的认知建议

### 9.1 不要把仓库看成单体前端项目

前端只是其中一个入口，真正的核心在 Python Agent 和工具系统。

### 9.2 不要把 Electron 看成独立业务系统

Electron 更像 Hermes 的桌面容器层，主要职责是整合已有能力，而不是重新发明业务逻辑。

### 9.3 先分清“核心能力”和“接入层”

推荐优先建立这个认知：

- 核心能力：`AIAgent`、tools、toolsets、state
- 接入层：CLI、Gateway、Web、Electron

一旦这个边界清楚，整个仓库会容易理解很多。

## 10. 一句话总结

Hermes Agent 是一个以 Python `AIAgent` 为核心，通过工具系统扩展能力，通过会话存储统一状态，并通过 CLI、Gateway、Web、Electron 等多入口对外提供服务的多端 Agent 平台。
