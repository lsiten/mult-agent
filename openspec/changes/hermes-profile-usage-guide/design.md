## Context

Hermes Profile 功能已在 v0.6.0 版本实现（hermes_cli/profiles.py），提供完整的多实例隔离能力。本设计文档不涉及新功能开发，而是规划如何创建一份全面的中文使用指南文档，帮助用户理解和使用 Profile 系统。

**现有实现**：
- hermes_cli/profiles.py：核心 Profile 管理逻辑
- hermes_cli/commands.py：CLI 命令注册
- tests/hermes_cli/test_profiles.py：全面的测试覆盖
- RELEASE_v0.6.0.md：版本发布说明

**目标受众**：
- 需要运行多个 Hermes 实例的高级用户
- 团队协作场景下的管理员
- 开发者和测试人员

## Goals / Non-Goals

**Goals:**
- 创建一份完整的中文 Profile 使用指南
- 涵盖从基础概念到高级操作的所有场景
- 提供清晰的示例和最佳实践
- 包含完整的故障排查手册
- 文档格式适合直接作为用户手册或培训材料

**Non-Goals:**
- 不修改任何现有代码
- 不添加新功能
- 不涉及英文文档（可后续翻译）
- 不包含源码级别的技术分析（仅用户视角）

## Decisions

### 决策 1：文档组织结构

**选择**：按功能模块组织，而非按操作流程

**理由**：
- Profile 功能涉及多种使用场景，线性流程难以覆盖所有情况
- 模块化组织便于用户按需查阅特定主题
- 与 spec 文件结构一致，便于维护

**结构**：
```
1. Profile 核心概念
   - 什么是 Profile
   - 隔离机制原理
   - 目录结构说明

2. 基础操作
   - 创建 Profile
   - 列出和查看 Profile
   - 切换 Profile
   - 删除 Profile

3. 典型使用场景
   - 工作/个人分离
   - 多平台部署
   - 开发/生产环境
   - 模型测试对比
   - 团队协作

4. 高级功能
   - 导出和导入
   - 重命名
   - 克隆配置
   - Shell 自动补全

5. 故障排查
   - 常见错误和解决方案
   - 日志查看和调试
   - 数据恢复
```

### 决策 2：示例代码风格

**选择**：使用真实命令示例 + 预期输出

**理由**：
- 用户可直接复制粘贴执行
- 预期输出帮助用户验证操作正确性
- 避免抽象描述导致的理解偏差

**格式**：
```bash
# 命令说明
$ hermes profile create work --clone
✓ Created profile 'work' at /Users/user/.hermes/profiles/work
✓ Copied config files from default profile
✓ Created wrapper script: /Users/user/.local/bin/work
```

### 决策 3：处理 Docker 部署差异

**选择**：在每个相关章节添加"Docker 部署注意事项"小节

**理由**：
- Docker 部署中 Profile 行为有所不同（路径、profiles root）
- 集中说明可能导致用户忽略
- 分散到相关章节确保用户在执行时看到提示

**示例**：
```
### Docker 部署注意事项
在 Docker 环境中，HERMES_HOME 通常设置为 /opt/data。此时：
- default profile 即为 /opt/data
- 命名 profile 位于 /opt/data/profiles/<name>
- active_profile 文件位于 /opt/data/active_profile
```

### 决策 4：故障排查的组织方式

**选择**：按问题类型分类，每个问题包含"症状 → 原因 → 解决方案"

**理由**：
- 用户遇到问题时需要快速定位
- 按问题类型分类便于查找
- 结构化格式减少阅读负担

**分类**：
- Profile 不存在错误
- Gateway 端口冲突
- Token 冲突
- 名称冲突
- PATH 配置问题
- 数据损坏恢复
- 磁盘空间不足
- 版本升级兼容性

## Risks / Trade-offs

### 风险 1：文档与代码实现不同步

**风险**：Profile 功能更新后文档未及时更新导致信息过时

**缓解措施**：
- 在文档开头标注基于的 Hermes 版本（v0.6.0+）
- 引用 tests/hermes_cli/test_profiles.py 作为权威行为参考
- 建议在 CI 中添加文档验证步骤（未来改进）

### 风险 2：中文表达准确性

**风险**：技术术语翻译可能引起歧义

**缓解措施**：
- 关键术语保留英文原词（如 Profile、Gateway、HERMES_HOME）
- 首次出现时使用"Profile（配置档案）"格式说明
- 命令和路径使用英文避免混淆

### 风险 3：示例命令可能在不同环境失败

**风险**：示例基于 macOS/Linux，Windows 用户可能无法直接使用

**缓解措施**：
- 在文档开头说明适用平台（Linux、macOS、WSL2）
- Windows 用户引导到 WSL2 文档
- 路径使用 ~ 而非绝对路径提高可移植性

## Trade-offs

### Trade-off 1：详尽性 vs 可读性

**选择**：优先可读性，将高级细节放入折叠块或附录

**理由**：大多数用户只需基础操作，过多细节会增加学习负担

### Trade-off 2：中文 vs 双语

**选择**：纯中文文档，避免中英混杂

**理由**：
- 目标受众为中文用户
- 双语排版影响阅读体验
- 英文文档可单独维护

### Trade-off 3：教程式 vs 参考手册

**选择**：混合模式 - 前半部分教程式，后半部分参考手册式

**理由**：
- 新用户需要循序渐进的教程
- 熟练用户需要快速查询的参考手册
- 混合模式满足不同用户需求

## Open Questions

1. **是否需要视频教程补充？**
   - 文字文档已足够，视频教程可作为未来增强
   - 建议先完成文字文档收集用户反馈

2. **是否需要交互式示例（如 asciinema）？**
   - 对于复杂操作（如导出/导入）交互式示例更直观
   - 可在文档完成后根据反馈添加

3. **是否需要单独的快速参考卡片？**
   - 一页纸的命令速查表对熟练用户有价值
   - 可从完整文档提取生成
