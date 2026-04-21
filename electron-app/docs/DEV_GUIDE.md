# Hermes Electron Development Guide

## 开发模式

### 快速开发 (推荐)

```bash
# 终端1: 启动Python文件监听 + Web HMR
npm run dev:watch:python

# 终端2: 启动Electron + TypeScript热重载
npm run dev:watch
```

**特性**:
- ✅ TypeScript自动编译 + Electron自动重启
- ✅ Python文件自动同步 (需手动刷新Electron: Cmd+R)
- ✅ Web前端HMR (需配合Web dev server)

### 标准开发

```bash
# 一次性构建并启动
npm run dev

# 快速重启(不重新打包Python)
npm run dev:quick
```

### 符号链接模式 (快速Python迭代)

```bash
# 使用符号链接代替复制(Python修改实时生效)
npm run dev:symlink
```

⚠️ **注意**: 符号链接模式下无法打包分发

## 组件热更新

### 1. Web前端 (React)
```bash
cd ../web
npm run dev:electron  # 启动Vite dev server with HMR
```

修改`web/src/`下任何文件自动热更新，无需刷新

### 2. Electron主进程 (TypeScript)
```bash
npm run build:watch  # 自动监听并编译
```

修改`src/*.ts`后自动编译，需手动重启Electron:
- 方法1: Cmd+R (刷新)
- 方法2: 使用`dev:watch`自动重启

### 3. Python后端
```bash
# 方式A: 自动同步(开发模式)
./scripts/dev-watch.sh

# 方式B: 符号链接(实时生效)
npm run dev:symlink
```

修改Python文件后:
- 符号链接模式: 立即生效(部分需要重启Gateway)
- 打包模式: 需重新同步 + 刷新Electron

## 目录结构

```
electron-app/
├── src/              # Electron主进程TypeScript源码
│   ├── main.ts
│   ├── python-manager.ts
│   └── data-migration.ts
├── dist/             # 编译后的JavaScript
├── app/              # 运行时资源
│   ├── python/       # Python代码(开发:打包副本, 生产:真实代码)
│   ├── python-runtime/  # Python虚拟环境
│   ├── config/       # 配置文件
│   └── skills/       # Skills脚本
└── release/          # 打包输出

web/
├── src/              # React前端源码
└── dist/             # 构建输出 → electron-app/dist/renderer/
```

## 开发工作流

### 修改前端UI

```bash
# 1. 启动Web开发服务器
cd web && npm run dev:electron

# 2. 修改 web/src/pages/*.tsx
# 3. 浏览器自动刷新

# 4. 构建到Electron
npm run build:electron
```

### 修改Python后端

```bash
# 方式1: 使用符号链接(推荐迭代)
cd electron-app
npm run dev:symlink

# 修改 ../../gateway/*.py
# Cmd+R刷新Electron

# 方式2: 使用文件监听
npm run dev:watch:python  # 在另一个终端
# 修改后自动同步，Cmd+R刷新
```

### 修改Electron主进程

```bash
# 1. 启动TypeScript监听
npm run build:watch

# 2. 修改 src/main.ts 等文件
# 3. 自动编译完成后，Cmd+R刷新Electron

# 或使用自动重启
npm run dev:watch
```

## 打包分发

### 开发构建
```bash
npm run package:dir  # 构建.app但不打包成dmg
```

### 生产打包
```bash
# macOS
npm run package:mac

# Windows
npm run package:win

# Linux  
npm run package:linux
```

输出目录: `release/mac-arm64/` 或 `release/win-unpacked/`

## 调试技巧

### 1. 查看控制台日志
- Electron开发工具: 自动打开 (View → Toggle Developer Tools)
- Python Gateway日志: 在Electron控制台中查看

### 2. 检查进程
```bash
# 查看Electron进程
ps aux | grep "Hermes Agent"

# 查看Gateway进程
ps aux | grep "gateway/run.py"

# 查看端口占用
lsof -i:8642
```

### 3. 清理缓存
```bash
npm run clean  # 清理dist和release

# 清理app目录(保留python-runtime)
rm -rf app/python app/config app/skills
```

### 4. 重新安装依赖
```bash
# Python依赖
cd app/python-runtime
./bin/pip install -r ../../../requirements.txt

# Node依赖
npm ci
cd ../web && npm ci
```

## 常见问题

### Q: Python代码修改不生效
A: 
1. 检查是否使用符号链接模式 (`npm run dev:symlink`)
2. 或手动同步: `npm run bundle:python`
3. 重启Electron: Cmd+R

### Q: Web前端修改不生效
A:
1. 确认是否重新构建: `npm run build:web`
2. 或使用HMR: `cd ../web && npm run dev:electron`

### Q: Gateway启动失败
A:
1. 检查端口占用: `lsof -i:8642`
2. 查看Python错误: Electron控制台 → Console
3. 检查配置: `app/config/gateway.yaml`

### Q: 打包失败
A:
1. 清理旧构建: `npm run clean`
2. 重新构建: `npm run build:all`
3. 确保Python已打包: `npm run bundle:python`

## 性能优化

### 减少启动时间
- 使用`dev:quick`跳过Python打包
- 使用`dev:symlink`避免文件复制

### 减少重启频率
- 使用`dev:watch`自动重启
- 使用Web HMR避免全量刷新

## 环境变量

开发模式自动设置:
```bash
HERMES_ELECTRON_MODE=true
HERMES_HOME=~/Library/Application Support/hermes-agent-electron
PYTHONPATH=<app>/python
```

## 相关命令速查

| 命令 | 用途 | 热更新 |
|------|------|--------|
| `npm run dev` | 标准开发启动 | ❌ |
| `npm run dev:watch` | TypeScript + Electron自动重启 | ⚡ 部分 |
| `npm run dev:watch:python` | Python文件监听同步 | ⚡ 需刷新 |
| `npm run dev:symlink` | 符号链接模式 | ✅ 实时 |
| `npm run build:watch` | TypeScript监听编译 | ⚡ 需重启 |
| `npm run package:mac` | macOS打包 | ❌ |
