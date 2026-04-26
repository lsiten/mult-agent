# Page Agent Extension (MCP)

基于 [Page Agent](https://github.com/alibaba/page-agent) 的浏览器扩展定制版本，集成了 MCP (Model Context Protocol) 调用支持。

## 特性

- 🤖 **MCP 集成**: 支持通过 MCP 调用外部 AI 服务，替代内置的大模型 API
- 🔧 **Skill 系统**: 内置多种浏览器操作 Skill，支持自定义扩展
- 🌐 **跨平台**: 基于 WXT + React 构建，支持 Chrome 扩展
- 📦 **开箱即用**: 集成了 Page-Agent 的核心 DOM 操作能力

## 与原版 Page-Agent 的区别

本扩展移除了内置的 LLM API 调用，改为支持 MCP (Model Context Protocol) 协议，通过 MCP 服务器调用外部 AI 能力。

## 项目结构

```
page-agent-extension/
├── src/
│   ├── agent/                    # Agent 核心实现
│   │   ├── MCPPageAgentCore.ts  # 基于 MCP 的 PageAgentCore
│   │   ├── MCPMultiPageAgent.ts # 多页面 Agent
│   │   ├── useMCPAgent.ts       # React Hook
│   │   ├── RemotePageController.ts
│   │   ├── TabsController.ts
│   │   ├── tabTools.ts
│   │   ├── tools/               # 工具定义
│   │   ├── utils/                # 工具函数
│   │   └── prompts/              # 系统提示词
│   ├── components/               # React 组件
│   │   ├── ConfigPanel.tsx       # MCP 配置面板
│   │   ├── cards.tsx             # 事件卡片
│   │   ├── misc.tsx              # 杂项组件
│   │   └── ui/                   # UI 基础组件
│   ├── mcp/                      # MCP 客户端
│   │   ├── MCPClient.ts          # MCP SDK 封装
│   │   └── MCPClientAdapter.ts    # 适配器
│   ├── skills/                   # Skill 系统
│   │   └── SkillManager.ts       # Skill 管理器
│   ├── lib/                      # 工具库
│   │   ├── db.ts                 # IndexedDB 操作
│   │   └── utils.ts              # 通用工具
│   ├── types/                    # 类型定义
│   └── entrypoints/              # 扩展入口点
│       ├── background.ts          # Service Worker
│       ├── content.ts             # Content Script
│       └── sidepanel/             # 侧边栏面板
├── package.json
├── wxt.config.ts                 # WXT 配置
└── tsconfig.json
```

## 安装

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 打包
npm run package
```

## 配置 MCP 服务器

1. 打开扩展侧边栏
2. 点击设置图标
3. 配置 MCP 服务器命令和参数

常用 MCP 服务器示例：

### Filesystem Server
```
Command: npx
Args: -y @modelcontextprotocol/server-filesystem ./
```

### Brave Search Server
```
Command: npx
Args: -y @modelcontextprotocol/server-brave-search
```

## 开发

### 前提条件

- Node.js >= 18
- Chrome 扩展开发者模式

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 在 Chrome 中加载扩展
# - 打开 chrome://extensions/
# - 启用开发者模式
# - 点击"加载已解压的扩展程序"
# - 选择 dist 目录
```

## Skill 系统

扩展内置以下 Skill：

- `browser_navigate` - 导航到指定 URL
- `browser_refresh` - 刷新页面
- `browser_back` - 后退
- `browser_forward` - 前进
- `clipboard_copy` - 复制到剪贴板
- `clipboard_paste` - 从剪贴板粘贴
- `page_info` - 获取页面信息
- `element_click` - 点击元素
- `element_fill` - 填写表单
- `element_scroll` - 滚动元素

## License

MIT
