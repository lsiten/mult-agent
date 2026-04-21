# 设计文档：ChatPage 国际化实现

## 设计概览

本设计方案为 Electron 应用的 ChatPage 组件添加国际化支持，遵循项目现有的 i18n 架构模式，通过最小化改动实现完整的中英文切换功能。

### 核心原则

1. **零侵入性**：复用现有 `I18nProvider` 和 `useI18n()` 基础设施
2. **类型安全**：通过 TypeScript 接口保证编译时类型检查
3. **一致性**：与 SessionsPage、LogsPage 等页面保持相同的 i18n 模式
4. **可维护性**：集中管理翻译文本，易于后续扩展

---

## 架构设计

### 系统上下文

```
┌──────────────────────────────────────────────────────────┐
│                    Electron App                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │              React Frontend                        │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  main.tsx (Entry Point)                      │  │   │
│  │  │  <I18nProvider>                              │  │   │
│  │  │    <ThemeProvider>                           │  │   │
│  │  │      <BrowserRouter>                         │  │   │
│  │  │        <App />                               │  │   │
│  │  │      </BrowserRouter>                        │  │   │
│  │  │    </ThemeProvider>                          │  │   │
│  │  │  </I18nProvider>                             │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  App.tsx (Router)                            │  │   │
│  │  │  <Routes>                                    │  │   │
│  │  │    <Route path="/chat" element={<ChatPage />}│  │   │
│  │  │    ...                                       │  │   │
│  │  │  </Routes>                                   │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  ChatPage.tsx                                │  │   │
│  │  │  const { t } = useI18n()  ◄── 新增集成       │  │   │
│  │  │  return (                                    │  │   │
│  │  │    <h1>{t.chat.title}</h1>  ◄── 使用翻译     │  │   │
│  │  │    ...                                       │  │   │
│  │  │  )                                           │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              I18n Infrastructure (已存在)                  │
│  ┌────────────────────────────────────────────────────┐   │
│  │  I18nProvider (context.tsx)                        │   │
│  │  • localStorage 持久化                              │   │
│  │  • 提供 { locale, setLocale, t } context           │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Translations (types.ts)                           │   │
│  │  • 定义所有翻译键的 TypeScript 接口                  │   │
│  │  • 新增：chat 命名空间  ◄── 本次变更                │   │
│  └────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────┐   │
│  │  en.ts, zh.ts                                      │   │
│  │  • 实现 Translations 接口                           │   │
│  │  • 新增：chat 翻译内容  ◄── 本次变更                │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 数据流设计

```
用户操作：点击语言切换器
    │
    ▼
LanguageSwitcher.onClick()
    │
    ├─► setLocale("zh") 
    │       │
    │       ▼
    │   localStorage.setItem("hermes-locale", "zh")
    │       │
    │       ▼
    │   I18nContext state 更新
    │       │
    │       ▼
    │   所有 useI18n() 消费者触发重新渲染
    │       │
    │       ├─► App.tsx (导航栏)
    │       ├─► SessionsPage
    │       ├─► LogsPage
    │       └─► ChatPage  ◄── 本次变更后也会响应
    │               │
    │               ▼
    │           { t } = useI18n()
    │               │
    │               ▼
    │           t.chat.title === "聊天"
    │           t.chat.roles.user === "您"
    │               │
    │               ▼
    │           组件重新渲染，显示中文
```

---

## 详细设计

### 1. 类型系统扩展

**文件**: `web/src/i18n/types.ts`

**设计决策**:
- 在现有 `Translations` 接口中添加 `chat` 属性
- 使用嵌套对象结构 `roles: { user, assistant, system }` 便于角色标签映射
- 所有字段类型为 `string`，保持简单

**接口定义**:
```typescript
export interface Translations {
  common: { /* ... existing ... */ };
  app: { /* ... existing ... */ };
  // ... other existing namespaces ...
  
  // 新增命名空间
  chat: {
    title: string;
    subtitle: string;
    emptyState: string;
    placeholder: string;
    roles: {
      user: string;
      assistant: string;
      system: string;
    };
  };
  
  language: { /* ... existing ... */ };
  theme: { /* ... existing ... */ };
}
```

**类型安全保障**:
```typescript
// 编译时检查示例
const { t } = useI18n();

