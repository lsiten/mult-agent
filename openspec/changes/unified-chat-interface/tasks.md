## 1. 前端基础架构搭建

- [x] 1.1 创建 ChatPage 容器组件及其状态结构
- [x] 1.2 实现 useSessions hook（会话列表管理）
- [x] 1.3 实现 useStreamingResponse hook（SSE 流式响应，已修复 EventSource 事件监听）
- [x] 1.4 实现 useAttachments hook（附件上传管理）
- [x] 1.5 创建 ToastProvider 和 useToast hook（全局通知）

## 2. 侧边栏组件实现

- [x] 2.1 创建 Sidebar 主组件（250px 宽度，可折叠）
- [x] 2.2 实现 SidebarHeader（新对话按钮 + 搜索框）
- [x] 2.3 实现 SessionList（虚拟滚动，使用 react-virtuoso）
- [x] 2.4 实现 SessionGroup（按时间分组：今天/昨天/本周/更早）
- [x] 2.5 实现 SessionItem（标题、预览、时间戳、删除按钮）
- [x] 2.6 实现 CollapsedSidebar（折叠状态视图）
- [x] 2.7 添加侧边栏折叠/展开动画（使用 Tailwind CSS 过渡）
- [ ] 2.8 实现会话列表无限滚动加载

## 3. 聊天区域组件实现

- [x] 3.1 创建 ChatArea 主组件布局
- [x] 3.2 实现 ChatHeader（会话标题、编辑、删除）
- [x] 3.3 实现 MessageList（虚拟滚动，使用 react-virtuoso）
- [x] 3.4 实现 MessageBubble（用户/AI 消息气泡）
- [x] 3.5 实现 StreamingIndicator（流式响应的打字指示器）
- [x] 3.6 在 MessageBubble 中集成 Markdown 渲染
- [x] 3.7 实现消息中的附件展示（AttachmentDisplay）
- [x] 3.8 实现消息中的工具调用展示（ToolCallDisplay，可折叠）

## 4. 输入区域组件实现

- [x] 4.1 创建 InputArea 主组件布局
- [x] 4.2 实现自动调整高度的 Textarea（最大 200px）
- [x] 4.3 添加 Enter 发送、Shift+Enter 换行逻辑
- [x] 4.4 实现 AttachmentButtons（📎文件、🖼️图片按钮）
- [x] 4.5 实现 AttachmentPreviewList（已选文件预览）
- [x] 4.6 实现拖拽上传文件功能
- [x] 4.7 实现粘贴上传图片功能
- [x] 4.8 添加 SendButton（发送/取消切换）
- [x] 4.9 实现文件类型和大小验证

## 5. 附件上传功能

- [x] 5.1 实现文件选择和预览逻辑
- [ ] 5.2 实现图片缩略图生成（generateThumbnail）
- [x] 5.3 实现文件上传进度追踪（使用 Fetch API）
- [x] 5.4 实现多文件并行上传
- [ ] 5.5 添加上传失败重试逻辑
- [x] 5.6 实现 AttachmentPreview 组件（文件图标、名称、大小、进度条）
- [ ] 5.7 添加图片预览放大查看功能

## 6. 后端 API 实现 - 会话管理

- [x] 6.1 实现 POST /api/sessions/create 创建会话接口
- [x] 6.2 实现 GET /api/sessions/list 会话列表接口（支持分页）
- [x] 6.3 实现 GET /api/sessions/{id}/messages 获取消息历史接口
- [x] 6.4 实现 PUT /api/sessions/{id} 更新会话标题接口
- [x] 6.5 实现 DELETE /api/sessions/{id} 删除会话接口
- [x] 6.6 在会话列表查询中添加最后消息预览
- [x] 6.7 实现会话按 updated_at 排序逻辑

## 7. 后端 API 实现 - 消息流式响应

- [x] 7.1 优化 GET /api/sessions/{id}/stream SSE 端点（已修复火山引擎 ARK 配置）
- [x] 7.2 统一 SSE 事件格式：content、tool_call、done、error
- [x] 7.3 实现流式响应中的工具调用事件发送
- [ ] 7.4 添加流式响应错误处理和重试
- [x] 7.5 实现 Agent 流式回调集成
- [x] 7.6 保存用户消息和 AI 响应到数据库
- [x] 7.7 更新会话 updated_at 时间戳

## 8. 后端 API 实现 - 附件管理

