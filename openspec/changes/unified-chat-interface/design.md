# 设计文档：统一对话界面

## 设计概览

本文档详细描述统一对话界面的技术设计，包括组件架构、状态管理、数据流、API 设计和实现细节。

### 核心设计原则

1. **组件化**：单一职责，可复用
2. **类型安全**：完整 TypeScript 类型定义
3. **性能优先**：虚拟滚动，懒加载
4. **用户体验**：流畅交互，清晰反馈
5. **可维护性**：清晰架构，详细注释

---

## 组件架构

### 组件树

```
ChatPage (Container)
├─ Layout
│   ├─ Sidebar (250px, collapsible)
│   │   ├─ SidebarHeader
│   │   │   ├─ NewChatButton
│   │   │   └─ SearchInput
│   │   ├─ SessionList (virtualized)
│   │   │   ├─ SessionGroup ("今天", "昨天", ...)
│   │   │   └─ SessionItem[]
│   │   │       ├─ SessionTitle
│   │   │       ├─ LastMessagePreview
│   │   │       ├─ Timestamp
│   │   │       └─ Actions (delete)
│   │   └─ SidebarFooter
│   │       ├─ SettingsButton
│   │       └─ CollapseButton
│   │
│   └─ ChatArea (flex-1)
│       ├─ ChatHeader
│       │   ├─ SessionTitle (editable)
│       │   └─ Actions (edit, delete)
│       ├─ MessageList (virtualized)
│       │   └─ MessageBubble[]
│       │       ├─ RoleIndicator
│       │       ├─ MessageContent (Markdown)
│       │       ├─ AttachmentList
│       │       │   └─ AttachmentItem[]
│       │       ├─ ToolCallList
│       │       │   └─ ToolCallItem[]
│       │       └─ Timestamp
│       ├─ StreamingIndicator (when streaming)
│       └─ InputArea
│           ├─ AttachmentPreview[]
│           ├─ Textarea (auto-resize)
│           ├─ AttachmentButtons
│           │   ├─ FileButton (📎)
│           │   ├─ ImageButton (🖼️)
│           │   ├─ VoiceButton (🎤) [P1]
│           │   └─ FolderButton (📁) [P1]
│           └─ SendButton
```

### 组件职责

#### ChatPage (Container)

**职责**：
- 全局状态管理
- 会话生命周期
- API 调用协调
- 错误处理

**状态**:
```typescript
interface ChatPageState {
  // 会话
  sessions: SessionSummary[];
  currentSessionId: string | null;
  sessionLoadingState: {
    isLoading: boolean;
    hasMore: boolean;
    offset: number;
  };
  
  // 消息
  messages: Message[];
  messagesLoadingState: 'idle' | 'loading' | 'streaming' | 'error';
  streamingMessage: string;
  
  // 输入
  inputContent: string;
  attachments: Attachment[];
  
  // UI
  sidebarCollapsed: boolean;
  searchQuery: string;
  editingSessionId: string | null;
}
```

**关键方法**:
```typescript
// 会话管理
const createNewSession = async () => Session;
const switchSession = async (id: string) => void;
const deleteSession = async (id: string) => void;
const loadMoreSessions = async () => void;

// 消息管理
const sendMessage = async () => void;
const startStreaming = (id: string, content: string) => void;
const cancelStreaming = () => void;

// 附件管理
const addAttachment = (file: File) => void;
const removeAttachment = (id: string) => void;
const uploadAttachment = (id: string) => Promise<void>;
```

#### Sidebar

**职责**：
- 显示会话列表
- 处理搜索
- 会话分组
- 可折叠

**Props**:
```typescript
interface SidebarProps {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  searchQuery: string;
  collapsed: boolean;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onSearch: (query: string) => void;
  onToggleCollapse: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
}
```

