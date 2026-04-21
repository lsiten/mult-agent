# Hermes Agent Electron-Only 改造与目录重构方案

## 1. 文档目标

本文档用于定义 Hermes Agent 从“多入口产品”收敛为“仅允许 Electron 启动”的完整实现方案。

本方案重点解决三个问题：

1. 对外只保留 Electron 作为唯一正式入口
2. CLI 与独立 Web UI 不再作为产品能力暴露
3. 当前目录结构调整为更适合桌面产品长期维护的形态

本文档只给出完整改造方案与目标目录结构，不直接执行代码目录移动。

## 2. 背景与现状

当前仓库属于多入口系统：

- Python Agent 核心对外可通过 CLI 启动
- `hermes_cli` 暴露大量交互命令
- `web/` 可独立作为浏览器 Dashboard 使用
- `electron-app/` 是一个桌面封装层，但不是唯一入口

这会带来几个长期问题：

- 产品边界不清晰，用户不知道哪一个入口才是正式入口
- 代码分层不够稳定，CLI、Web、Electron 都在争夺“启动入口”角色
- 文档、部署、打包、测试链路需要同时兼容多种运行形态，维护成本高
- Electron 无法真正成为一等公民，很多能力仍然依赖 CLI 语义

## 3. 改造目标

### 3.1 产品目标

改造完成后，Hermes Agent 对外只保留 Electron 桌面端。

对外产品形态统一为：

- 用户通过桌面应用启动 Hermes
- 桌面应用内部拉起 Python 服务
- 前端界面只作为桌面内嵌界面存在
- CLI、独立 Web UI 不再作为正式产品入口提供

### 3.2 技术目标

改造完成后应满足以下技术状态：

- Electron 是唯一正式启动壳
- Python 核心模块变为桌面内部运行时
- Web UI 变为 Electron Renderer 的内部界面层
- CLI 只保留开发辅助或迁移兜底能力
- 独立 Web Server 不再具备对外产品入口属性
- 目录结构围绕 `apps/ + packages/ + internal/` 组织

### 3.3 非目标

本次改造不以以下事项为目标：

- 不重写 Agent 核心能力
- 不推翻当前 Python 工具系统
- 不立即删除全部 CLI 代码
- 不立即删除 FastAPI 层
- 不在第一阶段引入完全新的构建系统

## 4. 目标架构

改造后的目标架构如下：

```text
Hermes Desktop (Electron)
  -> Desktop Main Process
  -> Desktop Renderer UI
  -> Desktop Internal API Layer
  -> Python Runtime Services
      -> Agent Core
      -> Tool System
      -> Session/State
      -> Gateway/Internal API
```

关键边界调整如下：

- Electron 从“其中一个入口”升级为“唯一产品入口”
- Web UI 从“独立浏览器产品”降级为“桌面内嵌界面”
- CLI 从“正式用户入口”降级为“内部开发工具”
- Python 服务从“多产品共享入口”转为“桌面内部运行时”

## 5. 目标目录结构

## 5.1 现状问题

当前目录结构的主要问题不是文件太多，而是“按技术来源堆放”，而不是“按产品边界组织”：

- `electron-app/` 与 `web/` 并列，但二者本质上属于同一个桌面产品
- `hermes_cli/` 同时承担 CLI 入口与 Web 管理服务职责，边界混杂
- Python 核心能力散落在仓库根目录和多个顶级包下，缺少清晰的桌面运行时边界

## 5.2 目标结构

建议调整为以下结构：

