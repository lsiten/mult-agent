# Electron 路径适配完整方案

> **版本**: v1.0  
> **创建日期**: 2026-04-21  
> **状态**: 实施方案

---

## 目录

1. [执行摘要](#执行摘要)
2. [问题分析](#问题分析)
3. [扫描结果](#扫描结果)
4. [修改清单](#修改清单)
5. [实施计划](#实施计划)
6. [验证方案](#验证方案)
7. [风险评估](#风险评估)

---

## 执行摘要

### 当前状态

Hermes Agent 代码库扫描发现 **200+ 处** 包含 `.hermes` 字符串，其中：

- ✅ **141 个文件** 已正确使用 `get_hermes_home()` 函数
- ⚠️ **2 个核心文件** 存在硬编码路径需要立即修复
- ⚠️ **1 个 Shell 脚本生成器** 需要改进使用环境变量
- 📄 **8+ 个文档文件** 需要添加 Electron 模式说明

### 路径对比

| 模式 | HERMES_HOME 路径 | 配置方式 |
|------|-----------------|---------|
| **CLI** | `$HERMES_HOME/` | 环境变量或默认值 |
| **Electron** | `~/Library/Application Support/hermes-agent-electron/` | `app.getPath('userData')` |
| **Docker** | `/opt/data/` (自定义) | 环境变量 |

---

## 问题分析

### 根本原因

**hermes_constants.py 已正确实现**：

```python
def get_hermes_home() -> Path:
    """Return the Hermes home directory (default: $HERMES_HOME).
    
    Reads HERMES_HOME env var, falls back to $HERMES_HOME.
    In Electron mode, uses HERMES_CONFIG_PATH if set.
    """
    # Electron 环境优先（向后兼容）
    if os.getenv("HERMES_ELECTRON_MODE"):
        config_path = os.getenv("HERMES_CONFIG_PATH")
        if config_path:
            return Path(config_path)
    
    # CLI 标准逻辑
    val = os.environ.get("HERMES_HOME", "").strip()
    return Path(val) if val else Path.home() / ".hermes"
```

**Electron 正确设置环境变量**：

```typescript
// electron-app/src/env-manager.ts
this.hermesHome = app.getPath('userData');  // ~/Library/Application Support/hermes-agent-electron/
process.env.HERMES_HOME = this.hermesHome;
process.env.HERMES_ELECTRON_MODE = 'true';
```

**问题出现的原因**：

部分代码绕过了 `get_hermes_home()`，直接使用备用逻辑硬编码 `$HERMES_HOME`，导致在 Electron 模式下路径不一致。

---

## 扫描结果

### 按优先级分类

#### 🔴 优先级 1：核心代码硬编码（必须修复）

| 文件 | 行号 | 代码片段 | 影响 |
|------|------|---------|------|
| `gateway/platforms/api_server_chat.py` | 278 | `hermes_home = Path(os.getenv("HERMES_HOME", Path.home() / ".hermes"))` | 聊天 API 附件路径错误 |
| `gateway/platforms/api_server_chat.py` | 417 | `hermes_home = Path(os.getenv("HERMES_HOME", Path.home() / ".hermes"))` | 图片附件路径错误 |
| `tools/mcp_tool.py` | 305 | `os.getenv("HERMES_HOME", os.path.join(os.path.expanduser("~"), ".hermes"))` | MCP 工具配置路径错误 |

#### 🟡 优先级 2：Shell 脚本生成器（需改进）

| 文件 | 行号 | 代码片段 | 影响 |
|------|------|---------|------|
| `hermes_cli/profiles.py` | 991 | `profiles_dir="$HOME/.hermes/profiles"` | bash completion 路径硬编码 |
| `hermes_cli/profiles.py` | 1044 | `if [[ -d "$HOME/.hermes/profiles" ]]` | zsh completion 路径硬编码 |

#### 🟢 优先级 3：已正确处理（无需修改）

| 文件 | 行号 | 代码 | 状态 |
|------|------|------|------|
| `agent/nous_rate_guard.py` | 34 | `base = get_hermes_home()` + ImportError 备用 | ✅ 正确 |
| `tools/mcp_oauth.py` | 103 | `get_hermes_home()` + ImportError 备用 | ✅ 正确 |
| `hermes_cli/env_loader.py` | 107 | 三层优先级逻辑 | ✅ 正确 |

#### 📄 优先级 4：文档需更新（无功能影响）

| 文件 | 类型 | 需求 |
|------|------|------|
| `docs/AGENTS.md` | 开发指南 | 添加 Electron 特定要求 |
| `docs/hermes-profile-usage-guide.md` | 用户指南 | 说明 Profile 仅限 CLI |
| `hermes_cli/config.py` | 代码文档 | 添加 Electron 路径说明 |
| `gateway/config.py` | 代码文档 | 说明 `HERMES_CONFIG_PATH` 用途 |
| `.claude/rules/architecture-hermes-core.md` | 架构文档 | 添加 Electron 数据库位置 |

---

## 修改清单

### 核心代码修改（3 处）

#### 修改 1: `gateway/platforms/api_server_chat.py`

**位置**: 第 278 行

```python
# 修改前
hermes_home = Path(os.getenv("HERMES_HOME", Path.home() / ".hermes"))
config_path = hermes_home / "config.yaml"

# 修改后
from hermes_constants import get_hermes_home

hermes_home = get_hermes_home()
config_path = hermes_home / "config.yaml"
```

**位置**: 第 417 行

```python
# 修改前
hermes_home = Path(os.getenv("HERMES_HOME", Path.home() / ".hermes"))
image_path = hermes_home / "data" / "attachments" / rel_path

# 修改后
from hermes_constants import get_hermes_home

hermes_home = get_hermes_home()
image_path = hermes_home / "data" / "attachments" / rel_path
```

**影响**：确保聊天 API 和图片附件在 Electron 模式下使用正确路径

---

#### 修改 2: `tools/mcp_tool.py`

**位置**: 第 303-307 行

```python
# 修改前
hermes_home = os.path.expanduser(
    os.getenv(
        "HERMES_HOME", os.path.join(os.path.expanduser("~"), ".hermes")
    )
)

# 修改后
from hermes_constants import get_hermes_home

hermes_home = str(get_hermes_home())
```

**影响**：确保 MCP 工具在 Electron 模式下使用正确配置路径

---

#### 修改 3: `hermes_cli/profiles.py`

**位置**: 第 991-1032 行（bash completion 生成）

```python
# 修改前
def generate_bash_completion() -> str:
    return '''# Hermes Agent profile completion
_hermes_profiles() {
    local profiles_dir="$HOME/.hermes/profiles"
    local profiles="default"
    if [ -d "$profiles_dir" ]; then
        profiles="$profiles $(ls "$profiles_dir" 2>/dev/null)"
    fi
    echo "$profiles"
}
'''

# 修改后
def generate_bash_completion() -> str:
    return '''# Hermes Agent profile completion
_hermes_profiles() {
    local hermes_home="${HERMES_HOME:-$HOME/.hermes}"
    local profiles_dir="$hermes_home/profiles"
    local profiles="default"
    if [ -d "$profiles_dir" ]; then
        profiles="$profiles $(ls "$profiles_dir" 2>/dev/null)"
    fi
    echo "$profiles"
}
'''
```

**位置**: 第 1036-1063 行（zsh completion 生成）

```python
# 修改前
def generate_zsh_completion() -> str:
    return '''#compdef hermes
_hermes() {
    local -a profiles
    profiles=(default)
    if [[ -d "$HOME/.hermes/profiles" ]]; then
        profiles+=("${(@f)$(ls $HOME/.hermes/profiles 2>/dev/null)}")
    fi
    ...
}
'''

# 修改后
def generate_zsh_completion() -> str:
    return '''#compdef hermes
_hermes() {
    local hermes_home="${HERMES_HOME:-$HOME/.hermes}"
    local -a profiles
    profiles=(default)
    if [[ -d "$hermes_home/profiles" ]]; then
        profiles+=("${(@f)$(ls $hermes_home/profiles 2>/dev/null)}")
    fi
    ...
}
'''
```

**影响**：Shell 自动补全正确识别 HERMES_HOME 环境变量

---

### 文档更新（8+ 处）

#### 文档 1: `docs/AGENTS.md`

**添加章节**: Electron 模式特殊要求

```markdown
## Electron Mode Considerations

When developing features that will run in Electron desktop app:

### Path Resolution

**NEVER** hardcode `$HERMES_HOME` or `Path.home() / ".hermes"`:

```python
# ❌ BAD - Hardcoded path
config_path = Path.home() / ".hermes" / "config.yaml"

# ✅ GOOD - Use get_hermes_home()
from hermes_constants import get_hermes_home
config_path = get_hermes_home() / "config.yaml"
```

### Environment Variables

Electron sets:
- `HERMES_HOME` → `~/Library/Application Support/hermes-agent-electron/`
- `HERMES_ELECTRON_MODE` → `true`

Always use `get_hermes_home()` to respect these settings.

### Testing

Test your code in both modes:
```bash
# CLI mode
hermes

# Electron mode (simulated)
export HERMES_HOME="$HOME/Library/Application Support/hermes-agent-electron"
export HERMES_ELECTRON_MODE=true
python your_code.py
```
```

---

#### 文档 2: `docs/hermes-profile-usage-guide.md`

**添加警告**: Profile 功能限制

```markdown
## ⚠️ Electron 模式限制

**Profile 功能当前仅在 CLI 模式可用。**

### 为什么 Electron 不支持 Profile？

Electron 桌面应用使用固定的数据目录：
```
~/Library/Application Support/hermes-agent-electron/
```

每次启动 Electron 应用都使用相同的数据目录，无法在启动时选择不同的 Profile。

### 如何在 Electron 中使用多实例？

**方案 1**: 使用 CLI 模式启动多个 Gateway

```bash
# Terminal 1: work Profile
hermes -p work gateway start

# Terminal 2: personal Profile
hermes -p personal gateway start
```

**方案 2**: 等待未来版本的 Profile 选择器 UI

我们计划在未来版本的 Electron 中添加 Profile 选择器，敬请期待。

### Electron 模式的数据位置

在 Electron 中，所有数据存储在：
```
~/Library/Application Support/hermes-agent-electron/
├── config.yaml
├── .env
├── state.db
├── memories/
├── sessions/
├── skills/
└── logs/
```

该路径与 CLI 的 `$HERMES_HOME/` 完全独立。
```

---

#### 文档 3: `hermes_cli/config.py`

**更新文档字符串**：

```python
"""Config management for Hermes Agent.

Config files location:

**CLI Mode**:
- `$HERMES_HOME/config.yaml` - All settings
- `$HERMES_HOME/.env` - API keys and secrets

**Electron Mode**:
- `~/Library/Application Support/hermes-agent-electron/config.yaml`
- `~/Library/Application Support/hermes-agent-electron/.env`

**Docker Mode**:
- `$HERMES_HOME/config.yaml` (custom path)
- `$HERMES_HOME/.env`

The location is determined by `hermes_constants.get_hermes_home()`.
"""
```

---

#### 文档 4: `.claude/rules/architecture-hermes-core.md`

**更新数据库位置说明**：

```markdown
## State 状态层

**数据库位置**:

| 模式 | 位置 |
|------|------|
| CLI | `$HERMES_HOME/state.db` |
| Electron | `~/Library/Application Support/hermes-agent-electron/state.db` |
| Docker | `$HERMES_HOME/state.db` |

所有模式都使用 `hermes_constants.get_hermes_home()` 自动解析路径。
```

---

## 实施计划

### 第一阶段：核心代码修复（必须）

**时间**: 1-2 小时

1. ✅ 修改 `gateway/platforms/api_server_chat.py` (2 处)
2. ✅ 修改 `tools/mcp_tool.py` (1 处)
3. ✅ 修改 `hermes_cli/profiles.py` shell completion (2 处)
4. ✅ 在每个修改的文件顶部添加 import
5. ✅ 提交代码：`fix: use get_hermes_home() for Electron compatibility`

### 第二阶段：文档更新（必须）

**时间**: 2-3 小时

1. ✅ 更新 `docs/AGENTS.md` 添加 Electron 要求
2. ✅ 更新 `docs/hermes-profile-usage-guide.md` 添加限制说明
3. ✅ 更新 `hermes_cli/config.py` 文档字符串
4. ✅ 更新 `.claude/rules/architecture-hermes-core.md` 数据库位置
5. ✅ 更新 `gateway/config.py` 文档字符串
6. ✅ 提交代码：`docs: clarify Electron vs CLI path differences`

### 第三阶段：测试验证（必须）

**时间**: 1-2 小时

1. ✅ 在 CLI 模式测试路径解析
2. ✅ 在 Electron 模式测试路径解析
3. ✅ 测试 bash/zsh completion 在两种模式下工作
4. ✅ 测试聊天 API 附件在 Electron 中正确存储
5. ✅ 测试 MCP 工具在 Electron 中正确加载配置

### 第四阶段：集成测试（可选）

**时间**: 2-3 小时

1. ⬜ 添加 Electron 模式的单元测试
2. ⬜ 添加路径解析的集成测试
3. ⬜ 更新 CI/CD 覆盖双模式测试
4. ⬜ 提交代码：`test: add Electron mode path resolution tests`

---

## 验证方案

### 手动验证清单

#### CLI 模式验证

```bash
# 1. 确认默认路径
$ python -c "from hermes_constants import get_hermes_home; print(get_hermes_home())"
/Users/username/.hermes

# 2. 测试聊天 API
$ hermes chat
> 发送带图片的消息
> 检查图片是否正确保存到 $HERMES_HOME/data/attachments/

# 3. 测试 MCP 工具
$ hermes chat
> /mcp list
> 确认配置从 $HERMES_HOME/ 加载
```

#### Electron 模式验证

```bash
# 1. 启动 Electron 应用
$ cd electron-app
$ npm start

# 2. 检查环境变量设置
$ # 在 DevTools Console 查看:
window.electron.getEnv('HERMES_HOME')
// 应该输出: /Users/username/Library/Application Support/hermes-agent-electron

# 3. 测试聊天功能
# 发送消息，检查附件是否保存到正确路径
$ ls ~/Library/Application\ Support/hermes-agent-electron/data/attachments/

# 4. 测试 MCP 工具
# 在聊天界面使用 MCP 命令
# 检查配置从 Electron 数据目录加载
```

#### Shell Completion 验证

```bash
# 1. 重新生成 completion 脚本
$ hermes completion bash > $HERMES_HOME-completion.bash
$ hermes completion zsh > $HERMES_HOME-completion.zsh

# 2. 重新加载 shell
$ source ~/.bashrc  # 或 source ~/.zshrc

# 3. 测试 completion
$ hermes -p <TAB>
# 应该显示所有 Profile

# 4. 测试环境变量
$ export HERMES_HOME="/tmp/test-hermes"
$ mkdir -p /tmp/test-hermes/profiles/test-profile
$ hermes -p <TAB>
# 应该显示 test-profile
```

### 自动化测试

```python
# tests/test_electron_paths.py
import os
import pytest
from pathlib import Path
from hermes_constants import get_hermes_home

def test_cli_mode_default_path():
    """CLI 模式使用 $HERMES_HOME"""
    # 清除环境变量
    os.environ.pop('HERMES_HOME', None)
    os.environ.pop('HERMES_ELECTRON_MODE', None)
    
    home = get_hermes_home()
    assert home == Path.home() / ".hermes"

def test_electron_mode_custom_path(monkeypatch):
    """Electron 模式使用 app.getPath('userData')"""
    custom_path = "/Users/test/Library/Application Support/hermes-agent-electron"
    monkeypatch.setenv('HERMES_HOME', custom_path)
    monkeypatch.setenv('HERMES_ELECTRON_MODE', 'true')
    
    home = get_hermes_home()
    assert str(home) == custom_path

def test_gateway_chat_uses_hermes_home(monkeypatch):
    """gateway/platforms/api_server_chat.py 使用 get_hermes_home()"""
    custom_path = "/tmp/test-hermes"
    monkeypatch.setenv('HERMES_HOME', custom_path)
    
    # 导入模块触发路径解析
    from gateway.platforms.api_server_chat import get_config_or_404
    
    # 验证配置路径正确
    # (需要实际实现检查逻辑)

def test_mcp_tool_uses_hermes_home(monkeypatch):
    """tools/mcp_tool.py 使用 get_hermes_home()"""
    custom_path = "/tmp/test-hermes"
    monkeypatch.setenv('HERMES_HOME', custom_path)
    
    from tools.mcp_tool import get_mcp_config_path
    
    config_path = get_mcp_config_path()
    assert custom_path in str(config_path)
```

---

## 风险评估

### 低风险（可控）

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| CLI 用户路径改变 | 无影响 | 保持默认 `$HERMES_HOME` 向后兼容 |
| Electron 用户需要重新配置 | 低影响 | Electron 路径始终是 `userData`，无需迁移 |
| Shell completion 不工作 | 低影响 | 用户可重新生成脚本 |

### 中风险（需验证）

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 修改破坏现有功能 | 中影响 | 完整的测试覆盖 |
| 路径解析在某些环境失败 | 中影响 | 多环境测试（macOS/Linux/Docker） |
| 文档更新不完整 | 中影响 | Review checklist 验证 |

### 高风险（已规避）

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 数据迁移需求 | 高影响 | ✅ 无需迁移，两种模式独立运行 |
| 破坏性更改 | 高影响 | ✅ 保持向后兼容，仅修复硬编码 |
| Profile 在 Electron 不工作 | 高影响 | ✅ 文档明确说明限制 |

---

## 附录

### A. 扫描方法

```bash
# 扫描所有 .hermes 引用
rg -i '\.hermes' --type py --type md

# 扫描 Path.home() 使用
rg 'Path\.home\(\).*\.hermes' --type py

# 扫描 expanduser 使用
rg 'expanduser.*\.hermes' --type py

# 扫描 get_hermes_home 调用
rg 'get_hermes_home\(\)' --type py
```

### B. 相关文件清单

**核心实现**:
- `hermes_constants.py` - 路径解析核心
- `electron-app/src/env-manager.ts` - Electron 环境设置

**需要修改**:
- `gateway/platforms/api_server_chat.py`
- `tools/mcp_tool.py`
- `hermes_cli/profiles.py`

**需要文档更新**:
- `docs/AGENTS.md`
- `docs/hermes-profile-usage-guide.md`
- `hermes_cli/config.py`
- `.claude/rules/architecture-hermes-core.md`

### C. 参考链接

- [Electron app.getPath 文档](https://www.electronjs.org/docs/latest/api/app#appgetpathname)
- [Hermes Constants 实现](../hermes_constants.py)
- [Electron 架构文档](../.claude/rules/architecture-electron.md)

---

**文档维护者**: Hermes Agent Development Team  
**最后更新**: 2026-04-21  
**版本**: v1.0
