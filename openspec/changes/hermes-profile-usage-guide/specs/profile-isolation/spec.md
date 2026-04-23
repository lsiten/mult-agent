## ADDED Requirements

### Requirement: 完全独立的 HERMES_HOME
每个 Profile 应当拥有独立的 HERMES_HOME 目录，确保配置和数据完全隔离。

#### Scenario: Default Profile 位置
- **WHEN** 用户使用 default Profile
- **THEN** HERMES_HOME 指向 $HERMES_HOME
- **THEN** 保持向后兼容，无需迁移

#### Scenario: 命名 Profile 位置
- **WHEN** 用户使用命名 Profile
- **THEN** HERMES_HOME 指向 $HERMES_HOME/profiles/<name>
- **THEN** 所有配置和数据读写限定在该目录

#### Scenario: Docker 部署中的 Profile
- **WHEN** HERMES_HOME 设置为自定义路径（如 /opt/data）
- **THEN** default Profile 即为该自定义路径
- **THEN** 命名 Profile 位于 <HERMES_HOME>/profiles/<name>
- **THEN** active_profile 文件位于 <HERMES_HOME>/active_profile

### Requirement: 隔离的配置文件
每个 Profile 应当拥有独立的配置文件，互不影响。

#### Scenario: 独立的 config.yaml
- **WHEN** Profile 加载配置
- **THEN** 从 <HERMES_HOME>/config.yaml 读取
- **THEN** 修改不影响其他 Profile

#### Scenario: 独立的 .env 文件
- **WHEN** Profile 加载环境变量
- **THEN** 从 <HERMES_HOME>/.env 读取 API keys
- **THEN** 支持不同 Profile 使用不同 API keys

#### Scenario: 独立的 SOUL.md
- **WHEN** Profile 初始化 agent persona
- **THEN** 从 <HERMES_HOME>/SOUL.md 读取
- **THEN** 支持不同 Profile 使用不同人格设定

### Requirement: 隔离的数据存储
每个 Profile 应当拥有独立的数据库和存储，避免数据混淆。

#### Scenario: 独立的 SQLite 数据库
- **WHEN** Profile 读写状态数据
- **THEN** 使用 <HERMES_HOME>/state.db
- **THEN** 不同 Profile 的会话、记忆、检查点完全分离

#### Scenario: 独立的 Sessions 目录
- **WHEN** Profile 保存会话历史
- **THEN** 会话文件存储在 <HERMES_HOME>/sessions/
- **THEN** 不同 Profile 的会话记录互不可见

#### Scenario: 独立的 Memories 目录
- **WHEN** Profile 管理记忆系统
- **THEN** 记忆文件存储在 <HERMES_HOME>/memories/
- **THEN** 记忆内容按 Profile 完全隔离

### Requirement: 隔离的技能和工具
每个 Profile 应当拥有独立的技能库，支持不同用途的技能配置。

#### Scenario: 独立的 Skills 目录
- **WHEN** Profile 加载技能
- **THEN** 从 <HERMES_HOME>/skills/ 扫描
- **THEN** 支持不同 Profile 安装不同技能集

#### Scenario: 独立的 Cron 任务
- **WHEN** Profile 管理定时任务
- **THEN** cron 配置存储在 <HERMES_HOME>/cron/
- **THEN** 不同 Profile 的定时任务独立调度

### Requirement: 隔离的 Gateway 服务
每个 Profile 应当拥有独立的 Gateway 进程，避免端口和配置冲突。

#### Scenario: 独立的 Gateway PID 文件
- **WHEN** Profile 启动 Gateway
- **THEN** PID 文件存储在 <HERMES_HOME>/gateway.pid
- **THEN** 不同 Profile 可同时运行 Gateway（不同端口）

#### Scenario: 独立的 systemd/launchd 服务
- **WHEN** Profile 注册系统服务
- **THEN** 服务名包含 Profile 标识（如 hermes-gateway-coder.service）
- **THEN** 支持多个 Profile 同时自动启动

#### Scenario: 独立的日志文件
- **WHEN** Profile 运行 Gateway
- **THEN** 日志写入 <HERMES_HOME>/logs/
- **THEN** 不同 Profile 的日志互不覆盖

### Requirement: 隔离的子进程环境
每个 Profile 应当为子进程提供独立的 HOME 目录，避免工具配置泄露。

#### Scenario: 独立的子进程 HOME
- **WHEN** Profile 执行 bash/terminal 工具
- **THEN** 子进程 HOME 环境变量指向 <HERMES_HOME>/home/
- **THEN** git、ssh、gh、npm 等工具的配置文件隔离
- **THEN** 避免凭据和配置在 Profile 间泄露

#### Scenario: Docker 环境中的子进程隔离
- **WHEN** Profile 在 Docker 中运行
- **THEN** 子进程 HOME 位于持久化卷内
- **THEN** 工具配置随容器生命周期持久化

### Requirement: Token Lock 机制
系统应当防止多个 Profile 使用相同的平台凭据，避免消息冲突。

#### Scenario: 检测凭据冲突
- **WHEN** Gateway 启动时读取平台 token
- **THEN** 系统检查该 token 是否被其他 Profile 占用
- **THEN** 若冲突则拒绝启动并提示用户

#### Scenario: Token 锁定和释放
- **WHEN** Gateway 成功启动
- **THEN** 系统在 <HERMES_HOME>/auth.lock 记录占用的 token
- **THEN** Gateway 停止时自动释放锁
- **THEN** 其他 Profile 可使用该 token
