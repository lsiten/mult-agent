#!/bin/bash
# Electron Path Fix - 快速验证脚本

set -e

echo "============================================"
echo "Electron Path Fix - 验证脚本"
echo "============================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    EXIT_CODE=1
}

check_warn() {
    echo -e "${YELLOW}!${NC} $1"
}

EXIT_CODE=0

# 1. 检查文件是否存在
echo "1. 检查修改的文件..."
echo ""

if [ -f "src/data-migration.ts" ]; then
    check_pass "src/data-migration.ts 存在"
else
    check_fail "src/data-migration.ts 不存在"
fi

if [ -f "package.json" ]; then
    if grep -q '"name": "hermes-agent-electron"' package.json; then
        check_pass "package.json: 应用名称已修复"
    else
        check_fail "package.json: 应用名称未修复"
    fi
else
    check_fail "package.json 不存在"
fi

echo ""

# 2. 检查 TypeScript 代码
echo "2. 检查 TypeScript 代码修改..."
echo ""

if grep -q "HERMES_HOME: hermesHome" src/python-manager.ts; then
    check_pass "python-manager.ts: HERMES_HOME 环境变量已修复"
else
    check_fail "python-manager.ts: HERMES_HOME 环境变量未修复"
fi

if grep -q "const hermesHome = app.getPath('userData');" src/python-manager.ts; then
    check_pass "python-manager.ts: 移除了 /config 子目录"
else
    check_fail "python-manager.ts: 未移除 /config 子目录"
fi

if grep -q "import { DataMigration } from './data-migration';" src/main.ts; then
    check_pass "main.ts: 导入了 DataMigration"
else
    check_fail "main.ts: 未导入 DataMigration"
fi

if grep -q "const migration = new DataMigration();" src/main.ts; then
    check_pass "main.ts: 集成了数据迁移逻辑"
else
    check_fail "main.ts: 未集成数据迁移逻辑"
fi

echo ""

# 3. 检查 Python 代码
echo "3. 检查 Python 代码修改..."
echo ""

if grep -q "COALESCE(SUM(input_tokens), 0)" ../hermes_cli/web_server.py; then
    check_pass "web_server.py: SQL 查询已添加 COALESCE"
else
    check_fail "web_server.py: SQL 查询未添加 COALESCE"
fi

if grep -q "os.getenv(\"HERMES_HOME\") or os.getenv(\"HERMES_CONFIG_PATH\")" ../hermes_constants.py; then
    check_pass "hermes_constants.py: 向后兼容 HERMES_CONFIG_PATH"
else
    check_warn "hermes_constants.py: 可能未添加向后兼容"
fi

echo ""

# 4. 检查前端代码
echo "4. 检查前端代码修改..."
echo ""

if grep -q "function formatTokens(n: number | null | undefined)" ../web/src/pages/AnalyticsPage.tsx; then
    check_pass "AnalyticsPage.tsx: formatTokens 已添加 null 检查"
else
    check_fail "AnalyticsPage.tsx: formatTokens 未添加 null 检查"
fi

echo ""

# 5. 检查编译状态
echo "5. 检查编译状态..."
echo ""

if [ -d "dist" ]; then
    check_pass "dist/ 目录存在"

    if [ -f "dist/data-migration.js" ]; then
        check_pass "dist/data-migration.js 已编译"
    else
        check_warn "dist/data-migration.js 未编译 (运行 npm run build)"
    fi

    if [ -f "dist/main.js" ]; then
        check_pass "dist/main.js 已编译"
    else
        check_warn "dist/main.js 未编译 (运行 npm run build)"
    fi
else
    check_warn "dist/ 目录不存在 (运行 npm run build)"
fi

echo ""

# 6. 检查数据路径
echo "6. 检查数据路径..."
echo ""

OLD_PATH="$HOME/Library/Application Support/hermes-agent-electron"
NEW_PATH="$HOME/Library/Application Support/hermes-electron/config"

if [ -d "$OLD_PATH" ]; then
    check_pass "旧路径存在: $OLD_PATH"

    if [ -f "$OLD_PATH/state.db" ]; then
        SIZE=$(du -h "$OLD_PATH/state.db" | cut -f1)
        check_pass "旧 state.db 存在 (大小: $SIZE)"
    else
        check_warn "旧 state.db 不存在"
    fi
else
    check_warn "旧路径不存在 (可能是全新安装)"
fi

if [ -d "$NEW_PATH" ]; then
    check_warn "新路径仍存在: $NEW_PATH"

    if [ -f "$NEW_PATH/state.db" ]; then
        SIZE=$(du -h "$NEW_PATH/state.db" | cut -f1)
        check_warn "新 state.db 存在 (大小: $SIZE) - 将被迁移覆盖"
    fi
fi

echo ""

# 7. 测试建议
echo "============================================"
echo "测试建议"
echo "============================================"
echo ""
echo "1. 编译代码:"
echo "   npm run build"
echo ""
echo "2. 运行开发模式:"
echo "   npm run dev"
echo ""
echo "3. 检查日志中的迁移信息:"
echo "   [DataMigration] Migration check: ..."
echo ""
echo "4. 验证 Analytics 页面不再显示 'null'"
echo ""
echo "5. 打包测试:"
echo "   npm run package:mac"
echo ""

# 总结
echo "============================================"
echo "验证结果"
echo "============================================"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}所有检查通过！可以继续测试。${NC}"
else
    echo -e "${RED}发现问题，请修复后重新验证。${NC}"
fi

echo ""

exit $EXIT_CODE
