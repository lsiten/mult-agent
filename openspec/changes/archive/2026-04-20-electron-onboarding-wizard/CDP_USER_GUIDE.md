# CDP 浏览器连接 - 用户指南

## 🎯 什么是 CDP 连接？

CDP（Chrome DevTools Protocol）连接允许 Hermes Agent 直接控制你本地运行的 Chrome 浏览器，进行自动化操作。

**优势**:
- ✅ 完全免费（相比云端浏览器服务）
- ✅ 可以看到浏览器操作过程
- ✅ 使用自己的浏览器配置、书签、扩展
- ✅ 更快的响应速度（本地运行）

## 🚀 快速开始（推荐方式）

### 方法 1: 自动启动（最简单）

1. **打开 Onboarding 向导**
   - 首次启动应用时自动出现
   - 或在配置页面点击"重新设置向导"

2. **进入步骤 3：可选功能**

3. **选择"CDP 连接本地 Chrome"**
   ```
   ○ Local Chromium (推荐，免费)
   ● CDP 连接本地 Chrome          ← 选择这个
   ○ Browserbase 云端浏览器
   ```

4. **点击"启动 Chrome"按钮**
   ```
   [🔍 重新检测]  [🚀 启动 Chrome]  ← 点击这个
   ```

5. **等待 2-3 秒**
   - Chrome 会自动打开
   - 显示"Chrome 已启动并连接成功！"
   - ✅ 配置完成！

### 方法 2: 自动检测（如果 Chrome 已经在运行）

1. **如果你已经启动了 Chrome**（带调试端口）

2. **选择"CDP 连接本地 Chrome"**

3. **系统会自动检测**
   ```
   ✓ 检测到 1 个 Chrome 实例
   
   ┌─────────────────────────┐
   │ 端口 9222      [连接]   │  ← 点击"连接"
   │ Chrome/120.0.0.0        │
   └─────────────────────────┘
   ```

4. **点击"连接"按钮**
   - ✅ 立即连接成功！

## 🛠️ 高级用法

### 手动启动 Chrome（如果自动启动失败）

#### macOS
```bash
# 终端执行
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222
```

#### Linux
```bash
google-chrome --remote-debugging-port=9222
# 或
chromium-browser --remote-debugging-port=9222
```

#### Windows
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

启动后，回到 Onboarding 向导点击"重新检测"。

### 使用不同的端口

如果 9222 端口被占用：

1. **启动 Chrome 时指定其他端口**
   ```bash
   chrome --remote-debugging-port=9223
   ```

2. **在向导中检测时会自动找到**
   系统会扫描常用端口：9222, 9223, 9224, 9333

### 多个 Chrome 实例

如果你同时运行多个 Chrome 实例：

```
检测到的 Chrome 实例：

┌─────────────────────────┐
│ 端口 9222      [连接]   │  ← 个人浏览器
│ Chrome/120.0.0.0        │
└─────────────────────────┘

┌─────────────────────────┐
│ 端口 9223      [连接]   │  ← 工作浏览器
│ Chrome/120.0.0.0        │
└─────────────────────────┘
```

选择你想用的那个点击"连接"即可。

## 🐛 故障排除

### 问题 1: "未检测到运行中的 Chrome 实例"

**原因**: Chrome 没有启动或没有使用调试端口

**解决方案**:
1. 点击"启动 Chrome"按钮（推荐）
2. 或手动启动 Chrome 带 `--remote-debugging-port=9222` 参数

### 问题 2: "启动 Chrome 失败"

**可能原因**:
- Chrome 未安装在标准位置
- 9222 端口被占用

**解决方案**:
1. **检查 Chrome 是否安装**
   ```bash
   # macOS
   open /Applications/Google\ Chrome.app
   
   # Linux
   which google-chrome
   ```

2. **尝试不同端口**
   - 手动启动 Chrome 使用 9223 端口
   - 点击"重新检测"

3. **检查端口占用**
   ```bash
   # 检查 9222 是否被占用
   lsof -i :9222
   
   # 或
   netstat -an | grep 9222
   ```

### 问题 3: "连接后浏览器无响应"

**原因**: WebSocket 连接断开

**解决方案**:
1. 不要关闭 Chrome 浏览器
2. 点击"重新检测"重新连接
3. 如果持续失败，重启 Hermes Agent

### 问题 4: "检测功能不可用"

**原因**: Gateway 后端未启动

**解决方案**:
- 确保 Hermes Agent gateway 服务正在运行
- 重启应用

## 🔒 安全说明

### 调试端口的安全性

当你启动 Chrome 带 `--remote-debugging-port` 参数时：

⚠️ **注意事项**:
- Chrome 会在指定端口监听连接
- 本地网络中的其他设备可能连接
- 建议只在可信网络使用

✅ **安全建议**:
- 使用完毕后关闭带调试端口的 Chrome
- 不要在公共 WiFi 下使用
- 如果需要长期使用，配置防火墙规则

### 数据隐私

- CDP 连接是本地的，不经过互联网
- Hermes Agent 只能访问连接的 Chrome 实例
- 浏览历史、密码等数据不会被上传

## 💡 使用建议

### 推荐场景

✅ **适合使用 CDP 的场景**:
- 需要看到浏览器实际操作过程
- 想使用自己的登录状态和 Cookie
- 需要使用浏览器扩展（如翻译、广告拦截）
- 本地开发和测试

❌ **不推荐的场景**:
- 无人值守的自动化任务（用 Local Chromium）
- 云服务器部署（用 Browserbase）
- 需要多实例并发（用 Browserbase）

### 性能优化

1. **关闭不必要的标签页**
   - CDP 连接后，关闭其他无关标签页
   - 提高性能和稳定性

2. **禁用扩展**
   - 某些扩展可能干扰自动化
   - 使用干净的 Chrome Profile

3. **定期重启**
   - 长时间使用后，重启 Chrome
   - 清理内存和缓存

## 📚 更多资源

- [Chrome DevTools Protocol 官方文档](https://chromedevtools.github.io/devtools-protocol/)
- [Hermes Agent 浏览器工具文档](../../docs/browser-automation.md)
- [故障排除指南](../../docs/troubleshooting.md)

## ❓ 常见问题

**Q: CDP 和 Local Chromium 有什么区别？**

A: 
- **CDP**: 连接你自己打开的 Chrome，可以看到操作过程
- **Local Chromium**: 后台运行的无头浏览器，看不到界面

**Q: 可以连接到其他机器的 Chrome 吗？**

A: 当前版本只支持本地连接 (localhost)。远程连接功能计划在未来版本添加。

**Q: 连接后 Chrome 可以正常使用吗？**

A: 可以！CDP 连接不影响正常浏览，但建议不要在 Agent 操作时手动操作浏览器，避免冲突。

**Q: 如何断开连接？**

A: 
1. 方法 1: 关闭 Chrome
2. 方法 2: 在配置页面清除 BROWSER_CDP_URL
3. 方法 3: 重启 Hermes Agent

**Q: 支持其他浏览器吗（Edge、Brave）？**

A: 理论上支持所有基于 Chromium 的浏览器，但自动启动功能目前只支持 Chrome。你可以手动启动其他浏览器带调试端口，然后使用"重新检测"。

---

**版本**: v2.0 (CDP Auto-Detection)  
**更新日期**: 2026-04-19  
**适用应用版本**: Hermes Agent Electron v0.1.0+
