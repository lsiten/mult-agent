# 实施指南：ChatPage 国际化

> 本文档提供逐步实施指导，适合开发者直接参考执行

## 总览

```
┌─────────────────────────────────────────────────────────────┐
│               实施路线图（预计 35 分钟）                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📁 阶段 1: 类型和翻译（15 分钟）                             │
│     ├─ [ ] 1.1 扩展 types.ts                                │
│     ├─ [ ] 1.2 添加 en.ts 翻译                              │
│     └─ [ ] 1.3 添加 zh.ts 翻译                              │
│           ↓                                                  │
│  🔧 阶段 2: 组件集成（10 分钟）                               │
│     └─ [ ] 2.1 修改 ChatPage.tsx                            │
│           ↓                                                  │
│  ✅ 阶段 3: 测试验证（10 分钟）                               │
│     ├─ [ ] 3.1 英文环境测试                                  │
│     ├─ [ ] 3.2 中文切换测试                                  │
│     ├─ [ ] 3.3 角色标签测试                                  │
│     ├─ [ ] 3.4 持久化测试                                    │
│     └─ [ ] 3.5 回归测试                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 阶段 1: 类型和翻译文件

### 步骤 1.1: 扩展 Translations 接口

**文件**: `web/src/i18n/types.ts`

**操作**: 在 `Translations` 接口中添加 `chat` 属性

**查找位置**: `oauth` 命名空间之后，`language` 命名空间之前

**插入代码**:
```typescript
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
```

**完整上下文**:
```typescript
export interface Translations {
  // ... 前面的命名空间 ...
  
  oauth: {
    // ...
  };
  
  // 👇 在这里插入 chat 命名空间
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
  
  language: {
    // ...
  };
  
