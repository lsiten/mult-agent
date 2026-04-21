## Why

当前 Hermes Agent 代码库中存在多处硬编码 `~/.hermes` 路径，这些路径在 Electron 桌面应用模式下无法正确工作。Electron 使用 `~/Library/Application Support/hermes-agent-electron/` 作为数据目录，但部分代码仍然硬编码使用 `~/.hermes/`，导致数据存储位置不一致，可能造成配置丢失、功能异常等问题。

本次适配确保所有代码统一使用 `get_hermes_home()` 函数获取路径，完整支持 Electron 模式和 CLI 模式的双轨运行。

## What Changes

**核心代码修改**（影响功能）：
- 修复 `gateway/platforms/api_server_chat.py` 中 2 处硬编码路径（第 278, 417 行）
- 修复 `tools/mcp_tool.py` 中 1 处硬编码路径（第 305 行）
- 改进 `hermes_cli/profiles.py` 中生成的 bash/zsh completion 脚本使用环境变量

**文档更新**（不影响功能）：
- 在 `docs/AGENTS.md` 添加 Electron 模式的特殊要求
- 在 `hermes_cli/config.py` 文档字符串中说明双模式路径
- 在 `docs/hermes-profile-usage-guide.md` 添加 Electron 限制说明
- 更新所有配置相关文档，明确 CLI vs Electron 路径差异

**验证与测试**：
- 添加 Electron 模式路径解析测试
- 添加 Profile 在 Electron 模式的行为测试
- 更新集成测试覆盖双模式场景

## Capabilities

### New Capabilities
- `electron-path-consistency`: 确保 Electron 模式下所有路径统一使用 `get_hermes_home()`
- `dual-mode-documentation`: 文档明确区分 CLI 和 Electron 两种模式的差异

### Modified Capabilities
- `path-resolution`: 修改现有路径解析逻辑，完全支持 Electron 模式
- `shell-completion`: 修改 bash/zsh completion 脚本使用环境变量而非硬编码

## Impact

**受影响的代码**：
- Gateway 平台层：`gateway/platforms/api_server_chat.py`
- 工具层：`tools/mcp_tool.py`
- CLI 层：`hermes_cli/profiles.py` (completion 脚本生成)

**受影响的文档**：
- 开发指南：`docs/AGENTS.md`
- 用户指南：`docs/hermes-profile-usage-guide.md`
- 代码文档：`hermes_cli/config.py`, `gateway/config.py`

**不影响**：
- 现有 CLI 模式用户（路径逻辑保持向后兼容）
- 已部署的 Electron 应用（使用正确的环境变量）
- Docker 部署（已正确使用 HERMES_HOME 环境变量）

**兼容性**：
- ✅ CLI 模式：继续使用 `~/.hermes/`
- ✅ Electron 模式：使用 `~/Library/Application Support/hermes-agent-electron/`
- ✅ Docker 模式：使用自定义 `HERMES_HOME`
- ✅ Profile 功能：仅在 CLI 模式可用（文档说明限制）
