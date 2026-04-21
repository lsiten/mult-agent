---
paths:
  - "web/src/i18n/**/*.ts"
  - "web/src/pages/**/*.tsx"
  - "web/src/components/**/*.tsx"
  - "web/src/main.tsx"
  - "web/src/App.tsx"
---

# i18n 国际化规范

## 使用方式

```typescript
import { useI18n } from '../i18n';

function MyComponent() {
  const { t, language, setLanguage } = useI18n();
  
  return (
    <div>
      <h1>{t('myPage.title')}</h1>
      <button onClick={() => setLanguage('zh')}>切换语言</button>
    </div>
  );
}
```

## 翻译文件结构

```typescript
// web/src/i18n/en.ts
export const translations = {
  nav: {
    status: "Status",
    chat: "Chat",
    sessions: "Sessions"
  },
  
  chat: {
    placeholder: "Type your message...",
    send: "Send"
  },
  
  common: {
    save: "Save",
    cancel: "Cancel"
  }
};

// web/src/i18n/zh.ts - 相同结构，中文翻译
```

## 已国际化页面

✅ StatusPage | ✅ SessionsPage | ✅ LogsPage | ✅ ConfigPage | ✅ EnvPage | ✅ SkillsPage | ✅ CronPage | ✅ AnalyticsPage

## 添加新翻译

### 步骤

1. **添加翻译键** (en.ts / zh.ts):
   ```typescript
   // en.ts
   myFeature: {
     title: "Title",
     button: "Click Me"
   }
   
   // zh.ts
   myFeature: {
     title: "标题",
     button: "点击我"
   }
   ```

2. **组件中使用**:
   ```typescript
   const { t } = useI18n();
   <h1>{t('myFeature.title')}</h1>
   <button>{t('myFeature.button')}</button>
   ```

3. **测试**:
   - 访问页面
   - 切换语言验证翻译
   - 确认无硬编码文本

### 命名约定

- 按**功能模块**分组，不是按文件
- 使用 camelCase
- 嵌套不超过 3 层

```typescript
// ✅ 正确
{ nav: {...}, chat: {...}, common: {...} }

// ❌ 错误
{ ChatPage: {...}, SessionsPage: {...} }
```

## 禁止事项

### ❌ 硬编码文本

```typescript
// ❌ 错误
<h1>Chat</h1>
<button>发送</button>

// ✅ 正确
<h1>{t('chat.title')}</h1>
<button>{t('chat.send')}</button>
```

### ❌ 代码中判断语言

```typescript
// ❌ 错误
{language === 'zh' ? '聊天' : 'Chat'}

// ✅ 正确
{t('chat.title')}
```

### ❌ 混合使用

```typescript
// ❌ 错误
<div>
  <h1>{t('chat.title')}</h1>
  <p>Type your message</p>  {/* 硬编码 */}
</div>

// ✅ 正确
<div>
  <h1>{t('chat.title')}</h1>
  <p>{t('chat.placeholder')}</p>
</div>
```

## 动态文本

### 模板字符串

```typescript
// en.ts: { items: "You have {count} items" }
// zh.ts: { items: "你有 {count} 个项目" }

<p>{t('common.items').replace('{count}', count.toString())}</p>
```

### 复数形式

```typescript
// en.ts
{
  itemSingular: "1 item",
  itemPlural: "{count} items"
}

// 组件
<p>{count === 1 ? t('common.itemSingular') : t('common.itemPlural').replace('{count}', count)}</p>
```

## 语言切换

```typescript
function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();
  
  return (
    <select 
      value={language} 
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
}
```

持久化到 localStorage，实时切换所有文本。

## 测试清单

添加新页面时确认:
- [ ] en.ts 和 zh.ts 都添加了翻译
- [ ] 所有硬编码文本都用 t() 函数
- [ ] 切换语言后文本正确显示
- [ ] 没有遗漏的英文/中文硬编码

## 参考

- **实现文件**: `web/src/i18n/index.ts`
- **翻译文件**: `web/src/i18n/en.ts`, `web/src/i18n/zh.ts`
- **类型定义**: `web/src/i18n/types.ts`
