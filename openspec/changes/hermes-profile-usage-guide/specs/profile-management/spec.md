## ADDED Requirements

### Requirement: 创建独立 Profile
系统应当允许用户创建新的独立 Profile，每个 Profile 拥有完全隔离的配置环境。

#### Scenario: 创建基础 Profile
- **WHEN** 用户执行 `hermes profile create <name>` 命令
- **THEN** 系统在 `~/.hermes/profiles/<name>/` 创建新目录
- **THEN** 系统初始化所有必需子目录（memories、sessions、skills、skins、logs、plans、workspace、cron、home）
- **THEN** 系统生成默认 SOUL.md 文件

#### Scenario: 克隆当前 Profile 配置
- **WHEN** 用户执行 `hermes profile create <name> --clone` 命令
- **THEN** 系统复制当前 Profile 的 config.yaml、.env、SOUL.md 文件
- **THEN** 系统复制 memories/MEMORY.md 和 memories/USER.md 文件
- **THEN** 系统不复制运行时文件（gateway.pid、gateway_state.json、processes.json）

#### Scenario: 完整克隆 Profile
- **WHEN** 用户执行 `hermes profile create <name> --clone-all` 命令
- **THEN** 系统完整复制源 Profile 的所有文件和目录
- **THEN** 系统自动清理运行时文件避免冲突

### Requirement: 列出所有 Profile
系统应当提供 Profile 列表查看功能，显示每个 Profile 的关键信息。

#### Scenario: 查看 Profile 列表
- **WHEN** 用户执行 `hermes profile list` 命令
- **THEN** 系统显示所有 Profile（包括 default）
- **THEN** 每个 Profile 显示名称、路径、Gateway 运行状态、模型配置、技能数量
- **THEN** 当前激活的 Profile 标记为 active

### Requirement: 切换 Profile
系统应当允许用户在不同 Profile 之间切换，且切换立即生效。

#### Scenario: 临时使用指定 Profile
- **WHEN** 用户执行 `hermes -p <name> chat` 命令
- **THEN** 系统使用指定 Profile 的 HERMES_HOME 启动会话
- **THEN** 不影响默认 active profile 设置

#### Scenario: 设置默认 Profile
- **WHEN** 用户执行 `hermes profile use <name>` 命令
- **THEN** 系统将 <name> 写入 `~/.hermes/active_profile` 文件
- **THEN** 后续所有 `hermes` 命令默认使用该 Profile

#### Scenario: 通过快捷别名使用 Profile
- **WHEN** 用户执行创建的快捷别名（如 `coder`）
- **THEN** 系统自动使用对应 Profile 启动（等价于 `hermes -p coder`）

### Requirement: 删除 Profile
系统应当安全删除 Profile，包括所有关联资源和服务。

#### Scenario: 删除 Profile 前确认
- **WHEN** 用户执行 `hermes profile delete <name>` 命令
- **THEN** 系统显示 Profile 详情（路径、模型、技能数量、Gateway 状态）
- **THEN** 系统要求用户输入 Profile 名称确认
- **THEN** 用户输入错误则取消操作

#### Scenario: 完整删除 Profile
- **WHEN** 用户确认删除操作
- **THEN** 系统停止该 Profile 的 Gateway 进程
- **THEN** 系统删除 systemd/launchd 服务配置
- **THEN** 系统删除 Profile 目录及所有内容
- **THEN** 系统删除快捷别名脚本（~/.local/bin/<name>）
- **THEN** 若该 Profile 为当前 active profile，则重置为 default

#### Scenario: 保护默认 Profile
- **WHEN** 用户尝试删除 default Profile
- **THEN** 系统拒绝操作并提示使用 `hermes uninstall` 完全卸载

### Requirement: Profile 名称验证
系统应当严格验证 Profile 名称，避免冲突和安全问题。

#### Scenario: 合法名称检查
- **WHEN** 用户创建 Profile 时提供名称
- **THEN** 系统仅接受 [a-z0-9][a-z0-9_-]{0,63} 格式的名称
- **THEN** 系统拒绝保留名称（hermes、default、test、tmp、root、sudo）
- **THEN** 系统拒绝与 hermes 子命令冲突的名称（chat、model、gateway 等）
- **THEN** 系统检查 PATH 中是否存在同名命令，存在则警告

#### Scenario: 名称冲突处理
- **WHEN** 用户创建的 Profile 名称与现有命令冲突
- **THEN** 系统显示清晰的冲突提示
- **THEN** 用户可选择继续（覆盖快捷别名）或取消

### Requirement: 快捷别名管理
系统应当为每个 Profile 自动创建快捷别名，简化访问。

#### Scenario: 自动创建快捷别名
- **WHEN** 用户创建 Profile（未指定 --no-alias）
- **THEN** 系统在 ~/.local/bin/<name> 创建 shell wrapper 脚本
- **THEN** 脚本内容为 `#!/bin/sh\nexec hermes -p <name> "$@"\n`
- **THEN** 脚本具有可执行权限

#### Scenario: PATH 提示
- **WHEN** 创建快捷别名后 ~/.local/bin 不在 PATH 中
- **THEN** 系统提示用户将 ~/.local/bin 添加到 PATH
- **THEN** 提供具体的 shell 配置命令（bash/zsh）
