# Hermes Agent v2

**AI Agent 平台**: Python 核心 + Electron 桌面应用  
**当前版本**: v1.1.0 | **启动时间**: ~2.25s

---

## 快速参考

```bash
# 一键启动 (推荐)
cd electron-app && npm start

# CLI 模式
hermes

# 前端开发
cd web && npm run dev
```

**架构**: Gateway (8642) → Agent Core → Tools/Skills → State (SQLite)

---

## 自动加载规则

编辑以下文件时自动加载对应规范（无需手动引用）：

| 路径模式 | 规则文件 |
|---------|---------|
| `electron-app/src/**/*.ts` | [Electron 架构](rules/architecture-electron.md) |
| `gateway/`, `agent/`, `tools/` | [Hermes 核心](rules/architecture-hermes-core.md) |
| `web/src/i18n/`, `web/src/pages/` | [i18n 规范](rules/i18n-guidelines.md) |

---

## 核心约束

**代码风格**
- 200-400 行/文件（硬限制：800 行）
- 禁止 `console.log`，使用日志系统
- 优先不可变数据结构

**前端开发**
- **必须使用 i18n**：所有文本通过 `t()` 翻译
- 禁止硬编码中英文文本

**提交规范**
- `feat:` 新功能 | `fix:` 修复 | `refactor:` 重构 | `docs:` 文档 | `test:` 测试
- 保持原子性提交

**测试要求**
- 工具函数：单元测试
- Gateway API：集成测试
- 关键流程：E2E 测试

---

## 故障排查

| 症状 | 快速检查 | 详细文档 |
|------|---------|---------|
| 窗口空白 | `lsof -i:5173` + `curl localhost:8642/health` | [开发工作流](rules/development-workflow.md#窗口空白) |
| Gateway 启动失败 | `lsof -i:8642` + 检查日志 | [开发工作流](rules/development-workflow.md#gateway-无法启动) |
| 热重载失效 | 确认 DevWatcher 运行 + 1秒防抖 | [开发工作流](rules/development-workflow.md#python-热重载不工作) |

---

## 性能基准 (v1.1.0)

| 指标 | v1.0.0 | v1.1.0 | 优化 |
|------|--------|--------|------|
| 启动时间 | ~3s | ~2.25s | 25% ↓ |
| CPU 占用 | 持续轮询 | 按需检查 | 20% ↓ |

**关键优化**: 分层并发启动 | 按需健康检查 | Gateway 认证 | IPC 缓存

---

## 注意事项

1. **编辑 Electron 代码后需重新编译**: `npm run build:main`
2. **修改 Python 代码自动生效**: DevWatcher 监控 + 1秒防抖
3. **前端修改实时生效**: Vite HMR
4. **不要直接编辑 `dist/`**: 这是编译产物

---

**完整文档**: 各 rules/ 文件会在编辑对应路径时自动加载，无需查找。
