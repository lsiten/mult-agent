# 任务清单：ChatPage 国际化

## 任务概览

| 阶段 | 任务数 | 预计耗时 |
|------|-------|---------|
| 类型和翻译 | 3 | 15 分钟 |
| 组件集成 | 1 | 10 分钟 |
| 测试验证 | 5 | 10 分钟 |
| **总计** | **9** | **35 分钟** |

---

## 阶段 1: 类型和翻译文件

### 任务 1.1: 扩展 Translations 接口
**文件**: `web/src/i18n/types.ts`  
**优先级**: P0  
**预计耗时**: 5 分钟  
**依赖**: 无

**描述**: 在 `Translations` 接口中添加 `chat` 命名空间类型定义

**详细步骤**:
1. 打开 `web/src/i18n/types.ts`
2. 找到 `export interface Translations` 定义
3. 在 `oauth` 和 `language` 之间插入以下代码：
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

**验收标准**:
- [ ] TypeScript 编译通过
- [ ] IDE 在 `t.chat.` 时能自动补全 `title`, `subtitle` 等属性
- [ ] 在 `t.chat.roles.` 时能自动补全 `user`, `assistant`, `system`

**测试方法**:
```bash
cd web
npx tsc --noEmit
# 应无错误输出
```

---

### 任务 1.2: 添加英文翻译
**文件**: `web/src/i18n/en.ts`  
**优先级**: P0  
**预计耗时**: 5 分钟  
**依赖**: 任务 1.1 完成

**描述**: 在英文翻译文件中添加 `app.nav.chat` 和完整的 `chat` 命名空间

**详细步骤**:

1. **添加导航标签**
   - 打开 `web/src/i18n/en.ts`
   - 找到 `app.nav` 对象（约第 56 行）
   - 在 `status` 和 `sessions` 之间插入：
     ```typescript
     chat: "Chat",
     ```

2. **添加 chat 命名空间**
   - 在 `oauth` 和 `language` 之间插入：
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

**验收标准**:
- [ ] TypeScript 编译通过
- [ ] `en` 对象符合 `Translations` 接口要求
- [ ] 无拼写错误

**测试方法**:
```bash
cd web
npx tsc --noEmit
# 检查 en.ts 相关的类型错误
```

---

### 任务 1.3: 添加中文翻译
**文件**: `web/src/i18n/zh.ts`  
**优先级**: P0  
**预计耗时**: 5 分钟  
**依赖**: 任务 1.1 完成

**描述**: 在中文翻译文件中添加 `app.nav.chat` 和完整的 `chat` 命名空间

**详细步骤**:

1. **添加导航标签**
   - 打开 `web/src/i18n/zh.ts`
   - 找到 `app.nav` 对象（约第 56 行）
   - 在 `status` 和 `sessions` 之间插入：
     ```typescript
     chat: "聊天",
     ```

2. **添加 chat 命名空间**
   - 在 `oauth` 和 `language` 之间插入：
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

**验收标准**:
- [ ] TypeScript 编译通过
- [ ] `zh` 对象符合 `Translations` 接口要求
- [ ] 中文表达自然、准确
- [ ] 与 `en.ts` 的键结构完全一致

**测试方法**:
```bash
cd web
npx tsc --noEmit
# 检查 zh.ts 相关的类型错误
```

---

## 阶段 2: 组件集成

### 任务 2.1: 集成 useI18n 到 ChatPage
**文件**: `web/src/pages/ChatPage.tsx`  
**优先级**: P0  
**预计耗时**: 10 分钟  
**依赖**: 阶段 1 全部任务完成

**描述**: 在 ChatPage 组件中导入并使用 `useI18n()` hook，替换所有硬编码文本

**详细步骤**:

1. **添加 import 声明**（约第 5 行后）
   ```typescript
   import { useI18n } from "@/i18n";
   ```

2. **调用 hook**（约第 14 行，组件函数内第一行）
   ```typescript
   export function ChatPage() {
     const { t } = useI18n();
     // ... 现有代码
   ```

3. **替换页面标题**（约第 78-83 行）
   - 将 `Chat` 改为 `{t.chat.title}`
   - 将 `Start a new conversation with Hermes Agent` 改为 `{t.chat.subtitle}`

4. **替换空状态提示**（约第 90 行）
   - 将 `Type a message to start chatting` 改为 `{t.chat.emptyState}`

5. **替换角色标签**（约第 109 行）
   - 将整个三元表达式改为 `{t.chat.roles[msg.role]}`
   - 原代码：`{msg.role === "user" ? "You" : msg.role === "system" ? "System" : "Hermes"}`
   - 新代码：`{t.chat.roles[msg.role]}`

