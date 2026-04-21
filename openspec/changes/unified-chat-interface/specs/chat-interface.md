# 规格说明：统一对话界面

## 能力标识

**Capability**: `web-ui.chat.unified-interface`  
**版本**: 1.0.0  
**状态**: 提案中

## 功能描述

提供一个统一的对话界面，整合会话管理、实时 AI 对话和多模态输入能力，类似 ChatGPT/Claude.ai 的用户体验。

## 功能需求

### FR-1: 会话管理

**优先级**: P0  
**描述**: 用户可以创建、查看、切换和删除对话会话

#### FR-1.1: 创建新会话

**验收标准**:
- 点击"新对话"按钮创建会话
- 后端返回新的 sessionId
- UI 立即切换到新会话
- 新会话出现在侧边栏顶部
- 消息区域清空，显示欢迎界面

**API 接口**:
```
POST /api/sessions/create
Request: {
  source: "electron-chat",
  user_id: "local-user",
  title?: string  // 可选，默认由首条消息生成
}
Response: {
  session_id: string,
  created_at: number,
  title: string
}
```

**UI 行为**:
```typescript
const handleNewChat = async () => {
  const newSession = await api.createSession({
    source: "electron-chat",
    user_id: "local-user"
  });
  
  setCurrentSessionId(newSession.session_id);
  setMessages([]);
  addSessionToList(newSession);
  localStorage.setItem('lastSessionId', newSession.session_id);
};
```

#### FR-1.2: 加载会话列表

**验收标准**:
- 应用启动时加载最近 20 个会话
- 按时间倒序排列（最新在前）
- 按时间分组：今天/昨天/本周/更早
- 滚动到底部自动加载更多（分页）
- 显示会话标题、最后消息预览、时间戳

**API 接口**:
```
GET /api/sessions/list?limit=20&offset=0&source=electron-chat
Response: {
  sessions: [
    {
      session_id: string,
      title: string,
      created_at: number,
      updated_at: number,
      message_count: number,
      last_message: string,
      source: string
    }
  ],
  total: number,
  has_more: boolean
}
```

**分组逻辑**:
```typescript
const groupSessions = (sessions: Session[]) => {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  return {
    today: sessions.filter(s => s.updated_at > oneDayAgo),
    yesterday: sessions.filter(s => 
      s.updated_at <= oneDayAgo && s.updated_at > oneDayAgo - 24 * 60 * 60 * 1000
    ),
    thisWeek: sessions.filter(s => 
      s.updated_at <= oneDayAgo - 24 * 60 * 60 * 1000 && s.updated_at > oneWeekAgo
    ),
    earlier: sessions.filter(s => s.updated_at <= oneWeekAgo)
  };
};
```

#### FR-1.3: 切换会话

**验收标准**:
- 点击侧边栏会话项切换到该会话
- 高亮当前选中的会话
- 加载该会话的完整消息历史
- 自动滚动到最新消息
- 保存当前会话 ID 到 localStorage

**API 接口**:
```
GET /api/sessions/{session_id}/messages?limit=100
Response: {
  messages: [
    {
      message_id: string,
      role: "user" | "assistant" | "system" | "tool",
      content: string,
      timestamp: number,
      attachments?: Attachment[],
      tool_calls?: ToolCall[]
    }
  ],
  session: {
    session_id: string,
    title: string,
    created_at: number
  }
}
```

**加载状态**:
```typescript
const switchSession = async (sessionId: string) => {
  setMessagesLoadingState('loading');
  setCurrentSessionId(sessionId);
  setMessages([]); // 先清空
  
  try {
    const data = await api.getSessionMessages(sessionId);
    setMessages(data.messages);
    localStorage.setItem('lastSessionId', sessionId);
  } catch (error) {
    setMessagesLoadingState('error');
    showError('Failed to load session');
  } finally {
    setMessagesLoadingState('idle');
  }
};
```

#### FR-1.4: 删除会话

**验收标准**:
- 鼠标悬停会话项显示删除图标
- 点击删除弹出确认对话框
- 确认后立即从 UI 移除
- 后端删除会话数据
- 如果删除的是当前会话，切换到最近的会话或新建会话

