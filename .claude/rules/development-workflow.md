---
paths:
  - "tests/**/*.py"
  - "pytest.ini"
  - ".github/workflows/*.yml"
  - "scripts/**/*"
  - "Makefile"
  - "package.json"
---

# 开发工作流

## 快速开始

| 场景 | 命令 | 启动时间 |
|------|------|----------|
| Electron 开发 | `cd electron-app && npm start` | ~2.25s (v1.1.0) |
| 前端开发 | `cd web && npm run dev` | <1s |
| Agent CLI | `hermes` | <2s |
| 打包分发 | `npm run package:mac:optimized` | ~30s |

## 热重载

| 修改内容 | 响应方式 | 需要重启 |
|---------|----------|---------|
| Python 代码 | DevWatcher 自动重启 Gateway (1秒防抖) | ❌ |
| TypeScript (Main) | 需重新编译 | ✅ `npm run build:main` |
| React/CSS | Vite HMR | ❌ |
| config.yaml | 手动重启 Gateway | ✅ |

## 添加功能

### 新工具 (Tool)

1. **创建**: `tools/my_tool.py`
2. **注册**: `tools/__init__.py` 导入
3. **测试**: `tests/tools/test_my_tool.py`

### 新技能 (Skill)

```bash
mkdir skills/my-skill
# 创建 skill.yaml, skill.py, README.md
hermes skill invoke my-skill
```

### 新前端页面 (含 i18n)

1. **翻译**: 添加到 `web/src/i18n/en.ts` 和 `zh.ts`
2. **组件**: 创建 `web/src/pages/MyPage.tsx`
3. **路由**: 添加到 `web/src/App.tsx`
4. **测试**: 切换语言验证

### 新 Gateway API

1. **处理器**: `gateway/platforms/api_server_myapi.py`
2. **路由**: 注册到 `api_server.py`
3. **客户端**: 添加到 `web/src/lib/api.ts`
4. **测试**: `curl -X POST http://localhost:8642/api/my-endpoint`

## 调试

### Electron

```bash
# DevTools
Cmd+Option+I

# 查看日志
tail -f ~/Library/Application\ Support/hermes-agent-electron/logs/gateway.log
```

### Gateway

```bash
# 健康检查
curl http://localhost:8642/health

# 直接运行
cd gateway && python run.py
```

### 前端

```bash
# 开发服务器
cd web && npm run dev

# 浏览器 DevTools
F12 或 Cmd+Option+I
```

## 故障排查

### 窗口空白

```bash
lsof -i:5173              # Vite 是否运行
curl localhost:8642/health # Gateway 是否就绪
# 检查 config.yaml 中 cors_origins
```

### Gateway 无法启动

```bash
lsof -i:8642              # 端口是否被占用
pip list | grep aiohttp   # 依赖是否完整
tail -f ~/Library/.../logs/gateway.log  # 查看启动日志
```

### Python 热重载失效

1. 确认 DevWatcher 在运行（查看启动日志）
2. 确认修改的是符号链接指向的源文件
3. 等待 1 秒防抖触发

### CORS 403 错误

```bash
# 确认 config.yaml
cors_origins: "http://localhost:5173"

# 重启 Gateway
# 测试
curl -H "Origin: http://localhost:5173" http://localhost:8642/health
```

## Git 工作流

### 分支命名

```
feat/description       # 新功能
fix/description        # Bug 修复
refactor/description   # 重构
task/TASK-xxx         # 关联任务
```

### 提交信息

```
feat: add new feature
fix: resolve bug in Gateway
refactor: optimize Electron startup
docs: update architecture guide
test: add unit tests for tools
```

### 提交前检查

```bash
pytest tests/                     # 运行测试
cd electron-app && npm run build:main  # TypeScript 编译
cd web && npm run build           # 前端构建
git status                        # 确认所有变更
```

## 测试

```bash
# Python 测试
pytest tests/                     # 所有测试
pytest tests/test_gateway.py -v  # 特定文件
pytest --cov=agent tests/         # 带覆盖率

# TypeScript 测试
cd electron-app
npm run test:unit                 # 单元测试
npm run test:integration          # 集成测试
```

## 环境变量

**必需**:
```bash
ANTHROPIC_API_KEY=sk-xxx          # Claude API
```

**可选**:
```bash
MODEL_NAME=claude-sonnet-4-6      # 默认模型
GATEWAY_PORT=8642                 # Gateway 端口
# HERMES_HOME 由 Electron 自动设置，无需手动配置
```

见 `.env.example` 完整列表

## 参考

- **Electron 架构**: `.claude/rules/architecture-electron.md`
- **Hermes 核心**: `.claude/rules/architecture-hermes-core.md`
- **i18n 规范**: `.claude/rules/i18n-guidelines.md`
- **完整文档**: 各模块目录下的 README.md