**实现细节**:
```typescript
const Sidebar = ({
  sessions,
  currentSessionId,
  searchQuery,
  collapsed,
  ...handlers
}: SidebarProps) => {
  const groupedSessions = useMemo(() => groupByDate(sessions), [sessions]);
  
  if (collapsed) {
    return <CollapsedSidebar onToggle={handlers.onToggleCollapse} />;
  }
  
  return (
    <div className="sidebar">
      <SidebarHeader
        onNewChat={handlers.onNewChat}
        searchQuery={searchQuery}
        onSearch={handlers.onSearch}
      />
      
      <Virtuoso
        data={Object.entries(groupedSessions)}
        endReached={handlers.onLoadMore}
        itemContent={(index, [group, items]) => (
          <SessionGroup
            title={group}
            sessions={items}
            currentSessionId={currentSessionId}
            onSelect={handlers.onSelectSession}
            onDelete={handlers.onDeleteSession}
          />
        )}
      />
      
      <SidebarFooter onToggle={handlers.onToggleCollapse} />
    </div>
  );
};
```

#### MessageList

**职责**：
- 显示消息历史
- 虚拟滚动
- 自动滚动到底部
- 流式消息实时更新

**Props**:
```typescript
interface MessageListProps {
  messages: Message[];
  streamingMessage?: string;
  isStreaming: boolean;
  onLoadMore?: () => void;
}
```

**虚拟滚动实现**:
```typescript
const MessageList = ({
  messages,
  streamingMessage,
  isStreaming
}: MessageListProps) => {
  const virtuoso = useRef<VirtuosoHandle>(null);
  
  // 自动滚动到底部
  useEffect(() => {
    if (isStreaming || messages.length > 0) {
      virtuoso.current?.scrollToIndex({
        index: messages.length,
        behavior: 'smooth'
      });
    }
  }, [messages.length, streamingMessage, isStreaming]);
  
  return (
    <Virtuoso
      ref={virtuoso}
      data={messages}
      followOutput="smooth"
      itemContent={(index, message) => (
        <MessageBubble key={message.message_id} message={message} />
      )}
      components={{
        Footer: () => (
          isStreaming && streamingMessage ? (
            <MessageBubble
              message={{
                message_id: 'streaming',
                role: 'assistant',
                content: streamingMessage,
                timestamp: Date.now(),
                _streaming: true
              }}
            />
          ) : null
        )
      }}
    />
  );
};
```

#### InputArea

**职责**：
- 文本输入
- 附件管理
- 发送控制
- 快捷键处理

**Props**:
```typescript
interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  attachments: Attachment[];
  onAddAttachment: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  disabled: boolean;
  isStreaming: boolean;
}
```

**实现细节**:
```typescript
const InputArea = ({
  value,
  onChange,
  onSend,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  disabled,
  isStreaming
}: InputAreaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    onAddAttachment(files);
  };
  
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    
    if (files.length > 0) {
      e.preventDefault();
      onAddAttachment(files);
    }
  };
  
  return (
    <div
      className="input-area"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {attachments.length > 0 && (
        <AttachmentPreviewList
          attachments={attachments}
          onRemove={onRemoveAttachment}
        />
      )}
      
      <div className="input-container">
        <AttachmentButtons
          onFile={() => fileInputRef.current?.click()}
          onImage={() => fileInputRef.current?.click()}
          disabled={disabled}
        />
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.py,.js,.json,.pdf,image/*"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            onAddAttachment(files);
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
        
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t.chat.placeholder}
          disabled={disabled}
          className="flex-1"
        />
        
        <Button
          onClick={onSend}
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          variant={isStreaming ? "destructive" : "primary"}
        >
          {isStreaming ? (
            <Square className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
};
```

---

## 状态管理设计

### 状态流

```
┌─────────────────────────────────────────────────────────────┐
│                    State Management Flow                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User Action                                                 │
│      │                                                       │
│      ▼                                                       │
│  Event Handler (ChatPage)                                    │
│      │                                                       │
│      ├─► Local State Update (optimistic)                    │
│      │                                                       │
│      └─► API Call                                           │
│             │                                                │
│             ├─► Success                                      │
│             │   └─► Confirm State Update                    │
│             │                                                │
│             └─► Error                                        │
│                 ├─► Rollback State                          │
│                 └─► Show Error Toast                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Context 结构

```typescript
// 会话上下文
interface SessionContextValue {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  loading: boolean;
  error: string | null;
  
