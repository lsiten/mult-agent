# Sub Agent 默认基础清单

> **版本**: v1.0.0  
> **最后更新**: 2026-04-24  
> **适用于**: Hermes Agent v2 Sub Agent 架构

---

## 📋 概述

本文档定义 Sub Agent 的默认配置清单，包括目录结构、Skills 继承规则、环境变量、配置文件模板等。

---

## 📁 目录结构

### 1. Profile 目录（运行时环境）

**位置**: `~/Library/Application Support/hermes-agent-electron/org/profiles/org-{agent_id}/`

```
profiles/org-{agent_id}/
├── SOUL.md                 # 身份文档（简化版）
├── config.yaml             # Agent 配置（继承自主 Agent）
├── .env                    # 环境变量（API keys，同步自主 Agent）
├── .runtime_token          # 运行时认证 token（同步自主 Agent）
├── skills/                 # 继承的 Skills（按 inheritable 标记）
│   ├── github/
│   ├── web-access/
│   └── ...
├── sessions/               # 会话历史
│   └── SESSION-*.json
├── logs/                   # 运行日志
│   ├── agent.log
│   └── gateway.log
├── memories/               # Agent 记忆
│   └── *.md
└── cron/                   # 定时任务配置
    └── *.yaml
```

**创建时机**: Sub Agent 首次启动时自动创建  
**清理规则**: 删除 `profiles/org-{agent_id}/org/` 冗余子目录（如存在）

---

### 2. Workspace 目录（工作成果）

**位置**: `~/Library/Application Support/hermes-agent-electron/org/workspaces/`

```
workspaces/
├── companies/
│   └── {company_id}-{company_slug}/
│       └── shared_resources/      # 公司级共享资源
├── departments/
│   └── {department_id}-{dept_slug}/
│       └── shared_resources/      # 部门级共享资源
├── positions/
│   └── {position_id}-{pos_slug}/
│       └── templates/             # 岗位模板
└── agents/
    └── {agent_id}-{agent_slug}/   # Agent 个人工作区
        ├── outputs/               # 任务产出物
        ├── reports/               # 生成的报告
        └── workspace.json         # 工作区元数据
```

**workspace.json 示例**:
```json
{
  "agent_id": 1,
  "profile_home": "/path/to/profile",
  "created_at": "2026-04-24T17:00:00Z",
  "type": "agent_workspace",
  "hierarchy": {
    "agent": { "id": 1, "name": "小a", "slug": "xiao-a" },
    "position": { "id": 1, "name": "助理", "slug": "zhu-li" },
    "department": { "id": 1, "name": "技术部", "slug": "ji-shu-bu" },
    "company": { "id": 1, "name": "示例公司", "slug": "shi-li-gong-si" }
  }
}
```

---

## 🔧 Skills 继承规则

### 继承条件

Skills 从主 Agent 继承需满足以下任一条件（在 skill.yaml 中）:

```yaml
inheritable: true      # 显式标记可继承
# 或
visibility: public     # 公开可见的 Skill
```

**默认行为**: 如果不包含这两个字段，默认为 `private`，**不继承**。

---

### 推荐的可继承 Skills 清单

#### 基础工具类（推荐全部继承）
- `github` - GitHub 工作流
- `web-access` - Web 访问
- `automation` - 自动化脚本
- `diagramming` - 图表生成
- `productivity` - 生产力工具

#### 开发类（根据岗位选择）
- `devops` - DevOps 工具
- `mlops` - MLOps 工具
- `data-science` - 数据科学
- `domain-intel` - 领域智能

#### 研究类（通用）
- `research` - 研究工具
- `note-taking` - 笔记管理
- `feeds` - 信息订阅

#### 专项类（按需）
- `apple` - Apple 生态
- `email` - 邮件管理
- `media` - 媒体处理
- `social-media` - 社交媒体
- `smart-home` - 智能家居

---

### Skills 继承流程