  // ... 后面的命名空间 ...
}
```

**验证**:
```bash
cd web
npx tsc --noEmit
# 应无错误输出
```

---

### 步骤 1.2: 添加英文翻译

**文件**: `web/src/i18n/en.ts`

#### 子步骤 A: 添加导航标签

**查找**: `app.nav` 对象（约第 56 行）

**在 `status` 和 `sessions` 之间插入**:
```typescript
nav: {
  status: "Status",
  chat: "Chat",        // 👈 添加这一行
  sessions: "Sessions",
  // ...
},
```

#### 子步骤 B: 添加 chat 命名空间

**查找**: `oauth` 和 `language` 命名空间之间（约第 260 行）

**插入完整对象**:
```typescript
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
```

**完整上下文**:
```typescript
export const en: Translations = {
  // ... 前面的命名空间 ...
  
  oauth: {
    // ...
  },
  
  // 👇 在这里插入 chat 对象
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
  
  language: {
    // ...
  },
  
  // ... 后面的命名空间 ...
};
```

**验证**:
```bash
cd web
npx tsc --noEmit
# 检查 en.ts 是否有类型错误
```

---

### 步骤 1.3: 添加中文翻译

**文件**: `web/src/i18n/zh.ts`

#### 子步骤 A: 添加导航标签

**查找**: `app.nav` 对象（约第 56 行）

**在 `status` 和 `sessions` 之间插入**:
```typescript
nav: {
  status: "状态",
  chat: "聊天",        // 👈 添加这一行
  sessions: "会话",
  // ...
},
```

#### 子步骤 B: 添加 chat 命名空间

**查找**: `oauth` 和 `language` 命名空间之间（约第 260 行）

**插入完整对象**:
```typescript
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
```

**验证**:
```bash
cd web
npx tsc --noEmit
# 确保无错误
```

---

## 阶段 2: 组件集成

### 步骤 2.1: 修改 ChatPage.tsx

**文件**: `web/src/pages/ChatPage.tsx`

#### 子步骤 A: 添加 import

**位置**: 文件顶部（约第 5 行后）

**添加**:
```typescript
import { useI18n } from "@/i18n";
```

**完整上下文**:
```typescript
import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { useI18n } from "@/i18n";  // 👈 添加这一行
```

---

#### 子步骤 B: 调用 useI18n hook

**位置**: `ChatPage` 函数内第一行（约第 14 行）

**添加**:
```typescript
export function ChatPage() {
  const { t } = useI18n();  // 👈 添加这一行
  
  const [messages, setMessages] = useState<Message[]>([]);
  // ... 其他 state
```

---

#### 子步骤 C: 替换页面标题

**查找**: 约第 78-83 行

**替换前**:
```typescript
<h1 className="text-xl font-heading font-bold text-primary">
  Chat
</h1>
<p className="text-sm text-muted-foreground mt-1">
  Start a new conversation with Hermes Agent
</p>
```

**替换后**:
```typescript
<h1 className="text-xl font-heading font-bold text-primary">
  {t.chat.title}
</h1>
<p className="text-sm text-muted-foreground mt-1">
  {t.chat.subtitle}
</p>
```

---

#### 子步骤 D: 替换空状态提示

**查找**: 约第 90 行

**替换前**:
```typescript
<p>Type a message to start chatting</p>
```

**替换后**:
```typescript
<p>{t.chat.emptyState}</p>
```

---

#### 子步骤 E: 替换角色标签

**查找**: 约第 109 行

**替换前**:
```typescript
<div className="text-xs opacity-60 mb-1">
  {msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Hermes"}
</div>
```

**替换后**:
```typescript
<div className="text-xs opacity-60 mb-1">
  {t.chat.roles[msg.role]}
</div>
```

---

#### 子步骤 F: 替换输入框占位符

**查找**: 约第 134 行

**替换前**:
```typescript
<Textarea
  // ... other props
  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
  // ... other props
/>
```

**替换后**:
```typescript
<Textarea
  // ... other props
  placeholder={t.chat.placeholder}
  // ... other props
/>
```

---

**验证**:
```bash
cd web
npx tsc --noEmit
# 确保无类型错误
```

---

## 阶段 3: 测试验证

### 准备：启动应用

```bash
# 方式 1: 启动 Electron 应用
cd electron-app
npm run dev

# 方式 2: 仅启动 Web 前端（如果需要）
cd web
npm run dev
```

---

### 测试 3.1: 英文环境功能测试

**目标**: 验证默认英文环境下所有文本正确显示

**步骤**:
1. 启动应用（默认英文）
2. 导航到 ChatPage

**检查清单**:
- [ ] 导航栏显示 "CHAT"
- [ ] 页面标题显示 "Chat"
- [ ] 副标题显示 "Start a new conversation with Hermes Agent"
- [ ] 空状态显示 "Type a message to start chatting"
- [ ] 输入框占位符正确显示
- [ ] 无控制台错误

**预期截图**（参考）:
```
┌─────────────────────────────────────────┐
│ HERMES AGENT │ STATUS │ CHAT │ ...      │
└─────────────────────────────────────────┘
  
  Chat
  Start a new conversation with Hermes Agent
  
  ┌─────────────────────────────────────┐
  │                                     │
  │   Type a message to start chatting  │
  │                                     │
  └─────────────────────────────────────┘
  
  ┌─────────────────────────────────────┐
  │ Type your message... (Enter to ...  │
  └─────────────────────────────────────┘
```

---

### 测试 3.2: 中文切换功能测试

**目标**: 验证切换到中文后所有文本正确翻译

**步骤**:
1. 点击右上角语言切换器
2. 选择中文（点击 "Switch to Chinese" 或地球图标）
3. 观察 ChatPage 变化

**检查清单**:
- [ ] 导航栏 "CHAT" 变为 "聊天"
- [ ] 页面标题变为 "聊天"
- [ ] 副标题变为 "与 Hermes Agent 开始新对话"
- [ ] 空状态变为 "输入消息开始聊天"
- [ ] 输入框占位符变为中文
- [ ] 切换流畅，无闪烁

**预期截图**（参考）:
```
┌─────────────────────────────────────────┐
│ HERMES AGENT │ 状态 │ 聊天 │ ...        │
└─────────────────────────────────────────┘
  
  聊天
  与 Hermes Agent 开始新对话
  
  ┌─────────────────────────────────────┐
  │                                     │
  │      输入消息开始聊天                │
  │                                     │
  └─────────────────────────────────────┘
  
  ┌─────────────────────────────────────┐
  │ 输入您的消息...（Enter 发送...）      │
  └─────────────────────────────────────┘
```

---

### 测试 3.3: 消息角色标签测试

**目标**: 验证发送消息后角色标签正确翻译

**步骤**（中文环境）:
1. 在输入框输入测试消息："你好"
2. 按 Enter 发送
3. 观察用户消息气泡
4. 等待助手回复（如果可用）
5. 观察助手消息气泡

**检查清单 - 中文**:
- [ ] 用户消息角色标签显示 "您"
- [ ] 助手消息角色标签显示 "Hermes"
- [ ] 系统消息角色标签显示 "系统"（如果有错误）

**步骤**（切换到英文）:
6. 点击语言切换器，切换到英文
7. 观察已有消息的角色标签变化

**检查清单 - 英文**:
- [ ] 用户消息角色标签变为 "You"
- [ ] 助手消息角色标签仍为 "Hermes"
- [ ] 系统消息角色标签变为 "System"
- [ ] ⚠️ **重要**: 消息内容不变（"你好" 仍为 "你好"）

**预期示例**:
```
中文环境：
┌──────────────────────────┐
│ 您                        │
│ 你好                      │
└──────────────────────────┘

┌──────────────────────────┐
│ Hermes                   │
│ 你好！有什么可以帮助你的？ │
└──────────────────────────┘

切换到英文后：
┌──────────────────────────┐
│ You                      │  ← 角色标签变了
│ 你好                      │  ← 内容不变
└──────────────────────────┘

┌──────────────────────────┐
│ Hermes                   │  ← 不变
│ 你好！有什么可以帮助你的？ │  ← 内容不变
└──────────────────────────┘
```

---

### 测试 3.4: 语言持久化测试

**目标**: 验证语言偏好在刷新和重启后保持

#### 子测试 A: 页面刷新
1. 切换到中文
2. 按 Cmd+R / Ctrl+R 刷新页面
3. 进入 ChatPage

**检查**:
- [ ] 刷新后仍显示中文

#### 子测试 B: 应用重启
1. 关闭应用（Cmd+Q / Alt+F4）
2. 重新启动应用
3. 进入 ChatPage

**检查**:
- [ ] 重启后仍显示中文

---

### 测试 3.5: 回归测试

**目标**: 确保变更未破坏其他功能

#### 子测试 A: 其他页面 i18n
依次访问以下页面，切换语言验证：
- [ ] StatusPage 正常
- [ ] SessionsPage 正常
- [ ] LogsPage 正常
- [ ] ConfigPage 正常

#### 子测试 B: ChatPage 功能
在 ChatPage 测试核心功能：
- [ ] 可以输入消息
- [ ] Enter 发送消息
- [ ] Shift+Enter 换行
- [ ] 发送按钮可用
- [ ] Loading 状态正确
- [ ] 消息滚动正常

---

## 完成检查

### 最终验证清单

#### 代码质量
- [ ] TypeScript 编译通过（`npx tsc --noEmit`）
- [ ] 无 ESLint 警告（如果配置了）
- [ ] 所有硬编码英文已移除

#### 功能完整性
- [ ] 英文环境正常
- [ ] 中文环境正常
- [ ] 语言切换流畅
- [ ] 角色标签正确
- [ ] 持久化工作正常

#### 用户体验
- [ ] 与其他页面行为一致
- [ ] 无闪烁或布局抖动
- [ ] 翻译文本自然、准确

---

## 提交代码

### Git 提交规范

```bash
# 1. 检查修改的文件
git status

# 应该看到：
#   modified:   web/src/i18n/types.ts
#   modified:   web/src/i18n/en.ts
#   modified:   web/src/i18n/zh.ts
#   modified:   web/src/pages/ChatPage.tsx

# 2. 暂存文件
git add web/src/i18n/types.ts web/src/i18n/en.ts web/src/i18n/zh.ts
git add web/src/pages/ChatPage.tsx

# 3. 提交（遵循 Conventional Commits）
git commit -m "feat(i18n): add ChatPage internationalization support

- Add chat namespace to Translations interface
- Add English and Chinese translations for ChatPage
- Integrate useI18n hook into ChatPage component
- Support dynamic language switching for all UI text

Closes: add-chat-i18n"

# 4. 推送（如果需要）
git push origin <branch-name>
```

---

## 常见问题

### Q1: TypeScript 报错 "Property 'chat' does not exist"

**原因**: 可能忘记在 `types.ts` 中添加 `chat` 接口

**解决**:
1. 检查 `web/src/i18n/types.ts`
2. 确认 `Translations` 接口包含 `chat` 属性
3. 重新运行 `npx tsc --noEmit`

---

### Q2: 切换语言后 ChatPage 没有变化

**可能原因**:
1. 未调用 `useI18n()` hook
2. 仍使用硬编码字符串而非 `t.chat.*`

**调试步骤**:
1. 打开浏览器控制台（F12）
2. 检查是否有 React 错误
3. 在 `ChatPage.tsx` 第一行添加：
   ```typescript
   const { t, locale } = useI18n();
   console.log('Current locale:', locale);
   console.log('Chat title:', t.chat.title);
   ```
4. 观察控制台输出

---

### Q3: 消息内容也被翻译了（不符合预期）

**这不应该发生**，因为：
- 消息内容存储在 `messages` state 中
- 内容不依赖 `t.chat.*` 翻译
- 仅角色标签应该翻译

**如果发生**:
- 检查是否误修改了消息内容渲染部分
- 确保 `<Markdown content={msg.content} />` 未被修改

---

## 下一步

### 完成后
1. ✅ 所有测试通过
2. ✅ 代码已提交
3. 🎉 ChatPage 国际化完成！

### 可选优化（未来）
- [ ] 添加更多语言支持（如日语、韩语）
- [ ] 添加时间戳显示（需要日期格式化 i18n）
- [ ] 添加单元测试（如果项目引入测试框架）

---

## 参考资料

- **提案文档**: `proposal.md`
- **功能规格**: `specs/chat-i18n.md`
- **技术设计**: `design.md`
- **详细任务**: `tasks.md`
- **项目 i18n 实现**: `web/src/i18n/`
- **参考页面**: `web/src/pages/SessionsPage.tsx`

---

**文档版本**: 1.0.0  
**最后更新**: 2026-04-17  
**适用于**: 开发者实施参考
