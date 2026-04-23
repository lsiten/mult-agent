---
paths:
  - "gateway/**/*.py"
  - "agent/**/*.py"
  - "tools/**/*.py"
  - "skills/**/*"
  - "hermes_state.py"
  - "hermes_constants.py"
  - "hermes_logging.py"
  - "run_agent.py"
  - "cli.py"
---

# Hermes Agent 核心架构

## 整体架构

```
┌──────────────────────────────────────────────┐
│          Hermes Agent 核心系统                │
└──────────────────┬───────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
┌────▼────┐  ┌─────▼─────┐  ┌───▼───┐
│ Gateway │  │   Agent   │  │ State │
│ 网关层  │  │  核心层   │  │ 状态层│
└────┬────┘  └─────┬─────┘  └───┬───┘
     │             │             │
     └─────────────┴─────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    ┌────▼────┐        ┌─────▼────┐
    │  Tools  │        │  Skills  │
    │ 工具层  │        │  技能层  │
    └─────────┘        └──────────┘
```

## 核心模块

### Gateway 网关层

**职责**: 多平台消息路由和协议适配

**文件结构**:
```
gateway/
├── run.py                          # Gateway 启动入口
├── delivery.py                     # 消息分发
├── session_context.py              # 会话上下文管理
├── channel_directory.py            # 频道注册表
└── platforms/                      # 平台适配器
    ├── api_server.py              # REST API 服务器 (主要)
    ├── api_server_chat.py         # 聊天 API 处理
    ├── api_server_analytics.py    # 分析 API 处理
    ├── api_server_sessions.py     # 会话 API 处理
    ├── api_server_status.py       # 状态 API 处理
    └── ...                        # 其他平台适配器
```

**关键 API 端点**:
```
GET  /api/status                # 系统状态
GET  /api/sessions              # 获取会话列表
GET  /api/sessions/{id}         # 获取会话详情
GET  /api/analytics/usage       # 获取分析数据
GET  /health                    # 健康检查 (Electron 用)
POST /v1/chat/completions       # OpenAI 格式聊天 API
```

**网络配置**:
- 默认端口: `8642`
- 监听地址: `127.0.0.1` (仅本地)
- CORS: 需在 config.yaml 配置 `cors_origins`

### Agent 核心层

**职责**: 对话管理、工具调用、上下文处理

**文件结构**:
```
agent/
├── __init__.py                    # Agent 核心逻辑
├── prompt_builder.py              # Prompt 构建
├── prompt_caching.py              # Prompt 缓存优化
├── memory_manager.py              # 记忆管理
├── skill_utils.py                 # 技能工具
├── smart_model_routing.py         # 智能模型路由
├── rate_limit_tracker.py          # 速率限制跟踪
├── retry_utils.py                 # 重试机制
├── error_classifier.py            # 错误分类
└── usage_pricing.py               # 使用计费
```

**工作流程**:
```
用户消息 → Prompt构建 → LLM推理 → 工具调用 → 结果合成 → 响应输出
           ↑                                    ↓
           └────────── 上下文管理 ←──────────────┘
```

### State 状态层

**职责**: SQLite 持久化存储和会话管理

**核心文件**: `hermes_state.py` (1303 行)

**数据库结构**:
```
sessions 表       # 会话记录
messages 表       # 消息记录
analytics 表      # 分析数据
skills 表         # 技能记录
```

**数据库位置**:

此应用仅支持 Electron 模式，数据库位置：
`~/Library/Application Support/hermes-agent-electron/state.db`

路径通过 `hermes_constants.get_hermes_home()` 自动解析（需要 `HERMES_HOME` 环境变量）。

### Tools 工具层

**职责**: 可调用工具函数库

**主要文件**:
```
tools/
├── web_tools.py                   # Web 搜索和浏览
├── vision_tools.py                # 图像处理
├── voice_mode.py                  # 语音模式
├── skills_hub.py                  # 技能管理
├── session_search_tool.py         # 会话搜索
├── tts_tool.py                    # 文本转语音
├── registry.py                    # 工具注册表
└── browser_providers/             # 浏览器自动化提供商
```

### Skills 技能层

**职责**: 高级自动化任务和复合工具

**目录结构**:
```
skills/
├── web-access/                    # 网页访问技能
├── claim-basis-analysis/          # 法律分析技能
├── browser-use/                   # 浏览器自动化
├── skill-creator/                 # 技能创建器
└── [其他技能]/
    ├── skill.yaml                 # 技能元数据
    ├── skill.py                   # 技能逻辑
    └── README.md                  # 技能文档
```

## 环境变量

**核心配置** (见 `.env.example`):
```bash
# API Keys
ANTHROPIC_API_KEY=sk-xxx          # Claude API
OPENROUTER_API_KEY=sk-or-xxx      # OpenRouter 多模型

# Model Config
MODEL_NAME=claude-sonnet-4-6       # 默认模型
FALLBACK_MODEL=claude-haiku-4-5    # 降级模型

# Storage (由 Electron 自动设置)
# HERMES_HOME 由 electron-app/src/env-manager.ts 设置为：
# ~/Library/Application Support/hermes-agent-electron/
DATABASE_PATH=$HERMES_HOME/state.db # 数据库路径

# Gateway
GATEWAY_PORT=8642                  # API 服务器端口
GATEWAY_HOST=127.0.0.1             # 监听地址 (IPv4)

# Platform Tokens
TELEGRAM_BOT_TOKEN=xxx             # Telegram Bot
DISCORD_BOT_TOKEN=xxx              # Discord Bot
SLACK_BOT_TOKEN=xxx                # Slack Bot
```

## 数据流

```
┌──────────────┐
│  用户输入    │ (来自任意平台)
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────┐
│    Gateway (gateway/run.py)     │
│  - 接收消息                     │
│  - 平台适配                     │
│  - 消息路由                     │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│   Agent Core (run_agent.py)     │
│  - Prompt 构建                  │
│  - LLM 推理                     │
│  - 工具调用                     │
└──────┬──────────────────────────┘
       │
       ├──► Tools (tools/) ──────┐
       │                          │
       ├──► Skills (skills/) ────┤
       │                          │
       └──► State (hermes_state)  │
                                  │
       ┌──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│   Response Delivery             │
│  - Gateway 反向路由             │
│  - 平台格式化                   │
│  - 发送回用户                   │
└─────────────────────────────────┘
```

## 核心文件

| 文件 | 行数 | 核心职责 |
|------|------|----------|
| `run_agent.py` | 12,113 | Agent 主入口 |
| `cli.py` | 10,570 | CLI 命令行接口 |
| `hermes_state.py` | 1,303 | SQLite 数据库封装 |
| `hermes_constants.py` | 310 | 全局常量配置 |
| `hermes_logging.py` | 390 | 日志系统 |
| `gateway/run.py` | 491,566 字节 | Gateway 服务启动 |

## 关键约束

1. **数据库**: 所有状态使用 SQLite，禁止直接操作 state.db
2. **端口**: Gateway 默认 8642，需在 Electron 中保持一致
3. **日志**: 使用 `hermes_logging.py` 系统，禁 `print()`
4. **环境变量**: 敏感配置通过 `.env`，不要硬编码 API keys
5. **会话管理**: 通过 `hermes_state.SessionDB`，不要自己管理会话

## 参考

- **完整文档**: 各模块目录下的 README.md
- **API 文档**: `gateway/platforms/ADDING_A_PLATFORM.md`