```text
mult-agent/
├── apps/
│   ├── electron/
│   │   ├── src/
│   │   ├── scripts/
│   │   ├── resources/
│   │   ├── tests/
│   │   └── package.json
│   └── desktop-ui/
│       ├── src/
│       ├── public/
│       ├── scripts/
│       └── package.json
├── internal/
│   ├── desktop_api/
│   │   ├── __init__.py
│   │   ├── app.py
│   │   ├── routes/
│   │   ├── services/
│   │   └── schemas/
│   ├── desktop_runtime/
│   │   ├── __init__.py
│   │   ├── bootstrap.py
│   │   ├── env.py
│   │   ├── auth.py
│   │   └── lifecycle.py
│   └── desktop_shared/
│       ├── ipc/
│       ├── api/
│       └── types/
├── packages/
│   ├── agent_core/
│   ├── tools_core/
│   ├── gateway_core/
│   ├── state_core/
│   └── automation_core/
├── legacy/
│   └── cli/
│       ├── hermes_cli/
│       ├── cli.py
│       └── migration_wrappers/
├── research/
│   ├── environments/
│   └── experiments/
├── docs/
├── tests/
├── pyproject.toml
└── package.json
```

## 5.3 目录映射关系

建议按如下映射迁移：

| 当前目录/文件                        | 目标位置                                        | 说明                   |
| ------------------------------ | ------------------------------------------- | -------------------- |
| `electron-app/`                | `apps/electron/`                            | Electron 主产品目录       |
| `web/`                         | `apps/desktop-ui/`                          | 桌面内嵌 UI，不再以浏览器产品对外暴露 |
| `hermes_cli/web_server.py`     | `internal/desktop_api/`                     | 拆成桌面内部 API 服务        |
| `hermes_cli/`                  | `legacy/cli/hermes_cli/` 或按模块拆入 `internal/` | CLI 降级为兼容层           |
| `agent/`                       | `packages/agent_core/`                      | Agent 核心能力           |
| `tools/`                       | `packages/tools_core/`                      | 工具系统核心               |
| `gateway/`                     | `packages/gateway_core/`                    | 仅保留内部服务能力            |
| `hermes_state.py` 及相关状态模块      | `packages/state_core/`                      | 状态与持久化               |
| `cron/`                        | `packages/automation_core/`                 | 自动化与调度               |
| `environments/`、`experiments/` | `research/`                                 | 非产品主线能力独立归档          |

## 5.4 目录结构调整原则

目录改造必须遵循以下原则：

1. 先建立新目录，再逐步迁移代码
2. 先做逻辑去耦，再做物理移动
3. 保留兼容层，避免一次性切断所有旧路径
4. 以产品边界为主，而不是以语言或历史模块边界为主

## 6. 模块分层方案

## 6.1 Electron 层

`apps/electron/` 作为唯一正式入口，负责：

- 主进程生命周期
- 窗口管理
- 资源准备
- 内部服务拉起
- IPC 暴露
- 桌面环境错误恢复

该层不直接承载 Agent 业务逻辑，只负责桌面壳能力。

## 6.2 Desktop UI 层

`apps/desktop-ui/` 负责：

- 配置界面
- Onboarding
- 会话与状态展示
- 开发诊断页面
- 桌面设置页

该层只服务于 Electron Renderer，不再承担独立浏览器产品职责。

## 6.3 Desktop API 层

从当前 `hermes_cli/web_server.py` 中拆出 `internal/desktop_api/`，负责：

- 提供桌面 UI 所需 API
- 统一配置读写接口
- 状态查询接口
- 桌面插件和主题接口
- 桌面专用认证逻辑

注意：

- 该层是桌面内部 API，不再作为公开 Web 服务产品暴露
- 后续要逐步把高频能力迁往 IPC，减少桌面 UI 对 HTTP 的依赖

## 6.4 Python Core 层

`packages/` 下的核心模块负责长期稳定能力：

- `agent_core`：模型对话、提示组装、上下文、记忆
- `tools_core`：工具发现、注册、调度、执行
- `gateway_core`：内部服务协调、API Server、消息能力抽象
- `state_core`：会话、状态、索引、持久化
- `automation_core`：Cron、任务调度、自动化

这些模块不再面向用户直接暴露入口，而是通过 Electron 内部运行时被调用。

## 6.5 Legacy CLI 层

`legacy/cli/` 只承担短期兼容与开发辅助角色。

保留目的：

- 历史脚本兼容
- 内部开发调试
- 数据迁移工具
- 特定场景的降级恢复

长期目标：

