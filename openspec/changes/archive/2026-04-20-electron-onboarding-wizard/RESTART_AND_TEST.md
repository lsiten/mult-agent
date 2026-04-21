# 重启应用并测试 CDP 自动检测功能

## 🚀 重启步骤

### 1. 准备工作（已完成）
- ✅ Web 前端已构建
- ✅ Electron 后端已编译
- ✅ Web 资源已复制到 renderer 目录
- ✅ CDP 自动检测功能已实现

### 2. 启动 Gateway（必需）
CDP 自动检测功能需要 Gateway 后端支持。

**打开新终端 1**:
```bash
cd /Users/shicheng_lei/code/hermes-agent-v2
hermes gateway
```

等待看到：
```
✓ Gateway 启动成功
✓ API Server 运行在 http://localhost:8642
```

### 3. 启动 Electron 应用

**打开新终端 2**:
```bash
cd /Users/shicheng_lei/code/hermes-agent-v2/electron-app
npm start
```

## 🧪 测试 CDP 自动检测功能

### 场景 1: 首次运行体验（推荐）

1. **删除 onboarding 标记文件**（触发首次运行）:
   ```bash
   rm -f ~/Library/Application\ Support/hermes-agent-electron/config/.onboarding-complete
   ```

2. **启动应用**（如果已经启动，重启应用）

3. **Onboarding 向导应该自动出现**
   - 步骤 1: 选择语言 → 下一步
   - 步骤 2: 选择任意 LLM 提供商 → 下一步
   - 步骤 3: **这里测试 CDP 功能** 👇

### 场景 2: 配置页面触发

如果应用已经启动且 Onboarding 没有出现：

1. 点击左侧导航 **"配置"** 页面
2. 找到 **"重新设置向导"** 按钮
3. 点击按钮，Onboarding 向导重新打开
4. 导航到步骤 3

## 📋 CDP 功能测试清单

### 步骤 3: 可选功能配置

#### 测试 A: 自动检测（Chrome 未运行）

1. **确保 Chrome 未运行**
   ```bash
   # 关闭所有 Chrome 进程
   killall "Google Chrome" 2>/dev/null
   ```

2. **在 Onboarding 中选择**:
   - ○ Local Chromium (推荐，免费)
   - ● **CDP 连接本地 Chrome** ← 选择这个
   - ○ Browserbase 云端浏览器

3. **观察自动检测**:
   - ℹ️ 应该显示："未检测到运行中的 Chrome 实例"
   - ✅ 应该显示 **"🚀 启动 Chrome"** 按钮

4. **点击"启动 Chrome"**:
   - 等待 2-3 秒
   - Chrome 应该自动打开
   - ✓ 应该显示："Chrome 已启动并连接成功！"
   - ✓ 应该看到连接的 WebSocket URL

**预期结果**:
```
✓ 已连接
ws://localhost:9222/devtools/browser/xxxxx

检测到的 Chrome 实例：
┌─────────────────────────┐
│ 端口 9222      [已连接] │
│ Chrome/120.0.0.0        │
└─────────────────────────┘
```

#### 测试 B: 自动检测（Chrome 已运行）

1. **手动启动 Chrome 带调试端口**:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 &
   ```

2. **在 Onboarding 中选择 CDP 模式**

3. **观察自动检测**:
   - ✓ 应该显示："检测到 1 个 Chrome 实例"
   - ✓ 应该列出端口 9222 的实例

4. **点击"连接"按钮**:
   - ✓ 立即连接成功
   - ✓ 显示："已连接到端口 9222 上的 Chrome"

#### 测试 C: 多实例检测

1. **启动多个 Chrome 实例**:
   ```bash
   # 实例 1 - 端口 9222
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 &
   
   # 实例 2 - 端口 9223
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9223 &
   ```

2. **在 Onboarding 中选择 CDP 模式**

3. **观察检测结果**:
   - ✓ 应该显示："检测到 2 个 Chrome 实例"
   - ✓ 应该列出两个实例

4. **选择其中一个点击"连接"**

#### 测试 D: 重新检测功能

1. **初始状态没有 Chrome**
   - 显示"未检测到实例"

2. **启动 Chrome**（另一个终端）:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 &
   ```

