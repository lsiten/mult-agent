## 为什么

当前 Electron 架构（v1.0.0）存在严重问题：main.ts 中分散着 6 个模块级全局变量、隐式的生命周期依赖导致启动顺序错误、PythonManager 有 536 行违反单一职责原则、Gateway 缺少身份验证允许本地进程劫持、服务间错误处理不一致。这些问题使代码库难以测试、维护和保护安全。我们需要系统性重构来建立清晰架构、增强安全性、改善开发体验，然后再添加新功能。

## 变更内容

- **应用生命周期管理器** 具备服务注册表、依赖注入、拓扑排序，实现确定性启动/关闭
- **服务接口标准化** 将所有管理器（Python、Vite、Config 等）转换为实现统一 Service 接口，包含 start/stop/isHealthy 方法
- **PythonManager 拆解** 将 536 行的巨型类拆分为 ProcessManager、HealthMonitor 和 GatewayService，职责清晰
- **IPC 类型安全系统** 使用 Zod schema 进行运行时验证、自动限流、统一错误处理
- **安全加固** 包括 Gateway 认证令牌验证、.env 文件权限强制、日志脱敏、输入验证
- **测试基础设施** 建立 Vitest 单元测试（80% 覆盖率目标）、Playwright E2E 测试、CI/CD 集成
- **开发工具** 添加实时日志查看器、服务面板、IPC 检查器、VSCode 调试配置

## 能力

### 新增能力

- `lifecycle-management`: 应用级服务编排，包含依赖解析、失败时自动回滚、优雅关闭顺序
- `service-interface`: 所有应用服务的标准化契约，包括生命周期钩子、健康检查、指标收集
- `ipc-type-safety`: 类型安全的 IPC 通信层，具备 schema 验证、限流、自动错误格式化
- `process-management`: 通用进程启动、监控、终止，支持优雅关闭和错误恢复
- `health-monitoring`: 服务健康检查，带指数退避、事件发射、延迟跟踪
- `security-hardening`: 综合安全措施，包括身份验证、授权、输入验证、密钥脱敏
- `test-infrastructure`: 测试框架，包含单元/集成/E2E 覆盖、Mock 工具、CI 自动化
- `dev-tools`: 开发体验增强，包括日志流、服务检查、调试工具

### 修改的能力

_无 - 这是对现有模块的全新架构工作_

## 影响

**代码结构**:
- `electron-app/src/main.ts`: 从 508 行减少到 ~50 行（仅协调器）
- `electron-app/src/python-manager.ts`: 弃用，改用模块化服务
- 新增目录: `services/`, `process/`, `health/`, `ipc/`, `security/`

**破坏性变更**:
- **BREAKING**: Gateway API 现在要求所有非健康检查端点使用 `Authorization: Bearer <token>` 头
- **BREAKING**: 直接使用 `ipcMain.handle()` 的方式被 `IpcRegistry.register()` 替代以实现类型安全

**依赖项**:
- 添加: `zod`（运行时类型验证）、`vitest`（测试）、`@playwright/test`（E2E）
- 更新: Python `gateway/` 添加认证中间件

**迁移路径**:
- Phase 0（第 1 周）: 安全修复 + 测试搭建（向后兼容）
- Phase 1（第 2 周）: 新抽象与旧代码共存
- Phase 2（第 3-4 周）: 渐进迁移，旧代码标记 `@deprecated`
- Phase 3（第 5-6 周）: 完全切换，移除旧代码

**风险缓解**:
- 新生命周期管理器的功能开关（`USE_NEW_LIFECYCLE=false` 可回滚）
- 每个阶段前有全面的测试覆盖
- 在开发机器上进行金丝雀测试