6. **替换输入框占位符**（约第 134 行）
   - 将 `placeholder="Type your message... (Enter to send, Shift+Enter for new line)"`
   - 改为 `placeholder={t.chat.placeholder}`

**验收标准**:
- [ ] TypeScript 编译通过
- [ ] 无 ESLint 警告
- [ ] 所有硬编码英文文本已移除
- [ ] 使用 `t.chat.*` 引用所有翻译

**测试方法**:
```bash
cd web
npx tsc --noEmit
npm run lint  # 如果配置了 eslint
```

---

## 阶段 3: 测试验证

### 任务 3.1: 英文环境功能测试
**优先级**: P0  
**预计耗时**: 3 分钟  
**依赖**: 任务 2.1 完成

**描述**: 验证应用在英文环境下 ChatPage 正常显示

**测试步骤**:
1. 启动应用：
   ```bash
   cd electron-app
   npm run dev
   ```
2. 确认默认语言为英文（或手动切换到英文）
3. 点击导航栏的 "CHAT" 标签进入 ChatPage
4. 检查以下内容：

**验收清单**:
- [ ] 导航栏显示 "CHAT"
- [ ] 页面标题显示 "Chat"
- [ ] 副标题显示 "Start a new conversation with Hermes Agent"
- [ ] 空状态提示显示 "Type a message to start chatting"
- [ ] 输入框占位符显示 "Type your message... (Enter to send, Shift+Enter for new line)"
- [ ] 无控制台错误

---

### 任务 3.2: 中文切换功能测试
**优先级**: P0  
**预计耗时**: 3 分钟  
**依赖**: 任务 3.1 完成

**描述**: 验证语言切换到中文后 ChatPage 正确翻译

**测试步骤**:
1. 应用运行中（英文环境）
2. 点击右上角语言切换器，选择中文
3. 观察 ChatPage 变化

**验收清单**:
- [ ] 导航栏 "CHAT" 变为 "聊天"
- [ ] 页面标题变为 "聊天"
- [ ] 副标题变为 "与 Hermes Agent 开始新对话"
- [ ] 空状态提示变为 "输入消息开始聊天"
- [ ] 输入框占位符变为 "输入您的消息...（Enter 发送，Shift+Enter 换行）"
- [ ] 切换瞬间完成，无闪烁

---

### 任务 3.3: 消息角色标签测试
**优先级**: P0  
**预计耗时**: 2 分钟  
**依赖**: 任务 3.2 完成

**描述**: 验证发送消息后角色标签正确翻译

**测试步骤**:
1. 应用运行中（中文环境）
2. 在 ChatPage 输入框输入测试消息，如 "你好"
3. 按 Enter 发送
4. 等待助手回复（如果 Hermes CLI 可用）
5. 观察消息气泡的角色标签

**验收清单**:
- [ ] 用户消息左上角显示 "您"（中文）
- [ ] 助手消息左上角显示 "Hermes"
- [ ] 如果触发错误，系统消息显示 "系统"（中文）

**切换到英文验证**:
6. 点击语言切换器，切换回英文
7. 观察已发送消息的角色标签变化

**验收清单**:
- [ ] 用户消息角色标签变为 "You"
- [ ] 助手消息角色标签仍为 "Hermes"
- [ ] 系统消息角色标签变为 "System"
- [ ] **重要**: 消息内容本身不变（"你好" 仍为 "你好"）

---

### 任务 3.4: 语言持久化测试
**优先级**: P1  
**预计耗时**: 1 分钟  
**依赖**: 任务 3.3 完成

**描述**: 验证语言偏好在页面刷新和应用重启后保持

**测试步骤**:

**子测试 A: 页面刷新**
1. 切换到中文
2. 刷新页面（Cmd+R / Ctrl+R）
3. 进入 ChatPage

**验收清单**:
- [ ] 页面刷新后仍显示中文
- [ ] ChatPage 所有文本为中文

**子测试 B: 应用重启**
4. 关闭应用
5. 重新启动应用
6. 进入 ChatPage

**验收清单**:
- [ ] 应用重启后仍显示中文
- [ ] ChatPage 所有文本为中文

---

### 任务 3.5: 回归测试
**优先级**: P1  
**预计耗时**: 1 分钟  
**依赖**: 任务 3.4 完成

**描述**: 验证此变更未影响其他页面和功能

**测试步骤**:
1. 应用运行中（任意语言）
2. 依次访问以下页面，检查 i18n 功能

**验收清单**:
- [ ] StatusPage 正常显示和切换语言
- [ ] SessionsPage 正常显示和切换语言
- [ ] LogsPage 正常显示和切换语言
- [ ] ConfigPage 正常显示和切换语言
- [ ] 语言切换器本身工作正常
- [ ] 主题切换器工作正常（未受影响）

