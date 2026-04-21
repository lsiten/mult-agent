# 规格说明：ChatPage 国际化

## 能力标识

**Capability**: `web-ui.chat.i18n`  
**版本**: 1.0.0  
**状态**: 提案中

## 功能描述

为 Electron 应用的聊天页面（ChatPage）提供完整的中英文国际化支持，使其能够响应用户的语言切换操作，与应用其他部分保持一致的多语言体验。

## 功能需求

### FR-1: 翻译文本定义
**优先级**: P0  
**描述**: 在 i18n 翻译文件中定义 ChatPage 所需的所有文本资源

**验收标准**:
- `web/src/i18n/types.ts` 中存在 `Translations['chat']` 接口定义
- `web/src/i18n/en.ts` 中存在完整的 `chat` 命名空间（包含 title, subtitle, emptyState, placeholder, roles）
- `web/src/i18n/zh.ts` 中存在对应的中文翻译
- `web/src/i18n/en.ts` 和 `zh.ts` 的 `app.nav` 中包含 `chat` 键

**详细规格**:

```typescript
// types.ts
export interface Translations {
  // ... existing namespaces
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
}
```

```typescript
// en.ts
export const en: Translations = {
  // ... existing content
  app: {
    // ... existing content
    nav: {
      status: "Status",
      chat: "Chat",  // 新增
      sessions: "Sessions",
      // ... rest
    },
  },
  // ... existing content
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
};
```

```typescript
// zh.ts
export const zh: Translations = {
  // ... existing content
  app: {
    // ... existing content
    nav: {
      status: "状态",
      chat: "聊天",  // 新增
      sessions: "会话",
      // ... rest
    },
  },
  // ... existing content
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
};
```

---

### FR-2: 组件 i18n 集成
**优先级**: P0  
**描述**: 在 ChatPage 组件中集成 `useI18n()` hook，使用翻译文本替换硬编码字符串

**验收标准**:
- `ChatPage.tsx` 导入 `useI18n` hook
- 组件内调用 `const { t } = useI18n()`
- 所有硬编码的 UI 文本均替换为 `t.chat.*` 引用
- 代码通过 TypeScript 编译，无类型错误

**详细规格**:

**文件**: `web/src/pages/ChatPage.tsx`

**修改点 1 - 导入声明**（第 1-5 行附近）:
```typescript
// 添加导入
import { useI18n } from "@/i18n";
```

**修改点 2 - Hook 调用**（第 14 行附近）:
```typescript
export function ChatPage() {
  const { t } = useI18n();  // 添加此行
  const [messages, setMessages] = useState<Message[]>([]);
  // ... rest of state
```

**修改点 3 - 页面标题**（第 78-83 行）:
```typescript
// 之前：
<h1 className="text-xl font-heading font-bold text-primary">
  Chat
</h1>
<p className="text-sm text-muted-foreground mt-1">
  Start a new conversation with Hermes Agent
</p>

// 之后：
<h1 className="text-xl font-heading font-bold text-primary">
  {t.chat.title}
</h1>
<p className="text-sm text-muted-foreground mt-1">
  {t.chat.subtitle}
</p>
```

**修改点 4 - 空状态提示**（第 90 行）:
```typescript
// 之前：
<p>Type a message to start chatting</p>

// 之后：
<p>{t.chat.emptyState}</p>
```

**修改点 5 - 角色标签**（第 108-109 行）:
```typescript
// 之前：
<div className="text-xs opacity-60 mb-1">
  {msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Hermes"}
</div>

// 之后：
<div className="text-xs opacity-60 mb-1">
  {t.chat.roles[msg.role]}
</div>
```

**修改点 6 - 输入框占位符**（第 134 行）:
```typescript
// 之前：
<Textarea
  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
  // ... other props
/>

// 之后：
<Textarea
  placeholder={t.chat.placeholder}
  // ... other props
/>
```

---

### FR-3: 语言切换响应
**优先级**: P0  
**描述**: ChatPage 必须能够实时响应用户的语言切换操作

**验收标准**:
- 用户点击语言切换器时，ChatPage 的所有文本立即更新
- 无需刷新页面
- 与应用其他页面的行为一致

**实现说明**:
- 此功能由 `I18nProvider` 和 `useI18n()` 自动提供
- 组件正确使用 `t.chat.*` 即可自动获得响应式更新

---

## 非功能需求

### NFR-1: 类型安全
**描述**: 所有翻译键必须通过 TypeScript 静态类型检查

**验收标准**:
- `tsc` 编译通过，无类型错误
- IDE 提供自动补全和类型提示
- 拼写错误的翻译键在编译时被捕获

### NFR-2: 性能
**描述**: 国际化不应引入可感知的性能开销

**验收标准**:
- 翻译文本切换延迟 < 100ms
- 无额外网络请求
- 内存占用增加 < 10KB

### NFR-3: 兼容性
**描述**: 与现有 i18n 架构完全兼容

