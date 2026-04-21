## Context

当前 Hermes Agent 的 Skills 页面只支持查看和管理已安装的技能。用户想要安装新技能必须：
1. 手动从外部源下载技能 ZIP 文件
2. 使用命令行执行 `hermes skill install <path>`

这个流程对非技术用户不友好，且无法发现在线可用的技能。

**当前技能管理架构**:
- Python 后端: `tools/skills_hub.py` 负责技能扫描、加载、执行
- Gateway API: `gateway/platforms/api_server_skills.py` 提供 REST API 获取已安装技能列表
- Web 前端: `web/src/pages/SkillsPage.tsx` 显示技能列表
- 技能存储: `skills/` 目录，每个技能一个子目录，包含 `skill.yaml` 和实现文件

**约束**:
- 必须保持与现有技能格式兼容（skill.yaml 结构）
- 安装过程需要文件系统写权限
- 在线技能仓库需要稳定的网络访问
- 需要支持中英文 i18n

## Goals / Non-Goals

**Goals:**
- 提供图形化界面在应用内安装技能
- 支持从在线仓库搜索和安装技能
- 支持上传本地 ZIP 文件安装技能
- 提供清晰的安装进度和错误反馈
- 安装后技能立即可用，无需重启

**Non-Goals:**
- 技能版本管理和自动更新（未来功能）
- 技能依赖自动解析和安装（未来功能）
- 技能市场评分和评论系统
- 技能开发和调试工具

## Decisions

### Decision 1: 在线技能仓库架构

**选择**: 使用 GitHub API 访问 `hermes-skills` 公开仓库作为技能源

**理由**:
- GitHub 提供免费、稳定的 API 和 CDN
- 技能可以版本化管理（Git tags/releases）
- 社区可以通过 PR 贡献技能
- 无需维护独立的技能服务器

**备选方案**:
- 自建技能服务器: 需要额外维护成本和基础设施
- NPM/PyPI: 不适合非代码类技能，包管理过于复杂

**实现细节**:
- 仓库结构: `hermes-skills/skills/<skill-name>/` 每个技能一个目录
- 元数据文件: `hermes-skills/registry.json` 包含所有技能的索引（名称、描述、版本、下载 URL、作者签名）
- 下载方式: 从 GitHub Releases 下载预打包的 `.zip` 文件
- **缓存策略**: 应用启动时获取 registry.json 并缓存到 localStorage（24小时 TTL），后台定期刷新
- **签名验证**（未来）: registry.json 包含技能包的 SHA256 哈希，下载后验证完整性

### Decision 2: ZIP 文件处理和验证

**选择**: 复用现有 `skills_hub.py` 和 `skills_guard.py` 基础设施

**理由**:
- 安全性：前端验证不可信，必须后端验证
- 文件系统权限：后端有 skills/ 目录写权限
- **复用现有代码**：`tools/skills_hub.py` 已有 `SkillBundle`, `GitHubSource`, 隔离目录、审计日志
- **威胁扫描**：`tools/skills_guard.py` 提供 400+ 行威胁模式检测（渗透、注入、破坏性命令）

**验证步骤**:
1. 文件大小检查（< 50MB，防止 ZIP 炸弹需检查解压后大小 < 200MB）
2. ZIP 完整性检查（`zipfile.is_zipfile()`）
3. 必需文件检查（skill.yaml 存在）
4. **集成 `skills_guard.py` 扫描**：检测代码中的 eval/exec、网络调用、文件操作模式
5. 路径安全检查（禁止 `../` 路径遍历、符号链接指向 skills/ 外部）
6. skill.yaml 格式验证（使用 YAML schema）
7. 可执行文件验证（.exe, .sh 必须在 skill.yaml 中声明，并通过信任级别检查）