- 不再面向终端用户开放
- 不进入正式产品文档主路径
- 最终缩减为迁移辅助层

## 7. 启动链路改造方案

## 7.1 当前链路

当前对外存在多条启动路径：

- `hermes`
- `hermes chat`
- `hermes gateway`
- `hermes dashboard`
- `electron-app`

这导致用户和代码都无法形成“唯一启动真相”。

## 7.2 目标链路

改造后的唯一正式链路：

```text
用户启动 Electron
  -> Electron Main Process
  -> Desktop Runtime Bootstrap
  -> Python Internal Services
  -> Desktop API / IPC
  -> Renderer UI
```

目标状态下：

- 用户不能再通过 CLI 获得正式产品体验
- 用户不能再单独打开 Web Dashboard 作为产品入口
- Web UI 只能运行在 Electron 环境内

## 7.3 关键实现点

### A. 启动门禁

在 Python 入口层加入统一产品模式控制：

- 引入环境变量：`HERMES_PRODUCT_MODE=electron-only`
- 在 Electron 启动时强制写入
- Python 入口检测到该模式后，禁止独立 CLI 和 Dashboard 启动

推荐限制项：

- 禁止 `hermes`
- 禁止 `hermes chat`
- 禁止 `hermes gateway`
- 禁止 `hermes dashboard`
- 禁止独立 `web` 模式启动

允许项：

- Electron 内部启动器
- 指定内部维护命令
- 显式 `DEV_INTERNAL=1` 的开发诊断模式

### B. Electron 内部运行时启动器

新增内部服务启动器，例如：

```text
internal/desktop_runtime/bootstrap.py
```

职责：

- 设置 `HERMES_ELECTRON_MODE`
- 设置 `HERMES_PRODUCT_MODE`
- 组装桌面运行环境变量
- 拉起 Desktop API
- 拉起 Gateway/Internal Service
- 返回健康状态给 Electron Main

Electron 后续只依赖这个内部启动器，而不是依赖 CLI 命令语义。

### C. Web Server 内部化

当前 `hermes_cli/web_server.py` 拆分目标如下：

```text
internal/desktop_api/
├── app.py
├── routes/
│   ├── config.py
│   ├── env.py
│   ├── sessions.py
│   ├── onboarding.py
│   ├── plugins.py
│   └── diagnostics.py
├── services/
│   ├── config_service.py
│   ├── state_service.py
│   ├── plugin_service.py
│   └── auth_service.py
└── schemas/
```

拆分后要求：

- 所有桌面 API 都有明确模块归属
- 认证逻辑集中管理
- Electron 模式可关闭浏览器型鉴权
- 非 Electron 模式禁止作为公开入口启动

### D. Renderer 通信策略调整

桌面 UI 与后端通信要从“以 HTTP 为主”逐步调整为“两层通道”：

1. 高频桌面能力走 IPC
2. 需要结构化服务能力的接口继续走内部 HTTP API

优先迁移到 IPC 的能力：

- 应用路径
- Onboarding 状态
- 本地系统能力
- 窗口控制
- 本地日志读取
- 依赖诊断
- 桌面级设置

保留 HTTP 的能力：

- 配置 schema
- 会话列表
- 搜索结果
- 插件 manifest
- 较复杂的服务型状态接口

### E. Dev 模式收口

开发模式也要遵循 Electron-only 方向：

- 标准开发入口只能是 `apps/electron`
- `apps/desktop-ui` 仅作为 Electron Renderer 的开发依赖
- 不再建议单独启动浏览器版 dashboard 作为主要开发方式

开发链路应统一为：

```text
apps/electron
  -> 启动内部 Python 服务
  -> 挂接 desktop-ui dev server
  -> 创建 BrowserWindow
```

## 8. 代码改造清单

## 8.1 第一类：入口收口

需要重点调整的文件：

- `hermes_cli/main.py`
- `hermes_cli/web_server.py`
- `electron-app/src/main.ts`
- `electron-app/src/services/gateway.service.ts`
- `electron-app/src/services/window.service.ts`
- `electron-app/src/preload.ts`

