## Why

当前的 Skills 页面只能查看和管理已安装的技能，但用户无法在应用内安装新技能。用户需要手动下载技能文件并通过命令行安装，这降低了用户体验。提供应用内技能安装功能可以让用户更便捷地扩展 Hermes Agent 的能力。

## What Changes

- 在 Skills 页面添加"安装新技能"功能入口
- 支持从在线技能仓库搜索和安装技能
- 支持通过上传 ZIP 文件安装本地技能
- 提供技能安装进度反馈和错误处理
- 更新技能列表以显示新安装的技能

## Capabilities

### New Capabilities
- `online-skill-search`: 搜索在线技能仓库，展示可用技能列表，支持筛选和预览
- `skill-zip-upload`: 上传并验证技能 ZIP 文件，解压并安装到系统
- `skill-installation-status`: 显示技能安装进度、成功/失败状态，并处理安装错误

### Modified Capabilities
<!-- 无现有能力需要修改 -->

## Impact

**前端**:
- `web/src/pages/SkillsPage.tsx` - 添加安装 UI 组件
- `web/src/components/` - 新增技能搜索和上传组件
- `web/src/lib/api.ts` - 添加技能安装相关 API 调用
- `web/src/i18n/` - 添加技能安装相关翻译

**后端**:
- `gateway/platforms/api_server_skills.py` - 新增技能安装、搜索 API 端点
- `tools/skills_hub.py` - 扩展技能管理逻辑（安装、验证）
- `hermes_constants.py` - 可能需要添加技能仓库配置

**依赖**:
- 可能需要 HTTP 客户端库来访问在线技能仓库
- ZIP 文件处理（Python 标准库 `zipfile`）