// ✅ 正确：
t.chat.title;              // TypeScript 知道存在
t.chat.roles.user;         // 嵌套属性也能补全

// ❌ 错误：编译时捕获
t.chat.titl;               // 属性拼写错误
t.chat.roles.admin;        // 不存在的角色
t.chatt.title;             // 命名空间拼写错误
```

---

### 2. 翻译内容设计

#### 2.1 导航标签扩展

**文件**: `web/src/i18n/en.ts`, `zh.ts`

**位置**: `app.nav` 对象内

**设计决策**:
- 在现有导航标签列表中插入 `chat` 键
- 按现有顺序排列（status, chat, sessions, ...）

**英文** (`en.ts`):
```typescript
app: {
  brand: "Hermes Agent",
  brandShort: "HA",
  webUi: "Web UI",
  footer: { /* ... */ },
  nav: {
    status: "Status",
    chat: "Chat",        // 新增
    sessions: "Sessions",
    analytics: "Analytics",
    logs: "Logs",
    cron: "Cron",
    skills: "Skills",
    config: "Config",
    keys: "Keys",
  },
},
```

**中文** (`zh.ts`):
```typescript
app: {
  brand: "Hermes Agent",
  brandShort: "HA",
  webUi: "管理面板",
  footer: { /* ... */ },
  nav: {
    status: "状态",
    chat: "聊天",        // 新增
    sessions: "会话",
    analytics: "分析",
    logs: "日志",
    cron: "定时任务",
    skills: "技能",
    config: "配置",
    keys: "密钥",
  },
},
```

#### 2.2 ChatPage 内容翻译

**文件**: `web/src/i18n/en.ts`, `zh.ts`

**位置**: 顶级 `chat` 命名空间

**翻译内容映射表**:

| 键名 | 英文 (en.ts) | 中文 (zh.ts) | 用途 |
|------|-------------|-------------|------|
| `title` | Chat | 聊天 | 页面主标题 |
| `subtitle` | Start a new conversation with Hermes Agent | 与 Hermes Agent 开始新对话 | 页面副标题 |
| `emptyState` | Type a message to start chatting | 输入消息开始聊天 | 无消息时的提示 |
| `placeholder` | Type your message... (Enter to send, Shift+Enter for new line) | 输入您的消息...（Enter 发送，Shift+Enter 换行） | 输入框占位符 |
| `roles.user` | You | 您 | 用户消息角色标签 |
| `roles.assistant` | Hermes | Hermes | 助手消息角色标签 |
| `roles.system` | System | 系统 | 系统消息角色标签 |

**英文完整实现** (`en.ts`):
```typescript
export const en: Translations = {
  // ... existing namespaces ...
  
  chat: {
    title: "Chat",
    subtitle: "Start a new conversation with Hermes Agent",
    emptyState: "Type a message to start chatting",
    placeholder: "Type your message... (Enter to send, Shift+Enter for new line)",
    roles: {
      user: "You",
      assistant: "Hermes",
      system: "System",
    },
  },
  
  // ... existing namespaces ...
};
```

**中文完整实现** (`zh.ts`):
```typescript
export const zh: Translations = {
  // ... existing namespaces ...
  
  chat: {
    title: "聊天",
    subtitle: "与 Hermes Agent 开始新对话",
    emptyState: "输入消息开始聊天",
    placeholder: "输入您的消息...（Enter 发送，Shift+Enter 换行）",
    roles: {
      user: "您",
      assistant: "Hermes",
      system: "系统",
    },
  },
  
  // ... existing namespaces ...
};
```

**翻译策略说明**:

1. **品牌名称保留**:
   - "Hermes Agent" / "Hermes" 保持不变
   - 理由：品牌专有名词，保持国际统一性

2. **快捷键说明本地化**:
   - 英文：`(Enter to send, Shift+Enter for new line)`
   - 中文：`（Enter 发送，Shift+Enter 换行）`
   - 理由：虽然键盘标识相同，但说明文字需本地化以提升可读性

3. **语气选择**:
   - 中文使用 "您" 而非 "你"
   - 理由：保持与应用其他部分的正式、专业语气一致

---

### 3. 组件集成设计

**文件**: `web/src/pages/ChatPage.tsx`

#### 3.1 Import 声明

**位置**: 文件顶部（第 1-5 行附近）

**修改**:
```typescript
// 现有 imports
import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";