具体动作：

1. 在 Python 入口增加产品模式门禁
2. 将 `dashboard`、`chat`、`gateway` 等命令标记为非产品入口
3. Electron 启动时强制设置产品模式
4. Web Server 检测到非 Electron 模式时拒绝启动

## 8.2 第二类：目录重构准备

在真正移动前，先新增目标目录：

- `apps/electron/`
- `apps/desktop-ui/`
- `internal/desktop_api/`
- `internal/desktop_runtime/`
- `internal/desktop_shared/`
- `packages/`
- `legacy/cli/`
- `research/`

第一阶段只建立目录和桥接导入，不立即删除旧目录。

## 8.3 第三类：模块拆分

### `hermes_cli/web_server.py` 拆分

拆分目标：

- 路由层
- 服务层
- schema 层
- 认证层
- Electron 模式识别层

### `hermes_cli/main.py` 拆分

将 CLI 入口中的以下内容分离：

- 产品命令
- 内部维护命令
- 兼容层命令

最终保留一个很薄的 legacy wrapper。

### Electron 服务层继续内聚

进一步把桌面能力集中在：

- `main process`
- `desktop runtime bootstrap`
- `preload bridge`
- `internal desktop api`

## 8.4 第四类：物理移动

物理移动推荐顺序：

1. `web/` -> `apps/desktop-ui/`
2. `electron-app/` -> `apps/electron/`
3. `hermes_cli/web_server.py` -> `internal/desktop_api/`
4. `environments/`、`experiments/` -> `research/`
5. Python 核心目录逐步归并到 `packages/`
6. CLI 相关入口与兼容脚本转入 `legacy/cli/`

每一步移动后都必须执行 import 修复和启动验证。

## 9. 分阶段实施计划

## Phase 1：入口门禁与产品收口

目标：

- Electron 成为唯一正式入口
- 不实际移动大目录

任务：

- 新增 `HERMES_PRODUCT_MODE=electron-only`
- 修改 Python 入口门禁逻辑
- 修改 `dashboard/web/chat/gateway` 对外行为
- 更新 README 和开发文档
- 在 Electron 启动链中注入产品模式变量

验收：

- 用户不能正常从 CLI 进入正式产品流程
- 用户不能独立启动 Web Dashboard
- Electron 启动不受影响

## Phase 2：Web 内部化与 API 拆分

目标：

- 将 Web UI 明确为桌面内嵌 UI
- 将 `web_server.py` 内部服务化

任务：

- 拆分 `web_server.py`
- 建立 `internal/desktop_api/`
- 区分 IPC 与 HTTP 的职责边界
- 调整前端 API 调用基址与 Electron 判断逻辑

验收：

- Web UI 只能在 Electron 环境下作为正式界面使用
- Desktop API 模块结构清晰
- 独立浏览器访问不再属于主支持路径

## Phase 3：目录重构

目标：

- 建立新的产品导向目录结构

任务：

- 建立 `apps/`、`internal/`、`packages/`、`legacy/`、`research/`
- 逐步迁移目录并修复 import
- 增加桥接层，避免一次性破坏过多路径

验收：

- 目录结构反映产品边界
- 新团队成员可从目录直接理解系统分层
- Electron 构建、启动、打包链路稳定

## Phase 4：清理旧入口

目标：

- 清理多余对外入口

任务：

- 删除文档中的 CLI 产品入口表述
- 将 CLI 标为 internal/legacy only
- 逐步移除不再需要的对外启动脚本

验收：

- 对外文档只有 Electron
- 发布产物只有 Electron
- 旧入口仅用于内部维护

## 10. 关键文件级实施细节

## 10.1 `hermes_cli/main.py`

改造目标：

- 保留兼容，但取消产品入口地位

实施细节：

1. 增加产品模式检测函数
2. 在 `main()` 初始化阶段做统一门禁
3. 对 `dashboard`、`chat`、`gateway` 等命令统一限制
4. 输出明确提示：
   - 当前版本为 Electron-only
   - 请从桌面应用启动

建议增加的逻辑：