  createSession: () => Promise<Session>;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  updateSession: (id: string, data: Partial<Session>) => Promise<void>;
  loadMoreSessions: () => Promise<void>;
}

// 消息上下文
interface MessageContextValue {
  messages: Message[];
  streamingMessage: string;
  isStreaming: boolean;
  loading: boolean;
  error: string | null;
  
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  cancelStreaming: () => void;
  deleteMessage: (id: string) => Promise<void>;
}

// UI 上下文
interface UIContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  toast: {
    show: (message: string, type: 'success' | 'error' | 'warning') => void;
    hide: () => void;
  };
}
```

### Custom Hooks

#### useSessions

```typescript
const useSessions = () => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  // 初始加载
  useEffect(() => {
    loadInitialSessions();
  }, []);
  
  const loadInitialSessions = async () => {
    setLoading(true);
    try {
      const data = await api.getSessions(20, 0);
      setSessions(data.sessions);
      setHasMore(data.has_more);
      setOffset(data.sessions.length);
      
      // 恢复上次会话
      const lastSessionId = localStorage.getItem('lastSessionId');
      if (lastSessionId && data.sessions.find(s => s.session_id === lastSessionId)) {
        setCurrentSessionId(lastSessionId);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadMoreSessions = async () => {
    if (!hasMore || loading) return;
    
    setLoading(true);
    try {
      const data = await api.getSessions(20, offset);
      setSessions(prev => [...prev, ...data.sessions]);
      setHasMore(data.has_more);
      setOffset(prev => prev + data.sessions.length);
    } catch (error) {
      console.error('Failed to load more sessions:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const createSession = async () => {
    const newSession = await api.createSession({
      source: 'electron-chat',
      user_id: 'local-user'
    });
    
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.session_id);
    localStorage.setItem('lastSessionId', newSession.session_id);
    
    return newSession;
  };
  
  const deleteSession = async (sessionId: string) => {
    await api.deleteSession(sessionId);
    
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    
    if (currentSessionId === sessionId) {
      const remaining = sessions.filter(s => s.session_id !== sessionId);
      if (remaining.length > 0) {
        setCurrentSessionId(remaining[0].session_id);
      } else {
        await createSession();
      }
    }
  };
  
  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loading,
    hasMore,
    createSession,
    deleteSession,
    loadMoreSessions
  };
};
```

#### useStreamingResponse

```typescript
const useStreamingResponse = () => {
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const startStreaming = useCallback(async (
    sessionId: string,
    content: string,
    attachments?: Attachment[]
  ) => {
    setIsStreaming(true);
    setStreamingMessage('');
    setError(null);
    
    const params = new URLSearchParams({
      message: content
    });
    
    if (attachments && attachments.length > 0) {
      params.set('attachments', JSON.stringify(attachments));
    }
    
    const eventSource = new EventSource(
      `${API_BASE}/api/sessions/${sessionId}/stream?${params.toString()}`
    );
    
    eventSourceRef.current = eventSource;
    
    return new Promise<Message>((resolve, reject) => {
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'content':
            setStreamingMessage(prev => prev + data.chunk);
            break;
            
          case 'tool_call':
            // 处理工具调用（见后续章节）
            break;
            
          case 'done':
            const message: Message = {
              message_id: data.message_id,
              role: 'assistant',
              content: streamingMessage,
              timestamp: Date.now()
            };
            
            setIsStreaming(false);
            setStreamingMessage('');
            eventSource.close();
            eventSourceRef.current = null;
            resolve(message);
            break;
            
          case 'error':
            setIsStreaming(false);
            setError(data.error);
            eventSource.close();
            eventSourceRef.current = null;
            reject(new Error(data.error));
            break;
        }
      };
      
      eventSource.onerror = () => {
        setIsStreaming(false);
        setError('Connection lost');
        eventSource.close();
        eventSourceRef.current = null;
        reject(new Error('Connection lost'));
      };
    });
  }, [streamingMessage]);
  
  const cancelStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      setStreamingMessage('');
    }
  }, []);
  
  // 清理
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
  
  return {
    streamingMessage,
    isStreaming,
    error,
    startStreaming,
    cancelStreaming
  };
};
```

#### useAttachments

```typescript
const useAttachments = () => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  const addAttachment = useCallback(async (file: File) => {
    const attachmentId = generateId();
    
    const attachment: Attachment = {
      id: attachmentId,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      localFile: file,
      uploadStatus: 'pending'
    };
    
    // 为图片生成预览
    if (attachment.type === 'image') {
      attachment.localPreview = await generateThumbnail(file);
    }
    
    setAttachments(prev => [...prev, attachment]);
    
    // 自动开始上传
    uploadAttachment(attachmentId);
  }, []);
  
  const uploadAttachment = useCallback(async (attachmentId: string) => {
    const attachment = attachments.find(a => a.id === attachmentId);
    if (!attachment || !attachment.localFile) return;
    
    setAttachmentStatus(attachmentId, 'uploading');
    
    try {
      const formData = new FormData();
      formData.append('file', attachment.localFile);
      formData.append('session_id', currentSessionId!);
      
      const result = await api.uploadAttachment(formData, (progress) => {
        setAttachmentProgress(attachmentId, progress);
      });
      
      updateAttachment(attachmentId, {
        serverPath: result.path,
        uploadStatus: 'uploaded'
      });
    } catch (error) {
      setAttachmentStatus(attachmentId, 'error');
      setAttachmentError(attachmentId, error.message);
    }
  }, [attachments, currentSessionId]);
  
  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  }, []);
  
  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);
  
  const setAttachmentStatus = useCallback((
    id: string,
    status: Attachment['uploadStatus']
  ) => {
    setAttachments(prev => prev.map(a =>
      a.id === id ? { ...a, uploadStatus: status } : a
    ));
  }, []);
  
  const setAttachmentProgress = useCallback((id: string, progress: number) => {
    setAttachments(prev => prev.map(a =>
      a.id === id ? { ...a, uploadProgress: progress } : a
    ));
  }, []);
  
  const updateAttachment = useCallback((
    id: string,
    updates: Partial<Attachment>
  ) => {
    setAttachments(prev => prev.map(a =>
      a.id === id ? { ...a, ...updates } : a
    ));
  }, []);
  
  const setAttachmentError = useCallback((id: string, error: string) => {
    setAttachments(prev => prev.map(a =>
      a.id === id ? { ...a, error } : a
    ));
  }, []);
  
  return {
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
    uploadAttachment
  };
};
```

---

## API 设计

### 后端 API 端点

```python
# ============================================================
#  Gateway API Endpoints
# ============================================================

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/api")

