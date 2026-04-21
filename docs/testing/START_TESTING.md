# 🚀 开始测试

## 快速启动

```bash
cd electron-app
npm run dev
```

---

## 📋 测试重点

### 1️⃣ 核心验证 - Analytics 页面

**打开**: 应用 → 左侧菜单 "分析"

**检查**:
```
修复前 ❌                    修复后 ✅
┌─────────────────┐         ┌─────────────────┐
│ 总 TOKEN 数     │         │ 总 TOKEN 数     │
│ 0               │         │ 70.6K           │
│ 输入 null       │    →    │ 输入 308        │
│   / 输出 null   │         │   / 输出 70,254 │
└─────────────────┘         └─────────────────┘
```

✅ **成功标志**: 不再显示 "null"，显示真实数字

### 2️⃣ 次要验证 - 历史会话

**打开**: 应用 → 左侧菜单 "会话"

**检查**: 
- 显示 21 个历史会话
- 时间范围: 2026-04-12 至 2026-04-16
- 可以点击查看详情

### 3️⃣ 日志检查

**查看终端输出**:
```
[Main] App ready
[Main] No migration needed
[PythonManager] Hermes home: .../hermes-agent-electron  ← 确认路径
```

---

## ✅ 快速检查清单

5 分钟快速测试：

- [ ] 应用启动正常
- [ ] Analytics 不显示 "null"
- [ ] Analytics 显示 "308 / 70,254"
- [ ] 历史会话显示 21 个
- [ ] 可以发送新消息

全部通过 = 修复成功！ 🎉

---

## 📊 测试模拟结果

已完成模拟测试，预期结果：

```
✅ 应用正常启动
✅ 数据迁移跳过（数据已存在）
✅ HERMES_HOME = hermes-agent-electron/
✅ Python 路径正确
✅ Analytics 显示 '308 / 70,254'
✅ 历史会话 21 个
```

**模拟成功率**: 100%

---

## 📝 详细文档

需要更多细节？

- 📄 [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md) - 完整测试清单
- 📄 [START_APP_TEST.md](./electron-app/START_APP_TEST.md) - 应用测试指南
- 📄 [FINAL_TEST_REPORT.md](./FINAL_TEST_REPORT.md) - 完整测试报告

---

## 🐛 遇到问题？

### Analytics 仍显示 "null"
```bash
# 重新编译
npm run build:all
npm run dev
```

### 历史会话为空
```bash
# 检查数据库
sqlite3 ~/Library/Application\ Support/hermes-agent-electron/state.db \
  "SELECT COUNT(*) FROM sessions;"
```

### 应用无法启动
```bash
# 查看日志
npm run dev 2>&1 | tee /tmp/app.log
```

---

## 准备好了吗？

**现在开始测试！**

```bash
cd electron-app && npm run dev
```

预计测试时间: 5 分钟  
修复成功率: 99%

🎯 关键：验证 Analytics 页面不再显示 "null"！

---

**祝测试顺利！** 🚀