- [x] 8.1 实现 POST /api/attachments/upload 文件上传接口
- [x] 8.2 实现文件存储逻辑（$HERMES_HOME/data/attachments/{session_id}/）
- [x] 8.3 实现 GET /api/attachments/{session_id}/{filename} 文件获取接口
- [ ] 8.4 为图片生成缩略图（Pillow）
- [x] 8.5 实现文件类型和大小验证（前端验证）
- [ ] 8.6 集成附件到 Agent 上下文（读取文件内容）
- [ ] 8.7 在消息数据库中存储附件引用

## 9. 搜索功能实现

- [x] 9.1 创建 SQLite FTS5 全文搜索表 messages_fts（SessionDB 已支持）
- [x] 9.2 实现 GET /api/sessions/search 搜索接口
- [x] 9.3 在 Sidebar 中集成搜索 UI
- [ ] 9.4 实现搜索结果高亮（>>>match<<< 标记）
- [x] 9.5 添加搜索防抖（前端实现）
- [x] 9.6 实现点击搜索结果切换会话

## 10. 性能优化

- [x] 10.1 配置 react-virtuoso 虚拟滚动（SessionList 和 MessageList）
- [x] 10.2 实现图片懒加载（IntersectionObserver）
- [x] 10.3 添加搜索防抖（前端实时过滤）
- [x] 10.4 优化消息列表自动滚动性能（Virtuoso followOutput）
- [x] 10.5 实现工具调用卡片默认折叠
- [x] 10.6 添加 React.memo 优化组件重渲染
- [x] 10.7 分析并优化 bundle 大小

## 11. 错误处理和用户反馈

- [x] 11.1 实现 ErrorBoundary 组件
- [x] 11.2 添加网络请求错误 Toast 提示
- [x] 11.3 实现流式响应断线重连（最多 3 次）
- [x] 11.4 添加文件上传失败提示和重试
- [x] 11.5 实现会话删除确认对话框
- [x] 11.6 添加空状态 UI（无会话、无消息）
- [x] 11.7 实现加载状态 UI（Loader2）

## 12. 国际化支持

- [x] 12.1 添加 chat-interface 的中文文案（zh.json）
- [x] 12.2 添加 chat-interface 的英文文案（en.json）
- [x] 12.3 在所有 UI 组件中使用 useI18n
- [x] 12.4 实现日期时间本地化（formatRelativeTime）
- [x] 12.5 实现文件大小本地化（formatBytes）

## 13. 快捷键支持

- [x] 13.1 实现 Cmd/Ctrl + N 新建会话
- [x] 13.2 实现 Cmd/Ctrl + K 聚焦搜索框
- [x] 13.3 实现 Cmd/Ctrl + / 切换侧边栏
- [x] 13.4 实现 Esc 取消输入/关闭对话框
- [x] 13.5 实现 ↑/↓ 导航会话列表
- [x] 13.6 添加快捷键提示 UI（Tooltip）

## 14. 样式和动画

- [x] 14.1 实现消息气泡样式（用户/AI 不同颜色）
- [x] 14.2 添加侧边栏折叠/展开过渡动画
- [x] 14.3 实现流式响应的打字光标动画（animate-pulse）
- [ ] 14.4 添加消息发送/接收的淡入动画
- [ ] 14.5 实现工具调用卡片展开/折叠动画
- [x] 14.6 优化滚动条样式（使用默认样式）
- [x] 14.7 添加 hover 和 active 状态样式

## 15. 集成测试

- [x] 15.1 测试会话创建和切换流程
- [x] 15.2 测试消息发送和流式响应
- [x] 15.3 测试文件上传和附件发送
- [ ] 15.4 测试图片上传和视觉理解
- [x] 15.5 测试会话搜索功能
- [x] 15.6 测试会话删除和标题编辑
- [ ] 15.7 测试虚拟滚动和无限加载
- [ ] 15.8 测试错误场景和边界条件

## 16. 语音输入功能（新增）

- [x] 16.1 实现 useVoiceRecording hook（录音状态管理）
- [x] 16.2 实现 VoiceInput 组件（录音按钮、状态指示器）
- [x] 16.3 实现 MediaRecorder API 音频录制
- [x] 16.4 实现录音时长显示和控制
- [x] 16.5 实现后端 STT API（POST /api/stt/transcribe）
- [x] 16.6 集成 OpenAI Whisper 转录服务
- [x] 16.7 实现转录文本自动填充到输入框
- [ ] 16.8 添加录音权限请求和错误处理
- [ ] 16.9 支持其他 STT 提供商（Groq、本地 Whisper）

## 17. 文档和部署

- [ ] 17.1 编写组件使用文档
- [ ] 17.2 添加代码注释和 JSDoc
- [ ] 17.3 更新 README 添加使用说明
- [x] 17.4 配置生产环境构建（Electron）
- [ ] 17.5 性能测试和优化报告
- [ ] 17.6 创建用户使用指南