# ────────────────────────────────────────────────────────
#  Session Management
# ────────────────────────────────────────────────────────

@router.post("/sessions/create")
async def create_session(
    source: str = "electron-chat",
    user_id: str = "local-user",
    title: str | None = None
) -> dict:
    """创建新会话"""
    session_id = generate_session_id()
    now = time.time()
    
    db.execute("""
        INSERT INTO sessions (session_id, source, user_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (session_id, source, user_id, title or "New Chat", now, now))
    
    return {
        "session_id": session_id,
        "title": title or "New Chat",
        "created_at": now,
        "message_count": 0
    }


@router.get("/sessions/list")
async def list_sessions(
    limit: int = 20,
    offset: int = 0,
    source: str | None = None
) -> dict:
    """获取会话列表"""
    query = """
        SELECT 
            s.session_id,
            s.title,
            s.created_at,
            s.updated_at,
            s.source,
            COUNT(m.message_id) as message_count,
            (
                SELECT content 
                FROM messages 
                WHERE session_id = s.session_id 
                ORDER BY timestamp DESC 
                LIMIT 1
            ) as last_message
        FROM sessions s
        LEFT JOIN messages m ON s.session_id = m.session_id
        WHERE (? IS NULL OR s.source = ?)
        GROUP BY s.session_id
        ORDER BY s.updated_at DESC
        LIMIT ? OFFSET ?
    """
    
    sessions = db.execute(query, (source, source, limit, offset)).fetchall()
    
    total = db.execute(
        "SELECT COUNT(*) FROM sessions WHERE (? IS NULL OR source = ?)",
        (source, source)
    ).fetchone()[0]
    
    return {
        "sessions": [dict(s) for s in sessions],
        "total": total,
        "has_more": offset + len(sessions) < total
    }


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    limit: int = 100
) -> dict:
    """获取会话消息"""
    session = db.execute(
        "SELECT * FROM sessions WHERE session_id = ?",
        (session_id,)
    ).fetchone()
    
    if not session:
        raise HTTPException(404, "Session not found")
    
    messages = db.execute("""
        SELECT * FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT ?
    """, (session_id, limit)).fetchall()
    
    return {
        "session": dict(session),
        "messages": [dict(m) for m in messages]
    }


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    title: str | None = None
) -> dict:
    """更新会话"""
    updates = {}
    if title is not None:
        updates["title"] = title
    
    if not updates:
        raise HTTPException(400, "No updates provided")
    
    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values()) + [time.time(), session_id]
    
    db.execute(
        f"UPDATE sessions SET {set_clause}, updated_at = ? WHERE session_id = ?",
        values
    )
    
    session = db.execute(
        "SELECT * FROM sessions WHERE session_id = ?",
        (session_id,)
    ).fetchone()
    
    return {
        "ok": True,
        "session": dict(session)
    }


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> dict:
    """删除会话"""
    # 删除消息
    db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    
    # 删除会话
    db.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
    
    # 删除附件文件
    attachment_dir = Path(f"$HERMES_HOME/data/attachments/{session_id}").expanduser()
    if attachment_dir.exists():
        shutil.rmtree(attachment_dir)
    
    return {
        "ok": True,
        "deleted_session_id": session_id
    }


# ────────────────────────────────────────────────────────
#  Message Streaming
# ────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/stream")
async def stream_message(
    session_id: str,
    message: str,
    attachments: str | None = None
) -> EventSourceResponse:
    """流式响应"""
    
    async def event_generator():
        try:
            # 保存用户消息
            user_message_id = save_message(
                session_id=session_id,
                role="user",
                content=message,
                attachments=json.loads(attachments) if attachments else None
            )
            
            # 调用 Agent
            accumulated_content = ""
            
            async for event in agent.stream_response(
                session_id=session_id,
                message=message,
                attachments=json.loads(attachments) if attachments else None
            ):
                if event.type == "content_delta":
                    accumulated_content += event.chunk
                    yield {
                        "event": "message",
                        "data": json.dumps({
                            "type": "content",
                            "chunk": event.chunk
                        })
                    }
                
                elif event.type == "tool_call":
                    yield {
                        "event": "message",
                        "data": json.dumps({
                            "type": "tool_call",
                            "tool": event.tool_name,
                            "args": event.args,
                            "id": event.tool_call_id
                        })
                    }
                
                elif event.type == "error":
                    yield {
                        "event": "message",
                        "data": json.dumps({
                            "type": "error",
                            "error": str(event.error)
                        })
                    }
                    return
            
            # 保存助手消息
            assistant_message_id = save_message(
                session_id=session_id,
                role="assistant",
                content=accumulated_content
            )
            
            # 更新会话时间
            db.execute(
                "UPDATE sessions SET updated_at = ? WHERE session_id = ?",
                (time.time(), session_id)
            )
            
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "done",
                    "message_id": assistant_message_id
                })
            }
            
        except Exception as e:
            logger.exception("Streaming error")
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "error",
                    "error": str(e)
                })
            }
    
    return EventSourceResponse(event_generator())


# ────────────────────────────────────────────────────────
#  Attachment Management
# ────────────────────────────────────────────────────────

@router.post("/attachments/upload")
async def upload_attachment(
    file: UploadFile,
    session_id: str
) -> dict:
    """上传附件"""
    attachment_id = generate_id()
    filename = secure_filename(file.filename)
    
    # 保存文件
    session_dir = Path(f"$HERMES_HOME/data/attachments/{session_id}").expanduser()
    session_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = session_dir / f"{attachment_id}_{filename}"
    
    with file_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # 生成缩略图（如果是图片）
    if file.content_type.startswith("image/"):
        thumb_path = generate_thumbnail(file_path)
    
    return {
        "attachment_id": attachment_id,
        "path": str(file_path),
        "url": f"/api/attachments/{attachment_id}",
        "name": filename,
        "size": file_path.stat().st_size,
        "mime_type": file.content_type
    }


@router.get("/attachments/{attachment_id}")
async def get_attachment(attachment_id: str):
    """获取附件"""
    # 查找文件
    attachments_dir = Path("$HERMES_HOME/data/attachments").expanduser()
    
    for session_dir in attachments_dir.iterdir():
        for file_path in session_dir.iterdir():
            if file_path.name.startswith(attachment_id):
                return FileResponse(file_path)
    
    raise HTTPException(404, "Attachment not found")


# ────────────────────────────────────────────────────────
#  Search
# ────────────────────────────────────────────────────────

@router.get("/sessions/search")
async def search_sessions(
    q: str,
    limit: int = 20
) -> dict:
    """搜索会话"""
    results = db.execute("""
        SELECT 
            s.session_id,
            s.title,
            s.created_at,
            snippet(messages_fts, 'content', '>>>', '<<<', '...', 64) as snippet,
            bm25(messages_fts) as score
        FROM messages_fts
        JOIN sessions s ON messages_fts.session_id = s.session_id
        WHERE messages_fts MATCH ?
        ORDER BY score
        LIMIT ?
    """, (q, limit)).fetchall()
    
    return {
        "results": [dict(r) for r in results],
        "total": len(results)
    }
```

---

## 性能优化

### 虚拟滚动

**问题**：会话列表和消息列表可能非常长，全部渲染会导致性能问题。

**解决方案**：使用 react-virtuoso

```typescript
// 会话列表虚拟滚动
<Virtuoso
  data={sessions}
  endReached={loadMoreSessions}
  itemContent={(index, session) => (
    <SessionItem
      session={session}
      active={session.session_id === currentSessionId}
      onSelect={() => switchSession(session.session_id)}
      onDelete={() => deleteSession(session.session_id)}
    />
  )}
  components={{
    List: forwardRef(({ children, ...props }, ref) => (
      <div ref={ref} {...props} className="session-list">
        {children}
      </div>
    ))
  }}
/>

// 消息列表虚拟滚动
<Virtuoso
  data={messages}
  followOutput="smooth"  // 自动滚动到底部
  itemContent={(index, message) => (
    <MessageBubble message={message} />
  )}
  components={{
    Footer: () => (
      isStreaming ? (
        <MessageBubble
          message={{
            message_id: 'streaming',
            role: 'assistant',
            content: streamingMessage,
            timestamp: Date.now(),
            _streaming: true
          }}
        />
      ) : null
    )
  }}
/>
```

### 懒加载

**图片懒加载**：
```typescript
const LazyImage = ({ src, alt }: { src: string; alt: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (imgRef.current) {
      observer.observe(imgRef.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <div ref={imgRef} className="lazy-image-container">
      {inView && (
        <>
          {!loaded && <Skeleton className="w-full h-full" />}
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            className={cn("transition-opacity", loaded ? "opacity-100" : "opacity-0")}
          />
        </>
      )}
    </div>
  );
};
```

### 防抖和节流

**搜索防抖**：
```typescript
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
};

// 使用
const [searchQuery, setSearchQuery] = useState('');
const debouncedQuery = useDebounce(searchQuery, 300);

useEffect(() => {
  if (debouncedQuery) {
    searchSessions(debouncedQuery);
  }
}, [debouncedQuery]);
```

---

## 错误处理

### 错误边界

```typescript
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <pre>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

### Toast 通知

```typescript
interface ToastContextValue {
  show: (message: string, type: 'success' | 'error' | 'warning') => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);
  
  const show = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  
  const hide = useCallback(() => {
    setToast(null);
  }, []);
  
  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {toast && (
        <div className={cn("toast", `toast-${toast.type}`)}>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
};
```

---

## 测试策略

### 单元测试

```typescript
// 测试 useSessions hook
describe('useSessions', () => {
  it('should load initial sessions', async () => {
    const { result, waitFor } = renderHook(() => useSessions());
    
    await waitFor(() => expect(result.current.loading).toBe(false));
    
    expect(result.current.sessions.length).toBeGreaterThan(0);
  });
  
  it('should create a new session', async () => {
    const { result } = renderHook(() => useSessions());
    
    await act(async () => {
      const session = await result.current.createSession();
      expect(session.session_id).toBeDefined();
    });
    
    expect(result.current.sessions[0].session_id).toBeDefined();
  });
});
```

### 集成测试

```typescript
// 测试完整的发送消息流程
describe('Send Message Flow', () => {
  it('should send a message and receive streaming response', async () => {
    render(<ChatPage />);
    
    // 创建新会话
    await userEvent.click(screen.getByText(/new chat/i));
    
    // 输入消息
    const input = screen.getByPlaceholderText(/type your message/i);
    await userEvent.type(input, 'Hello, AI!');
    
    // 发送
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    
    // 验证用户消息显示
    expect(screen.getByText('Hello, AI!')).toBeInTheDocument();
    
    // 等待流式响应
    await waitFor(() => {
      expect(screen.getByText(/streaming/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
```

---

## 部署和构建

### 构建流程

```bash
# 构建 Web 前端
cd web
npm run build:electron

# 打包 Electron 应用
cd ../electron-app
npm run package:mac  # or package:win, package:linux
```

### 环境变量

```bash
# .env.production
VITE_API_BASE=http://localhost:9119
VITE_ENABLE_ANALYTICS=true
```

---

## 附录

### 数据模型

```typescript
interface Session {
  session_id: string;
  source: string;
  user_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  last_message?: string;
}

interface Message {
  message_id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  tool_calls?: ToolCall[];
  _optimistic?: boolean;  // 客户端标记
  _streaming?: boolean;    // 客户端标记
}

interface Attachment {
  id: string;
  type: 'file' | 'image' | 'audio' | 'folder';
  name: string;
  size: number;
  mimeType: string;
  localFile?: File;
  localPreview?: string;
  serverPath?: string;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'error';
  uploadProgress?: number;
  error?: string;
}

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
  result?: string;
  error?: string;
  status: 'pending' | 'success' | 'error';
}
```

---

## 实际实现总结

### 已完成功能（2026-04-18）

#### 前端核心功能 ✅
1. **基础架构**
   - ✅ ChatPage 容器组件（完整状态管理）
   - ✅ useSessions hook（会话 CRUD、分组、本地存储）
   - ✅ useStreamingResponse hook（SSE 事件监听，已修复）
   - ✅ useAttachments hook（多文件上传、进度追踪）
   - ✅ useVoiceRecording hook（录音状态管理）
   - ✅ useToast hook（全局通知）

2. **侧边栏组件**
   - ✅ Sidebar 主组件（250px 宽，可折叠）
   - ✅ 搜索框（实时过滤）
   - ✅ SessionList（按时间分组）
   - ✅ SessionItem（标题、预览、删除）
   - ⚠️ 虚拟滚动未启用（待优化）

3. **聊天区域**
   - ✅ ChatArea 布局
   - ✅ MessageList（自动滚动）
   - ✅ MessageBubble（Markdown 渲染）
   - ✅ StreamingIndicator（Loader 动画）
   - ✅ 工具调用展示（基础版）
   - ❌ ChatHeader（标题编辑）

4. **输入区域**
   - ✅ InputArea 主组件
   - ✅ 自动调整高度的 Textarea
   - ✅ Enter 发送、Shift+Enter 换行
   - ✅ AttachmentButtons（文件、图片）
   - ✅ VoiceInput（录音、转录）
   - ✅ AttachmentPreview（进度条、删除）
   - ❌ 拖拽上传
   - ❌ 粘贴上传

#### 后端 API ✅
1. **会话管理**（api_server_sessions.py）
   - ✅ POST /api/sessions/create
   - ✅ GET /api/sessions/list（分页）
   - ✅ GET /api/sessions/{id}/messages
   - ✅ DELETE /api/sessions/{id}
   - ✅ GET /api/sessions/search（FTS5）
   - ❌ PUT /api/sessions/{id}（标题更新）

2. **流式响应**（api_server_chat.py）
   - ✅ GET /api/sessions/{id}/stream（SSE）
   - ✅ 火山引擎 ARK 配置支持
   - ✅ 事件格式：content、tool_call、done、error
   - ✅ Agent 流式回调集成
   - ✅ 消息持久化到数据库

3. **附件管理**（api_server_attachments.py）
   - ✅ POST /api/attachments/upload
   - ✅ GET /api/attachments/{session_id}/{filename}
   - ✅ 文件存储（$HERMES_HOME/data/attachments/）
   - ✅ 路径遍历防护
   - ❌ 图片缩略图生成

4. **语音转录**（api_server_stt.py）
   - ✅ POST /api/stt/transcribe
   - ✅ OpenAI Whisper 集成
   - ✅ 多格式支持（webm、mp3、wav）
   - ❌ Groq/本地 Whisper 支持

### 关键技术决策

1. **SSE 事件监听修复**
   - 问题：使用 `EventSource.onmessage` 无法接收自定义事件
   - 解决：改用 `addEventListener('content')` 监听自定义事件类型
   - 影响文件：useStreamingResponse.ts

2. **火山引擎 ARK 配置**
   - 模型：ark-code-latest
   - Base URL：https://ark.cn-beijing.volces.com/api/coding
   - Provider：anthropic（兼容层）
   - 配置文件：$HERMES_HOME/config.yaml

3. **Electron 构建路径**
   - Web 构建：`npm run build:web` → electron-app/dist/renderer
   - Electron 加载：file://electron-app/dist/renderer/index.html
   - 缓存清理：必须清理 Cache/Code Cache/GPUCache

4. **会话按时间分组**
   - 今天：< 24h
   - 昨天：24h ~ 48h
   - 本周：48h ~ 7d
   - 更早：> 7d

### 待完成功能

#### 高优先级 🔴
- [ ] ChatHeader（会话标题编辑）
- [ ] 拖拽上传文件
- [ ] 粘贴上传图片
- [ ] 虚拟滚动优化（react-virtuoso）
- [ ] 错误重试机制
- [ ] 会话删除确认对话框

#### 中优先级 🟡
- [ ] 图片缩略图生成
- [ ] 附件在消息中的展示
- [ ] 工具调用卡片折叠
- [ ] 日期时间本地化
- [ ] ErrorBoundary 组件
- [ ] 快捷键支持

#### 低优先级 🟢
- [ ] 流式响应断线重连
- [ ] 消息淡入动画
- [ ] 图片预览放大
- [ ] 多 STT 提供商支持
- [ ] 性能测试报告

### 文件结构

```
web/src/
├── pages/
│   ├── ChatPage.tsx                 ✅ 主容器
│   └── ChatPage/
│       ├── Sidebar.tsx              ✅ 侧边栏
│       ├── SessionList.tsx          ✅ 会话列表
│       ├── SessionItem.tsx          ✅ 会话项
│       ├── ChatArea.tsx             ✅ 聊天区域
│       ├── MessageList.tsx          ✅ 消息列表
│       ├── MessageBubble.tsx        ✅ 消息气泡
│       ├── InputArea.tsx            ✅ 输入区域
│       ├── AttachmentButtons.tsx    ✅ 附件按钮
│       ├── AttachmentPreview.tsx    ✅ 附件预览
│       └── VoiceInput.tsx           ✅ 语音输入
├── hooks/
│   ├── useSessions.ts               ✅ 会话管理
│   ├── useStreamingResponse.ts      ✅ 流式响应
│   ├── useAttachments.ts            ✅ 附件管理
│   ├── useVoiceRecording.ts         ✅ 录音管理
│   └── useToast.ts                  ✅ 通知
└── lib/
    └── api.ts                       ✅ API 客户端

gateway/platforms/
├── api_server_sessions.py           ✅ 会话 API
├── api_server_chat.py               ✅ 流式响应
├── api_server_attachments.py        ✅ 附件 API
└── api_server_stt.py                ✅ 语音转录
```

---

**文档版本**: 1.1.0  
**创建日期**: 2026-04-17  
**最后更新**: 2026-04-18  
**实际开发时间**: 2 天  
**完成度**: ~75%（核心功能已实现）
