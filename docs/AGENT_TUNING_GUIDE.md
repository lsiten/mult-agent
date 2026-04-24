# Hermes Agent 调教指南

> **Version**: 1.0.0  
> **Updated**: 2026-04-24  
> **Audience**: 想定制 Agent 行为的开发者和高级用户

---

## 目录

1. [调教原理](#调教原理)
2. [调教方式](#调教方式)
3. [实战示例](#实战示例)
4. [高级技巧](#高级技巧)
5. [最佳实践](#最佳实践)

---

## 调教原理

### System Prompt 构建流程

Hermes Agent 的行为通过 **System Prompt** 控制，构建流程如下（按顺序）：

```
┌─────────────────────────────────────────────────────┐
│ 1. Agent Identity                                   │
│    ├─ 优先级1: SOUL.md (若存在)                      │
│    └─ 优先级2: DEFAULT_AGENT_IDENTITY (硬编码)      │
├─────────────────────────────────────────────────────┤
│ 2. User System Prompt (Gateway 层注入)              │
├─────────────────────────────────────────────────────┤
│ 3. Tool-Aware Behavioral Guidance                   │
│    ├─ MEMORY_GUIDANCE (若 memory 工具启用)          │
│    ├─ SESSION_SEARCH_GUIDANCE (若 session_search 启用)│
│    └─ SKILLS_GUIDANCE (若 skill_manage 启用)        │
├─────────────────────────────────────────────────────┤
│ 4. Nous Subscription Prompt (若配置)                │
├─────────────────────────────────────────────────────┤
│ 5. TRUTHFULNESS_GUIDANCE (有工具时强制注入)         │
├─────────────────────────────────────────────────────┤
│ 6. Tool Use Enforcement (按模型自适应)              │
│    ├─ TOOL_USE_ENFORCEMENT_GUIDANCE                 │
│    ├─ GOOGLE_MODEL_OPERATIONAL_GUIDANCE (Gemini)    │
│    └─ OPENAI_MODEL_EXECUTION_GUIDANCE (GPT/Codex)   │
├─────────────────────────────────────────────────────┤
│ 7. Memory Context (persistent memory)               │
├─────────────────────────────────────────────────────┤
│ 8. Skills Index (动态生成)                          │
├─────────────────────────────────────────────────────┤
│ 9. Context Files (项目级指令)                       │
│    优先级: .hermes.md > AGENTS.md > .cursorrules    │
├─────────────────────────────────────────────────────┤
│ 10. Timestamp + Model Info                          │
├─────────────────────────────────────────────────────┤
│ 11. Environment Hints (WSL/Termux/etc.)             │
├─────────────────────────────────────────────────────┤
│ 12. Platform Hints (Telegram/Discord/CLI/etc.)      │
└─────────────────────────────────────────────────────┘
```

**代码位置**: `run_agent.py:3666-3843` (`_build_system_prompt()`)

---

## 调教方式

### 方式 1: SOUL.md (推荐)

**适用场景**: 全局人格定制

**优先级**: ⭐⭐⭐⭐⭐ (最高)

#### 位置

```bash
# CLI 模式
$HERMES_HOME/SOUL.md

# Electron 模式 (自动)
~/Library/Application Support/hermes-agent-electron/SOUL.md

# Docker 模式
$HERMES_HOME/SOUL.md
```

#### 示例

```markdown
# Hermes Agent Persona

You are a senior software architect specializing in distributed systems and performance optimization. You:

- Always analyze performance implications before suggesting solutions
- Prefer battle-tested libraries over bleeding-edge ones
- Write concise, production-ready code without excessive comments
- Think in terms of scalability and maintainability

When reviewing code, focus on:
1. Potential race conditions and deadlocks
2. Memory allocation patterns
3. Error propagation strategy
4. Test coverage for edge cases

Communication style: Direct, technical, zero fluff.
```

#### 验证

```bash
# 启动 CLI 查看首条消息
hermes

# 检查是否加载 SOUL.md
cat ~/.hermes/SOUL.md
```

**注意**:
- SOUL.md 修改后**立即生效**，无需重启
- 留空或删除文件回退到默认人格
- 支持 Markdown 格式，但 LLM 只看纯文本

---

### 方式 2: config.yaml

**适用场景**: 行为参数配置

**优先级**: ⭐⭐⭐⭐ (高)

#### 位置

```bash
# CLI/Docker 模式
$HERMES_HOME/config.yaml

# Electron 模式 (自动)
~/Library/Application Support/hermes-agent-electron/config.yaml
```

#### 关键配置

```yaml
# ========== 模型配置 ==========
model:
  default: "anthropic/claude-opus-4.6"  # 默认模型
  fallback: "anthropic/claude-haiku-4.5"  # 降级模型
  # 智能路由: 复杂任务用 opus, 简单任务用 haiku
  smart_routing:
    enabled: true
    simple_tasks:
      - "summarize"
      - "translate"
      - "format"

# ========== Agent 行为 ==========
agent:
  # 工具调用强制执行 (防止模型只说不做)
  # auto: 自动匹配 GPT/Gemini
  # true: 所有模型
  # false: 关闭
  # [list]: 自定义匹配列表
  tool_use_enforcement: "auto"
  
  # 最大迭代次数 (防止无限循环)
  max_iterations: 90
  
  # 子 Agent 最大迭代
  delegation:
    max_iterations: 50

# ========== 记忆系统 ==========
memory:
  enabled: true  # 持久化记忆
  user_profile: true  # 用户画像

# ========== 技能系统 ==========
skills:
  auto_load: true  # 自动加载相关技能
  external_dirs:  # 外部技能目录
    - "/path/to/custom-skills"

# ========== 上下文压缩 ==========
compression:
  enabled: true
  threshold: 0.85  # 85% 时触发压缩
  summary_model: "google/gemini-3-flash-preview"  # 压缩用模型
  protect_first_n: 3  # 保护开头 N 轮
  protect_last_n: 6  # 保护末尾 N 轮
```

#### 应用配置

```bash
# 编辑配置
hermes config edit

# 查看当前配置
hermes config

# 设置单个值
hermes config set model.default "anthropic/claude-opus-4.6"

# 重启 Gateway 使配置生效
hermes restart
```

**注意**:
- 修改 `config.yaml` 需**重启 Gateway**
- 路径相关配置使用**绝对路径**
- 不要在 `config.yaml` 存 API keys (用 `.env`)

---

### 方式 3: 项目级指令文件

**适用场景**: 项目特定规范

**优先级**: ⭐⭐⭐ (中)

#### 文件优先级

1. **`.hermes.md` / `HERMES.md`** (最高)
   - 搜索到 Git 根目录
   - Hermes 专用指令
   
2. **`AGENTS.md`** / `agents.md`
   - 仅当前目录
   - 通用 AI Agent 指令

3. **`CLAUDE.md`** / `claude.md`
   - 仅当前目录
   - Claude 特定指令 (兼容 Claude Code)

4. **`.cursorrules`** + `.cursor/rules/*.mdc`
   - 仅当前目录
   - Cursor 编辑器规则 (兼容)

**代码位置**: `agent/prompt_builder.py:1051-1090` (`build_context_files_prompt()`)

#### 示例: .hermes.md

```markdown
# Project Context

**Project**: hermes-agent-v2 (AI Agent Platform)  
**Tech Stack**: Python 3.11 + SQLite + Electron  
**Architecture**: Gateway → Agent Core → Tools → Skills

## Coding Standards

- **File Size**: 200-400 lines typical, 800 max
- **Imports**: Absolute imports only, no relative
- **Logging**: Use `hermes_logging`, never `print()`
- **State**: All state in SQLite, never in-memory dicts
- **Testing**: Unit tests for utils, integration for API

## Project-Specific Rules

1. **Gateway API**: All endpoints under `/api/*` or `/v1/*`
2. **Port**: Gateway must use 8642 (Electron dependency)
3. **Env Vars**: Load via `hermes_cli.env_loader`, not `python-dotenv`
4. **Database**: Use `hermes_state.SessionDB`, never raw SQL
5. **Config**: Read from `hermes_cli.config`, never hardcode paths

## When Editing

- **Run Tests**: `pytest tests/` before commit
- **Format**: `black .` + `isort .`
- **Type Check**: `mypy .` (strict mode)
- **Lint**: `ruff check .`

## Common Patterns

```python
# ✅ Good: Use hermes_logging
from hermes_logging import get_logger
logger = get_logger(__name__)
logger.info("Task completed")

# ❌ Bad: Don't use print()
print("Task completed")  # 会污染 stdout

# ✅ Good: Use hermes_state
from hermes_state import SessionDB
db = SessionDB()
db.save_session(session_id, messages)

# ❌ Bad: Don't use in-memory dict
_sessions = {}  # 重启即丢失
```
```

#### 验证

```bash
# 检查是否加载
cd /path/to/project
hermes

# 首次对话时会打印加载的文件
```

**注意**:
- 只加载**一个**项目指令文件 (优先级最高的)
- 修改后**立即生效**，无需重启
- 支持 YAML frontmatter (会自动剥离)

---

### 方式 4: 环境变量

**适用场景**: 临时覆盖、平台特定配置

**优先级**: ⭐⭐ (低)

#### 关键环境变量

```bash
# ========== Hermes Home ==========
# 所有配置和数据的根目录
export HERMES_HOME="$HOME/.hermes"

# ========== 平台标识 ==========
# 影响 Platform Hints (格式、媒体支持)
export HERMES_PLATFORM="telegram"  # telegram/discord/cli/whatsapp/...

# ========== 模型覆盖 ==========
# 注意: 已弃用，使用 config.yaml 的 model.default
# LLM_MODEL="anthropic/claude-opus-4.6"

# ========== API Keys ==========
# 见 .env.example 完整列表
export OPENROUTER_API_KEY="sk-or-xxx"
export ANTHROPIC_API_KEY="sk-ant-xxx"

# ========== Terminal 后端 ==========
# 强制覆盖 config.yaml 的 terminal.backend
export TERMINAL_ENV="docker"  # local/docker/modal/ssh

# ========== 调试 ==========
export WEB_TOOLS_DEBUG="true"
export VISION_TOOLS_DEBUG="true"
```

#### 应用

```bash
# 临时覆盖 (单次会话)
HERMES_PLATFORM="whatsapp" hermes

# 持久化 (写入 ~/.hermes/.env)
echo "HERMES_PLATFORM=telegram" >> ~/.hermes/.env
hermes restart
```

---

### 方式 5: Gateway 注入的 System Prompt

**适用场景**: 平台特定、会话特定的动态指令

**优先级**: ⭐⭐⭐⭐ (高，但需代码修改)

#### 原理

Gateway 层在调用 Agent 时可注入额外的 System Prompt:

```python
# gateway/platforms/telegram_adapter.py (示例)
async def handle_message(message):
    # 根据用户 ID 动态生成指令
    if message.user_id in PREMIUM_USERS:
        extra_prompt = "This user has premium access. Enable all experimental features."
    else:
        extra_prompt = "This is a free-tier user. Limit tool usage to 10 calls/turn."
    
    response = await agent.run_conversation(
        user_message=message.text,
        system_message=extra_prompt  # 注入到 System Prompt
    )
```

**代码位置**: `run_agent.py:3755-3756`

---

## 实战示例

### 示例 1: 调教为代码审查专家

**目标**: Agent 专注于代码质量、安全性和性能

#### 1. 创建 SOUL.md

```bash
cat > ~/.hermes/SOUL.md << 'EOF'
# Code Review Agent

You are a senior code reviewer with 15 years of experience in production systems. Your mission is to prevent bugs before they reach production.

## Review Priorities (in order)

1. **Security**: SQL injection, XSS, CSRF, hardcoded secrets
2. **Performance**: N+1 queries, unnecessary loops, inefficient algorithms
3. **Correctness**: Edge cases, off-by-one errors, null pointer risks
4. **Maintainability**: Code smells, tight coupling, magic numbers

## Communication Style

- **Direct**: No sugarcoating, state problems clearly
- **Actionable**: Every issue must have a fix suggestion
- **Prioritized**: Mark issues as CRITICAL/HIGH/MEDIUM/LOW
- **Concise**: 3-5 line explanations max per issue

## When You Find Nothing

Say: "LGTM. No blocking issues." and suggest optional improvements.

## When Code is Dangerous

Say: "❌ BLOCKING. Do not merge." and explain why.
EOF
```

#### 2. 配置工具集

```bash
# 编辑 config.yaml
hermes config set toolsets.enabled "[\"filesystem\", \"terminal\", \"web\"]"

# 工具使用限制
hermes config set agent.tool_use_enforcement "true"
```

#### 3. 测试

```bash
hermes

# 用户输入:
# "Review this function for security issues:
# def get_user(id):
#     db.execute(f'SELECT * FROM users WHERE id={id}')"

# 期望输出:
# ❌ BLOCKING. Do not merge.
#
# CRITICAL: SQL Injection vulnerability
# - Line 2: String interpolation in SQL query
# - Attack vector: id="1 OR 1=1"
#
# Fix:
# def get_user(id):
#     db.execute('SELECT * FROM users WHERE id=?', (id,))
```

---

### 示例 2: 调教为技术写作助手

#### 1. SOUL.md

```markdown
# Technical Writing Assistant

You are a technical writer who turns complex concepts into clear documentation.

## Writing Principles

1. **Clarity over cleverness**: Use simple words
2. **Show, don't tell**: Code examples for every concept
3. **User-first**: What does the reader need to accomplish?
4. **Scannable**: Use headings, bullet points, tables

## Tone

- Friendly but professional
- Confident without being condescending
- Encouraging, not patronizing

## Format

Always structure docs as:
1. **Overview** (1-2 sentences)
2. **Prerequisites** (bullet list)
3. **Step-by-step** (numbered, with code blocks)
4. **Verification** (how to test it worked)
5. **Troubleshooting** (common issues)
```

#### 2. 项目级指令 (.hermes.md)

```markdown
---
paths:
  - "docs/**/*.md"
---

# Documentation Standards

- **Line length**: 80 chars (hard wrap)
- **Code blocks**: Always specify language (```python, not ```)
- **Links**: Relative links for internal docs
- **Examples**: Real, runnable code (no pseudocode)
```

#### 3. 测试

```bash
hermes

# 用户输入:
# "Document the agent.tool_use_enforcement config option"

# 期望输出包含:
# - 清晰的配置示例
# - 各个值的效果对比表格
# - 验证步骤
# - 常见问题解答
```

---

### 示例 3: 调教为性能优化顾问

#### SOUL.md

```markdown
# Performance Optimization Consultant

You are a systems engineer obsessed with performance. You:

- Profile before optimizing (no premature optimization)
- Measure everything (no guesses)
- Focus on hot paths (80/20 rule)
- Consider hardware limitations (CPU cache, memory bandwidth)

## Analysis Framework

For every optimization suggestion:
1. **Benchmark current state** (latency, throughput, memory)
2. **Identify bottleneck** (CPU? I/O? Memory?)
3. **Propose fix** (algorithm change, caching, parallelization)
4. **Estimate impact** (expected improvement %)
5. **Cost/benefit** (dev time vs performance gain)

## Communication

- Lead with numbers (P95 latency, QPS, memory usage)
- Explain WHY (cache miss pattern, lock contention, etc.)
- Prioritize by ROI (biggest impact, smallest effort)
- Warn about tradeoffs (memory for speed, complexity for throughput)
```

---

## 高级技巧

### 技巧 1: 模型特定调教

不同模型需要不同的指令风格。Hermes 自动根据模型注入优化指令:

```python
# agent/prompt_builder.py

# GPT/Codex: 需要显式强制工具调用
TOOL_USE_ENFORCEMENT_MODELS = ("gpt", "codex", "gemini", "gemma", "grok")

# GPT: 需要防止提前放弃
OPENAI_MODEL_EXECUTION_GUIDANCE = """
- Use tools whenever they improve correctness
- Do not stop early when another tool call would help
- Keep calling tools until task is complete AND verified
"""

# Gemini: 需要强调绝对路径和并行调用
GOOGLE_MODEL_OPERATIONAL_GUIDANCE = """
- Always use absolute file paths
- Verify file contents before editing
- Use parallel tool calls when operations are independent
"""
```

**自定义匹配规则**:

```yaml
# config.yaml
agent:
  tool_use_enforcement:
    - "gpt"
    - "o1"
    - "deepseek"
    - "qwen"
```

---

### 技巧 2: 条件性指令

使用 YAML frontmatter 实现条件加载:

```markdown
---
platforms:
  - telegram
  - discord
---

# Messaging Platform Rules

- Keep responses under 4000 chars (Telegram limit)
- Use markdown sparingly (not all clients render it)
- Never send media over 20MB
```

**代码位置**: `agent/skill_utils.py:skill_matches_platform()`

---

### 技巧 3: 分层调教策略

| 层级 | 文件 | 适用场景 | 优先级 |
|------|------|----------|--------|
| **全局人格** | `SOUL.md` | 通用行为风格 | ⭐⭐⭐⭐⭐ |
| **参数配置** | `config.yaml` | 模型、工具、限制 | ⭐⭐⭐⭐ |
| **项目规范** | `.hermes.md` | 项目特定规则 | ⭐⭐⭐ |
| **会话临时** | Gateway 注入 | 动态、用户特定 | ⭐⭐⭐⭐ |

**推荐组合**:
- **SOUL.md**: 定义"谁"
- **config.yaml**: 定义"能力"
- **.hermes.md**: 定义"规则"
- **Gateway**: 定义"上下文"

---

### 技巧 4: 调教验证清单

```bash
# 1. 检查 SOUL.md 是否生效
hermes
# 首条消息应体现人格

# 2. 检查配置加载
hermes config | grep "tool_use_enforcement"

# 3. 检查项目指令
cd /path/to/project
hermes
# 查看日志中的 "Loaded context from..."

# 4. 测试边界情况
# - 尝试让 Agent 做不该做的事 (应拒绝)
# - 尝试复杂任务 (应主动调用工具)
# - 检查上下文压缩后行为是否一致
```

---

## 最佳实践

### ✅ DO

1. **迭代优化**: 从简单人格开始，逐步细化
2. **测量效果**: 记录调教前后的对话质量
3. **版本控制**: SOUL.md 和 .hermes.md 应纳入 Git
4. **分离关注**: 人格在 SOUL.md，参数在 config.yaml
5. **文档化**: 在 README 说明项目的 Agent 配置

### ❌ DON'T

1. **不要过度约束**: 太多规则会限制创造力
2. **不要硬编码**: API keys 属于 `.env`，不是指令文件
3. **不要忽略模型差异**: GPT 和 Claude 需要不同的指令风格
4. **不要在 SOUL.md 写具体命令**: 命令属于 Skills，不是人格
5. **不要假设立即生效**: config.yaml 需重启，检查日志

---

## 调教效果评估

### 定量指标

```python
# 跟踪关键指标
metrics = {
    "tool_calls_per_turn": 3.2,  # 工具使用频率
    "task_completion_rate": 0.89,  # 任务完成率
    "avg_iterations": 4.5,  # 平均迭代次数
    "premature_stops": 0.02,  # 提前放弃比例
    "hallucination_rate": 0.01,  # 幻觉率
}
```

### 定性评估

- [ ] **指令遵守**: 遵循 SOUL.md 的行为风格
- [ ] **主动性**: 主动调用工具而非询问
- [ ] **完整性**: 任务完成彻底，不半途而废
- [ ] **准确性**: 不编造事实，基于工具输出
- [ ] **一致性**: 多轮对话保持人格一致

---

## 故障排查

### 问题 1: SOUL.md 没有生效

```bash
# 检查文件位置
ls -la $HERMES_HOME/SOUL.md

# 检查权限
chmod 644 $HERMES_HOME/SOUL.md

# 检查是否被跳过
# 查看日志: "Loaded SOUL.md from ..."
hermes --verbose
```

### 问题 2: config.yaml 修改无效

```bash
# 检查语法
python3 -c "import yaml; yaml.safe_load(open('$HERMES_HOME/config.yaml'))"

# 重启 Gateway
hermes restart

# 验证配置
hermes config
```

### 问题 3: Agent 行为不稳定

可能原因:
1. **上下文压缩**导致人格丢失 → 增大 `compression.protect_first_n`
2. **模型不匹配** → GPT 需更强的工具强制
3. **Token 超限** → SOUL.md 过长，截断了

```yaml
# config.yaml
compression:
  protect_first_n: 5  # 增大保护区
  protect_last_n: 10
  
agent:
  tool_use_enforcement: true  # 强制工具调用
```

---

## 进阶资源

- **代码位置**:
  - System Prompt 构建: `run_agent.py:3666-3843`
  - Prompt 片段: `agent/prompt_builder.py`
  - 上下文引擎: `agent/context_engine.py`
  - 技能系统: `agent/skill_utils.py`

- **相关文档**:
  - [Electron 架构](.claude/rules/architecture-electron.md)
  - [Hermes 核心](.claude/rules/architecture-hermes-core.md)
  - [开发工作流](.claude/rules/development-workflow.md)

- **社区案例**:
  - [OpenClaw PR #38953](https://github.com/openclaw/openclaw/pull/38953): GPT-5 调教案例
  - [Docker SOUL.md](docker/SOUL.md): 极简人格示例

---

## 总结

Hermes Agent 的调教是一个**渐进式**的过程:

1. **从 SOUL.md 开始** → 定义基础人格
2. **用 config.yaml 调参** → 启用必要工具和限制
3. **项目级指令细化** → .hermes.md 添加项目规则
4. **监控和迭代** → 根据实际效果调整

**核心原则**:
- **清晰胜于聪明**: 简单直接的指令效果最好
- **测试驱动**: 每次调整都验证效果
- **分层管理**: 全局、项目、会话三层分离
- **拥抱实验**: AI 调教是实验性的，多试多改

**Remember**: The best prompt is the one that works for your use case.

---

**Maintained by**: Hermes Team  
**License**: MIT  
**Contribute**: [GitHub Issues](https://github.com/NousResearch/hermes-agent/issues)