```
主 Agent 启动
  ↓
Sub Agent 启动时调用 inheritSkills()
  ↓
扫描主 Agent skills/ 目录
  ↓
逐个读取 skill.yaml
  ↓
检查 inheritable 或 visibility 字段
  ↓
符合条件 → 递归复制到 Sub Agent skills/
  ↓
记录继承日志（已继承数量、跳过数量）
```

**日志示例**:
```
[SubAgent:1] ✓ Inherited: github
[SubAgent:1] ✓ Inherited: web-access
[SubAgent:1] ✗ Skipped: dogfood (not inheritable)
[SubAgent:1] Skills inheritance: 15 inherited, 8 skipped
```

---

## 📄 SOUL.md 模板

### 简化版格式（默认）

```markdown
# {agent_name}

## 身份信息
- **员工编号**: {agent_id}
- **岗位**: {position_name}
- **部门**: {department_name}
- **公司**: {company_name}

## 职责描述
{position_name}的核心职责。

## 服务目标
提供专业、高效的服务。

## 工作空间

### Profile 目录（运行时环境）
- **位置**: \`{profile_home}\`
- **包含**: 配置、会话、记忆、技能、日志

### Workspace 目录（工作成果）
- **个人工作区**: \`{agent_workspace}\`
- **岗位空间**: \`{position_workspace}\`
- **部门空间**: \`{department_workspace}\`
- **公司空间**: \`{company_workspace}\`

---

⚙️ **技术能力**:
- Skills 位于 \`skills/\` 目录（Python 自动发现）
- Tools 配置见 \`config.yaml\` 的 \`toolsets\` 字段
```

**关键变更**（相比旧版本）：
- ❌ 删除：Skills 列表（不再枚举具体 Skills）
- ❌ 删除：Tools 列表（不再枚举具体 Tools）
- ✅ 新增：工作空间路径说明
- ✅ 保留：身份信息、职责描述

**设计理念**: 身份与技术能力分离，技术能力通过文件系统体现。

---

## 🌍 环境变量清单

### Profile 相关

```bash
# 主 Profile 目录（Sub Agent 使用独立 Profile）
HERMES_HOME=/path/to/profiles/org-{agent_id}

# Agent 身份标识
HERMES_AGENT_ID={agent_id}
HERMES_COMPANY_ID={company_id}
HERMES_DEPARTMENT_ID={department_id}
HERMES_POSITION_ID={position_id}
```

### Workspace 相关

```bash
# Agent 个人工作区
HERMES_AGENT_WORKSPACE=/path/to/workspaces/agents/{agent_id}-{slug}

# 岗位空间（共享模板）
HERMES_POSITION_WORKSPACE=/path/to/workspaces/positions/{position_id}-{slug}

# 部门空间（共享资源）
HERMES_DEPARTMENT_WORKSPACE=/path/to/workspaces/departments/{department_id}-{slug}

# 公司空间（共享资源）
HERMES_COMPANY_WORKSPACE=/path/to/workspaces/companies/{company_id}-{slug}

# 组织数据库
HERMES_ORG_DB=/path/to/org/org.db
```

### Sub Agent 模式标记

```bash
# 标记当前为 Sub Agent 模式
HERMES_SUB_AGENT_MODE=1

# 跳过 Parent Gateway 检查
HERMES_SKIP_PARENT_CHECK=1

# Gateway 端口和主机
API_SERVER_PORT={dynamic_port}
API_SERVER_HOST=127.0.0.1

# 认证 Token
HERMES_AUDIT_TOKEN={64_char_hex}
HERMES_GATEWAY_TOKEN={main_gateway_token}
```

---

## ⚙️ config.yaml 继承规则

### 继承字段（从主 Agent）

