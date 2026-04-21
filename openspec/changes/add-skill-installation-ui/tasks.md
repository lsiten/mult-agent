## 1. 后端 API - 在线技能搜索 ✅

- [x] 1.1 创建技能仓库配置（添加 GitHub 仓库 URL 到 hermes_constants.py）
- [x] 1.2 实现 `/api/skills/search` 端点（api_server_skills.py）
- [x] 1.3 实现 GitHub API 集成，获取技能仓库的 registry.json（复用 rate_limit_tracker.py）
- [x] 1.3a 添加 GitHub API 速率限制处理（403 响应处理和重试逻辑）
- [x] 1.4 实现技能搜索逻辑（关键词匹配名称和描述）
- [x] 1.5 添加已安装技能状态检查（比对本地 skills/ 目录）
- [x] 1.6 实现 registry.json 缓存逻辑（SQLite 存储，24小时 TTL）
- [ ] 1.7 添加搜索 API 单元测试（推迟到测试阶段）

## 2. 后端 API - 异步任务框架 ✅

- [x] 2.1 Spike: 设计 asyncio 任务管理架构（使用 asyncio.create_task 而非 threading）
- [x] 2.2 创建异步任务管理器类（tools/skill_installer.py，使用 asyncio）
- [x] 2.3 实现任务状态存储（SQLite 表，持久化防止重启丢失）
- [x] 2.4 实现任务进度回调机制（支持 WebSocket 推送和轮询查询）
- [x] 2.5 实现 `/api/skills/install/<task_id>` 状态查询端点（HTTP 轮询降级）
- [ ] 2.6 实现 WebSocket 进度推送端点（可选优化，轮询已足够）
- [x] 2.7 实现任务取消 API 端点（POST /api/skills/install/<task_id>/cancel）
- [x] 2.8 添加任务超时和清理机制（包括并发任务队列管理）
- [x] 2.9 添加任务并发控制（最多 2 个并行安装，其余排队）

## 3. 后端 API - 在线技能安装 ✅

- [x] 3.1 实现 `POST /api/skills/install` 端点（从在线仓库安装）
- [x] 3.2 实现技能 ZIP 文件下载逻辑（从 GitHub Releases CDN）
- [x] 3.3 实现下载后 SHA256 哈希验证（与 registry.json 中哈希比对）
- [x] 3.4 集成 ZIP 验证逻辑（调用第4节验证函数）
- [x] 3.5 集成安装逻辑（调用 _perform_installation 共享函数）
- [x] 3.6 添加安装进度事件（downloading, validating, installing）
- [ ] 3.7 添加在线安装单元测试（推迟到测试阶段）

## 4. 后端 API - ZIP 文件上传和验证 ✅

- [x] 4.1 Spike: 设计 skill.yaml schema 规范（定义必需字段和验证规则）
- [x] 4.2 实现 `POST /api/skills/upload` 端点（multipart/form-data）
- [x] 4.3 实现文件大小验证（< 50MB 压缩，< 200MB 解压）
- [x] 4.4 实现 ZIP 炸弹检测（压缩比 > 4:1 则拒绝）
- [x] 4.5 实现 ZIP 完整性检查（zipfile.is_zipfile()）
- [x] 4.6 实现必需文件检查（SKILL.md 或 skill.yaml 存在于根目录）
- [x] 4.7 实现路径安全检查（禁止 ../ 路径、符号链接指向外部）
- [x] 4.8 集成 skills_guard.py 代码扫描（检测 eval/exec/网络调用/文件操作）
- [ ] 4.9 实现可执行文件验证（推迟到需求明确时）
- [x] 4.10 实现 skill.yaml 格式验证（支持 SKILL.md frontmatter 和 skill.yaml）
- [x] 4.11 添加详细日志记录（验证失败原因、威胁检测结果）
- [ ] 4.12 添加 ZIP 验证单元测试（推迟到测试阶段）

## 5. 后端 API - 技能安装核心逻辑 ✅

