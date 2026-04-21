# 应用启动测试指南

## 快速开始

```bash
cd electron-app
npm run dev
```

---

## 观察要点

### 1. 启动日志检查 ✓

**预期日志序列:**
```
[Main] App ready
[Main] Checking for data migration...
[DataMigration] Migration check: No migration needed
  （因为数据已在正确位置）
[Main] No migration needed
[PythonManager] Starting Python process manager...
[PythonManager] Hermes home directory: .../hermes-agent-electron
[PythonManager] Python directory: .../python
[PythonManager] Using Python: ...
[PythonManager] Starting Gateway: ...
```

**关键检查点:**
- ✓ "No migration needed" - 数据路径正确
- ✓ Hermes home = "hermes-agent-electron" - 不是 "hermes-electron/config"
- ✓ Gateway 正常启动

### 2. Analytics 页面验证 ✓

**导航:** 打开应用 → 点击左侧 "分析" 菜单

**预期显示:**
```
┌─────────────────────────────────┐
│ 总 TOKEN 数          #          │
│ 70.6K                           │
│ 输入 308 / 输出 70,254          │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ 总会话数             BarChart3  │
│ 21                              │
│ ~0.7/天 平均                    │
└─────────────────────────────────┘
```

**检查点:**
- ❌ 修复前: "输入 null / 输出 null"
- ✅ 修复后: "输入 308 / 输出 70,254"

### 3. 历史会话验证 ✓

**导航:** 点击左侧 "会话" 菜单

**预期显示:**
- ✅ 显示 21 个历史会话
- ✅ 会话时间: 2026-04-12 至 2026-04-16
- ✅ 可以点击查看详情

### 4. 功能回归测试 ✓

**测试项目:**
- [ ] **聊天**: 发送 "Hello" → 收到回复
- [ ] **配置**: 可以打开配置页面
- [ ] **Gateway**: 状态显示 "运行中"
- [ ] **Skills**: 可以查看和切换 skills
- [ ] **日志**: 日志正确显示

---

## 问题排查

### 问题 1: Analytics 仍显示 "null"

**可能原因:**
1. 浏览器缓存未清除
2. 前端代码未重新编译

**解决:**
```bash
# 重新编译前端
npm run build:web

# 清除 Electron 缓存
rm -rf dist/renderer
npm run build:all

# 重启应用
npm run dev
```

### 问题 2: 数据库为空

**检查:**
```bash
sqlite3 ~/Library/Application\ Support/hermes-agent-electron/state.db \
  "SELECT COUNT(*) FROM sessions;"
```

**预期**: 21

**如果为 0:**
- 检查应用使用的路径
- 查看启动日志中的 "Hermes home" 路径

### 问题 3: Gateway 启动失败

**检查日志:**
- 看是否有 Python 错误
- 检查 HERMES_HOME 环境变量

**手动测试:**
```bash
export HERMES_ELECTRON_MODE=true
export HERMES_HOME="$HOME/Library/Application Support/hermes-agent-electron"
python3 -c "from hermes_constants import get_hermes_home; print(get_hermes_home())"
```

---

## 成功标志

应用启动成功后，你应该看到：

### ✅ 启动日志正常
```
[Main] App ready
[Main] No migration needed
[PythonManager] Python services started successfully
```

### ✅ Analytics 显示正确
```
总 TOKEN 数: 70.6K
输入 308 / 输出 70,254  ← 不再是 "null"
```

### ✅ 历史数据完整
```
21 个会话
时间范围: 2026-04-12 至 2026-04-16
```

### ✅ 所有功能正常
- 可以发送消息
- 可以查看配置
- Gateway 运行正常

---

## 测试完成检查表

- [ ] 应用正常启动
- [ ] 启动日志正确
- [ ] Analytics 不显示 "null"
- [ ] Analytics 显示 "308 / 70,254"
- [ ] 历史会话显示 21 个
- [ ] 可以发送新消息
- [ ] Gateway 状态正常
- [ ] 配置页面可访问
- [ ] Skills 页面正常
- [ ] 日志页面正常

---

## 下一步

测试通过后：

1. **记录测试结果**
   - 截图 Analytics 页面
   - 记录任何异常

2. **打包测试** (可选)
   ```bash
   npm run package:mac
   ```

3. **准备发布**
   - 更新 CHANGELOG
   - 创建 Git commit
   - 标记版本号

---

## 快速命令

```bash
# 启动应用
npm run dev

# 查看数据
sqlite3 ~/Library/Application\ Support/hermes-agent-electron/state.db \
  "SELECT COUNT(*) FROM sessions;"

# 重新编译
npm run build:all

# 清理缓存
rm -rf dist
npm run build:all
```

---

**预计测试时间**: 5 分钟  
**成功率预估**: 99%

准备好了吗？运行 `npm run dev` 开始测试！ 🚀