```yaml
# 模型配置（必须继承）
model: volcengine/ark-code-latest
providers: {}
fallback_providers: []

# Toolsets（必须继承）
toolsets:
  - hermes-cli

# Agent 行为配置
agent:
  max_turns: 90
  gateway_timeout: 1800
  tool_use_enforcement: auto

# Terminal 配置
terminal:
  backend: local
  timeout: 180
  persistent_shell: true

# Browser 配置
browser:
  inactivity_timeout: 120
  command_timeout: 30

# 文件读取限制
file_read_max_chars: 100000
```

---

## 🗄️ org.db 数据库查询

### 层级信息查询（buildWorkspaceStructure() 使用）

```sql
SELECT
  a.id as agent_id, a.name as agent_name,
  p.id as position_id, p.name as position_name,
  d.id as department_id, d.name as department_name,
  c.id as company_id, c.name as company_name
FROM agents a
JOIN positions p ON a.position_id = p.id
JOIN departments d ON p.department_id = d.id
JOIN companies c ON d.company_id = c.id
WHERE a.id = ?
```

---

## 🚀 启动流程

### Sub Agent 启动步骤

```
1. SubAgentGatewayService.start()
   ↓
2. buildWorkspaceStructure()
   - 查询 org.db 获取层级信息
   ↓
3. ensureProfileDirectory()
   - 创建 Profile 目录
   - 创建 Workspace 目录（4 层）
   - 清理冗余 org/ 子目录
   - 调用 inheritSkills()
   - 生成 SOUL.md
   - 同步 .env 和 .runtime_token
   ↓
4. buildEnvironment()
   - 构建环境变量
   ↓
5. processManager.start()
   - 启动 Python Gateway
   ↓
6. healthMonitor.waitUntilHealthy()
   - 等待健康检查通过
```

---

## 📝 验收清单

### 目录结构验证

```bash
# 验证 Profile 目录
ls -la ~/Library/Application\ Support/hermes-agent-electron/org/profiles/org-{id}/
# 预期：sessions/ logs/ memories/ skills/ SOUL.md config.yaml .env

# 验证 Workspace 目录
ls -la ~/Library/Application\ Support/hermes-agent-electron/org/workspaces/agents/{id}-{slug}/
# 预期：outputs/ reports/ workspace.json

# 验证无冗余 org/ 子目录
test ! -d ~/Library/Application\ Support/hermes-agent-electron/org/profiles/org-{id}/org
# 预期：退出码 0
```

### Skills 继承验证

```bash
# 列出继承的 Skills
ls ~/Library/Application\ Support/hermes-agent-electron/org/profiles/org-{id}/skills/

# 对比主 Agent Skills
ls ~/Library/Application\ Support/hermes-agent-electron/skills/
```

### SOUL.md 验证

```bash
# 查看内容
cat ~/Library/Application\ Support/hermes-agent-electron/org/profiles/org-{id}/SOUL.md
# 预期：只包含身份信息，不列举 Skills/Tools
```

---

## 🛠️ 故障排查

### Sub Agent 启动失败

1. 检查 org.db 是否存在
   ```bash
   ls -la ~/Library/Application\ Support/hermes-agent-electron/org/org.db
   ```

2. 检查端口占用
   ```bash
   lsof -i:{port}
   ```

3. 查看启动日志
   ```bash
   tail -f ~/Library/Application\ Support/hermes-agent-electron/org/profiles/org-{id}/logs/gateway.log
   ```

### Skills 继承失败

1. 检查主 Agent skills/ 目录
   ```bash
   ls -la ~/Library/Application\ Support/hermes-agent-electron/skills/
   ```

2. 检查 skill.yaml 继承标记
   ```bash
   grep -r "inheritable\|visibility" ~/Library/Application\ Support/hermes-agent-electron/skills/*/skill.yaml
   ```

---

## 📚 参考资料

- **代码实现**: `electron-app/src/services/sub-agent-gateway.service.ts`
- **相关 Commit**: 0a2f6c6
- **设计文档**: `.cs-project/sessions/SESSION-20260424-002/plan.md`

---

**版本**: v1.0.0 | **日期**: 2026-04-24 | **维护者**: 雷诗城
