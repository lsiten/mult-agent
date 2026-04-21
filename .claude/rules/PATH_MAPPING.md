# Rules 路径映射表

本文档说明各 rule 文件的自动加载触发器。

## 工作原理

每个 rule 文件开头的 YAML frontmatter 定义了路径模式：

```yaml
---
paths:
  - "path/pattern/**/*.ext"
---
```

当你编辑匹配的文件时，Claude Code 会自动加载对应的 rule，提供相关的架构知识和规范。

## 📋 完整映射表

### Hermes 核心架构

**文件**: `architecture-hermes-core.md`

| 路径模式 | 说明 |
|---------|------|
| `gateway/**/*.py` | Gateway 网关层代码 |
| `agent/**/*.py` | Agent 核心层代码 |
| `tools/**/*.py` | 工具函数库 |
| `skills/**/*` | 技能脚本 |
| `hermes_state.py` | 状态管理核心 |
| `hermes_constants.py` | 全局常量 |
| `hermes_logging.py` | 日志系统 |
| `run_agent.py` | Agent 主入口 |
| `cli.py` | CLI 接口 |

### Electron 架构

**文件**: `architecture-electron.md`

| 路径模式 | 说明 |
|---------|------|
| `electron-app/src/**/*.ts` | Electron TypeScript 源码 |
| `electron-app/scripts/**/*.js` | 构建脚本 |
| `electron-app/package.json` | 依赖和脚本配置 |
| `electron-app/tsconfig.json` | TypeScript 配置 |
| `electron-app/resources/**/*` | 运行时资源 |
| `web/src/lib/api.ts` | API 客户端 |
| `web/vite.config.ts` | Vite 配置 |

### 国际化规范

**文件**: `i18n-guidelines.md`

| 路径模式 | 说明 |
|---------|------|
| `web/src/i18n/**/*.ts` | i18n 配置和翻译文件 |
| `web/src/pages/**/*.tsx` | React 页面组件 |
| `web/src/components/**/*.tsx` | React UI 组件 |
| `web/src/main.tsx` | React 应用入口 |
| `web/src/App.tsx` | 应用根组件 |

### 开发工作流

**文件**: `development-workflow.md`

| 路径模式 | 说明 |
|---------|------|
| `tests/**/*.py` | 测试文件 |
| `pytest.ini` | pytest 配置 |
| `.github/workflows/*.yml` | CI/CD 配置 |
| `scripts/**/*` | 构建和部署脚本 |
| `Makefile` | 构建任务 |
| `package.json` | npm 脚本 |

## 🎯 使用示例

### 场景 1: 修改 Gateway API

```bash
# 你编辑
vim gateway/platforms/api_server.py

# Claude Code 自动加载
architecture-hermes-core.md
  ↓
了解 Gateway 架构、API 端点、数据流
```

### 场景 2: 添加 Electron 组件

```bash
# 你编辑
vim electron-app/src/my-component.ts

# Claude Code 自动加载
architecture-electron.md
  ↓
了解 Main/Renderer Process、IPC 通信、v1.0.0 优化
```

### 场景 3: 添加前端页面

```bash
# 你编辑
vim web/src/pages/NewPage.tsx

# Claude Code 自动加载
i18n-guidelines.md
  ↓
了解 i18n 架构、翻译文件结构、开发规范
```

### 场景 4: 编写测试

```bash
# 你编辑
vim tests/test_gateway.py

# Claude Code 自动加载
development-workflow.md
  ↓
了解测试策略、pytest 配置、调试技巧
```

## 🔧 路径模式语法

支持的 glob 模式：

| 模式 | 匹配 |
|------|------|
| `*.py` | 当前目录所有 .py 文件 |
| `**/*.py` | 当前及子目录所有 .py 文件 |
| `dir/**/*` | dir/ 下所有文件和目录 |
| `file.ts` | 精确匹配特定文件 |

## 📝 添加新 Rule

如果需要添加新的 rule 文件：

1. **创建 rule 文件**:
   ```bash
   touch .claude/rules/my-new-rule.md
   ```

2. **添加 YAML frontmatter**:
   ```yaml
   ---
   paths:
     - "path/to/files/**/*.ext"
   ---
   
   # My New Rule
   ```

3. **更新导航**:
   - 在 `.claude/CLAUDE.md` 添加到导航表
   - 在 `README.md` 添加说明
   - 在本文件添加映射说明

4. **测试**:
   ```bash
   # 编辑匹配的文件，验证 rule 是否加载
   vim path/to/files/test.ext
   ```

## ⚠️ 注意事项

1. **路径必须相对于项目根目录**
   - ✅ `gateway/run.py`
   - ❌ `/Users/xxx/gateway/run.py`

2. **避免路径重叠**
   - 尽量让每个路径只匹配一个 rule
   - 如果重叠，多个 rules 都会加载

3. **保持路径精确**
   - ✅ `web/src/pages/**/*.tsx` (精确到页面组件)
   - ❌ `**/*.tsx` (太宽泛，包含所有 TypeScript 文件)

4. **定期维护**
   - 项目结构变化时更新路径
   - 删除过时的路径模式
   - 添加新目录的路径

---

**最后更新**: 2026-04-20  
**维护者**: Claude Code + 雷诗城
