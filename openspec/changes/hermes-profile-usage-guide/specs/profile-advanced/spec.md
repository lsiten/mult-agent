## ADDED Requirements

### Requirement: Profile 导出功能
系统应当支持将 Profile 导出为可移植的归档文件，便于备份和分享。

#### Scenario: 导出命名 Profile
- **WHEN** 用户执行 `hermes profile export <name> -o <path>.tar.gz`
- **THEN** 系统创建 tar.gz 归档包含 Profile 所有文件
- **THEN** 自动排除凭据文件（auth.json、.env）
- **THEN** 归档可在不同机器导入使用

#### Scenario: 导出 Default Profile
- **WHEN** 用户执行 `hermes profile export default -o default.tar.gz`
- **THEN** 系统仅打包 Profile 数据（配置、记忆、技能、会话）
- **THEN** 排除基础设施（hermes-agent 仓库、.worktrees、bin、node_modules）
- **THEN** 排除数据库和运行时文件（state.db、gateway.pid、processes.json）
- **THEN** 排除缓存目录（image_cache、audio_cache、logs）
- **THEN** 生成精简的可移植归档

#### Scenario: 导出时过滤敏感信息
- **WHEN** 导出任何 Profile
- **THEN** 系统自动排除 auth.json 和 .env 文件
- **THEN** 系统排除 __pycache__、*.sock、*.tmp 文件
- **THEN** 确保归档不包含敏感凭据

### Requirement: Profile 导入功能
系统应当支持从归档文件导入 Profile，实现跨机器迁移。

#### Scenario: 导入 Profile 归档
- **WHEN** 用户执行 `hermes profile import <archive>.tar.gz --name <new-name>`
- **THEN** 系统解压归档到 $HERMES_HOME/profiles/<new-name>/
- **THEN** 若未指定 --name，则从归档顶层目录推断名称
- **THEN** 导入后用户需手动配置 .env 添加 API keys

#### Scenario: 导入冲突检查
- **WHEN** 导入时目标 Profile 已存在
- **THEN** 系统拒绝导入并提示用户
- **THEN** 用户需先删除现有 Profile 或选择不同名称

#### Scenario: 安全的归档解压
- **WHEN** 系统解压 Profile 归档
- **THEN** 验证归档成员路径不包含 ../（路径遍历攻击）
- **THEN** 验证归档成员路径不为绝对路径
- **THEN** 拒绝符号链接和非常规文件
- **THEN** 确保解压不会逃逸到 profiles 目录外

#### Scenario: 拒绝导入为 Default
- **WHEN** 用户尝试导入归档为 default Profile
- **THEN** 系统拒绝操作并提示错误
- **THEN** 引导用户使用命名 Profile 避免覆盖 $HERMES_HOME

### Requirement: Profile 重命名功能
系统应当支持安全重命名 Profile，同步更新所有关联资源。

#### Scenario: 重命名 Profile 目录
- **WHEN** 用户执行 `hermes profile rename <old> <new>`
- **THEN** 系统停止该 Profile 的 Gateway 进程
- **THEN** 系统重命名目录：$HERMES_HOME/profiles/<old>/ → <new>/
- **THEN** 系统更新快捷别名：~/.local/bin/<old> → <new>
- **THEN** 若该 Profile 为 active，则更新 active_profile 文件

#### Scenario: 重命名服务配置
- **WHEN** 重命名包含运行中 Gateway 的 Profile
- **THEN** 系统删除旧的 systemd/launchd 服务配置
- **THEN** 重命名后用户需重新注册服务（使用新名称）

#### Scenario: 重命名冲突检查
- **WHEN** 用户尝试重命名到已存在的名称
- **THEN** 系统拒绝操作并提示冲突
- **THEN** 用户需先删除目标 Profile 或选择不同名称

#### Scenario: 保护特殊 Profile
- **WHEN** 用户尝试重命名 default Profile
- **THEN** 系统拒绝操作并提示 default 不可重命名
- **THEN** 用户尝试重命名为 default 同样被拒绝

### Requirement: Profile 克隆配置
系统应当支持从现有 Profile 克隆配置创建新 Profile。

#### Scenario: 克隆基础配置
- **WHEN** 用户执行 `hermes profile create <name> --clone`
- **THEN** 系统复制源 Profile 的 config.yaml、.env、SOUL.md
- **THEN** 系统复制 memories/MEMORY.md 和 memories/USER.md
- **THEN** 系统初始化其他必需目录结构
- **THEN** 不复制会话历史和数据库

#### Scenario: 克隆指定源 Profile
- **WHEN** 用户执行 `hermes profile create <name> --clone --from <source>`
- **THEN** 系统从 <source> Profile 复制配置
- **THEN** 而非从当前 active Profile 复制

#### Scenario: 完整克隆 Profile
- **WHEN** 用户执行 `hermes profile create <name> --clone-all`
- **THEN** 系统完整复制源 Profile 的所有文件和目录
- **THEN** 自动清理运行时文件（gateway.pid、gateway_state.json、processes.json）
- **THEN** 适用于创建完全相同的 Profile 副本

#### Scenario: 克隆后独立性
- **WHEN** 克隆创建新 Profile 后
- **THEN** 新 Profile 与源 Profile 完全独立
- **THEN** 修改新 Profile 不影响源 Profile
- **THEN** 两个 Profile 可同时运行

### Requirement: Profile 显示详情
系统应当提供 Profile 详细信息查看功能。

#### Scenario: 显示 Profile 配置
- **WHEN** 用户执行 `hermes profile show <name>`
- **THEN** 系统显示 Profile 名称和路径
- **THEN** 系统显示配置的模型和提供商
- **THEN** 系统显示是否配置 .env 文件
- **THEN** 系统显示安装的技能数量
- **THEN** 系统显示 Gateway 运行状态
- **THEN** 系统显示快捷别名路径（若存在）

#### Scenario: 显示当前 Active Profile
- **WHEN** 用户在会话中执行 `/profile` 命令
- **THEN** 系统显示当前使用的 Profile 名称
- **THEN** 系统显示 HERMES_HOME 路径
- **THEN** 帮助用户确认所在环境

### Requirement: Shell 自动补全
系统应当为 Profile 操作提供 shell 自动补全，提升用户体验。

#### Scenario: Bash 自动补全
- **WHEN** 用户执行 `eval "$(hermes completion bash)"`
- **THEN** 系统注册 bash 补全函数
- **THEN** 用户输入 `hermes -p <TAB>` 显示所有 Profile 名称
- **THEN** 用户输入 `hermes profile delete <TAB>` 显示可删除的 Profile

#### Scenario: Zsh 自动补全
- **WHEN** 用户执行 `eval "$(hermes completion zsh)"`
- **THEN** 系统注册 zsh 补全函数
- **THEN** 支持 Profile 名称和子命令的智能补全