- [x] 5.1 扩展 skills_hub.SkillBundle 添加 from_zip() 类方法
- [x] 5.2 实现 quarantine_bundle() 提取到隔离目录（复用 skills_hub 现有函数）
- [x] 5.3 实现技能名称冲突检查（已存在则自动备份到 quarantine）
- [ ] 5.4 实现冲突解决 API 端点（可选功能，当前自动备份策略已足够）
- [x] 5.5 实现覆盖模式的备份逻辑（自动移动到 quarantine 目录，添加时间戳后缀）
- [ ] 5.6 实现 keep_both 模式的重命名逻辑（可选功能，推迟）
- [x] 5.7 实现原子移动（quarantine → skills/，使用 install_from_quarantine）
- [x] 5.8 实现技能注册（复用 skills_hub.HubLockFile 和审计日志）
- [x] 5.9 实现安装失败回滚逻辑（清理临时文件，quarantine 保留失败痕迹）
- [ ] 5.10 添加安装核心逻辑单元测试（推迟到测试阶段）

## 6. 前端组件 - Modal 和布局

- [x] 6.1 创建 SkillInstallModal 组件（web/src/components/SkillInstallModal.tsx）
- [x] 6.2 集成 Shadcn Dialog 组件
- [x] 6.3 实现 Tabs 布局（在线搜索 Tab 和 ZIP 上传 Tab）
- [x] 6.4 在 SkillsPage.tsx 添加"安装新技能"按钮
- [x] 6.5 实现 Modal 打开/关闭状态管理

## 7. 前端组件 - 在线技能搜索

- [x] 7.1 创建 OnlineSearchTab 组件
- [x] 7.2 实现搜索输入框和搜索按钮
- [x] 7.3 实现技能列表展示（普通滚动，虚拟滚动推迟到性能优化阶段）
- [x] 7.4 实现技能卡片组件（显示名称、描述、版本、作者、已安装状态）
- [ ] 7.5 实现技能详情展开面板
- [x] 7.6 实现"安装"按钮和已安装状态显示（禁用已安装技能的安装按钮）
- [x] 7.7 实现离线模式指示器（显示"使用缓存数据"警告）
- [x] 7.8 实现空结果提示和离线降级提示

## 8. 前端组件 - ZIP 文件上传

- [x] 8.1 创建 ZipUploadTab 组件
- [x] 8.2 集成原生拖拽上传（HTML5 Drag & Drop API）
- [ ] 8.3 实现 Electron 原生文件选择器（通过 IPC 调用 dialog.showOpenDialog）
- [x] 8.4 实现文件类型验证（只接受 .zip）
- [x] 8.5 实现文件大小前端预检查（< 50MB）
- [x] 8.6 实现上传进度显示

## 9. 前端 API 集成 ✅

- [x] 9.1 在 api.ts 添加 `searchSkills(query)` 方法（使用缓存优先）
- [x] 9.2 在 api.ts 添加 `installSkillOnline(skillId)` 方法
- [x] 9.3 在 api.ts 添加 `uploadSkillZip(file)` 方法
- [x] 9.4 在 useInstallProgress 实现 `getInstallStatus(taskId)` 轮询（直接 fetch）
- [x] 9.5 在 InstallationProgress 实现 `cancelInstallation(taskId)` （直接 fetch）
- [ ] 9.6 在 api.ts 添加 `resolveConflict(taskId, action)` 方法（可选功能，当前自动备份）
- [ ] 9.7 实现 WebSocket 连接管理（可选优化，轮询已足够）
- [ ] 9.8 实现 WebSocket 进度监听（可选优化，轮询已足够）
- [ ] 9.9 使用 React Query 管理 API 状态和缓存（可选优化，当前方案已工作）
- [x] 9.10 实现轮询降级逻辑（直接使用轮询，500ms 间隔，无需 WebSocket）

## 10. 前端状态管理 - 安装进度 ✅

