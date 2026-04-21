## Why

Hermes Profile 功能允许在单个安装中运行多个完全隔离的 Hermes 实例，每个 profile 拥有独立的配置、内存、会话、技能和网关服务。这解决了需要维护不同用途（工作、个人、测试等）或不同配置（不同模型、不同平台）的 agent 实例的需求，同时避免了多次安装的复杂性。

## What Changes

此 change 不涉及代码修改，而是创建一份完整的 Profile 功能使用方案文档，包括：

- Profile 的核心概念和架构原理
- 创建、切换、管理 Profile 的完整操作流程
- 典型使用场景和最佳实践
- 高级功能：导出/导入、重命名、克隆配置
- 故障排查和注意事项
- 与 Docker 部署的集成说明

## Capabilities

### New Capabilities
- `profile-management`: Profile 的 CRUD 操作（创建、列表、切换、删除）
- `profile-isolation`: Profile 隔离机制和目录结构
- `profile-workflows`: 典型使用场景和工作流程
- `profile-advanced`: 高级功能（导出、导入、重命名、克隆）
- `profile-troubleshooting`: 常见问题和故障排查

### Modified Capabilities
<!-- 无现有能力修改 -->

## Impact

此 change 为文档性质，不影响现有代码。输出为：

- 完整的中文 Profile 使用指南（Markdown 格式）
- 涵盖从基础概念到高级操作的全流程
- 适合作为用户文档或内部培训材料
