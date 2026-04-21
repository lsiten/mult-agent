# Hermes Profile 使用指南

> **版本**: 基于 Hermes Agent v0.6.0+  
> **适用平台**: Linux, macOS, WSL2  
> **最后更新**: 2026-04-21

---

## 目录

1. [核心概念](#1-核心概念)
2. [基础操作](#2-基础操作)
3. [典型使用场景](#3-典型使用场景)
4. [高级功能](#4-高级功能)
5. [Docker 部署集成](#5-docker-部署集成)
6. [故障排查](#6-故障排查)
7. [最佳实践](#7-最佳实践)
8. [快速参考](#8-快速参考)

---

## 1. 核心概念

### 1.1 什么是 Profile

**Profile**（配置档案）是 Hermes 的多实例隔离机制，允许你在同一台机器上运行多个完全独立的 Hermes 实例。每个 Profile 拥有：

- ✅ **独立的配置文件**（config.yaml、.env、SOUL.md）
- ✅ **独立的数据存储**（会话历史、记忆、数据库）
- ✅ **独立的技能库**（skills、cron 任务）
- ✅ **独立的 Gateway 服务**（不同端口、不同平台 token）
- ✅ **独立的子进程环境**（git、ssh、npm 配置隔离）

**典型应用场景**：
- 工作和个人环境分离
- 多个平台bot同时运行（Telegram、Discord、Slack）
- 开发/测试/生产环境隔离
- 不同模型对比测试
- 团队协作配置分发

### 1.2 隔离机制原理

每个 Profile 通过独立的 **HERMES_HOME** 目录实现完全隔离：

```
~/.hermes/                    # default profile（默认）
~/.hermes/profiles/work/      # work profile
~/.hermes/profiles/personal/  # personal profile
~/.hermes/profiles/dev/       # dev profile
```

**关键隔离机制**：

| 隔离维度 | 实现方式 | 效果 |
|---------|---------|------|
| 配置隔离 | 独立 config.yaml/.env | 不同 API keys、模型、提供商 |
| 数据隔离 | 独立 state.db/sessions | 会话、记忆互不干扰 |
| 技能隔离 | 独立 skills 目录 | 不同技能集 |
| 服务隔离 | 独立 Gateway 进程 | 不同端口、systemd 服务名 |
| 环境隔离 | 独立子进程 HOME | git/ssh 凭据不泄露 |
| Token 锁定 | auth.lock 文件 | 防止多 Profile 共用平台 token |

### 1.3 目录结构

每个 Profile 的完整目录结构：

```
<HERMES_HOME>/
├── config.yaml          # 配置文件
├── .env                 # API keys（不会被导出）
├── SOUL.md              # Agent 人格设定
├── memories/            # 记忆系统
│   ├── MEMORY.md        # 主记忆文件
│   └── USER.md          # 用户档案
├── sessions/            # 会话历史（JSON 文件）
├── skills/              # 已安装技能
├── skins/               # UI 主题
├── logs/                # Gateway 和 agent 日志
├── plans/               # 计划文件
├── workspace/           # 工作空间
├── cron/                # 定时任务配置
├── home/                # 子进程隔离 HOME
├── state.db             # SQLite 数据库
├── gateway.pid          # Gateway 进程 PID
├── gateway_state.json   # Gateway 状态
└── processes.json       # 运行中进程记录
```

---

## ⚠️ 重要提示：Electron 模式限制

**Profile 功能当前仅在 CLI 命令行模式下可用，Electron 桌面应用暂不支持。**

### Electron 模式的数据位置

Electron 桌面应用使用固定的数据目录：

```
~/Library/Application Support/hermes-agent-electron/
├── config.yaml
├── .env
├── state.db
├── memories/
├── sessions/
├── skills/
└── logs/
```

该目录与 CLI 模式的 `~/.hermes/` **完全独立**，两者互不干扰。

### 为什么 Electron 不支持 Profile？

Electron 应用每次启动都使用相同的固定数据目录（`app.getPath('userData')`），无法在启动时选择不同的 Profile。要使用 Profile 功能，请：

**方案 1**: 使用 CLI 模式启动多个独立 Gateway

```bash
# Terminal 1: work Profile
hermes -p work gateway start

# Terminal 2: personal Profile
hermes -p personal gateway start

# Electron 应用连接到这些 Gateway
```

**方案 2**: 等待未来版本的 Electron Profile 选择器

我们计划在未来版本的 Electron 应用中添加启动时的 Profile 选择器 UI，敬请期待。

### CLI vs Electron 路径对比

| 模式 | HERMES_HOME 路径 | Profile 支持 |
|------|-----------------|-------------|
| **CLI** | `~/.hermes/` (可通过 Profile 切换) | ✅ 完整支持 |
| **Electron** | `~/Library/Application Support/hermes-agent-electron/` (固定) | ❌ 暂不支持 |
| **Docker** | 自定义路径（环境变量配置） | ✅ 支持单 Profile |

---

## 2. 基础操作

> **注意**: 以下所有操作仅适用于 CLI 模式。

### 2.1 创建 Profile

#### 基础创建

创建一个全新的空 Profile：

```bash
$ hermes profile create work
✓ Created profile 'work' at /Users/user/.hermes/profiles/work
✓ Created wrapper script: /Users/user/.local/bin/work

Use:
  work chat             # Start chatting
  hermes -p work chat   # Or use the -p flag
  hermes profile use work  # Set as default
```

#### 克隆当前配置

从当前 Profile 复制配置文件（config.yaml、.env、SOUL.md、memories）：

```bash
$ hermes profile create personal --clone
✓ Created profile 'personal' at /Users/user/.hermes/profiles/personal
✓ Cloned config files from 'default'
✓ Copied: config.yaml, .env, SOUL.md
✓ Copied: memories/MEMORY.md, memories/USER.md
✓ Created wrapper script: /Users/user/.local/bin/personal
```

#### 完整克隆

完整复制所有文件（包括会话历史、技能、数据库）：

```bash
$ hermes profile create backup --clone-all
✓ Created profile 'backup' at /Users/user/.hermes/profiles/backup
✓ Full clone from 'default' completed
✓ Cleaned up runtime files (gateway.pid, processes.json)
```

#### 指定克隆源

从指定 Profile 克隆：

```bash
$ hermes profile create dev --clone --from personal
✓ Cloned config from 'personal' profile
```

#### 不创建快捷别名

```bash
$ hermes profile create test --no-alias
✓ Created profile 'test' (no command alias)
```

### 2.2 列出和查看 Profile

#### 列出所有 Profile

```bash
$ hermes profile list
┌─────────┬──────────────┬─────────┬────────┬──────────┐
│ Name    │ Model        │ Gateway │ Skills │ Alias    │
├─────────┼──────────────┼─────────┼────────┼──────────┤
│ default │ sonnet-4-6   │ ● running│   42   │ -        │
│ work    │ sonnet-4-6   │ ○ stopped│   38   │ ✓        │
│ personal│ haiku-4-5    │ ○ stopped│   15   │ ✓        │
└─────────┴──────────────┴─────────┴────────┴──────────┘

● = active profile
```

#### 查看 Profile 详情

```bash
$ hermes profile show work
Profile: work
Path:    /Users/user/.hermes/profiles/work
Model:   claude-sonnet-4-6 (anthropic)
Gateway: Running (PID 12345)
Skills:  38 installed
Env:     ✓ .env configured
Alias:   /Users/user/.local/bin/work
```

#### 在会话中查看当前 Profile

```bash
$ hermes chat
> /profile
Current profile: work
HERMES_HOME: /Users/user/.hermes/profiles/work
```

### 2.3 切换 Profile

#### 方式 1：临时使用（-p 标志）

```bash
$ hermes -p work chat
# 仅此次会话使用 work profile，不影响默认设置
```

#### 方式 2：设置默认 Profile

```bash
$ hermes profile use work
✓ Active profile set to 'work'
✓ Future commands will use this profile by default

$ hermes chat
# 现在默认使用 work profile
```

重置为 default：

```bash
$ hermes profile use default
✓ Active profile reset to 'default'
```

#### 方式 3：快捷别名

创建 Profile 时自动生成快捷别名：

```bash
$ work chat              # 等价于 hermes -p work chat
$ work gateway start     # 启动 work profile 的 Gateway
$ work model             # 配置 work profile 的模型
```

**配置快捷别名的 PATH**：

如果快捷别名不可用，添加 ~/.local/bin 到 PATH：

```bash
# Bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Zsh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

验证别名是否生效：

```bash
$ which work
/Users/user/.local/bin/work
```

### 2.4 删除 Profile

#### 安全删除流程

```bash
$ hermes profile delete work

Profile: work
Path:    /Users/user/.hermes/profiles/work
Model:   claude-sonnet-4-6 (anthropic)
Skills:  38

This will permanently delete:
  • All config, API keys, memories, sessions, skills, cron jobs
  • Command alias (/Users/user/.local/bin/work)
  ⚠ Gateway is running — it will be stopped.

Type 'work' to confirm: work

✓ Service hermes-gateway-work removed
✓ Gateway stopped (PID 12345)
✓ Removed /Users/user/.local/bin/work
✓ Removed /Users/user/.hermes/profiles/work
✓ Active profile reset to default

Profile 'work' deleted.
```

#### 快速删除（跳过确认）

```bash
$ hermes profile delete work --yes
✓ Profile 'work' deleted
```

#### 删除保护

default Profile 受保护，无法删除：

```bash
$ hermes profile delete default
Error: Cannot delete the default profile (~/.hermes).
To remove everything, use: hermes uninstall
```

### 2.5 Profile 名称规则

#### 合法名称格式

- **允许**: 小写字母、数字、连字符（-）、下划线（_）
- **必须**: 以字母或数字开头
- **长度**: 1-64 个字符
- **示例**: `work`, `personal`, `dev-team`, `bot_telegram`, `test2`

#### 保留名称

以下名称不可用（会与系统命令或 hermes 子命令冲突）：

```
hermes, default, test, tmp, root, sudo
chat, model, gateway, setup, status, cron, doctor, dump, config,
pairing, skills, tools, mcp, sessions, insights, version, update,
uninstall, profile, plugins, honcho, acp
```

#### 名称冲突检查

创建 Profile 时系统自动检查：

```bash
$ hermes profile create ls
Warning: 'ls' conflicts with an existing command (/usr/bin/ls)
Creating this profile may cause confusion. Continue? (y/n)
```

---

## 3. 典型使用场景

### 3.1 工作和个人环境分离

#### 场景描述

你需要一个专业的工作助手（严肃、简洁）和一个轻松的个人助手（友好、幽默），且两者的会话和记忆完全分离。

#### 实现步骤

**1. 创建工作 Profile**

```bash
$ hermes profile create work --clone
✓ Created profile 'work'

$ work chat
> /personality professional
> 修改 ~/.hermes/profiles/work/SOUL.md
  （设定为专业、简洁的工作助手）
```

**2. 创建个人 Profile**

```bash
$ hermes profile create personal --clone
✓ Created profile 'personal'

$ personal chat
> /personality friendly
> 修改 ~/.hermes/profiles/personal/SOUL.md
  （设定为友好、幽默的个人助手）
```

**3. 配置不同的技能和 API keys**

```bash
# 工作 Profile：安装开发工具、项目管理技能
$ work chat
> /skills install code-review
> /skills install jira-integration

# 个人 Profile：安装生活助手技能
$ personal chat
> /skills install recipe-finder
> /skills install workout-planner
```

**4. 日常使用**

```bash
# 工作时间
$ work chat
> 帮我review这段代码

# 下班后
$ personal chat
> 推荐一道简单的晚餐食谱
```

#### 优势

- ✅ 工作和个人的会话、记忆完全隔离
- ✅ 不同的 API keys（工作用公司账户，个人用个人账户）
- ✅ 不同的人格设定和技能集
- ✅ 通过快捷别名快速切换

### 3.2 多平台 Agent 实例

#### 场景描述

你需要同时运行多个平台的 bot：Telegram 个人助手、Discord 社区 bot、Slack 团队协作助手。

#### 实现步骤

**1. 创建 Telegram Profile**

```bash
$ hermes profile create telegram --clone
$ cd ~/.hermes/profiles/telegram
$ vim .env
TELEGRAM_TOKEN=your_telegram_token
TELEGRAM_ALLOWED_USERS=123456789

$ vim config.yaml
gateway:
  port: 8642  # 默认端口
  platforms:
    telegram:
      enabled: true

$ hermes -p telegram gateway start
✓ Gateway started on port 8642
```

**2. 创建 Discord Profile**

```bash
$ hermes profile create discord --clone
$ cd ~/.hermes/profiles/discord
$ vim .env
DISCORD_TOKEN=your_discord_token

$ vim config.yaml
gateway:
  port: 8643  # 不同端口避免冲突
  platforms:
    discord:
      enabled: true

$ hermes -p discord gateway start
✓ Gateway started on port 8643
```

**3. 创建 Slack Profile**

```bash
$ hermes profile create slack --clone
$ cd ~/.hermes/profiles/slack
$ vim .env
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token

$ vim config.yaml
gateway:
  port: 8644
  platforms:
    slack:
      enabled: true

$ hermes -p slack gateway start
✓ Gateway started on port 8644
```

**4. 同时运行多个 Gateway**

```bash
$ hermes profile list
┌──────────┬─────────┬────────┐
│ Name     │ Gateway │ Port   │
├──────────┼─────────┼────────┤
│ telegram │ ● running│ 8642  │
│ discord  │ ● running│ 8643  │
│ slack    │ ● running│ 8644  │
└──────────┴─────────┴────────┘
```

#### 优势

- ✅ 每个平台独立的 token 和配置
- ✅ 不同的会话历史和记忆（Telegram 聊天不会影响 Discord）
- ✅ Token Lock 机制防止冲突
- ✅ 可针对不同平台定制技能和人格

### 3.3 开发和生产环境

#### 场景描述

开发新功能时需要测试环境，避免影响生产环境的稳定性和数据。

#### 实现步骤

**1. 创建开发 Profile**

```bash
$ hermes profile create dev --clone
$ cd ~/.hermes/profiles/dev
$ vim .env
# 使用测试 API keys
ANTHROPIC_API_KEY=sk-test-xxx
OPENROUTER_API_KEY=sk-or-test-xxx

$ vim config.yaml
model:
  default: sonnet-4-6
  provider: anthropic
log_level: DEBUG  # 开发环境启用详细日志
```

**2. 在开发环境测试新功能**

```bash
$ dev chat
> 测试新开发的技能
> 验证配置更改
> 调试 Gateway 集成

$ tail -f ~/.hermes/profiles/dev/logs/gateway.log
# 查看详细日志
```

**3. 创建 Staging Profile**

验证通过后，创建预发布环境：

```bash
$ hermes profile create staging --clone-all --from dev
✓ Full clone from 'dev' completed

$ cd ~/.hermes/profiles/staging
$ vim .env
# 使用接近生产的配置
ANTHROPIC_API_KEY=sk-staging-xxx

$ staging chat
# 最终验证
```

**4. 部署到生产**

```bash
# 导出 staging 配置
$ hermes profile export staging -o staging.tar.gz
✓ Exported profile 'staging' to staging.tar.gz

# 在生产服务器导入
$ hermes profile import staging.tar.gz --name production
✓ Imported profile 'production'

$ cd ~/.hermes/profiles/production
$ vim .env
# 配置生产 API keys
ANTHROPIC_API_KEY=sk-prod-xxx

$ hermes -p production gateway start
✓ Gateway started in production mode
```

#### 优势

- ✅ 开发、测试、生产完全隔离
- ✅ 测试不影响生产数据和会话
- ✅ 可逐步验证（dev → staging → production）
- ✅ 通过导出/导入实现配置同步

### 3.4 模型和提供商测试

#### 场景描述

评估不同模型的性能和成本，找到最优配置。

#### 实现步骤

**1. 创建测试 Profile**

```bash
# GPT-4 测试
$ hermes profile create test-gpt4 --clone
$ cd ~/.hermes/profiles/test-gpt4
$ vim config.yaml
model:
  default: gpt-4-turbo
  provider: openai

# Claude Sonnet 测试
$ hermes profile create test-sonnet --clone
$ cd ~/.hermes/profiles/test-sonnet
$ vim config.yaml
model:
  default: sonnet-4-6
  provider: anthropic

# Claude Haiku 测试（低成本）
$ hermes profile create test-haiku --clone
$ cd ~/.hermes/profiles/test-haiku
$ vim config.yaml
model:
  default: haiku-4-5
  provider: anthropic
```

**2. 并行对比测试**

```bash
# Terminal 1
$ test-gpt4 chat
> 解释量子计算的基本原理

# Terminal 2
$ test-sonnet chat
> 解释量子计算的基本原理

# Terminal 3
$ test-haiku chat
> 解释量子计算的基本原理
```

**3. 对比结果**

| Profile | 模型 | 响应质量 | 响应速度 | 成本 |
|---------|------|----------|----------|------|
| test-gpt4 | GPT-4 Turbo | 9/10 | 慢 | $$$ |
| test-sonnet | Sonnet 4.6 | 9.5/10 | 中等 | $$ |
| test-haiku | Haiku 4.5 | 7/10 | 快 | $ |

**4. 应用到生产**

```bash
# 根据测试结果更新生产配置
$ vim ~/.hermes/config.yaml
model:
  default: sonnet-4-6
  provider: anthropic
```

#### 优势

- ✅ 公平对比（相同提示词、不同模型）
- ✅ 保留测试历史便于后续分析
- ✅ 快速切换测试不同配置
- ✅ 避免修改生产环境

### 3.5 技能开发和测试

#### 场景描述

开发新技能时需要隔离的测试环境，避免破坏生产 Profile。

#### 实现步骤

**1. 创建技能开发 Profile**

```bash
$ hermes profile create skill-dev --clone-all
✓ Full clone from 'default' completed

$ cd ~/.hermes/profiles/skill-dev/skills
$ mkdir my-new-skill
$ vim my-new-skill/SKILL.md
```

**2. 在隔离环境测试**

```bash
$ skill-dev chat
> /skills
Available skills:
  ...
  my-new-skill (dev)

> /my-new-skill test-input
Testing new skill...
```

**3. 迭代开发**

```bash
# 修改技能代码
$ vim ~/.hermes/profiles/skill-dev/skills/my-new-skill/skill.py

# 重新加载
$ skill-dev chat
> /skills reload
✓ Skills reloaded

# 测试
> /my-new-skill another-test
```

**4. 部署到生产**

验证通过后复制到生产 Profile：

```bash
$ cp -r ~/.hermes/profiles/skill-dev/skills/my-new-skill \
        ~/.hermes/skills/

$ hermes chat
> /skills
Available skills:
  ...
  my-new-skill ✓
```

#### 优势

- ✅ 技能开发不影响生产环境
- ✅ 可安全测试破坏性操作
- ✅ 保留开发历史便于调试
- ✅ 验证通过后轻松部署

### 3.6 团队协作场景

#### 场景描述

团队需要统一的 Hermes 配置，包括技能、SOUL.md、常用设置。

#### 实现步骤

**1. 团队负责人配置模板 Profile**

```bash
$ hermes profile create team-template --clone
$ cd ~/.hermes/profiles/team-template

# 配置团队统一设置
$ vim config.yaml
model:
  default: sonnet-4-6
  provider: anthropic
tools:
  enabled:
    - file_operations
    - code_execution
    - browser

# 配置团队 SOUL.md
$ vim SOUL.md
You are a professional software development assistant...

# 安装团队常用技能
$ hermes -p team-template chat
> /skills install code-review
> /skills install git-workflow
> /skills install jira-integration
```

**2. 导出模板**

```bash
$ hermes profile export team-template -o team-template.tar.gz
✓ Exported profile 'team-template' to team-template.tar.gz
✓ Credentials excluded (users will add their own .env)
```

**3. 分享给团队成员**

```bash
# 通过内部文件服务器或 Slack 分享 team-template.tar.gz

# 团队成员导入
$ hermes profile import team-template.tar.gz --name my-team
✓ Imported profile 'my-team'

# 配置个人 API keys
$ cd ~/.hermes/profiles/my-team
$ vim .env
ANTHROPIC_API_KEY=sk-user-xxx
JIRA_API_TOKEN=xxx

$ my-team chat
# 开始使用团队统一配置
```

**4. 配置更新流程**

```bash
# 团队负责人更新配置
$ cd ~/.hermes/profiles/team-template
$ vim config.yaml  # 添加新配置
$ hermes -p team-template chat
> /skills install new-team-skill

# 导出新版本
$ hermes profile export team-template -o team-template-v2.tar.gz

# 团队成员更新
$ hermes profile delete my-team --yes
$ hermes profile import team-template-v2.tar.gz --name my-team
$ cd ~/.hermes/profiles/my-team
$ vim .env  # 重新配置 API keys
```

#### 优势

- ✅ 团队使用统一配置和技能
- ✅ 导出时自动排除凭据保护安全
- ✅ 配置更新流程标准化
- ✅ 新成员快速上手

### 3.7 临时实验环境

#### 场景描述

需要测试危险操作或实验性功能，测试完成后销毁环境。

#### 实现步骤

**1. 创建临时 Profile**

```bash
$ hermes profile create sandbox --clone-all
✓ Created 'sandbox' profile

$ sandbox chat
> 测试可能破坏环境的操作
> 实验各种极端配置
> 验证未知功能
```

**2. 实验结束后清理**

```bash
$ hermes profile delete sandbox --yes
✓ Profile 'sandbox' deleted
✓ All data removed
```

#### 优势

- ✅ 安全的破坏性测试
- ✅ 不影响其他 Profile
- ✅ 快速创建和销毁
- ✅ 零残留数据

---

## 4. 高级功能

### 4.1 导出 Profile

#### 导出命名 Profile

```bash
$ hermes profile export work -o work-backup.tar.gz
✓ Exported profile 'work' to work-backup.tar.gz
✓ Size: 15.2 MB
✓ Credentials excluded (auth.json, .env)
```

#### 导出 Default Profile

Default Profile 导出时自动过滤基础设施文件：

```bash
$ hermes profile export default -o default-backup.tar.gz
✓ Exported profile 'default' to default-backup.tar.gz
✓ Excluded: hermes-agent repo, .worktrees, databases, caches
✓ Size: 8.5 MB (clean export)
```

**自动排除的内容**：
- 基础设施：`hermes-agent/`, `.worktrees/`, `bin/`, `node_modules/`
- 数据库：`state.db`, `response_store.db`
- 运行时：`gateway.pid`, `gateway_state.json`, `processes.json`
- 缓存：`logs/`, `image_cache/`, `audio_cache/`, `sandboxes/`
- 凭据：`auth.json`, `.env`, `auth.lock`

#### 查看归档内容

```bash
$ tar -tzf work-backup.tar.gz | head -20
work/
work/config.yaml
work/SOUL.md
work/memories/
work/memories/MEMORY.md
work/sessions/
work/skills/
...
```

### 4.2 导入 Profile

#### 基础导入

```bash
$ hermes profile import work-backup.tar.gz --name work-restored
✓ Imported profile 'work-restored'
✓ Location: /Users/user/.hermes/profiles/work-restored

⚠ Note: You need to configure .env with your API keys
```

#### 自动推断名称

```bash
# 如果归档顶层目录为 'work'，则自动命名为 'work'
$ hermes profile import work-backup.tar.gz
✓ Imported profile 'work'
```

#### 跨机器迁移

**在旧机器**：

```bash
$ hermes profile export work -o work.tar.gz
$ scp work.tar.gz user@new-machine:~/
```

**在新机器**：

```bash
$ hermes profile import work.tar.gz
✓ Imported profile 'work'

$ cd ~/.hermes/profiles/work
$ vim .env
ANTHROPIC_API_KEY=sk-xxx  # 重新配置 API keys

$ work chat
# 成功迁移
```

#### 安全限制

系统自动验证归档安全性：

```bash
# 拒绝路径遍历攻击
$ hermes profile import malicious.tar.gz
Error: Unsafe archive member path: ../../etc/passwd
Import aborted.

# 拒绝绝对路径
$ hermes profile import malicious.tar.gz
Error: Unsafe archive member path: /tmp/evil.sh
Import aborted.

# 拒绝导入为 default
$ hermes profile import backup.tar.gz --name default
Error: Cannot import as 'default' — that is the built-in root profile (~/.hermes).
Specify a different name: hermes profile import <archive> --name <name>
```

### 4.3 重命名 Profile

#### 基础重命名

```bash
$ hermes profile rename old-name new-name
✓ Gateway stopped (PID 12345)
✓ Renamed old-name → new-name
✓ Alias updated: new-name
✓ Active profile updated: new-name (if applicable)

Profile renamed successfully.
```

#### 重命名流程详解

重命名会同步更新：

1. **Profile 目录**：`~/.hermes/profiles/old-name/` → `new-name/`
2. **快捷别名**：`~/.local/bin/old-name` → `new-name`
3. **Active Profile 设置**：若 `old-name` 是当前 active，更新为 `new-name`
4. **systemd/launchd 服务**：停止旧服务（需手动重新注册）

#### 重命名后重新注册服务

```bash
$ hermes -p new-name gateway install
✓ Service hermes-gateway-new-name.service registered
✓ Enabled on boot

$ hermes -p new-name gateway start
✓ Gateway started
```

#### 重命名限制

```bash
# 不能重命名 default
$ hermes profile rename default my-profile
Error: Cannot rename the default profile.

# 不能重命名为 default
$ hermes profile rename work default
Error: Cannot rename to 'default' — it is reserved.

# 目标名称已存在
$ hermes profile rename alpha beta
Error: Profile 'beta' already exists.
```

### 4.4 克隆配置

#### 克隆基础配置（推荐）

仅复制配置文件和记忆，不复制会话历史：

```bash
$ hermes profile create new-profile --clone --from source-profile
✓ Cloned config from 'source-profile'
✓ Copied: config.yaml, .env, SOUL.md
✓ Copied: memories/MEMORY.md, memories/USER.md
✓ Initialized empty: sessions/, skills/, logs/
```

#### 完整克隆

复制所有内容（包括会话、技能、数据库）：

```bash
$ hermes profile create full-clone --clone-all --from source-profile
✓ Full clone from 'source-profile' completed
✓ Copied: all files and directories
✓ Cleaned up: gateway.pid, gateway_state.json, processes.json
```

#### 克隆独立性

克隆后的 Profile 完全独立：

```bash
# 修改新 Profile 不影响源 Profile
$ vim ~/.hermes/profiles/new-profile/config.yaml
# source-profile 不受影响

# 两个 Profile 可同时运行
$ hermes -p source-profile gateway start  # 端口 8642
$ hermes -p new-profile gateway start     # 端口 8643
```

### 4.5 Shell 自动补全

#### Bash 自动补全

```bash
# 生成补全脚本
$ hermes completion bash > ~/.hermes-completion.bash

# 添加到 ~/.bashrc
$ echo 'source ~/.hermes-completion.bash' >> ~/.bashrc
$ source ~/.bashrc

# 测试补全
$ hermes -p <TAB>
default   work   personal   dev

$ hermes profile delete <TAB>
work   personal   dev
```

#### Zsh 自动补全

```bash
# 生成补全脚本
$ hermes completion zsh > ~/.hermes-completion.zsh

# 添加到 ~/.zshrc
$ echo 'source ~/.hermes-completion.zsh' >> ~/.zshrc
$ source ~/.zshrc

# 测试补全
$ hermes profile <TAB>
list     use     create   delete   show   rename   export   import
```

#### 动态补全

补全脚本自动从 `~/.hermes/profiles/` 读取可用 Profile，无需手动更新。

---

## 5. Docker 部署集成

### 5.1 Docker 环境中的 Profile 路径

在 Docker 部署中，HERMES_HOME 通常设置为自定义路径（如 `/opt/data`）：

```yaml
# docker-compose.yml
services:
  hermes:
    image: hermes-agent:latest
    environment:
      HERMES_HOME: /opt/data
    volumes:
      - hermes-data:/opt/data
```

此时 Profile 路径为：

```
/opt/data/                      # default profile
/opt/data/profiles/work/        # work profile
/opt/data/profiles/telegram/    # telegram profile
/opt/data/active_profile        # active profile 文件
```

### 5.2 在 Docker 中创建 Profile

```bash
# 进入容器
$ docker exec -it hermes bash

# 创建 Profile（路径自动适配）
root@container:/app# hermes profile create telegram --clone
✓ Created profile 'telegram' at /opt/data/profiles/telegram
```

### 5.3 持久化卷配置

确保 Profile 数据持久化：

```yaml
volumes:
  - hermes-data:/opt/data  # 挂载到 HERMES_HOME

# 或使用主机目录
volumes:
  - /host/path/hermes-data:/opt/data
```

### 5.4 Docker 环境中的多 Profile

每个 Profile 可单独运行在不同容器：

```yaml
services:
  hermes-telegram:
    image: hermes-agent:latest
    environment:
      HERMES_HOME: /opt/data/telegram
    volumes:
      - telegram-data:/opt/data/telegram
    command: gateway start

  hermes-discord:
    image: hermes-agent:latest
    environment:
      HERMES_HOME: /opt/data/discord
    volumes:
      - discord-data:/opt/data/discord
    command: gateway start
```

---

## 6. 故障排查

### 6.1 Profile 不存在错误

#### 症状

```bash
$ hermes -p nonexistent chat
Error: Profile 'nonexistent' does not exist at /Users/user/.hermes/profiles/nonexistent
Create it with: hermes profile create nonexistent
```

#### 解决方案

**检查已有 Profile**：

```bash
$ hermes profile list
┌─────────┬──────────────┬─────────┐
│ Name    │ Model        │ Gateway │
├─────────┼──────────────┼─────────┤
│ default │ sonnet-4-6   │ ● running│
│ work    │ sonnet-4-6   │ ○ stopped│
└─────────┴──────────────┴─────────┘
```

**创建缺失的 Profile**：

```bash
$ hermes profile create nonexistent --clone
✓ Created profile 'nonexistent'
```

### 6.2 Gateway 端口冲突

#### 症状

```bash
$ hermes -p work gateway start
Error: Port 8642 already in use
```

#### 原因

- 同一 Profile 的 Gateway 已在运行
- 不同 Profile 配置了相同端口

#### 解决方案

**检查运行中的 Gateway**：

```bash
$ lsof -i:8642
COMMAND   PID  USER
python3  1234 user

$ hermes profile list
┌─────────┬─────────┐
│ Name    │ Gateway │
├─────────┼─────────┤
│ default │ ● running (PID 1234) │
└─────────┴─────────┘
```

**方案 1：停止占用端口的 Gateway**：

```bash
$ hermes gateway stop  # 停止 default profile 的 Gateway
✓ Gateway stopped

$ hermes -p work gateway start
✓ Gateway started on port 8642
```

**方案 2：配置不同端口**：

```bash
$ vim ~/.hermes/profiles/work/config.yaml
gateway:
  port: 8643  # 改为不同端口

$ hermes -p work gateway start
✓ Gateway started on port 8643
```

**清理僵尸进程**：

```bash
# 如果 gateway.pid 存在但进程已死
$ rm ~/.hermes/profiles/work/gateway.pid
$ hermes -p work gateway start
✓ Gateway started
```

### 6.3 Token 冲突检测

#### 症状

```bash
$ hermes -p work gateway start
Error: Telegram token is already in use by profile 'default'
Cannot start gateway with same token in multiple profiles.
```

#### 原因

Token Lock 机制检测到多个 Profile 尝试使用相同的平台凭据。

#### 解决方案

**方案 1：停止占用 Token 的 Profile**：

```bash
$ hermes gateway stop  # 停止 default profile
✓ Gateway stopped
✓ Token lock released

$ hermes -p work gateway start
✓ Gateway started
```

**方案 2：配置不同 Token**：

```bash
$ vim ~/.hermes/profiles/work/.env
TELEGRAM_TOKEN=different_telegram_token

$ hermes -p work gateway start
✓ Gateway started
```

**方案 3：手动释放 Token 锁**：

```bash
# 仅在确认占用 Profile 的 Gateway 已停止时执行
$ rm ~/.hermes/auth.lock  # default profile
$ rm ~/.hermes/profiles/work/auth.lock  # work profile

$ hermes -p work gateway start
✓ Gateway started
```

**查看 Token 占用情况**：

```bash
$ cat ~/.hermes/auth.lock
{
  "telegram": "bot123456:ABC...",
  "locked_by": "default",
  "locked_at": "2026-04-21T10:30:00Z"
}
```

### 6.4 Profile 名称冲突

#### 症状

```bash
$ hermes profile create work
Error: Profile 'work' already exists at /Users/user/.hermes/profiles/work
```

#### 解决方案

**检查现有 Profile**：

```bash
$ hermes profile list
```

**方案 1：使用不同名称**：

```bash
$ hermes profile create work2
✓ Created profile 'work2'
```

**方案 2：删除现有 Profile 后重建**：

```bash
$ hermes profile delete work --yes
$ hermes profile create work --clone
✓ Created profile 'work'
```

#### 别名冲突

```bash
$ hermes profile create ls
Warning: 'ls' conflicts with an existing command (/usr/bin/ls)

$ hermes profile create chat
Error: 'chat' conflicts with a hermes subcommand
```

**解决方案**：选择不冲突的名称，如 `list-bot`, `chat-assistant`

### 6.5 快捷别名 PATH 问题

#### 症状

```bash
$ work
bash: work: command not found
```

#### 原因

`~/.local/bin` 不在 PATH 中

#### 解决方案

**检查 PATH**：

```bash
$ echo $PATH | grep -o "$HOME/.local/bin"
# 无输出说明不在 PATH
```

**添加到 PATH**：

```bash
# Bash
$ echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
$ source ~/.bashrc

# Zsh
$ echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
$ source ~/.zshrc
```

**验证**：

```bash
$ which work
/Users/user/.local/bin/work

$ work
# 成功启动
```

### 6.6 数据损坏恢复

#### state.db 损坏

**症状**：

```bash
$ hermes chat
Error: database disk image is malformed
```

**解决方案**：

```bash
# 1. 备份损坏的数据库
$ cd ~/.hermes
$ cp state.db state.db.backup-$(date +%Y%m%d)

# 2. 删除损坏的数据库
$ rm state.db state.db-shm state.db-wal

# 3. 重启 Hermes（自动创建新数据库）
$ hermes chat
✓ Initialized new database
⚠ Warning: Previous session history lost
```

#### 配置文件错误

**症状**：

```bash
$ hermes chat
Error: YAML syntax error in config.yaml at line 42
```

**解决方案**：

```bash
# 1. 备份当前配置
$ cp ~/.hermes/config.yaml ~/.hermes/config.yaml.backup

# 2. 修复语法错误
$ vim ~/.hermes/config.yaml
# 或从其他 Profile 复制正确配置

# 3. 验证配置
$ hermes config show
✓ Configuration loaded successfully
```

#### 技能加载失败

**症状**：

```bash
$ hermes chat
Warning: Failed to load skill 'broken-skill' at ~/.hermes/skills/broken-skill/
```

**解决方案**：

```bash
# 1. 查看详细错误日志
$ tail -f ~/.hermes/logs/gateway.log

# 2. 修复技能文件
$ vim ~/.hermes/skills/broken-skill/skill.py

# 3. 或删除损坏的技能
$ rm -rf ~/.hermes/skills/broken-skill

# 4. 重新加载技能
$ hermes chat
> /skills reload
✓ Skills reloaded (broken-skill removed)
```

### 6.7 磁盘空间不足

#### 检查 Profile 占用

```bash
$ du -sh ~/.hermes/profiles/*/
15G   ~/.hermes/profiles/work/
8G    ~/.hermes/profiles/personal/
3G    ~/.hermes/profiles/dev/
```

#### 清理日志

```bash
$ rm ~/.hermes/profiles/*/logs/*.log
$ rm ~/.hermes/logs/*.log
```

#### 清理旧会话

```bash
# 删除 30 天前的会话
$ find ~/.hermes/profiles/*/sessions/ -name "*.json" -mtime +30 -delete
```

#### 清理缓存

```bash
$ rm -rf ~/.hermes/image_cache/*
$ rm -rf ~/.hermes/audio_cache/*
$ rm -rf ~/.hermes/profiles/*/checkpoints/*
```

#### 删除不用的 Profile

```bash
$ hermes profile delete unused-profile --yes
✓ Profile 'unused-profile' deleted
✓ Freed 8 GB
```

### 6.8 版本升级兼容性

#### 症状

```bash
$ hermes chat
Error: Database schema version mismatch
Expected: 5, Found: 3
```

#### 解决方案

**运行 doctor 诊断**：

```bash
$ hermes doctor
Checking Hermes installation...
✓ Python version: 3.11.5
✓ Dependencies: OK
⚠ Database schema outdated

Run migration: hermes migrate
```

**执行迁移**：

```bash
$ hermes migrate
✓ Migrated database schema: 3 → 5
✓ All profiles updated
```

**查看 CHANGELOG**：

```bash
$ hermes version
Hermes Agent v0.7.0

$ cat ~/.hermes/hermes-agent/docs/releases/RELEASE_v0.7.0.md
# 查看 breaking changes
```

### 6.9 调试和日志查看

#### 查看 Gateway 日志

```bash
# 实时查看日志
$ tail -f ~/.hermes/profiles/work/logs/gateway.log

# 查看最近 100 行
$ tail -n 100 ~/.hermes/profiles/work/logs/gateway.log

# 搜索错误
$ grep -i error ~/.hermes/profiles/work/logs/gateway.log
```

#### 启用详细日志

```bash
$ vim ~/.hermes/profiles/work/config.yaml
log_level: DEBUG  # INFO → DEBUG

$ hermes -p work gateway restart
✓ Gateway restarted with DEBUG logging
```

#### 诊断 Profile 配置

```bash
# 查看完整配置
$ hermes -p work config show

# 查看 Profile 信息
$ hermes profile show work

# 全面诊断
$ hermes doctor
✓ Hermes installation: OK
✓ Dependencies: OK
✓ Profiles: 3 profiles found
✓ Gateway: Running (default, work)
✓ Disk space: 45 GB available
```

---

## 7. 最佳实践

### 7.1 命名规范

**清晰的用途标识**：

- ✅ `work`, `personal`, `dev`, `production`
- ✅ `telegram-bot`, `discord-community`, `slack-team`
- ❌ `profile1`, `test123`, `asdf`

**避免冲突**：

- ❌ 系统命令：`ls`, `cat`, `rm`, `cp`
- ❌ Hermes 子命令：`chat`, `model`, `gateway`
- ✅ 添加后缀：`work-chat`, `dev-bot`

### 7.2 定期备份

**备份重要 Profile**：

```bash
# 每周备份生产 Profile
$ hermes profile export production -o ~/backups/production-$(date +%Y%m%d).tar.gz

# 保留最近 4 周的备份
$ find ~/backups/ -name "production-*.tar.gz" -mtime +28 -delete
```

**自动化备份（cron）**：

```bash
$ crontab -e
# 每周日凌晨 2 点备份
0 2 * * 0 hermes profile export production -o ~/backups/production-$(date +\%Y\%m\%d).tar.gz
```

### 7.3 资源清理

**定期清理日志**：

```bash
# 每月清理 30 天前的日志
$ find ~/.hermes/profiles/*/logs/ -name "*.log" -mtime +30 -delete
```

**删除不用的 Profile**：

```bash
$ hermes profile list
# 识别不再使用的 Profile

$ hermes profile delete unused-profile --yes
```

**清理缓存**：

```bash
# 每季度清理一次缓存
$ rm -rf ~/.hermes/image_cache/*
$ rm -rf ~/.hermes/audio_cache/*
```

### 7.4 安全注意事项

**保护 .env 文件**：

```bash
# 确保 .env 文件权限正确
$ chmod 600 ~/.hermes/profiles/*/.env

# 导出 Profile 时 .env 自动排除
$ hermes profile export work -o work.tar.gz
✓ Credentials excluded
```

**不要共享包含凭据的 Profile**：

- ❌ 不要直接分享 `~/.hermes/profiles/work/` 目录
- ✅ 使用 `hermes profile export` 导出（自动排除凭据）
- ✅ 接收方手动配置 .env

**Token 管理**：

```bash
# 不同 Profile 使用不同 token
~/.hermes/.env                  → TELEGRAM_TOKEN=bot_default
~/.hermes/profiles/work/.env    → TELEGRAM_TOKEN=bot_work
~/.hermes/profiles/personal/.env → TELEGRAM_TOKEN=bot_personal
```

### 7.5 性能优化

**避免同时运行过多 Gateway**：

每个 Gateway 消耗内存和 CPU，建议：

- ≤ 3 个 Profile 同时运行 Gateway（常驻服务）
- 其他 Profile 按需启动

**配置合适的日志级别**：

```bash
# 生产环境：INFO（默认）
log_level: INFO

# 开发环境：DEBUG（详细日志）
log_level: DEBUG
```

**定期清理 SQLite 数据库**：

```bash
# 优化数据库（减少碎片）
$ sqlite3 ~/.hermes/profiles/work/state.db "VACUUM;"
```

---

## 8. 快速参考

### 8.1 命令速查表

| 命令 | 用途 |
|------|------|
| `hermes profile create <name>` | 创建新 Profile |
| `hermes profile create <name> --clone` | 克隆配置创建 |
| `hermes profile create <name> --clone-all` | 完整克隆创建 |
| `hermes profile list` | 列出所有 Profile |
| `hermes profile show <name>` | 查看 Profile 详情 |
| `hermes profile use <name>` | 设置默认 Profile |
| `hermes -p <name> <command>` | 临时使用指定 Profile |
| `<name> <command>` | 通过快捷别名使用 |
| `hermes profile delete <name>` | 删除 Profile |
| `hermes profile export <name> -o <file>` | 导出 Profile |
| `hermes profile import <file> --name <name>` | 导入 Profile |
| `hermes profile rename <old> <new>` | 重命名 Profile |
| `/profile` | 会话中查看当前 Profile |
| `hermes completion bash` | 生成 Bash 补全脚本 |
| `hermes completion zsh` | 生成 Zsh 补全脚本 |

### 8.2 目录结构速查

| 目录/文件 | 用途 |
|----------|------|
| `~/.hermes/` | Default Profile |
| `~/.hermes/profiles/<name>/` | 命名 Profile |
| `config.yaml` | 配置文件 |
| `.env` | API keys（不导出） |
| `SOUL.md` | Agent 人格 |
| `memories/` | 记忆系统 |
| `sessions/` | 会话历史 |
| `skills/` | 已安装技能 |
| `logs/` | 日志文件 |
| `cron/` | 定时任务 |
| `home/` | 子进程隔离 HOME |
| `state.db` | SQLite 数据库 |
| `gateway.pid` | Gateway 进程 ID |
| `auth.lock` | Token 锁定文件 |
| `~/.local/bin/<name>` | 快捷别名脚本 |
| `active_profile` | 默认 Profile 设置 |

### 8.3 常见问题 FAQ

**Q1: 如何在工作和个人环境快速切换？**

```bash
$ work chat      # 工作环境
$ personal chat  # 个人环境
```

**Q2: 如何同时运行多个平台 bot？**

```bash
$ hermes -p telegram gateway start  # 端口 8642
$ hermes -p discord gateway start   # 端口 8643
$ hermes -p slack gateway start     # 端口 8644
```

**Q3: 如何备份重要 Profile？**

```bash
$ hermes profile export production -o backup.tar.gz
# 保存 backup.tar.gz 到安全位置
```

**Q4: 如何在新机器恢复 Profile？**

```bash
$ hermes profile import backup.tar.gz --name production
$ vim ~/.hermes/profiles/production/.env  # 重新配置 API keys
```

**Q5: Profile 占用太多磁盘空间怎么办？**

```bash
# 清理日志
$ rm ~/.hermes/profiles/*/logs/*.log

# 清理旧会话
$ find ~/.hermes/profiles/*/sessions/ -mtime +30 -delete

# 删除不用的 Profile
$ hermes profile delete unused --yes
```

**Q6: Gateway 端口冲突怎么办？**

```bash
# 方案 1：配置不同端口
$ vim ~/.hermes/profiles/work/config.yaml
gateway:
  port: 8643

# 方案 2：停止占用端口的 Gateway
$ hermes gateway stop
```

**Q7: 如何查看 Gateway 日志？**

```bash
$ tail -f ~/.hermes/profiles/work/logs/gateway.log
```

**Q8: 快捷别名不可用怎么办？**

```bash
$ echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
$ source ~/.bashrc
$ which work  # 验证
```

**Q9: 如何分享团队配置？**

```bash
# 导出（自动排除凭据）
$ hermes profile export team-template -o team.tar.gz

# 团队成员导入
$ hermes profile import team.tar.gz --name my-team
$ vim ~/.hermes/profiles/my-team/.env  # 配置个人 API keys
```

**Q10: 如何临时测试危险操作？**

```bash
$ hermes profile create sandbox --clone-all
$ sandbox chat
# 测试...
$ hermes profile delete sandbox --yes
```

---

## 附录

### A. 相关文档

- [Hermes Agent 官方文档](https://hermes-agent.nousresearch.com/docs/)
- [Profile 功能发布说明](../releases/archive/RELEASE_v0.6.0.md)
- [Profile 测试覆盖](../../tests/hermes_cli/test_profiles.py)

### B. 贡献和反馈

如发现文档错误或有改进建议：

- 提交 Issue: [GitHub Issues](https://github.com/NousResearch/hermes-agent/issues)
- 提交 PR: [GitHub Pull Requests](https://github.com/NousResearch/hermes-agent/pulls)
- 讨论交流: [Discord](https://discord.gg/NousResearch)

### C. 版本历史

- **v0.6.0** (2024-XX-XX): Profile 功能首次发布
  - 多实例隔离
  - 导出/导入/重命名
  - Token Lock 机制
  - Docker 部署支持

---

**文档维护者**: Hermes Agent Community  
**最后更新**: 2026-04-21  
**适用版本**: Hermes Agent v0.6.0+