- [x] 10.1 创建 Zustand store 管理安装任务状态（在 React Query 之前初始化）
- [x] 10.2 实现安装进度状态（pending, queued, in_progress, completed, failed, cancelled）
- [x] 10.3 实现任务队列状态（显示队列位置）
- [x] 10.4 实现进度百分比和当前步骤显示
- [x] 10.5 实现错误信息存储（包括威胁检测详情）
- [x] 10.6 实现冲突解决状态（显示冲突提示和用户选择）
- [x] 10.7 实现安装成功后刷新技能列表（监听 Zustand store 状态变化，完成后自动刷新）

## 11. 前端 UI - 安装状态反馈 ✅

- [x] 11.1 创建 InstallationProgress 组件（进度条 + 步骤文本 + 队列位置）
- [x] 11.2 实现 Shadcn Toast 显示成功/失败通知（复用现有 Toast 系统）
- [x] 11.3 实现错误对话框（详细错误信息 + 威胁详情 + 可展开 JSON）
- [ ] 11.4 实现冲突解决对话框（可选功能，当前自动备份策略已足够）
- [x] 11.5 实现取消安装按钮（发送取消请求到后端）
- [x] 11.6 实现安装完成后自动关闭进度卡片（2 秒延迟）

## 12. 国际化 (i18n)

- [x] 12.1 在 en.ts 添加技能安装相关翻译键
- [x] 12.2 在 zh.ts 添加技能安装相关翻译键
- [x] 12.3 翻译所有前端文本（按钮、标题、提示、错误消息）
- [ ] 12.4 翻译后端 API 错误消息键（返回 i18n key）
- [ ] 12.5 验证中英文切换正确显示

## 13. 测试 - 单元测试

- [ ] 13.1 后端：测试技能搜索 API（包括缓存逻辑和速率限制）
- [ ] 13.2 后端：测试 ZIP 验证逻辑（正常、恶意路径、ZIP 炸弹、代码注入、skill.yaml schema）
- [ ] 13.3 后端：测试 skills_guard 集成（检测威胁模式）
- [ ] 13.4 后端：测试技能安装核心逻辑（包括冲突解决和回滚）
- [ ] 13.5 后端：测试异步任务管理器（包括并发队列和取消逻辑）
- [ ] 13.6 前端：测试 SkillInstallModal 组件渲染
- [ ] 13.7 前端：测试搜索和上传逻辑（包括离线降级）
- [ ] 13.8 前端：测试 WebSocket 连接和轮询降级

## 14. 测试 - 集成测试 ✅

- [x] 14.1 测试完整的安装流程（SkillBundle → quarantine → scan → install）
- [x] 14.2 测试 AsyncTaskManager 集成（创建任务 → 执行 → 状态跟踪）
- [x] 14.3 测试安装失败场景（scan_skill 集成，威胁检测）
- [x] 14.4 测试技能名称冲突处理（install_from_quarantine 覆盖）
- [x] 14.5 测试并发安装（3个任务排队，最多2个并行）
- [x] 14.6 测试取消安装功能（中途取消 + 清理验证）
- [ ] 14.7 测试完整 API 端点集成（需要运行 Gateway 服务器）

## 15. 测试 - E2E 测试

- [ ] 15.1 Spike: 设置 Playwright 测试环境（如果尚未配置）
- [ ] 15.2 使用 Playwright 测试打开 Modal
- [ ] 15.3 测试在线搜索并安装技能
- [ ] 15.4 测试上传 ZIP 文件安装技能
- [ ] 15.5 测试安装进度显示（WebSocket 和轮询）
- [ ] 15.6 测试冲突解决流程（模拟冲突 + 选择 Overwrite）
- [ ] 15.7 测试错误处理和重试

## 16. 文档和优化

- [ ] 16.1 更新 README 添加技能安装功能说明
- [ ] 16.2 添加技能开发者指南（如何打包和发布技能，包含 skill.yaml schema 文档）
- [ ] 16.3 性能测试：50MB ZIP 文件上传在 10Mbps 连接下 <10s
- [ ] 16.4 性能优化：实现技能列表虚拟滚动（如果性能测试显示需要）
- [ ] 16.5 安全审查：检查 ZIP 验证、skills_guard 集成、路径处理
- [ ] 16.6 代码审查：确保符合项目规范（日志记录、错误处理、不可变性）
