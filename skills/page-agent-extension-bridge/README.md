# Page Agent Extension Bridge

使用 Page Agent Chrome 扩展通过 WebSocket 桥接进行浏览器自动化。

## 概述

Page Agent Extension Bridge 允许 Hermes Agent 通过 Page Agent Chrome 扩展控制用户的本地浏览器。这意味着：

- 继承用户的登录会话和 Cookie
- 使用用户已有的浏览器配置文件和扩展
- 无需启动独立的浏览器实例
- 在用户的日常浏览环境中执行自动化任务

## 安装步骤

### 1. 解压扩展压缩包

扩展已经打包在当前 skill 的 assets 目录中：

```bash
# 在 mult-agent 项目根目录
unzip skills/page-agent-extension-bridge/assets/page-agent-ext-1.8.0-chrome.zip -d /tmp/page-agent-ext
```

解压后得到 `chrome-mv3/` 目录。

### 2. 安装 Chrome 扩展

1. 打开 Chrome 浏览器 → 访问 `chrome://extensions/`
2. 启用右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择刚才解压得到的 `chrome-mv3` 目录
5. 确认扩展列表中出现 "Page Agent" 扩展 ✓

### 3. 启动桥接服务器

在 **page-agent 项目**根目录中运行：

```bash
npm run bridge:server
```

**预期输出:**
```
WebSocket server running on ws://127.0.0.1:18765
Waiting for extension connection...
```

### 4. 连接扩展

1. 点击 Chrome 工具栏中的 **Page Agent** 扩展图标
2. 确认 **Endpoint** 设置为: `ws://127.0.0.1:18765`
3. 点击 **Connect** 按钮
4. 状态显示绿色 **Connected** ✓

### 5. 完成

**Extension Bridge 默认已启用** - 由于已移除所有其他浏览器后端，无需额外配置环境变量。重启 Hermes 后，浏览器工具将自动使用 Extension Bridge 后端。

## 使用方式

启用 Extension Bridge 后，所有浏览器工具 (`browser_navigate`, `browser_snapshot`, `browser_click` 等) 将自动通过 Chrome 扩展执行。

### 示例

```python
from tools.browser_tool import browser_navigate, browser_snapshot

# 导航到页面 (使用用户的浏览器，包含登录状态)
result = browser_navigate("https://example.com/dashboard")

# 获取页面快照
snapshot = browser_snapshot(task_id="my_task")

# 点击元素
browser_click("@e3", task_id="my_task")
```

## 特性

- ✅ 自动继承用户的登录会话
- ✅ 使用真实的 Chrome 浏览器环境
- ✅ 支持所有标准浏览器工具 API
- ✅ 执行 JavaScript 代码
- ✅ 安全检查（URL 策略、密钥泄露防护）
- ❌ 截图/视觉分析（当前协议不支持）

## 故障排除

### 连接失败

```
Error: Cannot connect to Extension Bridge
```

解决：
1. 确认桥接服务器正在运行 (`npm run bridge:server`)
2. 确认扩展已安装并连接
3. 检查扩展弹出窗口中的连接状态
4. 验证端口 18765 是否被占用

### 扩展未连接

1. 点击 Chrome 工具栏中的 Page Agent 扩展图标
2. 确认 Endpoint 设置为 `ws://127.0.0.1:18765`
3. 点击 "Connect" 按钮
4. 状态应显示为 "Connected"

### 命令超时

- 检查服务器日志是否有错误
- 确认页面没有在调试器暂停
- 尝试刷新目标页面

## 优势

相比传统的独立浏览器后端，Extension Bridge 提供：

| 特性 | Extension Bridge | 传统独立浏览器 |
|------|------------------|----------------|
| **继承用户登录会话** | ✅ | ❌ 需要重新登录 |
| **用户扩展可用** | ✅ | ❌ 独立进程不共享 |
| **不干扰用户浏览** | ✅ 在用户浏览器中运行 | ❌ 启动独立浏览器实例 |
| **保留浏览器配置** | ✅ 使用用户的代理、Cookie、设置 | ❌ 干净实例无配置 |
| **无需额外下载浏览器** | ✅ 使用已安装的 Chrome | ❌ 需要下载 Chromium |
| **设置难度** | ⭐ 简单（仅需加载扩展） | ⭐⭐⭐ 需要安装依赖 |

## 安全说明

- 桥接服务器仅监听 localhost（127.0.0.1）
- 外部无法连接到桥接服务
- 所有命令通过 WebSocket 发送到扩展
- 保留原有的 URL 安全检查和密钥泄露防护
