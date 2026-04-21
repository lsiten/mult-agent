## ADDED Requirements

### Requirement: Profile 不存在错误处理
系统应当在 Profile 不存在时提供清晰的错误信息和解决建议。

#### Scenario: 使用不存在的 Profile
- **WHEN** 用户执行 `hermes -p nonexistent chat`
- **THEN** 系统显示错误：Profile 'nonexistent' does not exist
- **THEN** 系统提示创建命令：`hermes profile create nonexistent`
- **THEN** 系统建议查看已有 Profile：`hermes profile list`

#### Scenario: 切换到不存在的 Profile
- **WHEN** 用户执行 `hermes profile use nonexistent`
- **THEN** 系统拒绝操作并显示错误
- **THEN** 系统保持当前 active profile 不变

### Requirement: Gateway 端口冲突处理
系统应当检测并解决 Gateway 端口冲突问题。

#### Scenario: 同一 Profile 多次启动 Gateway
- **WHEN** 用户尝试启动已运行的 Gateway
- **THEN** 系统检测到 gateway.pid 存在且进程运行中
- **THEN** 系统提示 Gateway 已运行并显示 PID
- **THEN** 系统拒绝重复启动

#### Scenario: 不同 Profile 使用相同端口
- **WHEN** 两个 Profile 配置了相同的 Gateway 端口
- **THEN** 第二个 Profile 启动 Gateway 失败
- **THEN** 系统提示端口被占用
- **THEN** 系统建议修改 config.yaml 中的 port 配置

#### Scenario: 清理僵尸进程
- **WHEN** Gateway 异常退出留下 gateway.pid 文件
- **THEN** 用户删除 gateway.pid 文件
- **THEN** 重新启动 Gateway 成功

### Requirement: Token 冲突检测和解决
系统应当防止多个 Profile 使用相同平台凭据导致的消息混乱。

#### Scenario: 检测到 Token 被占用
- **WHEN** Profile A 的 Gateway 正在使用 Telegram token
- **THEN** Profile B 尝试使用相同 Telegram token 启动 Gateway
- **THEN** 系统检测到 token 被 Profile A 占用
- **THEN** 系统拒绝启动并提示用户

