---
name: company-org-architect
description: Design company orgs for Hermes multi-agent teams. Invoke when users want to generate, review, or refine company -> department -> position -> agent structures. Inspired by garrytan/gstack's 23-specialist role methodology. Supports MCP direct creation via existing org APIs using Hermes native MCP client. Includes automatic MCP configuration capability.
version: 1.4.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [organization, org-design, multi-agent, company, planning, gstack, mcp, native-mcp, organization-architecture, auto-config]
    related_skills: [plan, writing-plans, hermes-agent, mcporter, native-mcp]
---

# Company Org Architect

基于 **[garrytan/gstack](https://github.com/garrytan/gstack)** 的角色化协作思路，以及当前仓库已有的企业组织架构模型，设计适合真实业务需要的公司组织架构。

gstack 的核心理念是：*一个人可以像 20 人团队一样交付产品*，关键在于 **专业化分工 + 流程化协作**。本 skill 将这个思想应用于企业多 Agent 组织设计，让每个专业化角色对应一个专业化 AI Agent。

这个 skill 不会默认套用单一模板，而是先判断公司的业务模式、发展阶段、协作复杂度，再生成适配的 `公司 -> 部门 -> 岗位 -> Agent` 四级组织方案。

## 何时使用

当用户出现以下意图时使用本 skill：

- 想生成公司组织架构
- 想设计多 Agent 团队编制
- 想把真实业务映射为 `公司 / 部门 / 岗位 / Agent`
- 想补齐平台工程、基础设施、共享服务、业务线协同的组织设计
- 想输出组织架构提案、岗位编制、负责人链路或 Agent 分工
- 想为 Hermes 的组织架构模块准备可落地的结构草案

## 核心原则

1. **真实需求优先**
   - 不要一开始就套固定部门模板。
   - 先识别公司属于研发驱动、销售交付、平台中台、数据处理维护，还是混合型组织。

2. **组织设计先于生成**
   - 先做诊断和提案，再做正式生成。
   - 如果业务目标、团队规模、交付模式、关键约束不清晰，先提问，不要猜。

3. **确认前不得创建**
   - 在用户明确确认组织架构方案前，**不得创建文件、数据草稿、结构表、种子数据或正式输出物**。
   - 允许先输出"提案版"文本供用户审阅。

4. **对齐本项目模型**
   - 必须与当前仓库组织架构模型对齐，统一使用四级结构：
     - `company`
     - `department`
     - `position`
     - `agent`
   - 组织字段、职责描述、负责人关系、工作空间和模板继承逻辑，应尽量贴合仓库现有文档与实现。

5. **平台工程与共享服务可显式建模**
   - 当业务复杂度较高时，优先考虑把以下能力从业务线中抽离成共享能力：
     - 平台工程
     - 基础设施 / SRE
     - QA / 测试保障
     - 安全 / 合规
     - 发布 / 交付 / 运维
     - 数据治理 / 数据运营

## 真实业务映射方法

用户提供真实业务后，按以下四步逐层映射到四个维度：

### 第一步：业务整体 → 公司 (Company)

**映射规则**：
- 用户描述的整个业务 → 一个 `Company`
- 提取一句话作为公司的核心 `goal`
- 补充描述业务范围、发展阶段、约束条件到 `description`

**示例**：
> 用户说："我要做一个 AI 辅助代码开发平台"
> 
> ↓ 映射
> - `name`: AI 代码开发平台
> - `goal`: 提供智能化的代码辅助开发服务，提升研发效率
> - `description`: 面向开发者的 AI 编程助手平台，包含模型服务、前端 IDE 插件、后端 API 服务

### 第二步：业务能力域 → 部门 (Department)

**映射规则**：
- 用户提到的"业务线"、"大模块"、"职能域" → 一个 `Department`
- 如果提到多个业务线，每个业务线是独立部门
- 如果提到"平台"、"中台"、"基础设施"，抽离为独立共享部门
- 能力相近但可独立的业务 → 合并为一个部门，避免过度拆分

**判断口诀**：
> 业务线是部门，共享能力抽成中台，职能相近不拆分

**示例**：
> 用户说："需要做前端产品、后端服务、还有平台运维"
> 
> ↓ 映射
> - 产品研发部 → 负责前端产品
> - 平台工程部 → 负责后端服务 + 平台运维（合并）

### 第三步：职责范围 → 岗位 (Position)

**映射规则**：
- 部门内的细分职责 → 一个 `Position`
- 每个岗位必须有明确的"目标"和"职责范围"
- 管理职责需要标记 `is_management_position = true`
- 需要给出预期编制 `headcount`（可根据业务规模估算）

**判断口诀**：
> 一个职责一个岗位，相近职责合并编制，管理岗明确标记

**示例**：
> 部门：平台工程部
> 
> ↓ 映射
> - 平台架构师（管理岗，编制 1）→ 负责架构设计
> - 后端开发工程师（编制 2-3）→ 负责 API 开发
> - 运维工程师（编制 1）→ 负责部署运维

### 第四步：执行人 → Agent

**映射规则**：
- 每个编制名额 → 一个 `Agent`
- 每个 Agent 必须明确归属哪个 `department` 和哪个 `position`
- 设置 `manager_agent_id` 汇报对象，形成清晰负责人链路
- 标记 `leadership_role`: `primary`（主负责人）/ `deputy`（副负责人）/ `none`（普通成员）

**判断口诀**：
> 一个人头一个 Agent，每个人归属唯一岗位，汇报链路清晰不交叉

### 完整映射示例

| 用户描述 | 映射维度 | 结果 |
|---------|---------|------|
| "我们要做电商平台" | 公司 | `Company: 电商平台` |
| "需要用户端、商家端、后台管理" | 部门 | `Department: 用户端业务部`, `Department: 商家端业务部`, `Department: 平台工程部` |
| "前端、后端、运维各要人" | 岗位 | `Position: 前端开发`, `Position: 后端开发`, `Position: 运维工程师` |
| "张三管前端，李四做后端" | Agent | `Agent: 张三 (前端开发, 用户端业务部, primary)`, `Agent: 李四 (后端开发, 平台工程部, primary)` |

### 常见映射错误规避

| ❌ 错误做法 | ✅ 正确做法 |
|-----------|------------|
| 把一个业务拆成多个公司 | 一个完整业务 = 一个公司 |
| 把所有职责堆在一个部门 | 根据能力域拆分多个部门 |
| 一个岗位包含多种不相关职责 | 拆分到多个岗位，每个岗位职责单一 |
| 跳过岗位直接到 Agent | 必须经过部门→岗位，Agent 必须归属岗位 |
| 一个 Agent 挂多个岗位 | 一个 Agent 只归属一个岗位 |

### 搜索去重规则

对于猎头/招聘类业务，必须遵循人才搜索去重规则：
- 如果搜索到的人才**已经在人才库** → 检查信息是否有更新
- 如果信息有更新 → **更新人才信息**，标记更新时间
- 如果信息无变化 → 复用已有记录，不创建重复
- 只有全新人才 → 才新增到人才库

### 用户需求调整处理

当用户提出调整需求（例如："需求不需要审核合理性，只需要确认信息是否准确"）：

1. **保留整体四级结构框架不变** - 不要重新设计全公司
2. **只修改对应岗位的岗位职责描述** - 对齐用户新要求
3. **不需要调整岗位/Agent 数量** - 除非用户明确说增减编制
4. **输出更新后的完整表格给用户确认** - 展示调整后的全貌

## 设计依据

设计时优先参考当前仓库已有约束：

- `docs/Hermes Agent 企业组织架构管理平台.md`
- `docs/企业组织架构页面编排说明.md`
- `docs/sub-agent-defaults.md`

重点保持一致的内容：

- `公司 -> 部门 -> 岗位 -> Agent` 的四级结构
- 岗位承接部门目标，Agent 归属于具体岗位
- 管理岗位可通过 `is_management_position` 表达
- Agent 负责人关系可通过 `manager_agent_id`、`leadership_role` 表达
- 个人工作空间与公司工作空间需要遵守隔离原则
- 岗位模板、技能继承、共享资源、工作目录应能映射到现有系统

## gstack 风格映射

参考 `gstack` 的 23 个专业化角色分工思路，但不要机械复制名称，而是将其抽象为组织能力层：

| gstack 角色 / 技能 | 核心能力 | 组织能力映射 | 常见落位 |
|---|---|---|---|
| **CEO / office-hours / plan-ceo-review** | 战略思考，范围调整，挑战前提 | 战略与目标对齐 | 公司层 CEO / 产品战略部门 |
| **Eng Manager / plan-eng-review** | 架构锁定，强制暴露假设 | 工程组织与架构治理 | 平台工程 / 研发管理岗位 |
| **Senior Designer / plan-design-review / design-review** | AI Slop 检测，设计维度评分 | 体验与交互设计 | 设计部门 / 产品体验岗位 |
| **DX Lead / plan-devex-review / devex-review** | 开发者体验优化 | 开发者体验与工具链 | 平台工程 / 开发者关系 |
| **Staff Engineer / review** | 质量把关，发现生产级 Bug | 评审与质量把关 | 架构评审 / 资深工程师 |
| **CSO (Chief Security Officer) / cso** | OWASP + STRIDE 威胁建模 | 安全与合规控制 | 安全岗位 / 平台治理 |
| **QA Lead / qa / qa-only** | 真实测试，原子修复 | 测试与验收保障 | QA 部门 / 测试平台主管 |
| **Release Engineer / ship / land-and-deploy** | 流程化交付，发布验证 | 发布与交付协同 | DevOps / 发布 / 运维岗位 |
| **investigate** | 系统性根因调试 | 问题诊断与排障 | SRE / 技术支持 |
| **document-release** | 文档同步更新 | 技术写作与文档 | 技术文档 / Developer Relations |
| **retro** | 每周工程回顾 | 持续改进 | 工程管理 |
| **autoplan** | 自动流水线评审 | 端到端自动化规划 | 产品研发流程 |

结论：本 skill 应把这些能力变成"是否需要设部门、岗位还是共享服务"的组织判断，而不是固定写死为单独部门。

根据 gstack 哲学：**专业化分工让每个人（每个 Agent）只做自己擅长的事**，这与我们的四级组织模型天然契合。

## 标准工作流

### 阶段 1：识别真实需求

先向用户收集或确认以下信息：

- 公司名称
- 行业 / 业务类型
- 发展阶段：0-1、增长期、成熟期
- 主要目标：研发效率、销售转化、交付质量、数据处理、运营稳定性等
- 当前团队规模或预期编制
- 是否存在多业务线
- 是否需要平台中台 / 基础设施 / 共享服务
- 是否需要销售、交付、客户成功、运营、数据维护等职能
- 是否有隐私隔离、审批链、负责人链路等约束

如果缺少关键信息，先提 3-8 个高价值问题，不要直接生成架构。

### 阶段 2：判断组织类型

基于用户输入，判断最接近的组织模式：

- **研发驱动型**
  - 核心矛盾在产品研发、平台建设、质量保障
- **销售交付型**
  - 核心矛盾在销售、客户成功、实施交付、运营协同
- **数据处理维护型**
  - 核心矛盾在数据采集、清洗、标注、质检、运营维护
- **平台中台型**
  - 核心矛盾在平台工程、基础设施、共享能力、业务线协同
- **混合型**
  - 同时具备两类或以上特征，需要采用“共享能力 + 业务线”的混合架构

默认优先考虑“平台中台 + 业务线协同”的组织方式，但仅在业务复杂度足够时采用。

### 阶段 3：映射为四级组织结构

生成提案时必须显式拆成以下四层：

#### 1. Company

至少包含：

- `name`
- `goal`
- `description`

#### 2. Department

每个部门至少包含：

- `name`
- `goal`
- `responsibilities`
- `manager`
- 是否需要上级部门或管理部门

#### 3. Position

每个岗位至少包含：

- `name`
- `goal`
- `responsibilities`
- `headcount`
- `template_key` 或模板建议
- 是否管理岗：`is_management_position`

#### 4. Agent

每个 Agent 至少包含：

- `name`
- `department`
- `position`
- `role_summary`
- `service_goal`
- `manager_agent_id` 或负责人说明
- `leadership_role`（如 `primary` / `deputy` / `none`）

### 阶段 4：输出“提案版组织架构”

在正式生成前，先输出一版提案，建议固定包含以下内容：

1. **组织判断**
   - 说明为什么选择当前组织模式

2. **公司层目标**
   - 用 1-3 句概括公司目标与组织设计原则

3. **部门设计**
   - 列出建议部门
   - 标明哪些是业务线，哪些是平台 / 共享服务

4. **岗位设计**
   - 每个部门下的关键岗位
   - 哪些岗位是管理岗
   - 每个岗位建议编制

5. **Agent 编排建议**
   - 初始 Agent 列表或最小团队编制
   - 负责人链路
   - 关键协作关系

6. **模板与继承建议**
   - 哪些岗位需要独立 Profile 模板
   - 哪些能力适合做 inheritable skills / shared resources

### 阶段 5：强制确认闸门

输出提案后，必须明确向用户确认，例如：

> “这是提案版组织架构。请确认是否按此结构生成正式组织方案；如果需要，我可以继续调整部门、岗位、编制或负责人链路。”

在用户没有明确确认前：

- 不创建文件
- 不生成正式表格
- 不落地种子数据
- 不写入配置或脚本

如果用户要求调整：

- 仅修改提案
- 再次发起确认

### 阶段 6：确认后再正式生成

只有在用户明确确认后，才可以输出正式结果。正式结果建议按以下顺序给出：

1. 公司摘要
2. 部门表
3. 岗位表
4. Agent 编排表
5. 管理链路说明
6. 模板 / Skill 继承建议
7. 工作空间与权限说明

如果用户进一步要求“写入文件”或“生成可导入数据”，再执行对应文件创建。

## 推荐的默认组织能力清单

不是所有公司都要全部启用，但设计时默认从这些能力域中挑选：

- 战略 / 产品
- 平台工程
- 基础设施 / DevOps / SRE
- 业务研发或业务交付
- 设计 / 用户体验
- QA / 测试保障
- 安全 / 合规
- 数据处理 / 数据运营 / 数据维护
- 销售 / 解决方案 / 客户成功
- 运营 / 支撑 / 共享服务

## 默认输出格式

如果用户未指定格式，优先输出为 Markdown，并使用以下结构：

### 公司摘要

- 公司名称
- 公司目标
- 组织模式
- 设计原则

### 部门表

| 部门 | 类型 | 目标 | 核心职责 | 负责人 |
|---|---|---|---|---|

### 岗位表

| 部门 | 岗位 | 是否管理岗 | 编制 | 目标 | 模板建议 |
|---|---|---|---|---|---|

### Agent 表

| Agent | 所属部门 | 所属岗位 | 角色摘要 | 服务目标 | 汇报对象 |
|---|---|---|---|---|---|

## 组织设计守则

- 从业务目标倒推组织，不从职位头衔倒推组织
- 能做共享服务的，不要过早复制到每条业务线
- 能由岗位承接的，不要直接把职责堆到 Agent 层
- 编制不足时，优先合并部门，不要堆叠空岗位
- 质量、安全、发布可以先作为共享岗位，再视规模升级为独立部门
- 避免出现职责模糊、双重汇报链、平台与业务线边界不清
- 若用户强调隐私隔离，必须显式保留个人空间与公司空间隔离原则

## 行业特定规则

### 搜索去重规则（招聘/猎头类业务）
针对猎头/招聘类业务的特殊要求：
- 搜索人才后，**第一步必须先检查人才库**
- 如果人才已在库中，检查是否有信息更新
  - 有更新 → 更新人才信息
  - 无更新 → 直接复用已有信息
- 如果人才不在库中 → 新增入库
- **禁止重复创建同一个人才**

### 招聘/猎头业务完整流程遵循
针对猎头/招聘业务，必须遵循标准业务流程：
1. **拿到甲方招聘需求** → 需求分析
2. **需求分析阶段**：
   - 分析属于哪个甲方公司
   - 解析 JD 信息提取关键词
   - 提取需求相关指标（薪资范围、工作年限、技能要求、学历要求等）
   - 确定指标优先级（哪些硬性要求必须满足，哪些软性要求可放宽）
   - 信息不完整/不清楚的地方 → **必须询问甲方对接人，补齐信息**
   - 信息完整确认后 → 进入下一阶段
3. **交给人才搜索** → 按需求关键词搜索
4. **人才搜索阶段**：
   - 按需求信息搜索相关人才简历
   - 遵循搜索去重规则（检查人才库，更新或新增）
   - 逐个评估候选人与需求匹配度
   - 给出匹配度排名列表
5. **选择确认** → 推荐给甲方确认
6. **全流程跟踪管理** → 直到需求关闭
7. **存档归档** → 所有需求、人才信息都要存档备查

## gstack 带给组织设计的关键启示

从 garrytan/gstack 学到的核心方法论，对我们多 Agent 组织设计有重要启示：

### 1. **专业化分工**
gstack 有 23 个专家角色，每个角色专注自己擅长的事。同理，在多 Agent 组织中：
- 让 CEO Agent 做战略思考，不要让他做 QA
- 让 Security Agent 做安全审计，不要让他做前端设计
- 专业化产生高质量，通才适合创业初期，专家适合规模化

### 2. **流程化协作**
gstack 遵循固定节奏：`Think → Plan → Build → Review → Test → Ship → Reflect`。  
在我们的组织设计中：
- 每个阶段对应不同部门/岗位/Agent
- 上游产出是下游输入，不要跳步
- 流程减少沟通成本，让协作可预测

### 3. **用户主权**
gstack 口号：**"AI models recommend, users decide"**（AI 推荐，用户决策）。  
在我们的设计中：
- 先出提案，用户确认后再生成
- 设计过程保持问题开放性，不替用户做决定
- 最终决定权始终在用户手中

### 4. **持续学习**
gstack 的 `/learn` 技能管理跨会话学到的模式。  
在我们的组织中：
- 每个 Agent 有独立 Profile 和记忆
- 经验会在运行中复利增长
- 组织本身也会随着业务迭代而进化

### 5. **安全分层**
gstack 有多层防御对抗 prompt 注入。  
在我们的组织中：
- 权限隔离是多层的：公司空间 / 个人空间分离
- 资产继承有白名单，不默认全开放
- 敏感信息永远不会向下继承

## 回答风格要求

- 优先使用清晰表格和结构化列表
- 明确写出“这是提案版”还是“这是确认后的正式版”
- 如果仍有关键未知项，先提问，不要假装完整
- 如果用户要的是“组织设计”，就不要直接写文件
- 如果用户要的是“生成结果”，先确认，再生成

## 一个最小示例

用户说：

> “我想做一个 AI 产品公司，现阶段需要平台工程、业务研发、设计、QA 和后续销售交付能力，先给我出组织架构。”

你应该：

1. 先识别这是偏“平台中台 + 研发驱动”的混合型组织
2. 给出提案版结构，例如：
   - 公司层：产品目标与技术战略
   - 部门层：产品与战略、平台工程、业务研发、设计体验、质量与发布、销售交付（可后置）
   - 岗位层：平台负责人、架构工程师、业务工程师、产品设计师、QA、发布工程师等
   - Agent 层：列出最小编制与负责人链
3. 明确要求用户确认
3. 用户确认后，再生成正式版组织架构

## MCP 接口集成

### 自动配置能力

当需要集成 MCP 时，你可以自动读取环境信息生成配置：

1. **读取 Gateway Token**：从环境变量 `HERMES_GATEWAY_TOKEN` 获取真实 token
2. **Gateway 默认地址**：`http://localhost:8642`（除非用户指定其他地址）
3. **自动生成完整配置**，用户只需要复制粘贴到 `config.yaml`

自动配置步骤：
```
1. 读取: process.env.HERMES_GATEWAY_TOKEN
2. 读取: process.env.HERMES_GATEWAY_HOST or use default "http://localhost:8642"
3. 生成完整 yaml 配置片段，包含正确的 token
4. 告诉用户如何粘贴到配置文件，然后重启生效
```

### 集成方式

本项目组织架构能力已经完整实现 REST API，并且 Hermes 原生支持 **MCP (Model Context Protocol)** 客户端。在 `config.yaml` 中配置 MCP 服务后，所有组织架构操作都可以通过 MCP 直接调用。

配置示例（自动生成）：
```yaml
mcp_servers:
  hermes_org:
    url: "{{GATEWAY_URL}}/mcp"
    headers:
      Authorization: "Bearer {{GATEWAY_TOKEN}}"
```

配置完成后，以下 26 个接口会自动被发现并注册为 MCP 工具：

### 可用 MCP 工具

配置后，Hermes 会自动发现所有工具。根据 native-mcp 命名规范，点会被替换为下划线（`org.create_company` → `mcp_hermes_org_org_create_company`）。

| 操作 | MCP 工具名（完整） | 说明 |
|------|-------------------|------|
| 获取组织树 | `mcp_hermes_org_org_get_tree` | 获取完整四级结构树 |
| 创建公司 | `mcp_hermes_org_org_create_company` | 创建新公司 |
| 更新公司 | `mcp_hermes_org_org_update_company` | 更新公司信息 |
| 删除公司 | `mcp_hermes_org_org_delete_company` | 删除公司（级联删除所有下属） |
| 创建部门 | `mcp_hermes_org_org_create_department` | 创建新部门 |
| 更新部门 | `mcp_hermes_org_org_update_department` | 更新部门信息 |
| 删除部门 | `mcp_hermes_org_org_delete_department` | 删除部门 |
| 创建岗位 | `mcp_hermes_org_org_create_position` | 创建新岗位 |
| 更新岗位 | `mcp_hermes_org_org_update_position` | 更新岗位信息 |
| 删除岗位 | `mcp_hermes_org_org_delete_position` | 删除岗位 |
| 创建 Agent | `mcp_hermes_org_org_create_agent` | 创建新 Agent |
| 获取 Agent 详情 | `mcp_hermes_org_org_get_agent` | 获取完整 Agent 信息 |
| 更新 Agent | `mcp_hermes_org_org_update_agent` | 更新 Agent 信息 |
| 删除 Agent | `mcp_hermes_org_org_delete_agent` | 删除 Agent |
| 生成 Profile | `mcp_hermes_org_org_provision_profile` | 触发 Agent Profile 生成 |
| 快捷操作：设置 Agent 负责人 | `mcp_hermes_org_org_set_agent_as_leader` | 设置为 primary/deputy/none |
| 快捷操作：设置岗位管理岗 | `mcp_hermes_org_org_set_position_as_management` | 标记/取消管理岗位 |
| 快捷操作：设置部门管理部门 | `mcp_hermes_org_org_set_department_as_management` | 标记/取消管理部门 |
| 获取推荐经理 | `mcp_hermes_org_org_get_recommended_manager` | 获取推荐汇报对象 |
| 刷新主资产 | `mcp_hermes_org_org_refresh_master_assets` | 扫描主 Agent 可继承资产 |
| 列出主资产 | `mcp_hermes_org_org_list_master_assets` | 列出可继承资产 |
| 更新主资产 | `mcp_hermes_org_org_update_master_asset` | 更新资产可见性 |
| 设置 Provider 可见性 | `mcp_hermes_org_org_set_provider_visibility` | 切换 API Key 是否可继承 |
| Bootstrap 检查 | `mcp_hermes_org_org_bootstrap_check_position` | 检查岗位创建 Agent 前置条件 |
| 列出 Profile 模板 | `mcp_hermes_org_org_list_profile_templates` | 列出可用 Profile 模板 |
| 创建 Profile 模板 | `mcp_hermes_org_org_create_profile_template` | 创建新模板 |
| 更新 Profile 模板 | `mcp_hermes_org_org_update_profile_template` | 更新模板 |
| 删除 Profile 模板 | `mcp_hermes_org_org_delete_profile_template` | 删除模板 |

### 调用方式

当用户要求"创建组织架构"、"生成到数据库"、"写入系统"或"直接创建"时：

1. 确认 **MCP 服务已配置并运行**（Gateway 启动后 `/mcp` 端点自动可用）
2. 按你设计出的四级结构，**逐个调用 MCP 工具创建**：
   - 先 `org_create_company` → 获取 `company_id`
   - 再 `org_create_department` 每个部门 → 获取 `department_id`
   - 再 `org_create_position` 每个岗位 → 获取 `position_id`
   - 最后 `org_create_agent` 每个 Agent
   - 创建完成后调用 `org_provision_profile` 自动生成独立 Profile
3. 创建完成后，返回创建结果的汇总表格

### MCP 调用参数示例

```javascript
// 1. 创建公司
{
  "name": "AI 代码开发平台",
  "goal": "提供智能化的代码辅助开发服务，提升研发效率",
  "description": "面向开发者的 AI 编程助手平台，包含模型服务、前端 IDE 插件、后端 API 服务"
}

// 2. 创建部门
{
  "company_id": 1,
  "name": "产品研发部",
  "goal": "负责前端产品开发和用户体验",
  "responsibilities": "前端产品开发、用户交互设计、页面性能优化",
  "is_management_department": false
}

// 3. 创建岗位
{
  "department_id": 1,
  "name": "前端开发工程师",
  "goal": "实现产品前端界面和交互",
  "responsibilities": "- 前端组件开发\n- 交互逻辑实现\n- 页面性能优化\n- 代码评审",
  "headcount": 2,
  "is_management_position": false,
  "template_key": "default-engineer"
}

// 4. 创建 Agent
{
  "position_id": 1,
  "name": "张三",
  "role_summary": "资深前端开发工程师",
  "service_goal": "负责前端架构设计和核心组件开发",
  "leadership_role": "primary"
}

// 5. 生成独立 Profile
// 调用 org.provision_profile 传入 agent_id
// 系统自动创建工作目录、生成 SOUL.md、配置继承白名单资产
```

### 调用原则

- **必须先确认用户同意**才能调用 MCP 写入
- 严格按层级顺序创建（公司 → 部门 → 岗位 → Agent）
- 使用事务性思路：如果某一步失败，停止并告知用户错误
- 创建完成后，输出清晰的创建结果汇总（ID、名称、路径）

### 自动配置快速开始

如果你发现 MCP 还没有配置，主动执行：

```
1. 使用 execute_code 读取环境变量 HERMES_GATEWAY_TOKEN
2. 如果 token 存在，自动生成完整配置片段
3. 提供给用户复制粘贴到 $HERMES_HOME/config.yaml
4. 提示用户重启 Hermes Agent 完成配置
5. 配置生效后，工具就能自动发现，开始创建组织架构
```

如果 token 不存在，提示用户启动 Gateway 后再试，不要编造 token。

## 参考资料

- [garrytan/gstack](https://github.com/garrytan/gstack) - 23 specialists 角色化协作方法论
- `gateway/platforms/api_server_org.py` - MCP/API 实现源码
