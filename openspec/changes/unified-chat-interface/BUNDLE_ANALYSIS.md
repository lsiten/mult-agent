# Bundle 大小分析

> 最后更新：2026-04-18  
> 构建工具：Vite 7.3.1  
> 目标环境：Electron

---

## 构建结果

### 最新构建（2026-04-18）

```
../electron-app/dist/renderer/
├── index.html                   0.47 kB │ gzip:   0.30 kB
├── assets/index-CgA1snES.css   51.33 kB │ gzip:   9.49 kB
└── assets/index-DVwH07YP.js   493.49 kB │ gzip: 152.69 kB

总计（未压缩）: 545 KB
总计（gzip）:    162 KB
```

**结论**: ✅ 符合目标（< 500 KB 主 JS bundle）

---

## Bundle 组成分析

### 主要依赖库大小估算

| 库名称 | 版本 | 估算大小 | 用途 |
|--------|------|----------|------|
| React + ReactDOM | 18.x | ~150 KB | 框架核心 |
| react-virtuoso | 4.18.5 | ~25 KB | 虚拟滚动 |
| lucide-react | 0.577.0 | ~50 KB | 图标库（tree-shaking 后）|
| react-markdown | - | ~30 KB | Markdown 渲染 |
| Tailwind CSS | - | ~50 KB | 样式框架（purge 后）|
| 业务代码 | - | ~180 KB | 自定义组件和逻辑 |

**注意**: 以上为估算值，实际大小会因 tree-shaking 和压缩而变化。

---

## 优化历史

### v1.0.0 → v1.1.0
- 添加 AlertDialog, ChatHeader 组件
- 添加拖拽/粘贴上传功能
- **Bundle 增长**: +4 KB (429 KB → 433 KB)

### v1.1.0 → v1.2.0
- 添加 react-virtuoso 虚拟滚动
- 添加 AttachmentDisplay, ToolCallDisplay 组件
- **Bundle 增长**: +58 KB (433 KB → 488 KB)
- **原因**: react-virtuoso 库体积较大

### v1.2.0 → v1.3.0
- 添加 ErrorBoundary, LazyImage 组件
- 添加快捷键和重连逻辑
- **Bundle 增长**: +4 KB (488 KB → 492 KB)

### v1.3.0 → v1.4.0
- 添加日期时间本地化（formatRelativeTime, formatDateTime）
- 添加 React.memo 优化（SessionItem, MessageBubble, AttachmentPreview）
- 添加 useCallback 优化（ChatPage 所有回调）
- **Bundle 增长**: +1 KB (492 KB → 493 KB)
- **性能提升**: 减少不必要的重渲染

---

## 潜在优化方案

### 短期优化（预计减少 20-30 KB）

#### 1. 代码分割（Code Splitting）
```typescript
// 懒加载非首屏组件
const ChatPage = lazy(() => import("./pages/ChatPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));

<Suspense fallback={<Loader />}>
  <Routes>
    <Route path="/chat" element={<ChatPage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
  </Routes>
</Suspense>
```

**预期收益**: 减少首屏 bundle 10-15 KB

#### 2. 优化 Lucide Icons 导入
```typescript
// ❌ 当前：从主包导入
import { MessageSquare, Trash2, File } from "lucide-react";

// ✅ 优化：从子路径导入
import MessageSquare from "lucide-react/dist/esm/icons/message-square";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
```

**预期收益**: 减少 10-20 KB（取决于未使用图标数量）

#### 3. 移除未使用的依赖
```bash
# 检查未使用的依赖
npx depcheck
```

### 中期优化（预计减少 30-50 KB）

#### 1. 替换 react-markdown
使用更轻量的 Markdown 渲染器：
- **markdown-it**: ~30 KB（vs react-markdown ~50 KB）
- **marked**: ~15 KB（更轻量，功能较少）

#### 2. 优化 Tailwind CSS
```javascript
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  safelist: [], // 减少安全列表
  theme: {
    extend: {
      // 只保留使用的颜色
    },
  },
};
```

#### 3. 使用 Dynamic Import 加载 i18n 文件
```typescript
const loadLocale = async (locale: Locale) => {
  const translations = await import(`@/i18n/${locale}.ts`);
  return translations.default;
};
```

### 长期优化（预计减少 50-80 KB）

#### 1. 自定义虚拟滚动
替换 react-virtuoso，实现更轻量的虚拟滚动：
- 使用 IntersectionObserver + CSS
- 仅实现项目需要的功能

**预期收益**: 减少 20-25 KB

#### 2. 按需加载组件
```typescript
// 大型组件按需加载
const VoiceInput = lazy(() => import("./VoiceInput"));
const ToolCallDisplay = lazy(() => import("./ToolCallDisplay"));
```

#### 3. 优化 React
- 使用 Preact（React 替代品，3 KB）
- 或等待 React 19 的改进

---

## 性能监控建议

### 1. 定期检查 Bundle 大小
```bash
# 生成 bundle 分析报告
npm run build -- --mode analyze

# 或使用 vite-plugin-visualizer
npm install -D rollup-plugin-visualizer
```

### 2. 设置 Bundle 大小阈值
```javascript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          virtuoso: ["react-virtuoso"],
        },
      },
    },
  },
});
```

### 3. CI/CD 集成
- 在 PR 中显示 bundle 大小变化
- 超过阈值自动警告

---

## Bundle 分析工具

### 推荐工具

1. **webpack-bundle-analyzer** / **rollup-plugin-visualizer**
   - 可视化 bundle 组成
   - 识别大体积依赖

2. **source-map-explorer**
   - 分析源码贡献
   - 精确到文件级别

3. **bundlephobia.com**
   - 查询 npm 包大小
   - 对比替代方案

### 使用示例

```bash
# 安装 visualizer
npm install -D rollup-plugin-visualizer

# 构建时生成报告
npm run build -- --mode analyze

# 打开 stats.html 查看
open stats.html
```

---

## 当前状态评估

### 优势 ✅
- Bundle 大小在合理范围（493 KB）
- Gzip 压缩效果良好（70% 压缩率）
- 已使用 Tree Shaking
- 已添加 React.memo 优化

### 待改进 ⚠️
- Lucide Icons 导入可优化
- 可考虑代码分割
- react-virtuoso 较重（但功能必需）

### 推荐行动 🎯
1. **立即可做**: 优化 Lucide Icons 导入方式
2. **短期目标**: 添加代码分割，减少首屏加载
3. **长期考虑**: 如果 bundle 超过 600 KB 再进行深度优化

---

**文档版本**: 1.0.0  
**创建日期**: 2026-04-18  
**维护者**: Development Team