3. **点击"🔍 重新检测"按钮**
   - ✓ 应该重新扫描
   - ✓ 现在应该检测到新启动的实例

#### 测试 E: 错误处理（Gateway 未运行）

1. **停止 Gateway**:
   ```bash
   # 在 Gateway 终端按 Ctrl+C
   ```

2. **在 Onboarding 中选择 CDP 模式**

3. **观察行为**:
   - ⚠️ 应该显示："自动检测失败，请确保后端服务已启动"
   - ✓ 仍然显示帮助文本（降级方案）
   - ✓ 用户可以继续操作（不会卡住）

## 🎬 完整的端到端测试

### 完整流程测试

1. **准备**: 删除标记文件，关闭所有 Chrome
2. **启动**: Gateway → Electron App
3. **步骤 1**: 选择中文 → 下一步
4. **步骤 2**: 选择"火山引擎" → 填入测试 API Key → 下一步
5. **步骤 3**: 
   - 选择 CDP 模式
   - 点击"启动 Chrome"
   - 等待连接成功 ✓
   - 下一步
6. **步骤 4**: 点击"开始使用 Hermes"
7. **验证**: 配置应该已保存

### 验证配置已生效

```bash
# 检查环境变量
cat ~/Library/Application\ Support/hermes-agent-electron/config/.env | grep BROWSER_CDP_URL

# 应该看到类似：
# BROWSER_CDP_URL=ws://localhost:9222/devtools/browser/xxxxx
```

## 🔍 调试技巧

### 查看日志

**Electron 应用日志**:
- 在应用窗口按 `Cmd+Option+I` 打开开发者工具
- 查看 Console 标签

**Gateway 日志**:
- 在 Gateway 终端查看实时输出

### 测试 API 直接调用

```bash
# 检测 Chrome
curl http://localhost:8642/api/browser/detect-chrome | jq

# 启动 Chrome
curl -X POST http://localhost:8642/api/browser/launch-chrome | jq
```

### 常见问题

**Q: 点击"启动 Chrome"没反应**
```bash
# 检查 Gateway 是否运行
curl http://localhost:8642/health

# 检查 Chrome 是否已经在运行
ps aux | grep Chrome
```

**Q: 检测不到 Chrome**
```bash
# 手动测试端口是否开放
curl http://localhost:9222/json/version
```

**Q: WebSocket URL 格式错误**
```bash
# 应该以 ws:// 开头
echo $BROWSER_CDP_URL
```

## 📸 预期截图

### 成功状态
```
✓ 已连接
ws://localhost:9222/devtools/browser/12345678-1234-1234...

检测到的 Chrome 实例：

┌──────────────────────────────────┐
│ 端口 9222              [已连接]  │
│ Chrome/120.0.6099.234            │
└──────────────────────────────────┘

[🔍 重新检测]

💡 点击"启动 Chrome"自动打开浏览器，或手动启动...
```

### 启动成功消息
```
✅ Chrome 已启动并连接成功！
```

### 检测失败（友好降级）
```
⚠️ 自动检测失败，请确保后端服务已启动

💡 点击"启动 Chrome"自动打开浏览器，或手动启动...
chrome --remote-debugging-port=9222
```

## ✅ 测试通过标准

- [ ] 自动检测功能正常工作
- [ ] 启动 Chrome 功能正常
- [ ] 一键连接功能正常
- [ ] 多实例检测和选择正常
- [ ] 重新检测功能正常
- [ ] 错误处理友好（Gateway 未运行时）
- [ ] UI 响应快速（< 3 秒）
- [ ] 配置正确保存到 .env
- [ ] 没有控制台错误

## 🎉 测试完成后

如果所有测试通过：

1. **保存截图**（可选）
   - 成功连接的界面
   - 多实例检测的界面

2. **清理测试环境**:
   ```bash
   # 关闭测试用的 Chrome 实例
   killall "Google Chrome"
   
   # 保留配置文件供实际使用
   ```

3. **用户验收**:
   - 邀请团队成员测试
   - 收集反馈

---

**测试脚本版本**: v1.0  
**最后更新**: 2026-04-19  
**预计测试时间**: 15-20 分钟