**安全考虑**:
- 禁止 ZIP 包含 `../` 路径（路径遍历攻击）
- **ZIP 炸弹防护**：限制压缩比（解压后大小/压缩大小 < 4:1）
- **代码内容扫描**：使用 `skills_guard.py` 检测恶意模式
- 提取到临时目录，验证通过后移动到 skills/
- **隔离执行**：新安装的技能默认在 skills_guard 监控下运行

**实现细节**:
- 扩展 `skills_hub.SkillBundle` 添加 `from_zip()` 类方法
- 调用 `skills_guard.scan_skill_directory()` 在安装前扫描
- 复用现有的 `HubLockFile` 和审计日志机制

### Decision 3: 前端组件架构

**选择**: 使用 Modal + Tabs 组合组件，集成 Electron 原生能力

**组件结构**:
```
SkillInstallModal (Shadcn Dialog)
├── Tabs
│   ├── OnlineSearchTab
│   │   ├── SearchInput
│   │   ├── SkillList (普通滚动，虚拟化推迟到性能优化阶段)
│   │   └── SkillDetailPanel
│   └── ZipUploadTab
│       ├── FileDropzone (react-dropzone + Electron 原生文件选择器)
│       └── UploadProgress
└── InstallationStatusToast (Shadcn Toast)
```

**状态管理**:
- 使用 Zustand 管理安装状态（进度、错误）- **必须在 React Query 之前初始化**
- 使用 React Query 管理 API 调用和缓存（依赖 Zustand store）
- WebSocket 连接管理（优先）+ 轮询降级（500ms）

### Decision 4: API 设计

**新增 REST API 端点**:

```python
# 搜索在线技能
GET /api/skills/search?q=<keyword>
Response: {
  "skills": [
    {
      "id": "browser-automation",
      "name": "Browser Automation",
      "description": "...",
      "version": "1.0.0",
      "author": "...",
      "download_url": "https://...",
      "installed": false
    }
  ]
}

# 从在线仓库安装技能
POST /api/skills/install
Body: { "skill_id": "browser-automation", "source": "online" }
Response: { "task_id": "uuid", "status": "pending" }

# 上传 ZIP 文件安装
POST /api/skills/upload
Content-Type: multipart/form-data
Body: file=<zip file>
Response: { "task_id": "uuid", "status": "pending" }

# 查询安装状态
GET /api/skills/install/<task_id>
Response: {
  "task_id": "uuid",
  "status": "in_progress", // pending, in_progress, completed, failed
  "progress": 60,
  "step": "Extracting files...",
  "error": null
}
```

**异步任务设计**:
- **使用 `asyncio`**（Gateway 已基于 aiohttp，保持一致）
- 使用 `asyncio.create_task()` 创建后台任务，共享状态字典存储进度
- 任务状态存储在 **SQLite**（持久化，防止进程重启丢失状态）
- **WebSocket 实时推送** + 轮询降级（WebSocket 失败时回退到 500ms 轮询）
- 复用现有 `agent/rate_limit_tracker.py` 管理 GitHub API 速率限制

### Decision 5: 国际化支持

**选择**: 在前端和后端都支持 i18n

**前端**:
- 添加到 `web/src/i18n/en.ts` 和 `zh.ts`
- 键命名: `skills.install.*`, `skills.search.*`, `skills.upload.*`

**后端**:
- API 错误消息返回 i18n key，前端翻译
- 例如: `{ "error": "skill_already_installed", "params": { "name": "..." } }`

## Risks / Trade-offs

### Risk 1: GitHub API 速率限制
**风险**: GitHub API 未认证请求限制为 60 次/小时

**缓解方案**:
- **主策略**：应用启动时获取并缓存 registry.json（localStorage, 24 小时 TTL）
- 后台定期刷新，搜索操作直接使用缓存，无需实时 API 调用
- 集成 `agent/rate_limit_tracker.py` 监控 API 配额，接近限制时显示警告
- 考虑使用 GitHub Personal Access Token（可选配置，提升至 5000次/小时）
- 下载 ZIP 文件使用 GitHub Releases CDN（不计入 API 配额）