// 新增 import
import { useI18n } from "@/i18n";
```

#### 3.2 Hook 调用

**位置**: `ChatPage` 函数组件内部（第 14 行附近）

**修改**:
```typescript
export function ChatPage() {
  // 新增：调用 i18n hook
  const { t } = useI18n();
  
  // 现有 state hooks
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // ... rest of component
}
```

**设计说明**:
- 将 `useI18n()` 放在 state hooks 之前，遵循 React hooks 顺序规范
- 仅解构 `t` 对象，不需要 `locale` 和 `setLocale`（ChatPage 不包含语言切换器）

#### 3.3 UI 文本替换

##### 替换点 1: 页面头部

**位置**: 第 76-84 行

**现有代码**:
```typescript
<div className="border-b border-border/50 bg-card/30 px-6 py-4">
  <h1 className="text-xl font-heading font-bold text-primary">
    Chat
  </h1>
  <p className="text-sm text-muted-foreground mt-1">
    Start a new conversation with Hermes Agent
  </p>
</div>
```

**修改后**:
```typescript
<div className="border-b border-border/50 bg-card/30 px-6 py-4">
  <h1 className="text-xl font-heading font-bold text-primary">
    {t.chat.title}
  </h1>
  <p className="text-sm text-muted-foreground mt-1">
    {t.chat.subtitle}
  </p>
</div>
```

##### 替换点 2: 空状态提示

**位置**: 第 88-92 行

**现有代码**:
```typescript
{messages.length === 0 && (
  <div className="flex items-center justify-center h-full text-muted-foreground">
    <p>Type a message to start chatting</p>
  </div>
)}
```

**修改后**:
```typescript
{messages.length === 0 && (
  <div className="flex items-center justify-center h-full text-muted-foreground">
    <p>{t.chat.emptyState}</p>
  </div>
)}
```

##### 替换点 3: 消息角色标签

**位置**: 第 108-110 行

**现有代码**:
```typescript
<div className="text-xs opacity-60 mb-1">
  {msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Hermes"}
</div>
```

**修改后**:
```typescript
<div className="text-xs opacity-60 mb-1">
  {t.chat.roles[msg.role]}
</div>
```

**设计优势**:
- 利用 TypeScript 索引访问，代码更简洁
- `msg.role` 类型为 `"user" | "assistant" | "system"`，与 `t.chat.roles` 的键完全匹配
- TypeScript 会确保 `msg.role` 只能是这三个值之一

##### 替换点 4: 输入框占位符

**位置**: 第 130-136 行

**现有代码**:
```typescript
<Textarea
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
  className="resize-none min-h-[60px] max-h-[200px]"
  disabled={isLoading}
/>
```

**修改后**:
```typescript
<Textarea
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder={t.chat.placeholder}
  className="resize-none min-h-[60px] max-h-[200px]"
  disabled={isLoading}
/>
```

---

## 组件状态设计

### 状态不变性

ChatPage 的核心状态结构**无需修改**：

```typescript
// 保持不变
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

const [messages, setMessages] = useState<Message[]>([]);
const [input, setInput] = useState("");
const [isLoading, setIsLoading] = useState(false);
```

### 响应式更新机制

```
I18nContext.locale 变化
    │
    ▼
useI18n() 返回新的 t 对象
    │
    ▼
ChatPage 组件重新渲染
    │
    ├─► t.chat.title → 新语言的标题
    ├─► t.chat.subtitle → 新语言的副标题
    ├─► t.chat.roles[msg.role] → 新语言的角色标签
    └─► t.chat.placeholder → 新语言的占位符
```

**关键点**:
- 消息内容 (`msg.content`) 不受影响，保持不变
- 仅 UI 装饰文本（标题、提示、标签）发生变化
- React 自动处理重新渲染，无需手动订阅

---

## 性能考虑

### 内存占用

**翻译数据大小估算**:
```
chat 命名空间：
  - 4 个字符串（title, subtitle, emptyState, placeholder）
  - 3 个角色标签
  - 每个字符串平均 30 字符
  - 总计：约 210 字符 × 2 字节/字符 = 420 字节

两种语言（en + zh）：420 × 2 = 840 字节

结论：几乎可忽略（< 1KB）
```

### 渲染性能

**重新渲染场景分析**:

| 触发条件 | 影响范围 | 频率 | 性能影响 |
|---------|---------|------|---------|
| 语言切换 | 全应用 | 极低（用户主动操作） | 可接受 |
| 新消息到达 | 消息列表 | 中等 | 无额外开销 |
| 输入框输入 | 仅输入框 | 高 | 无额外开销 |

**优化措施**（已在现有架构中实现）:
- `I18nContext` 使用 `useCallback` 缓存 `setLocale`
- 翻译对象在 locale 不变时保持引用稳定
- React 自动优化未变化节点的渲染

---

## 错误处理

### 编译时错误

TypeScript 会捕获所有拼写错误和类型不匹配：

```typescript
// ❌ 编译错误示例
t.chat.titel;               // Property 'titel' does not exist
t.chat.roles['admin'];      // Type '"admin"' is not assignable
```

### 运行时保障

由于 TypeScript 强类型约束，运行时错误几乎不可能发生：

```typescript
// ✅ 类型安全保证
const role: "user" | "assistant" | "system" = msg.role;
const label = t.chat.roles[role];  // 始终存在
```

### 降级策略

如果 i18n 系统失败（极端情况）：
- `I18nProvider` 提供默认的 `en` 翻译对象
- 应用仍可正常运行，仅显示英文

---

## 可访问性 (a11y)

### 语义化 HTML

**当前实现已满足**:
- 页面标题使用 `<h1>` 标签
- 输入框使用 `<Textarea>` 组件（带正确的 aria 属性）
- 按钮使用语义化 `<Button>` 组件

### 屏幕阅读器支持

**国际化后的改进**:
```html
<!-- 英文环境 -->
<h1>Chat</h1>
<Textarea placeholder="Type your message..." />

<!-- 中文环境 -->
<h1>聊天</h1>
<Textarea placeholder="输入您的消息..." />
```

屏幕阅读器会以正确的语言朗读 UI 文本，提升无障碍体验。

---

## 测试策略

### 单元测试（暂不实施，理由见下）

**理论测试方案**:
```typescript
// 如果需要，可添加测试
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ChatPage } from './ChatPage';

