## 新增需求

### 需求: 基于 Schema 的验证
IPC 处理器必须使用 Zod schema 定义，在运行时进行输入和输出验证。

#### 场景: 用 schema 定义处理器
- **当** IPC 处理器在 IpcSchema 中定义了输入和输出 schema 时
- **则** 系统必须存储 schema 供运行时验证使用

#### 场景: 运行时验证输入
- **当** IPC 调用接收到无效输入（类型错误、缺少字段）时
- **则** 系统必须返回带有 INVALID_INPUT 代码和验证详情的错误响应

#### 场景: 运行时验证输出
- **当** 处理器返回不匹配输出 schema 的数据时
- **则** 系统必须抛出错误指示 schema 违规（内部错误）

#### 场景: 从 schema 推断类型
- **当** 使用 IpcRegistry.register() 注册处理器时
- **则** TypeScript 必须从 schema 推断正确的输入/输出类型

### 需求: 类型安全注册
IPC 处理器必须通过 IpcRegistry.register() 注册，具有编译时类型检查。

#### 场景: 类型安全的处理器函数
- **当** 注册的处理器函数类型不匹配时
- **则** TypeScript 编译器必须显示错误

#### 场景: 处理器输入的自动完成
- **当** 在 TypeScript 中编写处理器函数时
- **则** IDE 必须为输入参数属性提供自动完成

#### 场景: 防止未注册的处理器
- **当** 直接使用 ipcMain.handle() 而不是 IpcRegistry.register() 时
- **则** 代码审查流程或 linter 必须将此标记为违规

### 需求: 自动限流
IPC 处理器必须支持可选的限流配置以防止滥用。

#### 场景: 配置限流
- **当** 处理器定义为 rateLimit: {maxAttempts: 3, windowMs: 60000} 时
- **则** 系统必须为该处理器创建限流器

#### 场景: 按客户端强制限流
- **当** 客户端在 windowMs 内超过 maxAttempts 时
- **则** 后续调用必须返回 RATE_LIMITED 错误直到时间窗口重置

#### 场景: 按发送者跟踪尝试次数
- **当** 多个客户端调用同一限流处理器时
- **则** 每个客户端必须有独立的限流跟踪

#### 场景: 超时后重置窗口
- **当** 时间窗口（windowMs）过期时
- **则** 该客户端的尝试计数器必须重置为零

### 需求: 统一错误处理
IPC 处理器必须返回标准化的错误响应，包含错误代码、消息和可选详情。

#### 场景: 返回验证错误
- **当** 输入验证失败时
- **则** 响应必须是 {error: "INVALID_INPUT", details: [...验证错误]}

#### 场景: 返回限流错误
- **当** 超过限流时
- **则** 响应必须是 {error: "RATE_LIMITED", message: "Too many requests..."}

#### 场景: 返回内部错误
- **当** 处理器抛出意外错误时
- **则** 响应必须是 {error: "INTERNAL_ERROR", message: <错误消息>}

#### 场景: 返回自定义错误
- **当** 处理器抛出带自定义代码的 IpcError 时
- **则** 响应必须是 {error: <自定义代码>, message: <自定义消息>}

### 需求: 自定义验证钩子
IPC 处理器必须支持在 schema 验证后执行的可选自定义验证函数。

#### 场景: 定义自定义验证器
- **当** 处理器定义为 validate: async (input) => {...} 时
- **则** 系统必须在 Zod 验证通过后调用此函数

#### 场景: 自定义验证拒绝
- **当** 自定义验证抛出错误时
- **则** 系统必须将错误返回给客户端

#### 场景: URL 白名单验证示例
- **当** shell:openExternal 处理器接收 URL 时
- **则** 自定义验证必须在允许 shell.openExternal() 前检查 URL 是否在白名单中

### 需求: 单一数据源
所有 IPC 处理器必须在集中的 IpcSchema 对象中定义，以保持 Main 和 Renderer 间的一致性。

#### 场景: Schema 作为契约
- **当** 向 IpcSchema 添加新的 IPC 处理器时
- **则** Main 进程（注册）和 Renderer 进程（类型）必须使用相同的 schema

#### 场景: 从 schema 生成类型
- **当** IpcSchema 更新时
- **则** IpcHandlers TypeScript 类型必须自动反映变更

#### 场景: 防止 schema 漂移
- **当** 使用不在 IpcSchema 中的通道名称注册处理器时
- **则** TypeScript 编译器必须显示错误

### 需求: 向后兼容
IPC Registry 必须在迁移阶段与现有 ipcMain.handle() 调用共存。

#### 场景: 混合注册
- **当** 一些处理器使用 IpcRegistry，其他使用 ipcMain.handle() 时
- **则** 两者必须无冲突地工作

#### 场景: 迁移路径
- **当** 将现有处理器迁移到 IpcRegistry 时
- **则** 在添加 IpcRegistry.register() 后必须移除旧的 ipcMain.handle() 调用

#### 场景: 回滚的功能开关
- **当** 设置 USE_IPC_REGISTRY=false 环境变量时
- **则** 系统必须回退到直接 ipcMain.handle()（如果实现）
