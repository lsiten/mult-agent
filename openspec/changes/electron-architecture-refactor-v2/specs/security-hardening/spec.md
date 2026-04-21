## 新增需求

### 需求: Gateway 身份验证
Gateway 必须对除 /health 外的所有 API 端点要求 Bearer token 身份验证。

#### 场景: 生成随机 token
- **当** Main 进程在生产模式启动时
- **则** 系统必须生成 32 字节随机十六进制字符串作为认证 token

#### 场景: 传递 token 给 Gateway
- **当** Gateway 进程启动时
- **则** GATEWAY_AUTH_TOKEN 环境变量必须设置为生成的 token

#### 场景: 验证认证头
- **当** 向 /api/* 的请求未带 Authorization 头时
- **则** Gateway 必须返回 401 Unauthorized

#### 场景: 验证 token
- **当** 请求带有 Authorization: Bearer <错误token> 时
- **则** Gateway 必须返回 403 Forbidden

#### 场景: 允许健康检查
- **当** 向 /health 的请求未带认证头时
- **则** Gateway 必须正常处理请求（不需要认证）

### 需求: .env 文件权限
EnvManager 必须强制 .env 文件的安全文件权限（0600）。

#### 场景: 加载时检查权限
- **当** EnvManager 加载 .env 文件时
- **则** 系统必须验证文件模式为 0600（仅所有者读/写）

#### 场景: 自动修复不安全权限
- **当** .env 文件模式为 0644（全局可读）时
- **则** 系统必须自动 chmod 到 0600 并记录警告

#### 场景: 验证文件所有权
- **当** .env 文件由不同用户拥有时
- **则** 系统必须抛出错误指示安全风险

#### 场景: 创建时设置安全权限
- **当** 首次创建 .env 文件时
- **则** 系统必须立即设置模式为 0600

### 需求: 日志脱敏
所有日志输出必须脱敏以移除 API keys、密码、tokens 和其他密钥。

#### 场景: 脱敏 API keys
- **当** 日志包含 "sk-ant-1234567890abcdef" 时
- **则** 输出必须显示 "sk-ant-...cdef"（前 7 + 后 4 个字符）

#### 场景: 脱敏 Bearer tokens
- **当** 日志包含 "Authorization: Bearer abc123xyz" 时
- **则** 输出必须显示 "Authorization: Bearer ***"

#### 场景: 脱敏密码
- **当** 日志包含 'password="secret123"' 时
- **则** 输出必须显示 'password="***"'

#### 场景: 脱敏邮箱
- **当** 日志包含 "user@example.com" 时
- **则** 输出必须显示 "us***@example.com"

#### 场景: 脱敏 JWTs
- **当** 日志包含 JWT（eyJ...）时
- **则** 输出必须显示前 10 + 后 10 个字符，中间用 ... 连接

### 需求: 输入验证
所有 IPC 和 HTTP 输入必须在处理前针对 schema 或白名单验证。

#### 场景: 用 Zod 验证 IPC 输入
- **当** IPC 处理器接收输入时
- **则** 输入必须在处理器执行前针对 Zod schema 验证

#### 场景: 验证 URL 协议
- **当** shell:openExternal 接收 URL 时
- **则** 只有 http:、https:、mailto: 协议必须被允许

#### 场景: 验证 URL 长度
- **当** shell:openExternal 接收 URL 时
- **则** 超过 2048 字符的 URL 必须被拒绝

#### 场景: 域名白名单检查
- **当** shell:openExternal 接收非 localhost URL 时
- **则** 域名必须针对 TRUSTED_DOMAINS 检查或需要用户确认

### 需求: 前端 API 身份验证
前端必须自动向所有 Gateway API 请求附加 Bearer token。

#### 场景: 从 IPC 检索 token
- **当** 调用 ApiClient.initialize() 时
- **则** 系统必须调用 window.electronAPI.getGatewayAuthToken() 检索 token

#### 场景: 附加 token 到请求
- **当** 调用 ApiClient.request() 时
- **则** Authorization: Bearer <token> 头必须自动添加

#### 场景: 处理缺失 token
- **当** token 检索失败（开发模式）时
- **则** 请求必须继续进行而不带认证头（用于本地测试）

### 需求: 限流强制
安全敏感的 IPC 处理器必须强制限流以防止 DoS 攻击。

#### 场景: 限制重启操作
- **当** python:restart 在 60 秒内被调用超过 3 次时
- **则** 后续调用必须返回 RATE_LIMITED 错误

#### 场景: 限制诊断重试
- **当** diagnostic:retry 在 5 秒内被调用超过 3 次时
- **则** 后续调用必须返回带冷却时间的限流错误

#### 场景: 独立客户端跟踪
- **当** 多个渲染器窗口调用同一限流处理器时
- **则** 每个窗口必须有独立的限流跟踪