### Risk 2: ZIP 文件恶意代码
**风险**: 用户上传的 ZIP 文件可能包含恶意脚本

**缓解方案**:
- **集成 `skills_guard.py` 威胁扫描**：400+ 行模式匹配检测渗透、注入、破坏性命令
- 严格验证 ZIP 内容（路径遍历、符号链接、ZIP 炸弹）
- 技能运行在 skills_guard 监控下（Python subprocess 限制）
- 显示安全警告："仅安装来自信任源的技能"
- **隔离新技能**：首次运行时要求用户确认信任级别
- 未来考虑：
  - 代码签名验证（registry.json 包含签名）
  - 沙盒执行环境（Docker 容器或 seccomp 限制）

### Risk 3: 安装失败后的清理
**风险**: 安装中断可能留下不完整的技能文件

**缓解方案**:
- 使用临时目录 + 原子移动（temp → skills/）
- 安装失败时自动清理临时文件
- 提供手动清理工具（未来）

### Trade-off: 同步 vs 异步安装
**选择**: 异步安装

**优点**:
- UI 不阻塞，用户体验好
- 支持大文件下载和解压

**缺点**:
- 实现复杂度增加（任务队列、状态管理）
- 需要轮询或 WebSocket 获取进度

**权衡**: 用户体验优先，异步是必要的

## Migration Plan (修订后 4 周计划)

**Phase 1: 基础设施和 Spike**（Week 1）
1. Spike: 异步任务架构设计（asyncio + SQLite）
2. Spike: skill.yaml schema 规范定义
3. Spike: Playwright E2E 环境搭建（如需要）
4. 实现异步任务框架（包括 WebSocket 推送和队列管理）
5. 复用和扩展 skills_hub.py / skills_guard.py

**Phase 2: 后端 API 实现**（Week 2）
1. 实现在线技能搜索和缓存（包括速率限制管理）
2. 实现 ZIP 上传和验证逻辑（集成 skills_guard 威胁扫描）
3. 实现在线安装和核心安装逻辑（包括冲突解决和回滚）
4. 实现 WebSocket 进度推送端点
5. 单元测试

**Phase 3: 前端 UI 实现**（Week 3）
1. 创建 Zustand store（在 React Query 之前）
2. 创建 SkillInstallModal 和 Tabs 布局
3. 实现在线搜索 Tab（含离线降级）
4. 实现 ZIP 上传 Tab（含 Electron 原生文件选择器）
5. 集成 API 和 WebSocket（含轮询降级）
6. 实现状态反馈 UI（含冲突解决对话框）
7. 前端测试

**Phase 4: 测试、优化和文档**（Week 4）
1. 集成测试（包括并发和离线场景）
2. E2E 测试（Playwright）
3. i18n 完整性检查
4. 性能测试和优化（虚拟滚动按需实现）
5. 安全审查（ZIP 验证、skills_guard 集成）
6. 文档和代码审查

**Rollback 策略**:
- 功能特性开关：`ENABLE_SKILL_INSTALLATION_UI=false` 隐藏 UI 入口
- 后端 API 独立，不影响现有技能管理
- 前端组件独立，可快速禁用

## Open Questions

1. **在线技能仓库的具体位置**？
   - 需要确认 GitHub 仓库名称和 URL
   - 是否使用现有仓库还是创建新的？

2. **技能安装权限管理**？
   - 所有用户都能安装技能，还是需要管理员权限？
   - Electron 应用场景：通常是单用户，权限管理简化

3. **技能依赖如何处理**？
   - 当前不支持依赖解析，如果技能 A 依赖技能 B，需要手动安装
   - 是否在 MVP 中添加简单的依赖提示？

4. **技能更新机制**？
   - 当前不在 MVP 范围，但需要预留接口
   - registry.json 应该包含版本信息供未来使用
