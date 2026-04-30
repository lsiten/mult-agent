---
name: page-agent-extension-bridge
description:
  通过 Page Agent Chrome 扩展进行浏览器自动化，继承用户的登录会话和浏览器配置。
  适用于需要真实浏览器环境、已登录状态的自动化任务。
metadata:
  author: Hermes Agent Team
  version: "1.0.0"
  category: Browser Automation
---

# Page Agent Extension Bridge Skill

## 安装引导

### 第一步：安装 Chrome 扩展

扩展压缩包位置：`skills/page-agent-extension-bridge/assets/page-agent-ext-1.8.0-chrome.zip`

1. **解压扩展压缩包**
   ```bash
   # 在 mult-agent 项目根目录
   unzip skills/page-agent-extension-bridge/assets/page-agent-ext-1.8.0-chrome.zip -d /tmp/page-agent-ext
   ```
   解压后得到 `chrome-mv3/` 目录。

2. **在 Chrome 中加载扩展**
   - 打开 Chrome 浏览器，访问 `chrome://extensions/`
   - 启用右上角的 **开发者模式**
   - 点击 **加载已解压的扩展程序**
   - 选择刚才解压得到的 `chrome-mv3` 目录
   - 确认扩展列表中出现 "Page Agent" 扩展

### 第二步：启动桥接服务器

```bash
# 在 page-agent 项目根目录运行
npm run bridge:server
```

**预期输出:**
```
WebSocket server running on ws://127.0.0.1:18765
Waiting for extension connection...
```

验证服务器运行：
```bash
nc -z 127.0.0.1 18765 && echo "✅ Server is running"
```

### 第三步：连接扩展到服务器

1. 点击 Chrome 工具栏中的 **Page Agent** 扩展图标
2. 确认 **Endpoint** 设置为: `ws://127.0.0.1:18765`
3. 点击 **Connect** 按钮
4. 状态应显示为绿色的 **Connected**

## 前置检查清单

启动任务前确认：

- [ ] Page Agent Chrome 扩展已安装并启用 ✓
- [ ] 桥接服务器在端口 18765 运行 ✓
- [ ] 扩展已连接到桥接服务器，状态显示 Connected ✓

## 适用场景

**优先使用此技能当：**

- 需要访问需要登录的网站/服务
- 任务依赖用户的浏览器配置、扩展或书签
- 需要在真实的浏览环境中测试或操作
- 网站有强反爬检测，需要真实用户指纹
- 多步骤交互需要保留会话状态

**不适用场景：**

- 需要截图或视觉分析（当前协议不支持）
- 需要完全隔离的浏览器环境
- 需要批量/并发浏览器操作
- 需要自定义 User-Agent 或指纹

## 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `EXTENSION_BRIDGE_ENABLED` | `true` | 默认启用 Extension Bridge 后端，不需要额外配置 |
| `EXTENSION_BRIDGE_HOST` | `127.0.0.1` | 桥接服务器主机地址 |
| `EXTENSION_BRIDGE_PORT` | `18765` | 桥接服务器端口 |

> **默认已启用**：由于已移除所有其他浏览器后端，Extension Bridge 是唯一的浏览器自动化方案，默认启用。

## 支持的浏览器工具

所有标准浏览器工具均支持 Extension Bridge 后端：

| 工具 | 支持状态 | 说明 |
|------|---------|------|
| `browser_navigate` | ✅ | 导航到 URL，获取页面快照 |
| `browser_snapshot` | ✅ | 获取 DOM 结构快照（JS生成） |
| `browser_click` | ✅ | 点击元素（按索引） |
| `browser_type` | ✅ | 输入文本（按索引） |
| `browser_scroll` | ✅ | 滚动页面 |
| `browser_back` | ✅ | 历史回退 |
| `browser_press` | ✅ | 键盘按键 |
| `browser_get_images` | ✅ | 获取页面图片列表 |
| `browser_console` | ✅ | 执行 JavaScript |
| `browser_vision` | ❌ | 不支持截图/视觉分析 |

## 使用示例

### 场景1：访问已登录的后台

```python
# 用户已经在浏览器中登录了后台系统
# Extension Bridge 继承该登录状态

# 直接导航到后台页面（无需重新登录）
result = browser_navigate("https://admin.example.com/dashboard")
print(result)  # 已登录状态的页面内容

# 操作后台元素
browser_click("@e5", task_id="admin-task")  # 点击"用户管理"
browser_type("@e12", "user@example.com", task_id="admin-task")  # 搜索用户
```

### 场景2：执行 JavaScript

```python
# 获取页面元数据
result = browser_console(
    expression="JSON.stringify({title: document.title, url: window.location.href})"
)

# 操作 DOM
browser_console(
    expression="document.querySelector('button.submit').click()"
)
```

### 场景3：多步骤会话保持

```python
task_id = "shopping-checkout"

# 所有操作共享同一个浏览器标签页，保持会话状态
browser_navigate("https://shop.example.com/cart", task_id=task_id)
browser_click("@e8", task_id=task_id)  # 点击结账
browser_type("@e15", "123 Main St", task_id=task_id)  # 输入地址
browser_click("@e20", task_id=task_id)  # 提交订单
```

## 局限性和注意事项

### 元素索引匹配

Extension Bridge 使用 JavaScript 动态生成 DOM 快照，元素索引与 agent-browser 的索引系统**不完全相同**。

**最佳实践：**
1. 导航后立即调用 `browser_snapshot` 获取最新的元素列表
2. 使用 `browser_console` 配合 CSS 选择器进行精确操作
3. 优先使用文本内容匹配来定位元素

```python
# 推荐：使用 JavaScript 选择器精确定位
browser_console(
    expression="document.querySelector('button:contains(\"Submit\")').click()"
)
```

### 无截图/视觉能力

当前的 WebSocket 协议不支持页面截图。对于需要视觉验证的场景：

- 改用 `browser_snapshot` 获取文本 DOM
- 使用 `browser_console` 提取需要的信息
- 告知用户手动查看浏览器状态

### 不关闭用户标签页

为了不干扰用户正常浏览，`cleanup_browser` 不会关闭用户的浏览器标签页。长时间运行大量任务时，建议：

- 定期告知用户手动清理标签页
- 使用单独的 Chrome 配置文件运行自动化任务

## 故障排查

### 问题：命令执行后没有响应

**可能原因：**
1. 扩展与桥接服务器断开连接
2. 页面在调试器断点暂停
3. JavaScript 执行出错

**解决步骤：**
1. 检查扩展弹出窗口的连接状态
2. 查看桥接服务器的控制台日志
3. 尝试断开并重新连接扩展
4. 刷新目标页面

### 问题：点击/输入操作没有效果

**可能原因：**
1. 元素索引不匹配
2. 元素在 iframe 或 Shadow DOM 中
3. 页面动态加载未完成

**解决步骤：**
1. 先调用 `browser_snapshot` 获取最新元素列表
2. 使用 `browser_console` 配合 CSS 选择器定位
3. 添加延迟等待页面加载完成

### 问题：桥接服务器启动失败

**检查：**
1. 端口 18765 是否被其他程序占用
2. Node.js 版本是否符合要求（>= 16）
3. 依赖包是否安装完整 (`npm install`)

## 安全特性

Extension Bridge 保留了 Hermes 原有的所有安全检查：

1. **URL 策略检查** — 遵守 `website_policy.json` 的访问限制
2. **密钥泄露防护** — 阻止包含 API 密钥或令牌的 URL
3. **内网访问控制** — 可选阻止内网地址访问
4. **本地仅监听** — 桥接服务器仅绑定 127.0.0.1，外部无法连接