**API 接口**:
```
DELETE /api/sessions/{session_id}
Response: {
  ok: boolean,
  deleted_session_id: string
}
```

**UI 行为**:
```typescript
const handleDeleteSession = async (sessionId: string) => {
  if (!confirm(t.chat.deleteConfirm)) return;
  
  try {
    await api.deleteSession(sessionId);
    
    // 从列表移除
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    
    // 如果删除的是当前会话
    if (currentSessionId === sessionId) {
      const remaining = sessions.filter(s => s.session_id !== sessionId);
      if (remaining.length > 0) {
        switchSession(remaining[0].session_id);
      } else {
        handleNewChat();
      }
    }
  } catch (error) {
    showError(t.chat.errors.deleteSessionFailed);
  }
};
```

#### FR-1.5: 编辑会话标题

**验收标准**:
- 点击会话标题进入编辑模式
- 输入框显示当前标题
- Enter 保存，Esc 取消
- 保存后立即更新 UI
- 后端持久化新标题

**API 接口**:
```
PUT /api/sessions/{session_id}
Request: {
  title: string
}
Response: {
  ok: boolean,
  session: {
    session_id: string,
    title: string,
    updated_at: number
  }
}
```

---

### FR-2: 消息发送和接收

**优先级**: P0  
**描述**: 用户可以发送文本消息，并实时接收 AI 的流式响应

#### FR-2.1: 发送文本消息

**验收标准**:
- 在输入框输入文本
- Enter 发送，Shift+Enter 换行
- 发送后输入框清空
- 用户消息立即显示（乐观更新）
- 禁用输入框直到响应完成

**乐观更新逻辑**:
```typescript
const sendMessage = async () => {
  if (!inputContent.trim() || isLoading) return;
  
  const userMessage: Message = {
    message_id: generateTempId(),
    role: "user",
    content: inputContent,
    timestamp: Date.now(),
    _optimistic: true  // 标记为乐观更新
  };
  
  // 立即显示
  setMessages(prev => [...prev, userMessage]);
  setInputContent('');
  setIsLoading(true);
  
  try {
    // 调用 API（见 FR-2.2）
    await startStreaming(currentSessionId, inputContent);
  } catch (error) {
    // 回滚乐观更新
    setMessages(prev => prev.filter(m => m.message_id !== userMessage.message_id));
    showError(t.chat.errors.messageSendFailed);
  } finally {
    setIsLoading(false);
  }
};
```

#### FR-2.2: 流式响应

**优先级**: P0  
**描述**: AI 响应实时逐字显示，提供打字机效果

**API 接口**:
```
GET /api/sessions/{session_id}/stream?message={content}
```

**SSE 事件格式**:
```
event: message
data: {"type": "content", "chunk": "这是"}

event: message
data: {"type": "content", "chunk": "一个"}

event: message
data: {"type": "content", "chunk": "流式"}

event: message
data: {"type": "content", "chunk": "响应"}

event: message
data: {"type": "tool_call", "tool": "read_file", "args": {...}}

event: message
data: {"type": "content", "chunk": "文件内容是..."}

event: message
data: {"type": "done", "message_id": "msg_123"}

event: message
data: {"type": "error", "error": "API error"}
```

**前端实现**:
```typescript
const startStreaming = async (sessionId: string, content: string) => {
  setMessagesLoadingState('streaming');
  setStreamingMessage('');
  
  const eventSource = new EventSource(
    `${API_BASE}/api/sessions/${sessionId}/stream?message=${encodeURIComponent(content)}`
  );
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case 'content':
        setStreamingMessage(prev => prev + data.chunk);
        break;
        
      case 'tool_call':
        // 显示工具调用（见 FR-3）
        addToolCall(data.tool, data.args);
        break;
        
      case 'done':
        // 保存完整消息
        const assistantMessage: Message = {
          message_id: data.message_id,
          role: "assistant",
          content: streamingMessage,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, assistantMessage]);
        setStreamingMessage('');
        setMessagesLoadingState('idle');
        eventSource.close();
        break;
        
      case 'error':
        showError(data.error);
        setMessagesLoadingState('error');
        eventSource.close();
        break;
    }
  };
  
  eventSource.onerror = () => {
    setMessagesLoadingState('error');
    eventSource.close();
    showError(t.chat.errors.streamingFailed);
  };
};
```