test('renders Chinese title when locale is zh', () => {
  render(
    <I18nProvider initialLocale="zh">
      <ChatPage />
    </I18nProvider>
  );
  expect(screen.getByText('聊天')).toBeInTheDocument();
});
```

**不实施理由**:
- 项目当前无测试框架（无 `@testing-library` 依赖）
- 其他页面的 i18n 也无单元测试
- 手动测试足够验证此低风险变更

### 集成测试

**测试检查清单**（手动执行）:

#### 测试 1: 英文环境验证
- [ ] 启动应用（默认英文）
- [ ] 导航到 ChatPage
- [ ] 验证页面标题显示 "Chat"
- [ ] 验证副标题显示 "Start a new conversation..."
- [ ] 验证空状态提示显示 "Type a message to start chatting"
- [ ] 验证输入框占位符正确

#### 测试 2: 中文切换验证
- [ ] 点击语言切换器，选择中文
- [ ] 验证导航栏 "Chat" 变为 "聊天"
- [ ] 验证 ChatPage 页面标题变为 "聊天"
- [ ] 验证所有文本切换为中文

#### 测试 3: 消息角色标签验证
- [ ] 发送一条消息
- [ ] 验证用户消息显示 "You"（英文）或 "您"（中文）
- [ ] 触发助手回复（如果可能）
- [ ] 验证助手消息显示 "Hermes"
- [ ] 触发错误消息（如果可能）
- [ ] 验证系统消息显示 "System"（英文）或 "系统"（中文）

#### 测试 4: 语言切换响应性
- [ ] ChatPage 显示消息历史时切换语言
- [ ] 验证 UI 文本立即更新
- [ ] 验证消息内容不变
- [ ] 验证无闪烁或布局抖动

#### 测试 5: 持久化验证
- [ ] 切换到中文
- [ ] 刷新页面
- [ ] 验证 ChatPage 仍显示中文
- [ ] 关闭应用并重新启动
- [ ] 验证语言设置保持

### 回归测试

验证不影响其他功能：
- [ ] StatusPage 仍正常显示和切换语言
- [ ] SessionsPage 仍正常工作
- [ ] LogsPage 仍正常工作
- [ ] 语言切换器本身功能正常
- [ ] 聊天功能（发送消息、接收回复）不受影响

---

## 安全考虑

### XSS 防护

**翻译文本来源**:
- 翻译文本硬编码在 `en.ts` 和 `zh.ts` 中
- 不涉及用户输入或外部数据源
- 无 XSS 风险

**消息内容渲染**:
- 使用 `<Markdown>` 组件渲染消息内容
- 该组件应已实现 XSS 防护（假设使用 `react-markdown` 或类似库）
- 本次变更不影响消息内容渲染逻辑

### 代码注入防护

**模板语法**:
```typescript
// ✅ 安全：JSX 自动转义
<h1>{t.chat.title}</h1>

