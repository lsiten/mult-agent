# Hermes Agent - 组件使用模式

**更新时间**: 2026-04-22

---

## 目录

1. [按钮 (Button)](#按钮-button)
2. [卡片 (Card)](#卡片-card)
3. [表单控件](#表单控件)
4. [徽章 (Badge)](#徽章-badge)
5. [布局与间距](#布局与间距)
6. [排版](#排版)
7. [交互状态](#交互状态)

---

## 按钮 (Button)

### 基础用法

```tsx
import { Button } from "@/components/ui/button";

// 主要操作（白底黑字，pill 形状）
<Button variant="default">保存配置</Button>

// 次要操作（深色底 + 边框，pill 形状）
<Button variant="secondary">取消</Button>

// 幽灵按钮（透明底，悬停显示边框）
<Button variant="ghost">更多选项</Button>

// 链接样式（绿色下划线）
<Button variant="link">查看详情</Button>

// 危险操作（红色底，pill 形状）
<Button variant="destructive">删除</Button>
```

### 尺寸变体

```tsx
<Button size="sm">小按钮</Button>
<Button size="default">默认</Button>
<Button size="lg">大按钮</Button>
<Button size="icon"><Settings className="h-4 w-4" /></Button>
```

### 使用场景

| 场景 | 推荐变体 | 示例 |
|-----|---------|-----|
| 表单提交 | `default` | 保存、创建、提交 |
| 表单取消 | `secondary` | 取消、返回 |
| 工具栏操作 | `ghost` | 刷新、设置、编辑 |
| 内联链接 | `link` | 查看详情、了解更多 |
| 删除/重置 | `destructive` | 删除会话、清空数据 |

### 组合示例

```tsx
// 表单操作组
<div className="flex gap-[var(--space-2)]">
  <Button variant="secondary">取消</Button>
  <Button variant="default">保存</Button>
</div>

// 工具栏
<div className="flex items-center gap-[var(--space-2)]">
  <Button variant="ghost" size="icon"><RefreshCw className="h-4 w-4" /></Button>
  <Button variant="ghost" size="icon"><Settings className="h-4 w-4" /></Button>
</div>
```

---

## 卡片 (Card)

### 基础结构

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>卡片标题</CardTitle>
  </CardHeader>
  <CardContent>
    <p>卡片内容</p>
  </CardContent>
</Card>
```

### 带图标的标题

```tsx
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <Activity className="h-5 w-5 text-[var(--color-text-muted)]" />
      <CardTitle className="text-base">活动状态</CardTitle>
    </div>
  </CardHeader>
  <CardContent>
    {/* 内容 */}
  </CardContent>
</Card>
```

### 网格布局

```tsx
// 响应式网格
<div className="grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</div>
```

### 交互式卡片

```tsx
<Card className="cursor-pointer transition-colors hover:border-[var(--color-border-prominent)]">
  {/* 悬停时边框加深 */}
</Card>
```

---

## 表单控件

### Input

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

<div className="space-y-[var(--space-2)]">
  <Label htmlFor="email">邮箱地址</Label>
  <Input 
    id="email"
    type="email"
    placeholder="your@email.com"
  />
</div>
```

### Textarea

```tsx
import { Textarea } from "@/components/ui/textarea";

<div className="space-y-[var(--space-2)]">
  <Label htmlFor="description">描述</Label>
  <Textarea 
    id="description"
    placeholder="请输入描述..."
    rows={4}
  />
</div>
```

### Select

```tsx
import { Select, SelectItem } from "@/components/ui/select";

<Select value={value} onValueChange={setValue}>
  <SelectItem value="option1">选项 1</SelectItem>
  <SelectItem value="option2">选项 2</SelectItem>
</Select>
```

### Checkbox

```tsx
import { Checkbox } from "@/components/ui/checkbox";

<div className="flex items-center gap-[var(--space-2)]">
  <Checkbox 
    id="terms"
    checked={accepted}
    onCheckedChange={setAccepted}
  />
  <Label htmlFor="terms">我同意服务条款</Label>
</div>
```

### Switch

```tsx
import { Switch } from "@/components/ui/switch";

<div className="flex items-center gap-[var(--space-2)]">
  <Switch 
    checked={enabled}
    onCheckedChange={setEnabled}
  />
  <Label>启用自动刷新</Label>
</div>
```

---

## 徽章 (Badge)

### 状态徽章

```tsx
import { Badge } from "@/components/ui/badge";

// 成功状态（绿色）
<Badge variant="success">
  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
  在线
</Badge>

// 警告状态（黄色）
<Badge variant="warning">等待中</Badge>

// 错误状态（红色）
<Badge variant="destructive">失败</Badge>

// 中性标签（灰色边框）
<Badge variant="outline">离线</Badge>

// 次要标签（灰色背景）
<Badge variant="secondary">本地</Badge>
```

### 使用场景

| 状态 | 变体 | 典型用途 |
|-----|------|---------|
| 激活/成功 | `success` | 服务运行、任务成功 |
| 等待/警告 | `warning` | 任务排队、配置警告 |
| 失败/错误 | `destructive` | 启动失败、错误状态 |
| 中性信息 | `outline` | 来源标签、类型标识 |
| 分类标签 | `secondary` | 分类、标签 |

---

## 布局与间距

### 垂直堆叠

```tsx
// 小间距（组件内部）
<div className="space-y-[var(--space-2)]">
  <Label>标签</Label>
  <Input />
</div>

// 中等间距（表单字段）
<div className="space-y-[var(--space-4)]">
  <div>...</div>
  <div>...</div>
</div>

// 大间距（页面章节）
<div className="space-y-[var(--space-6)]">
  <section>...</section>
  <section>...</section>
</div>
```

### 水平排列

```tsx
// 紧密排列（按钮组）
<div className="flex gap-[var(--space-2)]">
  <Button>取消</Button>
  <Button>确定</Button>
</div>

// 标准间距（工具栏）
<div className="flex items-center gap-[var(--space-4)]">
  <Icon />
  <Text />
</div>
```

### 响应式布局

```tsx
// 移动端单列，桌面端多列
<div className="grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</div>

// 移动端堆叠，桌面端横向
<div className="flex flex-col sm:flex-row gap-[var(--space-3)]">
  <div>左侧</div>
  <div>右侧</div>
</div>
```

---

## 排版

### 标题层级

```tsx
// 页面主标题
<h1 className="text-3xl font-medium">页面标题</h1>

// 章节标题
<h2 className="text-2xl font-medium">章节标题</h2>

// 子章节标题
<h3 className="text-xl font-medium">子章节</h3>

// 卡片标题
<CardTitle className="text-base font-medium">卡片标题</CardTitle>
```

### 正文文本

```tsx
// 主要正文
<p className="text-base text-[var(--color-text-primary)]">
  主要内容文本
</p>

// 次要文本（标签、说明）
<p className="text-sm text-[var(--color-text-secondary)]">
  次要说明文本
</p>

// 弱化文本（时间戳、辅助信息）
<p className="text-xs text-[var(--color-text-muted)]">
  2 分钟前
</p>
```

### 等宽字体（技术内容）

```tsx
// 行内代码
<code className="font-mono text-sm bg-[var(--color-bg-secondary)] px-[var(--space-2)] rounded-[var(--radius-sm)]">
  npm install
</code>

// 代码块
<pre className="font-mono text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border-standard)] rounded-[var(--radius-md)] p-[var(--space-3)]">
  const example = "code";
</pre>

// 技术数值
<span className="font-mono text-base">
  192.168.1.1
</span>
```

---

## 交互状态

### 悬停效果

```tsx
// 边框悬停
<div className="border border-[var(--color-border-standard)] hover:border-[var(--color-border-prominent)] transition-colors">
  内容
</div>

// 背景悬停
<button className="hover:bg-[var(--color-bg-secondary)] transition-colors">
  按钮
</button>
```

### 焦点状态

```tsx
// 绿色焦点环（2px）
<Input className="focus-visible:ring-2 focus-visible:ring-[var(--color-brand-green)]" />

// 带偏移的焦点环
<Button className="focus-visible:ring-2 focus-visible:ring-[var(--color-brand-green)] focus-visible:ring-offset-2">
  按钮
</Button>
```

### 禁用状态

```tsx
<Button disabled className="opacity-50 cursor-not-allowed">
  已禁用
</Button>

<Input disabled placeholder="禁用的输入框" />
```

### 加载状态

```tsx
import { Loader2 } from "lucide-react";

// 加载指示器
<div className="flex items-center justify-center">
  <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand-green)]" />
</div>

// 带文本的加载
<div className="flex items-center gap-2">
  <Loader2 className="h-4 w-4 animate-spin" />
  <span className="text-sm text-[var(--color-text-secondary)]">
    加载中...
  </span>
</div>

// 加载按钮
<Button disabled>
  <Loader2 className="h-4 w-4 animate-spin mr-2" />
  处理中...
</Button>
```

---

## 最佳实践

### ✅ Do's

1. **保持一致的间距**
   ```tsx
   // ✅ 使用 token
   <div className="gap-[var(--space-4)]" />
   ```

2. **使用语义化变体**
   ```tsx
   // ✅ 根据用途选择变体
   <Button variant="destructive">删除</Button>
   ```

3. **响应式设计**
   ```tsx
   // ✅ 移动端优先
   <div className="flex-col sm:flex-row" />
   ```

4. **无障碍属性**
   ```tsx
   // ✅ 添加 Label 关联
   <Label htmlFor="input-id">标签</Label>
   <Input id="input-id" />
   ```

---

### ❌ Don'ts

1. **不要硬编码样式**
   ```tsx
   // ❌ 错误
   <div className="p-3 rounded-lg" />
   
   // ✅ 正确
   <div className="p-[var(--space-3)] rounded-[var(--radius-md)]" />
   ```

2. **不要过度嵌套**
   ```tsx
   // ❌ 错误
   <Card>
     <div>
       <div>
         <div>内容</div>
       </div>
     </div>
   </Card>
   
   // ✅ 正确
   <Card>
     <CardContent>内容</CardContent>
   </Card>
   ```

3. **不要忽略空状态**
   ```tsx
   // ❌ 错误
   {items.map(item => <Item key={item.id} />)}
   
   // ✅ 正确
   {items.length > 0 ? (
     items.map(item => <Item key={item.id} />)
   ) : (
     <EmptyState message="暂无数据" />
   )}
   ```

---

## 完整示例

### 表单页面

```tsx
export default function SettingsPage() {
  const { t } = useI18n();
  
  return (
    <div className="space-y-[var(--space-6)]">
      <div>
        <h1 className="text-3xl font-medium">{t.settings.title}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-[var(--space-2)]">
          {t.settings.subtitle}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基础设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-[var(--space-4)]">
          <div className="space-y-[var(--space-2)]">
            <Label htmlFor="name">名称</Label>
            <Input id="name" placeholder="输入名称" />
          </div>
          
          <div className="space-y-[var(--space-2)]">
            <Label htmlFor="description">描述</Label>
            <Textarea id="description" rows={3} />
          </div>

          <div className="flex items-center gap-[var(--space-2)]">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>启用功能</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-[var(--space-2)]">
        <Button variant="secondary">取消</Button>
        <Button variant="default">保存</Button>
      </div>
    </div>
  );
}
```

### 列表页面

```tsx
export default function SkillsPage() {
  const { t } = useI18n();
  
  return (
    <div className="space-y-[var(--space-6)]">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-medium">{t.skills.title}</h1>
        <Button variant="default">
          <Plus className="h-4 w-4 mr-2" />
          安装技能
        </Button>
      </div>

      <div className="grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3">
        {skills.map(skill => (
          <Card 
            key={skill.name}
            className="cursor-pointer hover:border-[var(--color-border-prominent)] transition-colors"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{skill.name}</CardTitle>
                <Badge variant={skill.enabled ? "success" : "outline"}>
                  {skill.enabled ? "已启用" : "未启用"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {skill.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

**参考**: [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)  
**维护者**: Hermes Agent Team