**验收标准**:
- AI 响应逐字显示
- 显示打字指示器（光标闪烁）
- 自动滚动到最新内容
- 支持中断/取消（关闭 EventSource）
- 网络断开自动重试
- 错误时显示友好提示

#### FR-2.3: 工具调用可视化

**优先级**: P0  
**描述**: AI 使用工具时显示工具调用详情

**验收标准**:
- 工具调用显示为独立卡片
- 默认折叠，显示工具名称
- 点击展开查看参数和结果
- 不同工具类型有不同图标
- 工具调用失败时显示错误

**UI 设计**:
```
┌──────────────────────────────────────┐
│ 🔧 read_file                         │  ← 折叠状态
│    tool_call_abc123          [▼]    │
└──────────────────────────────────────┘

点击后展开：
┌──────────────────────────────────────┐
│ 🔧 read_file                  [▲]   │  ← 展开状态
│    tool_call_abc123                  │
├──────────────────────────────────────┤
│ Arguments:                           │
│ {                                    │
│   "path": "/path/to/file.py",       │
│   "encoding": "utf-8"                │
│ }                                    │
├──────────────────────────────────────┤
│ Result:                              │
│ def hello_world():                   │
│     print("Hello, World!")           │
└──────────────────────────────────────┘
```

**数据结构**:
```typescript
interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;  // JSON string
  };
  result?: string;
  error?: string;
  status: 'pending' | 'success' | 'error';
}
```

---

### FR-3: 多模态输入 - 文件上传

**优先级**: P0  
**描述**: 用户可以上传文件作为对话上下文

#### FR-3.1: 文件选择和预览

**验收标准**:
- 点击 📎 按钮打开文件选择器
- 支持多文件选择
- 拖拽文件到输入区自动识别
- 显示文件预览（名称、大小、类型）
- 支持删除单个文件
- 限制文件大小（默认 10MB）
- 限制文件类型（配置化）

**支持的文件类型**（Phase 1）:
- 文本文件: `.txt`, `.md`, `.json`, `.yaml`, `.toml`
- 代码文件: `.py`, `.js`, `.ts`, `.tsx`, `.java`, `.go`, `.rs`, `.c`, `.cpp`
- 文档文件: `.pdf`
- 其他: `.csv`, `.xml`, `.html`

**UI 组件**:
```typescript
interface Attachment {
  id: string;
  type: 'file' | 'image' | 'audio' | 'folder';
  name: string;
  size: number;
  mimeType: string;
  localFile?: File;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'error';
  uploadProgress?: number;
  serverPath?: string;
  error?: string;
}

const AttachmentPreview = ({ attachment, onRemove }: Props) => {
  return (
    <div className="attachment-preview">
      <FileIcon type={attachment.mimeType} />
      <div className="info">
        <div className="name">{attachment.name}</div>
        <div className="size">{formatBytes(attachment.size)}</div>
      </div>
      {attachment.uploadStatus === 'uploading' && (
        <ProgressBar value={attachment.uploadProgress} />
      )}
      <IconButton icon={X} onClick={() => onRemove(attachment.id)} />
    </div>
  );
};
```

#### FR-3.2: 文件上传

**验收标准**:
- 后台异步上传，不阻塞 UI
- 显示上传进度条
- 支持取消上传
- 上传失败显示错误，支持重试
- 多个文件并行上传
- 上传完成后才能发送消息

**API 接口**:
```
POST /api/attachments/upload
Request: FormData {
  file: File,
  session_id: string,
  message_id?: string  // 可选，关联到具体消息
}
Response: {
  attachment_id: string,
  path: string,
  url: string,
  name: string,
  size: number,
  mime_type: string
}
```