**验收标准**:
- 使用与其他页面相同的 i18n 模式
- 不修改 `I18nProvider` 或 `useI18n()` 实现
- 不影响其他已国际化页面的功能

---

## 边界条件

### 在范围内
- ✅ ChatPage UI 文本的国际化
- ✅ 导航栏 "Chat" 标签的国际化
- ✅ 用户角色、助手角色、系统角色标签的翻译

### 不在范围内
- ❌ 聊天消息内容的翻译（由 LLM 生成，不属于 UI 文本）
- ❌ 错误消息的国际化（当前使用原始错误信息）
- ❌ 时间戳格式化（当前不显示时间戳）
- ❌ 添加新语言（仅支持现有的中英文）

---

## 数据规格

### 翻译键命名规范

**格式**: `t.<namespace>.<key>` 或 `t.<namespace>.<category>.<key>`

**示例**:
- `t.chat.title` - 页面标题
- `t.chat.roles.user` - 用户角色标签
- `t.app.nav.chat` - 导航栏标签

**规则**:
- 使用 camelCase 命名
- 避免缩写（除非业界通用，如 `i18n`）
- 键名应描述内容语义，而非样式或位置

### 翻译文本内容规范

**英文**:
- 使用标准美式英语
- 首字母大写规则遵循 UI 惯例（标题大写，句子首字母大写）
- 保持简洁专业

**中文**:
- 使用简体中文
- 避免机翻腔，使用自然表达
- 保持与产品整体语言风格一致

**品牌名称**:
- "Hermes" 保持不变，不翻译
- 作为专有名词处理

---

## 测试需求

### 测试场景 1: 默认语言加载
**前置条件**: 无语言偏好设置（localStorage 为空）  
**操作步骤**:
1. 启动应用
2. 导航到 ChatPage

**预期结果**:
- 页面以英文显示
- 所有文本使用 `en.ts` 中的翻译

---

### 测试场景 2: 中文切换
**前置条件**: 应用以英文显示  
**操作步骤**:
1. 点击语言切换器，选择 "切换到中文"
2. 导航到 ChatPage

**预期结果**:
- 页面标题显示 "聊天"
- 副标题显示 "与 Hermes Agent 开始新对话"
- 空状态提示显示 "输入消息开始聊天"
- 输入框占位符显示 "输入您的消息...（Enter 发送，Shift+Enter 换行）"

---

### 测试场景 3: 消息角色标签
**前置条件**: 应用以中文显示  
**操作步骤**:
1. 在 ChatPage 发送一条消息
2. 等待助手回复
3. 观察消息气泡中的角色标签

**预期结果**:
- 用户消息显示 "您"
- 助手消息显示 "Hermes"
- 系统消息（如错误）显示 "系统"

---

### 测试场景 4: 语言切换响应性
**前置条件**: ChatPage 已打开并显示消息历史  
**操作步骤**:
1. 点击语言切换器
2. 观察页面文本变化

**预期结果**:
- 所有 UI 文本立即切换（无需刷新）
- 已发送的消息内容不变（仅角色标签切换）
- 切换流畅，无闪烁或布局抖动

---

### 测试场景 5: 导航栏标签
**前置条件**: 应用已启动  
**操作步骤**:
1. 观察顶部导航栏的 "Chat" 标签
2. 切换语言为中文
3. 再次观察导航栏

**预期结果**:
- 英文时显示 "CHAT"
- 中文时显示 "聊天"

---

## 依赖关系

### 依赖项
- `web/src/i18n/context.tsx` - 提供 `useI18n()` hook
- `web/src/i18n/types.ts` - 定义 `Translations` 接口
- `web/src/i18n/en.ts` - 英文翻译源
- `web/src/i18n/zh.ts` - 中文翻译源

### 被依赖项
- 无（独立功能模块）

---

## 实施约束

### 技术约束
- 必须使用现有的 i18n 系统（不引入新依赖）
- 必须保持 TypeScript 严格模式通过
- 不修改 `I18nProvider` 或 `useI18n()` 核心实现

### 代码规范约束
- 遵循项目现有的代码风格
- 翻译键命名遵循 camelCase
- 不使用 emoji（根据项目规范）

### 时间约束
- 预计 30 分钟内完成开发和基础测试
- 低风险变更，可快速迭代

---

## 验收标准总结

✅ **完成定义**:
1. 所有 4 个文件修改完成
2. TypeScript 编译通过，无错误
3. 本地测试通过所有 5 个测试场景
4. 与其他页面的 i18n 行为一致
5. 无控制台错误或警告

✅ **质量标准**:
- 代码通过 eslint 检查
- 翻译文本准确、自然
- 用户体验流畅，无感知性能损失

---

## 版本历史

| 版本 | 日期 | 变更说明 | 作者 |
|------|------|----------|------|
| 1.0.0 | 2026-04-17 | 初始版本 | Explore Mode |
