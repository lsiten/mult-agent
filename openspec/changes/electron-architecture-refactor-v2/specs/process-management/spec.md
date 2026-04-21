## 新增需求

### 需求: 进程启动
ProcessManager 必须使用可配置的命令、参数、环境变量和工作目录启动子进程。

#### 场景: 基本配置启动
- **当** ProcessManager.start() 以 command="python3", args=["script.py"] 调用时
- **则** 系统必须启动运行 python3 script.py 的子进程

#### 场景: 自定义环境变量
- **当** ProcessManager 配置为 env={PATH: "/custom", FOO: "bar"} 时
- **则** 启动的进程必须设置这些环境变量

#### 场景: 自定义工作目录
- **当** ProcessManager 配置为 cwd="/path/to/dir" 时
- **则** 启动的进程必须以 /path/to/dir 作为工作目录运行

### 需求: 输出流处理
ProcessManager 必须捕获 stdout 和 stderr 流，并用脱敏后的输出调用注册的回调。

#### 场景: 捕获 stdout
- **当** 子进程写入 stdout 时
- **则** ProcessManager 必须用文本调用注册的 stdout 处理器

#### 场景: 捕获 stderr
- **当** 子进程写入 stderr 时
- **则** ProcessManager 必须用文本调用注册的 stderr 处理器

#### 场景: 修剪空白
- **当** 输出包含前导/尾随空白时
- **则** 处理器必须接收修剪后的文本

### 需求: 进程生命周期跟踪
ProcessManager 必须跟踪进程状态并公开 isRunning() 和 getPid() 方法。

#### 场景: 报告运行状态
- **当** 进程存活时
- **则** isRunning() 必须返回 true

#### 场景: 报告停止状态
- **当** 进程已退出或被杀死时
- **则** isRunning() 必须返回 false

#### 场景: 公开进程 ID
- **当** 在运行的进程上调用 getPid() 时
- **则** 方法必须返回进程 ID 号

#### 场景: 停止进程返回 undefined
- **当** 在停止的进程上调用 getPid() 时
- **则** 方法必须返回 undefined

### 需求: 优雅关闭
ProcessManager.stop() 必须先尝试 SIGTERM，超时后再用 SIGKILL。

#### 场景: 用 SIGTERM 优雅终止
- **当** 在运行的进程上调用 stop() 时
- **则** 系统必须发送 SIGTERM 信号

#### 场景: 等待优雅退出
- **当** 进程在 SIGTERM 后的 gracefulTimeoutMs 内退出时
- **则** stop() 必须解析且不发送 SIGKILL

#### 场景: 用 SIGKILL 强制杀死
- **当** 进程在 gracefulTimeoutMs 内未退出时
- **则** 系统必须发送 SIGKILL 信号

#### 场景: 可配置超时
- **当** 调用 stop(gracefulTimeoutMs=3000) 时
- **则** 系统必须在发送 SIGKILL 前等待 3 秒

### 需求: 退出事件处理
ProcessManager 必须在进程终止时调用注册的退出回调。

#### 场景: 报告退出代码
- **当** 进程以代码 0 退出时
- **则** 退出处理器必须以 exitCode=0 被调用

#### 场景: 报告非零退出
- **当** 进程以代码 1 退出时
- **则** 退出处理器必须以 exitCode=1 被调用

#### 场景: SIGKILL 时报告 null
- **当** 进程被 SIGKILL 杀死时
- **则** 退出处理器必须以 exitCode=null 被调用

### 需求: 防止重复启动
ProcessManager 必须防止在已有进程运行时启动新进程。

#### 场景: 拒绝重复启动
- **当** 进程已在运行时调用 start() 时
- **则** 方法必须抛出错误 "Process already running"

#### 场景: 停止后允许重启
- **当** stop() 完成后调用 start() 时
- **则** 方法必须成功启动新进程