**上传逻辑**:
```typescript
const uploadFile = async (file: File) => {
  const attachmentId = generateId();
  
  const attachment: Attachment = {
    id: attachmentId,
    type: 'file',
    name: file.name,
    size: file.size,
    mimeType: file.type,
    localFile: file,
    uploadStatus: 'pending'
  };
  
  setAttachments(prev => [...prev, attachment]);
  
  try {
    setAttachmentStatus(attachmentId, 'uploading');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', currentSessionId!);
    
    const xhr = new XMLHttpRequest();
    
    // 监听上传进度
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        setAttachmentProgress(attachmentId, progress);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        updateAttachment(attachmentId, {
          serverPath: result.path,
          uploadStatus: 'uploaded'
        });
      } else {
        throw new Error('Upload failed');
      }
    };
    
    xhr.onerror = () => {
      throw new Error('Network error');
    };
    
    xhr.open('POST', `${API_BASE}/api/attachments/upload`);
    xhr.send(formData);
    
  } catch (error) {
    setAttachmentStatus(attachmentId, 'error');
    setAttachmentError(attachmentId, error.message);
  }
};
```

#### FR-3.3: 发送带附件的消息

**验收标准**:
- 等待所有附件上传完成
- 消息中包含附件引用
- AI 可以读取附件内容
- 消息历史中显示附件

**API 接口**:
```
POST /api/sessions/{session_id}/message
Request: {
  content: string,
  attachments: [
    {
      attachment_id: string,
      type: 'file' | 'image',
      path: string,
      name: string
    }
  ]
}
Response: {
  message_id: string,
  created_at: number
}
```

**发送逻辑**:
```typescript
const sendMessageWithAttachments = async () => {
  // 检查所有附件是否上传完成
  const allUploaded = attachments.every(a => a.uploadStatus === 'uploaded');
  if (!allUploaded) {
    showWarning(t.chat.waitForUpload);
    return;
  }
  
  const userMessage: Message = {
    message_id: generateTempId(),
    role: "user",
    content: inputContent,
    timestamp: Date.now(),
    attachments: attachments.map(a => ({
      id: a.id,
      type: a.type,
      name: a.name,
      path: a.serverPath!
    }))
  };
  
  setMessages(prev => [...prev, userMessage]);
  setInputContent('');
  setAttachments([]);
  
  // 开始流式响应
  await startStreaming(currentSessionId, {
    content: inputContent,
    attachments: userMessage.attachments
  });
};
```

---

### FR-4: 多模态输入 - 图片

**优先级**: P0  
**描述**: 用户可以上传图片，AI 进行视觉理解

#### FR-4.1: 图片选择和预览

**验收标准**:
- 点击 🖼️ 按钮打开图片选择器
- 支持格式: PNG, JPEG, GIF, WebP
- 显示图片缩略图预览
- 限制大小（默认 5MB）
- 自动压缩大图片
- 支持拖拽上传

**缩略图生成**:
```typescript
const generateThumbnail = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        // 缩小到最大 200x200
        const maxSize = 200;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
};
```

#### FR-4.2: 图片上传和展示

**验收标准**:
- 图片上传到服务器
- 消息中显示图片
- 点击图片放大查看
- AI 可以分析图片内容

**存储结构**:
```
~/.hermes/data/attachments/{session_id}/
├── images/
│   ├── {message_id}_original.png
│   └── {message_id}_thumb.webp
```

**Claude API 集成**:
```python
# Backend: 发送图片给 Claude
response = client.messages.create(
    model="claude-3-sonnet-20240229",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": base64_image_data
                    }
                },
                {
                    "type": "text",
                    "text": "这张图片里有什么？"
                }
            ]
        }
    ]
)
```

---

### FR-5: 搜索功能

**优先级**: P1  
**描述**: 用户可以搜索历史会话和消息

#### FR-5.1: 会话搜索

**验收标准**:
- 侧边栏顶部显示搜索框
- 输入关键词实时搜索（300ms 防抖）
- 搜索结果高亮匹配文本
- 支持中英文搜索
- 显示匹配的消息片段

**API 接口**:
```
GET /api/sessions/search?q={query}&limit=20
Response: {
  results: [
    {
      session_id: string,
      title: string,
      snippet: string,  // 匹配的文本片段，>>>match<<< 包裹
      score: number,
      created_at: number
    }
  ],
  total: number
}
```

**FTS5 后端实现**:
```python
# Backend: SQLite FTS5 search
cursor.execute("""
    SELECT 
        sessions.session_id,
        sessions.title,
        snippet(messages_fts, 'content', '>>>', '<<<', '...', 64) as snippet,
        rank
    FROM messages_fts
    JOIN sessions ON messages_fts.session_id = sessions.session_id
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
""", (query, limit))
```