// 不使用 dangerouslySetInnerHTML
```

---

## 部署考虑

### 构建影响

**打包体积变化**:
- 增加约 1KB 翻译文本（已压缩）
- 可忽略不计

**构建时检查**:
```bash
# 确保 TypeScript 编译通过
cd web
npm run type-check  # 或 tsc --noEmit

# 确保应用可正常构建
npm run build:electron
```

### Electron 打包

**影响范围**:
- 仅 Web 前端代码变更
- Electron 主进程不受影响
- Python 后端不受影响

**验证步骤**:
```bash
cd electron-app
npm run package:mac  # 或对应平台
# 运行打包后的应用，验证 i18n 功能
```

---

## 维护指南

### 添加新翻译文本

如果未来需要为 ChatPage 添加更多翻译：

1. **更新类型定义** (`types.ts`):
   ```typescript
   chat: {
     // ... existing
     newKey: string;  // 添加新键
   }
   ```

2. **添加翻译** (`en.ts`, `zh.ts`):
   ```typescript
   chat: {
     // ... existing
     newKey: "English text",  // en.ts
     newKey: "中文文本",       // zh.ts
   }
   ```

3. **使用翻译** (`ChatPage.tsx`):
   ```typescript
   {t.chat.newKey}
   ```

### 添加新语言

如果未来需要支持第三种语言（如日语）：

1. 创建新翻译文件 `web/src/i18n/ja.ts`
2. 实现完整的 `Translations` 接口
3. 在 `context.tsx` 中注册：
   ```typescript
   const TRANSLATIONS: Record<Locale, Translations> = {
     en, zh, ja  // 添加日语
   };
   ```
4. 更新 `Locale` 类型：
   ```typescript
   export type Locale = "en" | "zh" | "ja";
   ```

### 翻译审核

**英文**:
- 由 native speaker 或专业翻译审核
- 检查拼写、语法、专业性

**中文**:
- 确保表达自然，无机翻腔
- 与产品其他部分的语言风格保持一致
- 专有名词（如 "Hermes"）处理正确

---

## 技术债务

### 当前无技术债务

本设计方案：
- ✅ 复用现有架构，无新债务
- ✅ 遵循最佳实践
- ✅ 类型安全保障
- ✅ 代码清晰易维护

### 未来优化可能性（非必需）

1. **抽取角色标签常量**:
   ```typescript
   // 当前：直接使用 msg.role
   {t.chat.roles[msg.role]}
   
   // 可选优化：如果角色类型扩展，可抽取映射逻辑
   const getRoleLabel = (role: Message['role']) => t.chat.roles[role];
   ```
   **不实施理由**：当前实现已足够简洁

2. **懒加载翻译**:
   仅在用户切换到某语言时加载该语言的翻译文件
   **不实施理由**：翻译文件极小，无性能瓶颈

---

## 设计验证

### 设计目标达成度

| 目标 | 实现方式 | 达成度 |
|------|---------|-------|
| 支持中英文切换 | 添加 chat 命名空间翻译 | ✅ 100% |
| 保持架构一致性 | 复用现有 i18n 模式 | ✅ 100% |
| 类型安全 | TypeScript 接口约束 | ✅ 100% |
| 最小化改动 | 仅修改 4 个文件 | ✅ 100% |
| 无性能影响 | 增加 < 1KB，无额外渲染 | ✅ 100% |

### 设计原则验证

✅ **零侵入性**：无需修改 `I18nProvider` 或其他组件  
✅ **类型安全**：所有翻译键通过 TypeScript 检查  
✅ **一致性**：与 SessionsPage 等页面使用相同模式  
✅ **可维护性**：翻译集中管理，易于扩展

---

## 附录

### A. 完整文件修改对比

#### `web/src/i18n/types.ts`
```diff
export interface Translations {
  common: { /* ... */ };
  app: { /* ... */ };
  // ... other namespaces ...
+ chat: {
+   title: string;
+   subtitle: string;
+   emptyState: string;
+   placeholder: string;
+   roles: {
+     user: string;
+     assistant: string;
+     system: string;
+   };
+ };
  language: { /* ... */ };
  theme: { /* ... */ };
}
```

#### `web/src/i18n/en.ts`
```diff
export const en: Translations = {
  // ... existing ...
  app: {
    // ... existing ...
    nav: {
      status: "Status",
+     chat: "Chat",
      sessions: "Sessions",
      // ... rest ...
    },
  },
  // ... existing ...
+ chat: {
+   title: "Chat",
+   subtitle: "Start a new conversation with Hermes Agent",
+   emptyState: "Type a message to start chatting",
+   placeholder: "Type your message... (Enter to send, Shift+Enter for new line)",
+   roles: {
+     user: "You",
+     assistant: "Hermes",
+     system: "System",
+   },
+ },
  // ... existing ...
};
```

#### `web/src/i18n/zh.ts`
```diff
export const zh: Translations = {
  // ... existing ...
  app: {
    // ... existing ...
    nav: {
      status: "状态",
+     chat: "聊天",
      sessions: "会话",
      // ... rest ...
    },
  },
  // ... existing ...
+ chat: {
+   title: "聊天",
+   subtitle: "与 Hermes Agent 开始新对话",
+   emptyState: "输入消息开始聊天",
+   placeholder: "输入您的消息...（Enter 发送，Shift+Enter 换行）",
+   roles: {
+     user: "您",
+     assistant: "Hermes",
+     system: "系统",
+   },
+ },
  // ... existing ...
};
```

#### `web/src/pages/ChatPage.tsx`
```diff
import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
+import { useI18n } from "@/i18n";

