# 提案：为 ChatPage 添加国际化支持

## 概述

**问题**：Electron 应用中的 ChatPage 组件缺少国际化支持，所有文本均为硬编码英文，导致用户切换语言时该页面无法响应。

**目标**：为 ChatPage 集成现有的 i18n 系统，实现中英文完整支持，与其他页面保持一致的用户体验。

## 背景

### 现状分析

整个 Web 前端应用已经具备完善的国际化基础设施：

- ✅ `I18nProvider` 全局包裹应用（`web/src/main.tsx`）
- ✅ `useI18n()` hook 可供所有组件使用
- ✅ 中英文翻译文件完整（`web/src/i18n/en.ts`, `zh.ts`）
- ✅ 其他所有页面均已国际化（StatusPage, SessionsPage, LogsPage 等）

**唯独 ChatPage 是孤例**：
- ❌ 未导入或使用 `useI18n()`
- ❌ 所有 UI 文本硬编码为英文
- ❌ 导航栏 "Chat" 标签也缺少翻译键值

### 用户影响

```
用户操作流程：
1. 用户点击语言切换器，选择 "中文"
2. 导航栏、StatusPage、SessionsPage 等全部切换为中文 ✓
3. 用户点击 "Chat" 导航项（仍显示为英文）
4. 进入 ChatPage，页面标题、提示文本全部为英文 ✗
   → 用户体验断裂，不符合预期
```

## 解决方案

### 核心方案

按照现有 i18n 架构，为 ChatPage 添加完整的国际化支持：

1. **扩展类型定义**：在 `types.ts` 中添加 `chat` 命名空间类型
2. **添加翻译文本**：在 `en.ts` 和 `zh.ts` 中添加 chat 相关翻译
3. **集成 hook**：在 `ChatPage.tsx` 中使用 `useI18n()` 替换硬编码文本
4. **修复导航标签**：补充 `app.nav.chat` 翻译键值

### 翻译内容清单

| 文本类型 | 英文 | 中文 | 翻译键 |
|---------|------|------|--------|
| 页面标题 | Chat | 聊天 | `t.chat.title` |
| 页面副标题 | Start a new conversation with Hermes Agent | 与 Hermes Agent 开始新对话 | `t.chat.subtitle` |
| 空状态提示 | Type a message to start chatting | 输入消息开始聊天 | `t.chat.emptyState` |
| 输入框占位符 | Type your message... (Enter to send, Shift+Enter for new line) | 输入您的消息...（Enter 发送，Shift+Enter 换行） | `t.chat.placeholder` |
| 用户角色 | You | 您 | `t.chat.roles.user` |
| 助手角色 | Hermes | Hermes | `t.chat.roles.assistant` |
| 系统角色 | System | 系统 | `t.chat.roles.system` |
| 导航标签 | Chat | 聊天 | `t.app.nav.chat` |

### 实现范围

**需要修改的文件**（共 4 个）：

```
web/src/i18n/
├── types.ts         添加 Translations['chat'] 接口定义
├── en.ts            添加英文翻译
└── zh.ts            添加中文翻译

web/src/pages/
└── ChatPage.tsx     集成 useI18n hook，替换硬编码文本
```

### 不在范围内

- ❌ 不修改聊天消息内容本身的语言（由 LLM 根据用户输入决定）
- ❌ 不涉及日期/时间格式化（当前未显示时间戳）
- ❌ 不修改其他组件（已完成国际化）

## 设计原则

1. **遵循现有模式**：完全按照 SessionsPage、LogsPage 等页面的 i18n 结构
2. **类型安全优先**：TypeScript 静态检查确保所有翻译键存在
3. **品牌名称保留**：保持 "Hermes" 作为品牌标识，中英文统一
4. **最小化改动**：仅添加必要的翻译和 hook 集成，不重构现有逻辑

## 技术细节

### 翻译键结构

```typescript
// 与其他页面保持一致的命名空间结构
interface Translations {
  // ... 现有命名空间
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

### 组件集成示例

```typescript
// ChatPage.tsx
import { useI18n } from "@/i18n";

export function ChatPage() {
  const { t } = useI18n();
  
  return (
    <div>
      <h1>{t.chat.title}</h1>
      <p>{t.chat.subtitle}</p>
      {/* ... */}
      <div>{t.chat.roles[msg.role]}</div>
    </div>
  );
}
```

### 角色标签映射

利用消息对象的 `role` 字段（`"user" | "assistant" | "system"`）直接映射到翻译键：

```typescript
// 当前代码（硬编码）：
msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Hermes"

// 改为（国际化）：
t.chat.roles[msg.role]
```

## 测试计划

### 功能测试

1. **语言切换测试**
   - 启动应用，默认英文环境
   - 进入 ChatPage，验证所有文本为英文
   - 切换到中文，验证所有文本立即变为中文
   - 切换回英文，验证正确恢复

2. **文本覆盖测试**
   - 验证页面标题翻译
   - 验证页面副标题翻译
   - 验证空状态提示翻译
   - 验证输入框占位符翻译
   - 发送消息，验证角色标签翻译（用户、助手、系统）

3. **导航栏测试**
   - 验证 "Chat"/"聊天" 导航标签随语言切换

### 集成测试

- 验证语言偏好持久化（localStorage）
- 验证页面刷新后语言设置保持
- 验证与其他已国际化页面的行为一致性

### 类型安全验证

- TypeScript 编译通过，无类型错误
- IDE 自动补全正确提示翻译键

## 实施计划

### 阶段一：类型和翻译文件（预计 15 分钟）
1. 更新 `web/src/i18n/types.ts`
2. 更新 `web/src/i18n/en.ts`
3. 更新 `web/src/i18n/zh.ts`

### 阶段二：组件集成（预计 10 分钟）
4. 修改 `web/src/pages/ChatPage.tsx`
5. 本地测试验证

### 总耗时预估
约 30 分钟完成开发和测试

## 成功标准

- ✅ 所有 TypeScript 编译通过，无类型错误
- ✅ 用户切换语言时，ChatPage 所有 UI 文本同步切换
- ✅ 导航栏 "Chat" 标签正确翻译
- ✅ 与其他页面的国际化体验一致
- ✅ 无控制台错误或警告

## 依赖关系

- **前置依赖**：无（i18n 基础设施已完善）
- **后续影响**：无（独立功能模块）

## 风险评估

**风险等级**：极低

- ✅ 使用成熟的 i18n 模式（已在其他页面验证）
- ✅ 改动范围小且隔离
- ✅ TypeScript 提供编译时保障
- ✅ 不影响现有功能逻辑

## 备选方案

### 备选方案 A：延迟加载翻译
**说明**：按需加载翻译文件而非全量加载

**拒绝理由**：
- 当前翻译文件体积很小（<10KB），无性能问题
- 增加实现复杂度，收益不明显
- 与现有架构不一致

### 备选方案 B：独立翻译库（如 i18next）
**说明**：引入成熟的第三方 i18n 库

**拒绝理由**：
- 项目已有轻量级自研方案，运行良好
- 引入依赖会增加打包体积
- 迁移成本高，无必要性

## 附录

### 参考文件

- 现有 i18n 实现：`web/src/i18n/`
- 已国际化页面示例：`web/src/pages/SessionsPage.tsx`
- ChatPage 源码：`web/src/pages/ChatPage.tsx`

### 相关讨论

此提案源自 Explore Mode 探索会话（2026-04-17），完整设计过程记录在探索会话中。