```text
if product_mode == "electron-only" and not internal_dev_mode:
    block standalone product commands
```

## 10.2 `hermes_cli/web_server.py`

改造目标：

- 从通用 Web 服务变为桌面内部 API

实施细节：

1. 抽取路由
2. 抽取服务对象
3. 抽取鉴权策略
4. 引入显式启动来源校验
5. 后续迁移到 `internal/desktop_api/`

## 10.3 `electron-app/src/main.ts`

改造目标：

- Electron 明确成为唯一正式壳

实施细节：

1. 启动时写入 `HERMES_PRODUCT_MODE=electron-only`
2. 不再依赖外部产品入口是否存在
3. 统一桌面模式环境变量
4. 引导所有下游服务都以桌面模式运行

## 10.4 `electron-app/src/services/window.service.ts`

改造目标：

- 统一桌面 UI 加载策略

实施细节：

1. 开发态只连接桌面 UI dev server
2. 生产态只加载内置静态资源
3. 不再把 Web 视为独立产品页面
4. 后续支持明确的桌面路由初始化参数

## 10.5 `electron-app/src/preload.ts`

改造目标：

- 扩大桌面 IPC 能力覆盖范围

实施细节：

1. 将本地系统级能力优先暴露到 IPC
2. 逐步减少前端对 HTTP 的依赖
3. 给桌面 UI 提供更明确的运行环境标识

## 11. 风险与规避

## 11.1 风险：一次性移动目录导致大量 import 断裂

规避方式：

- 先加新目录
- 先做桥接导出
- 先跑兼容层
- 再移除旧路径

## 11.2 风险：Electron 仍隐式依赖 CLI 逻辑

规避方式：

- 增加桌面内部启动器
- 不直接依赖 CLI 命令语义
- 将桌面启动逻辑下沉到 `internal/desktop_runtime/`

## 11.3 风险：Web UI 过度依赖 HTTP API

规避方式：

- 明确 IPC 与 HTTP 的分工
- 优先把桌面级能力迁到 IPC
- 逐步减少 Renderer 对公开 API 风格接口的依赖

## 11.4 风险：测试体系大面积失效

规避方式：

- Phase 1 只做入口门禁
- Phase 2 再拆 API
- Phase 3 才物理移动
- 每阶段都保留回退点

## 12. 测试与验收方案

## 12.1 启动验收

必须验证：

- Electron 开发模式可启动
- Electron 生产打包可启动
- Python 内部服务可健康运行
- Renderer 可以正常访问所需接口

## 12.2 门禁验收

必须验证：

- 非 Electron 环境下 CLI 主产品命令被禁止
- 非 Electron 环境下 Dashboard/Web 独立启动被禁止
- 内部维护模式仍可使用必要命令

## 12.3 结构验收

必须验证：

- 新目录结构可被团队理解
- 文档、脚本、构建路径与新结构一致
- 旧路径有明确迁移策略

## 12.4 回归验收

必须覆盖：

- Onboarding
- 配置读写
- Session 列表
- Gateway 健康检查
- 桌面日志查看
- 打包产物启动

## 13. 推荐执行顺序

实际落地推荐顺序如下：

1. 先写清晰文档并冻结目标结构
2. 先做入口门禁，不移动目录
3. 再拆 `web_server.py` 为内部 API
4. 再新增桌面内部启动器
5. 再迁移 `web/` 与 `electron-app/`
6. 最后整理 Python 核心目录与 legacy CLI

这是风险最低、回滚最容易的顺序。

## 14. 最终结论

本次改造的关键不在于“删除 CLI 和 Web 代码”，而在于重构它们的角色：

- Electron：唯一正式入口
- Desktop UI：桌面内嵌界面
- Desktop API：桌面内部服务
- Python Core：内部运行时能力
- CLI：兼容和开发辅助层

目录结构也必须围绕这一产品边界重组，而不是继续保持历史遗留的并列入口布局。

只有这样，Hermes Agent 才能真正从“多入口技术仓库”收敛成“桌面优先、Electron-only 的产品架构”。