// ... Message interface unchanged ...

export function ChatPage() {
+ const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  // ... rest of state ...
  
  // ... handlers unchanged ...
  
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border/50 bg-card/30 px-6 py-4">
        <h1 className="text-xl font-heading font-bold text-primary">
-         Chat
+         {t.chat.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
-         Start a new conversation with Hermes Agent
+         {t.chat.subtitle}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
-           <p>Type a message to start chatting</p>
+           <p>{t.chat.emptyState}</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div /* ... */>
            <div /* ... */>
              <div className="text-xs opacity-60 mb-1">
-               {msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Hermes"}
+               {t.chat.roles[msg.role]}
              </div>
              <Markdown content={msg.content} />
            </div>
          </div>
        ))}
        
        {/* ... loading indicator unchanged ... */}
      </div>

      <div className="border-t border-border/50 bg-card/30 px-6 py-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
-           placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
+           placeholder={t.chat.placeholder}
            className="resize-none min-h-[60px] max-h-[200px]"
            disabled={isLoading}
          />
          {/* ... button unchanged ... */}
        </div>
      </div>
    </div>
  );
}
```

### B. 参考资料

- React Context 文档: https://react.dev/reference/react/useContext
- TypeScript 索引类型: https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html
- React i18n 最佳实践: https://react.i18next.com/latest/using-with-hooks

---

## 文档版本

| 版本 | 日期 | 变更说明 | 作者 |
|------|------|----------|------|
| 1.0.0 | 2026-04-17 | 初始设计文档 | Explore Mode |
