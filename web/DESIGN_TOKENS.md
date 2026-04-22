# Hermes Agent - Design Token 文档

**基于**: Supabase Dark Theme  
**更新时间**: 2026-04-22

---

## 概述

Hermes Agent v2 采用基于 CSS 自定义属性的设计 token 系统，遵循 Supabase 深色主题规范。所有颜色、间距、字体和圆角值统一定义在 `web/src/index.css` 的 `@theme` 块中。

---

## 颜色 Token

### 品牌色（绿色系）

```css
--color-brand-green: #3ecf8e;      /* 主品牌色 */
--color-green-link: #00c573;       /* 链接颜色 */
--color-green-border: rgba(62, 207, 142, 0.3); /* 绿色边框（30% 透明度）*/
```

**使用场景**:
- 激活状态指示器
- 主要操作按钮背景
- 链接文本
- 成功状态徽章
- 焦点环

**禁止**:
- ❌ 不要用作大面积背景色（仅用于强调）
- ❌ 不要用于非交互元素

---

### 中性色阶（背景）

```css
--color-bg-primary: #171717;       /* 主背景 */
--color-bg-button: #0f0f0f;        /* 按钮背景（更深）*/
--color-bg-secondary: #1f1f1f;     /* 次要背景（卡片、输入框）*/
```

**使用场景**:
- `bg-primary`: body, 主内容区
- `bg-button`: 次要按钮、Switch 未激活状态
- `bg-secondary`: Card, Input, 代码块背景

---

### 中性色阶（边框）

```css
--color-border-subtle: #242424;    /* 微妙分割线 */
--color-border-standard: #2e2e2e;  /* 标准边框 */
--color-border-prominent: #363636; /* 强调边框（悬停）*/
```

**边框层级系统**（替代阴影）:
1. **Subtle**: 不重要的分割线
2. **Standard**: 卡片、输入框、按钮边框
3. **Prominent**: 悬停状态、激活边框

---

### 中性色阶（文本）

```css
--color-text-primary: #fafafa;     /* 主文本 */
--color-text-secondary: #b4b4b4;   /* 次要文本（标签、说明）*/
--color-text-muted: #898989;       /* 弱化文本（占位符、禁用）*/
```

**排版层级**:
- `text-primary`: 标题、正文、按钮文字
- `text-secondary`: 表单标签、卡片副标题
- `text-muted`: 占位符、时间戳、辅助信息

---

### 语义色

```css
--color-destructive: #ef4444;      /* 错误/删除 */
--color-success: #10b981;          /* 成功（备用，优先用 brand-green）*/
--color-warning: #f59e0b;          /* 警告 */
```

**使用场景**:
- `destructive`: 删除按钮、错误提示、失败徽章
- `success`: 成功徽章（优先使用 `brand-green`）
- `warning`: 警告横幅、配置缺失提示

---

## 排版 Token

### 字体系列

```css
--font-primary: "Circular", -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: "Source Code Pro", "Monaco", "Menlo", monospace;
```

**使用指南**:
- **Circular** (primary): 所有 UI 文本
- **Source Code Pro** (mono): 代码块、等宽数值、技术标签

**字重约束**:
- ✅ 仅使用 `font-normal` (400) 和 `font-medium` (500)
- ❌ 禁止 `font-bold` (600+) — 通过字号和颜色实现层级

---

### 字号层级

| 用途 | Tailwind Class | 实际大小 |
|-----|---------------|---------|
| 大标题 | `text-3xl` | 30px |
| 标题 | `text-2xl` | 24px |
| 副标题 | `text-xl` | 20px |
| 正文 | `text-base` | 16px |
| 小字 | `text-sm` | 14px |
| 辅助文本 | `text-xs` | 12px |

---

## 间距 Token

基于 **8px 基础单位** 的倍数系统：

```css
--space-1: 4px;    /* 0.5x */
--space-2: 8px;    /* 1x 基础 */
--space-3: 12px;   /* 1.5x */
--space-4: 16px;   /* 2x */
--space-6: 24px;   /* 3x */
--space-8: 32px;   /* 4x */
--space-12: 48px;  /* 6x */
--space-16: 64px;  /* 8x */
--space-24: 96px;  /* 12x */
--space-32: 128px; /* 16x */
```

**使用建议**:
- 组件内边距: `space-2` ~ `space-4`
- 组件间距: `space-4` ~ `space-6`
- 章节间距: `space-12` ~ `space-16`
- 页面大间距: `space-24` ~ `space-32`

---

## 圆角 Token

```css
--radius-sm: 6px;       /* 小元素（Badge, Tag）*/
--radius-md: 8px;       /* 中等元素（Card, Input）*/
--radius-lg: 16px;      /* 大元素（Modal）*/
--radius-pill: 9999px;  /* 药丸形状（Button, Tab）*/
```

**设计原则**:
- **主要按钮**: 必须使用 `radius-pill`
- **卡片/输入框**: 使用 `radius-md`
- **徽章**: 使用 `radius-sm`
- **避免锐角**: 所有可交互元素至少 6px 圆角

---

## 组件使用模式

### Button 变体