---

## 非功能需求

### NFR-1: 性能

**描述**: 界面响应流畅，无明显卡顿

**指标**:
- 首屏加载 < 1 秒
- 会话切换 < 200ms
- 流式响应延迟 < 100ms
- 滚动流畅 60fps
- 处理 1000+ 会话不卡顿

**实现方式**:
- 虚拟滚动（react-virtuoso）
- 分页加载会话
- 图片懒加载
- 工具调用默认折叠
- 使用 Web Worker 处理大文件

### NFR-2: 可访问性

**描述**: 支持键盘导航和屏幕阅读器

**要求**:
- 所有交互元素可通过 Tab 访问
- 语义化 HTML 标签
- ARIA 标签完整
- 支持常用快捷键

**快捷键**:
- `Cmd/Ctrl + N`: 新对话
- `Cmd/Ctrl + K`: 搜索
- `Cmd/Ctrl + /`: 切换侧边栏
- `Esc`: 取消输入/关闭对话框
- `↑/↓`: 导航会话列表

### NFR-3: 响应式设计

**描述**: 适配不同屏幕尺寸

**断点**:
- Desktop: ≥ 1024px - 完整布局
- Tablet: 768px - 1023px - 可折叠侧边栏
- Mobile: < 768px - 全屏，底部导航

### NFR-4: 国际化

**描述**: 支持中英文切换

**要求**:
- 所有 UI 文本通过 i18n 系统
- 日期时间本地化
- 数字格式本地化
- RTL 布局支持（未来）

---

## 测试需求

### 测试场景 1: 创建和切换会话

**前置条件**: 应用已启动  
**操作步骤**:
1. 点击"新对话"按钮
2. 发送一条消息
3. 再次点击"新对话"
4. 发送另一条消息
5. 在侧边栏点击第一个会话

**预期结果**:
- 成功创建两个会话
- 切换后显示正确的消息历史
- 当前会话高亮显示

### 测试场景 2: 流式响应

**前置条件**: 已有活跃会话  
**操作步骤**:
1. 输入"写一首诗"
2. 按 Enter 发送
3. 观察响应过程

**预期结果**:
- 用户消息立即显示
- AI 响应逐字出现
- 显示打字指示器
- 自动滚动到底部
- 响应完成后可以继续输入

### 测试场景 3: 上传文件

**前置条件**: 已有活跃会话  
**操作步骤**:
1. 点击 📎 按钮
2. 选择一个 Python 文件
3. 等待上传完成
4. 输入"分析这个文件"
5. 发送消息

**预期结果**:
- 文件显示在预览区
- 显示上传进度
- AI 能够读取文件内容
- 消息历史中显示附件

### 测试场景 4: 搜索会话

**前置条件**: 已有多个会话  
**操作步骤**:
1. 在搜索框输入关键词
2. 观察搜索结果
3. 点击某个结果

**预期结果**:
- 实时显示匹配结果
- 关键词高亮
- 点击后切换到该会话

---

## 依赖关系

### API 依赖

**新增 API**:
- `POST /api/sessions/create`
- `GET /api/sessions/list`
- `GET /api/sessions/{id}/messages`
- `GET /api/sessions/{id}/stream` (SSE)
- `PUT /api/sessions/{id}`
- `DELETE /api/sessions/{id}`
- `POST /api/attachments/upload`
- `GET /api/sessions/search`

**修改 API**:
- `POST /api/sessions/{id}/message` - 支持 attachments 字段

### 组件依赖

**外部库**:
- `react-virtuoso`: 虚拟滚动
- `lucide-react`: 图标
- 现有 UI 组件库

---

## 验收标准总结

✅ **功能完整性**:
- 所有 FR 需求实现
- 核心流程可端到端测试
- 错误场景有友好提示

✅ **性能标准**:
- 满足 NFR-1 所有指标
- 无内存泄漏
- 长时间使用稳定

✅ **用户体验**:
- 界面响应流畅
- 交互符合直觉
- 国际化完整

✅ **代码质量**:
- TypeScript 编译通过
- 组件职责清晰
- 代码有注释

---

**文档版本**: 1.0.0  
**创建日期**: 2026-04-17  
**最后更新**: 2026-04-17