**ChatPage 功能测试**:
3. 返回 ChatPage
4. 测试发送消息功能

**验收清单**:
- [ ] 可以正常输入消息
- [ ] 按 Enter 可以发送消息
- [ ] Shift+Enter 可以换行
- [ ] 发送按钮正常工作
- [ ] Loading 状态正常显示
- [ ] 消息历史正常滚动

---

## 可选任务（非必需）

### 任务 O.1: 构建验证
**优先级**: P2  
**预计耗时**: 5 分钟  
**依赖**: 阶段 3 完成

**描述**: 验证变更在生产构建中正常工作

**测试步骤**:
```bash
# 构建 Web 前端
cd web
npm run build:electron

# 检查构建产物
ls -lh dist/

# 构建 Electron 应用（可选，耗时较长）
cd ../electron-app
npm run build
npm run start

# 在打包后的应用中测试 i18n 功能
```

**验收标准**:
- [ ] Web 前端构建成功，无错误
- [ ] 构建产物大小合理（增加 < 5KB）
- [ ] 打包后的应用 ChatPage i18n 功能正常

---

### 任务 O.2: 翻译审核
**优先级**: P2  
**预计耗时**: 10 分钟  
**依赖**: 阶段 3 完成

**描述**: 由 native speaker 审核翻译质量

**审核维度**:

**英文审核**:
- [ ] 拼写正确
- [ ] 语法正确
- [ ] 符合美式英语习惯
- [ ] 专业且简洁

**中文审核**:
- [ ] 表达自然，无机翻腔
- [ ] 用词准确
- [ ] 与应用其他部分语言风格一致
- [ ] 标点符号使用正确（中文标点）

**品牌名称审核**:
- [ ] "Hermes" 在两种语言中保持一致
- [ ] "Hermes Agent" 处理正确

---

## 问题跟踪

### 已知问题
（无）

### 潜在风险
| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| TypeScript 类型错误 | 低 | 中 | 任务 1.1-1.3 完成后立即编译检查 |
| 翻译键拼写错误 | 低 | 低 | TypeScript 会捕获 |
| 消息内容被误翻译 | 极低 | 中 | 任务 3.3 专门测试消息内容不变 |

---

## 完成标准

### 必须完成（阻塞发布）
- [x] 任务 1.1: 扩展 Translations 接口 ✓
- [x] 任务 1.2: 添加英文翻译 ✓
- [x] 任务 1.3: 添加中文翻译 ✓
- [x] 任务 2.1: 集成 useI18n 到 ChatPage ✓
- [ ] 任务 3.1: 英文环境功能测试
- [ ] 任务 3.2: 中文切换功能测试
- [ ] 任务 3.3: 消息角色标签测试

### 应该完成（高优先级）
- [ ] 任务 3.4: 语言持久化测试
- [ ] 任务 3.5: 回归测试

### 可以完成（低优先级）
- [ ] 任务 O.1: 构建验证
- [ ] 任务 O.2: 翻译审核

---

## 进度追踪

| 阶段 | 进度 | 状态 |
|------|------|------|
| 阶段 1: 类型和翻译 | 0/3 | ⏳ 待开始 |
| 阶段 2: 组件集成 | 0/1 | ⏳ 待开始 |
| 阶段 3: 测试验证 | 0/5 | ⏳ 待开始 |
| **总计** | **0/9** | **⏳ 0% 完成** |

**图例**:
- ⏳ 待开始
- 🚧 进行中
- ✅ 已完成
- ❌ 失败/阻塞

---

## 变更日志

| 日期 | 任务 | 变更说明 |
|------|------|---------|
| 2026-04-17 | - | 初始任务清单创建 |

---

## 备注

### 开发环境要求
- Node.js 版本：v18+（项目要求）
- TypeScript 版本：5.3+（`web/package.json` 中定义）
- 编辑器：建议使用 VS Code 或 JetBrains WebStorm（TypeScript 支持良好）

### 快速开始
```bash
# 1. 安装依赖（如果尚未安装）
cd web
npm install

# 2. 启动开发服务器（如果需要）
npm run dev

# 3. 或者启动 Electron 应用
cd ../electron-app
npm run dev
```

### 提交规范
按照项目 Git 规范提交：
```bash
# 阶段 1 完成后
git add web/src/i18n/
git commit -m "feat(i18n): add ChatPage translations (en, zh)"

# 阶段 2 完成后
git add web/src/pages/ChatPage.tsx
git commit -m "feat(chat): integrate i18n into ChatPage component"
```

### 帮助资源
- 项目 i18n 架构说明：`web/src/i18n/README.md`（如果存在）
- 参考其他页面的 i18n 实现：`web/src/pages/SessionsPage.tsx`
- TypeScript 文档：https://www.typescriptlang.org/docs/