#### Scenario: 查看 Token 占用情况
- **WHEN** 用户怀疑 token 冲突
- **THEN** 检查 ~/.hermes/profiles/*/auth.lock 文件
- **THEN** 查看哪个 Profile 正在使用该 token
- **THEN** 决定是否停止占用 Profile 的 Gateway

#### Scenario: 手动释放 Token 锁
- **WHEN** Profile 异常退出未释放 token 锁
- **THEN** 用户确认该 Profile 的 Gateway 已停止
- **THEN** 删除 <HERMES_HOME>/auth.lock 文件
- **THEN** 其他 Profile 可正常使用该 token

### Requirement: Profile 名称冲突处理
系统应当在名称冲突时提供清晰的指引。

#### Scenario: 创建已存在的 Profile
- **WHEN** 用户尝试创建已存在的 Profile 名称
- **THEN** 系统拒绝操作并显示错误
- **THEN** 系统提示该 Profile 已存在于某路径
- **THEN** 系统建议使用不同名称或先删除现有 Profile

#### Scenario: 别名与系统命令冲突
- **WHEN** 用户创建名为 'ls' 的 Profile
- **THEN** 系统警告 'ls' 与系统命令冲突
- **THEN** 系统仍可创建 Profile 但不推荐
- **THEN** 快捷别名可能覆盖系统命令导致混淆

#### Scenario: 别名与 Hermes 子命令冲突
- **WHEN** 用户创建名为 'chat' 的 Profile
- **THEN** 系统拒绝操作并提示 'chat' 是 hermes 子命令
- **THEN** 系统建议使用不同名称避免冲突

### Requirement: 快捷别名 PATH 问题
系统应当帮助用户解决快捷别名不可用的问题。

#### Scenario: ~/.local/bin 不在 PATH
- **WHEN** 用户创建 Profile 后无法使用快捷别名
- **THEN** 系统检测 ~/.local/bin 不在 PATH
- **THEN** 系统提示用户添加到 PATH
- **THEN** 系统提供具体命令：`export PATH="$HOME/.local/bin:$PATH"`
- **THEN** 系统建议添加到 ~/.bashrc 或 ~/.zshrc

#### Scenario: 验证别名是否可用
- **WHEN** 用户不确定快捷别名是否生效
- **THEN** 执行 `which <profile-name>` 查看路径
- **THEN** 若显示 ~/.local/bin/<profile-name> 则配置正确
- **THEN** 若未找到则检查 PATH 或重新加载 shell

### Requirement: Profile 数据损坏恢复
系统应当提供 Profile 数据损坏时的恢复指引。

#### Scenario: state.db 损坏
- **WHEN** Profile 的 SQLite 数据库损坏
- **THEN** 系统在启动时显示数据库错误
- **THEN** 用户备份 state.db：`cp state.db state.db.backup`
- **THEN** 删除损坏的数据库：`rm state.db`
- **THEN** 系统重新初始化空数据库，丢失历史但可正常工作

#### Scenario: 配置文件错误
- **WHEN** config.yaml 格式错误导致启动失败
- **THEN** 系统显示 YAML 解析错误和行号
- **THEN** 用户修复 YAML 语法错误
- **THEN** 或从其他 Profile 复制正确的配置模板

#### Scenario: 技能加载失败
- **WHEN** 某个技能文件损坏导致加载失败
- **THEN** 系统在日志中记录具体技能路径
- **THEN** 用户删除或修复该技能文件
- **THEN** 重启 agent 或 Gateway 重新加载

### Requirement: 磁盘空间不足处理
系统应当在磁盘空间不足时提供清理建议。

#### Scenario: Profile 占用过多空间
- **WHEN** 用户发现 Profile 目录过大
- **THEN** 检查各子目录大小：`du -sh ~/.hermes/profiles/*/`
- **THEN** 清理 logs 目录：`rm ~/.hermes/profiles/<name>/logs/*.log`
- **THEN** 清理旧会话：删除 sessions 目录中的旧 JSON 文件
- **THEN** 清理缓存：删除 image_cache、audio_cache 目录

#### Scenario: 多个 Profile 共享空间
- **WHEN** 多个 Profile 占用大量磁盘空间
- **THEN** 删除不再使用的 Profile：`hermes profile delete <unused>`
- **THEN** 导出重要 Profile 到外部存储后删除本地副本
- **THEN** 定期清理日志和缓存文件

### Requirement: 迁移和升级问题
系统应当处理 Profile 在 Hermes 版本升级后的兼容性问题。

#### Scenario: 版本升级后 Profile 不兼容
- **WHEN** Hermes 升级后 Profile 无法正常工作
- **THEN** 查看 CHANGELOG 了解 breaking changes
- **THEN** 运行 `hermes doctor` 诊断 Profile 配置
- **THEN** 按提示更新配置文件或数据库 schema

#### Scenario: 迁移到新机器
- **WHEN** 用户需要将 Profile 迁移到新机器
- **THEN** 导出 Profile：`hermes profile export <name>`
- **THEN** 在新机器导入：`hermes profile import <archive>`
- **THEN** 手动配置 .env 文件添加 API keys
- **THEN** 验证配置：`hermes -p <name> chat`

### Requirement: 调试和日志查看
系统应当提供便捷的调试和日志查看方法。

#### Scenario: 查看 Gateway 日志
- **WHEN** 用户需要诊断 Gateway 问题
- **THEN** 查看日志文件：`tail -f ~/.hermes/profiles/<name>/logs/gateway.log`
- **THEN** 增加日志详细程度：在 config.yaml 设置 `log_level: DEBUG`
- **THEN** 重启 Gateway 查看详细日志

#### Scenario: 诊断 Profile 配置
- **WHEN** 用户不确定 Profile 配置是否正确
- **THEN** 执行 `hermes -p <name> config show` 查看完整配置
- **THEN** 执行 `hermes profile show <name>` 查看 Profile 信息
- **THEN** 执行 `hermes doctor` 全面检查系统状态