| 变体 | 样式 | 使用场景 |
|-----|------|---------|
| `default` | 白底黑字，pill 形状 | 主要操作 |
| `secondary` | 深色底 + 边框，pill 形状 | 次要操作 |
| `ghost` | 透明底，悬停显示边框 | 工具栏、表格操作 |
| `link` | 绿色下划线 | 文本链接 |
| `destructive` | 红色底，pill 形状 | 删除、危险操作 |

**示例**:
```tsx
<Button variant="default">保存</Button>
<Button variant="secondary">取消</Button>
<Button variant="ghost" size="icon"><Settings /></Button>
```

---

### Badge 变体

| 变体 | 样式 | 使用场景 |
|-----|------|---------|
| `success` | 绿色边框 + 浅绿背景 | 成功、在线状态 |
| `warning` | 黄色边框 + 浅黄背景 | 警告、待处理 |
| `destructive` | 红色边框 + 浅红背景 | 错误、失败 |
| `outline` | 灰色边框 | 中性标签 |
| `secondary` | 灰色背景 | 分类标签 |

**示例**:
```tsx
<Badge variant="success">运行中</Badge>
<Badge variant="warning">等待中</Badge>
<Badge variant="outline">离线</Badge>
```

---

### Card 样式

**基础结构**:
```tsx
<Card className="border border-[var(--color-border-standard)] bg-[var(--color-bg-secondary)] rounded-[var(--radius-md)]">
  <CardHeader>
    <CardTitle className="text-base font-medium">标题</CardTitle>
  </CardHeader>
  <CardContent>
    内容
  </CardContent>
</Card>
```

**关键点**:
- ✅ 使用边框定义深度
- ❌ 禁止阴影 (`shadow-*`)
- 悬停状态: 边框颜色从 `standard` → `prominent`

---

### Input/Textarea 样式

**焦点状态**:
```tsx
<Input className="border-[var(--color-border-standard)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-green)]" />
```

**关键特性**:
- 绿色焦点环 (2px)
- 标准边框 → 焦点时保持边框
- 背景色: `bg-secondary`

---

## Do's and Don'ts

### ✅ Do's

1. **使用设计 token**，不要硬编码颜色
   ```tsx
   // ✅ 正确
   <div className="bg-[var(--color-bg-primary)]" />
   
   // ❌ 错误
   <div className="bg-[#171717]" />
   ```

2. **用边框定义深度**，不要用阴影
   ```tsx
   // ✅ 正确
   <Card className="border border-[var(--color-border-standard)]" />
   
   // ❌ 错误
   <Card className="shadow-lg" />
   ```

3. **主要按钮用 pill 形状**
   ```tsx
   // ✅ 正确
   <Button variant="default">保存</Button>
   
   // ❌ 错误
   <Button className="rounded-md">保存</Button>
   ```

4. **技术内容用等宽字体**
   ```tsx
   // ✅ 正确
   <code className="font-mono">npm install</code>
   
   // ❌ 错误
   <span>npm install</span>
   ```

---

### ❌ Don'ts

1. **不要用绿色作为大面积背景**
   ```tsx
   // ❌ 错误
   <div className="bg-[var(--color-brand-green)] p-8">
   
   // ✅ 正确
   <div className="border-l-4 border-[var(--color-brand-green)]">
   ```

2. **不要使用粗体（font-bold）**
   ```tsx
   // ❌ 错误
   <h1 className="font-bold">标题</h1>
   
   // ✅ 正确
   <h1 className="text-2xl font-medium">标题</h1>
   ```

3. **不要混用阴影和边框**
   ```tsx
   // ❌ 错误
   <Card className="shadow-md border">
   
   // ✅ 正确
   <Card className="border border-[var(--color-border-standard)]">
   ```

4. **不要硬编码间距**
   ```tsx
   // ❌ 错误
   <div className="gap-3">
   
   // ✅ 正确
   <div className="gap-[var(--space-3)]">
   ```

---

## 迁移指南

### 从旧主题迁移

| 旧 Token | 新 Token | 说明 |
|---------|---------|-----|
| `background` | `bg-primary` | 主背景 |
| `foreground` | `text-primary` | 主文本 |
| `card` | `bg-secondary` | 卡片背景 |
| `border` | `border-standard` | 标准边框 |
| `primary` | `brand-green` | 品牌色 |
| `muted-foreground` | `text-muted` | 弱化文本 |

### Tailwind 兼容性

Tailwind v4 的 `@theme` 自动将 CSS 变量映射为 utility classes：

```tsx
// 自动可用
className="bg-[var(--color-bg-primary)]"
className="text-[var(--color-text-primary)]"
className="border-[var(--color-border-standard)]"
```

---

## 开发者工具

### 查看当前 Token

在浏览器控制台运行：
```js
getComputedStyle(document.documentElement).getPropertyValue('--color-brand-green')
// 输出: #3ecf8e
```

### 测试对比度

使用浏览器 DevTools > Accessibility > Contrast ratio 验证文本对比度是否符合 WCAG AA 标准（≥4.5:1）。

---

## 参考

- **设计规范**: `docs/DESIGN.md`
- **样式文件**: `web/src/index.css`
- **组件库**: `web/src/components/ui/`
- **Supabase Design**: https://supabase.com/brand-assets/design-system

---

**维护者**: Hermes Agent Team  
**版本**: 2.1.0
