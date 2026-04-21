#!/bin/bash
# Hermes Agent Electron - 快速启动脚本

set -e

echo "🚀 Hermes Agent Electron - 快速启动"
echo "====================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在 electron-app 目录中运行此脚本"
    exit 1
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
    echo ""
fi

# 构建 TypeScript
echo "🔨 编译 TypeScript..."
npm run build
echo ""

# 复制 web 资源
echo "📋 复制 Web 资源..."
if [ -d "../hermes_cli/web_dist" ]; then
    rm -rf dist/renderer
    cp -r ../hermes_cli/web_dist dist/renderer
    echo "   ✅ Web 资源已复制"
else
    echo "   ⚠️  警告：Web 资源未找到，请先构建 web 项目"
    echo "   cd ../web && npm run build"
fi
echo ""

# 可选：重置 onboarding
read -p "是否重置 Onboarding 向导？(y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ONBOARDING_FILE=~/Library/Application\ Support/hermes-agent-electron/config/.onboarding-complete
    if [ -f "$ONBOARDING_FILE" ]; then
        rm -f "$ONBOARDING_FILE"
        echo "   ✅ Onboarding 标记已删除"
    else
        echo "   ℹ️  Onboarding 标记不存在（首次运行）"
    fi
    echo ""
fi

# 检查 Gateway
echo "🔍 检查 Gateway 服务..."
if curl -s http://localhost:8642/health > /dev/null 2>&1; then
    echo "   ✅ Gateway 正在运行"
else
    echo "   ⚠️  Gateway 未运行"
    echo "   CDP 自动检测功能需要 Gateway 支持"
    echo ""
    echo "   请在另一个终端运行："
    echo "   hermes gateway"
    echo ""
    read -p "按 Enter 继续启动应用（或 Ctrl+C 取消）..."
fi
echo ""

# 启动应用
echo "🎉 启动 Electron 应用..."
echo ""
npm start
