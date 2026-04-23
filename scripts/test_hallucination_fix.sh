#!/bin/bash
# Hermes Agent 幻觉修复验证脚本
# Usage: bash scripts/test_hallucination_fix.sh

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Hermes Agent 幻觉修复验证脚本 v2.1.1                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check() {
    local name="$1"
    local command="$2"

    echo -n "[$name] "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

# 1. 检查代码修改
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. 检查代码修改"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check "TRUTHFULNESS_GUIDANCE 已定义" \
    "grep -q 'TRUTHFULNESS_GUIDANCE =' agent/prompt_builder.py"

check "System Prompt 注入逻辑已修改" \
    "grep -q 'Truthfulness guidance: ALWAYS inject' run_agent.py"

check "Computer Use 工具描述已增强" \
    "grep -q 'describe ONLY what you actually see' tools/computer_use_tool.py"

check "测试文件已创建" \
    "test -f tests/run_agent/test_truthfulness_guidance.py"

echo ""

# 2. 运行单元测试
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. 运行单元测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if pytest tests/run_agent/test_truthfulness_guidance.py -v --tb=short 2>/dev/null; then
    echo -e "${GREEN}✓ 所有测试通过${NC}"
else
    echo -e "${YELLOW}⚠ 测试失败或 pytest 未安装${NC}"
    echo "  提示：运行 'pip install pytest' 安装 pytest"
fi

echo ""

# 3. 检查 Git 提交
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. 检查 Git 提交"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if git log --oneline -1 | grep -q "TRUTHFULNESS_GUIDANCE"; then
    echo -e "${GREEN}✓ 修复已提交到 Git${NC}"
    git log --oneline -1
else
    echo -e "${YELLOW}⚠ 修复尚未提交或提交信息不包含关键词${NC}"
fi

echo ""

# 4. 生成验证报告
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. 修复内容摘要"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "已修改的文件:"
echo "  - agent/prompt_builder.py (新增 TRUTHFULNESS_GUIDANCE)"
echo "  - run_agent.py (修改注入逻辑)"
echo "  - tools/computer_use_tool.py (增强工具描述)"
echo "  - tests/run_agent/test_truthfulness_guidance.py (新增测试)"
echo ""

echo "修改统计:"
git diff --stat HEAD~1 HEAD -- agent/prompt_builder.py run_agent.py tools/computer_use_tool.py 2>/dev/null || echo "  (无法获取 diff 统计)"

echo ""

# 5. 下一步行动
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. 下一步行动"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "📋 验证修复是否生效："
echo ""
echo "   1. 重启 Electron 应用:"
echo "      cd electron-app && npm start"
echo ""
echo "   2. 测试截图分析:"
echo "      在 Agent 对话中输入："
echo "      \"请截取当前屏幕并分析打开的应用窗口\""
echo ""
echo "   3. 验证 Agent 是否准确描述图像内容"
echo ""
echo "📚 完整文档："
echo "   - docs/fixes/HALLUCINATION_FIX_2026-04-23.md"
echo "   - docs/fixes/CLAUDE_CODE_HALLUCINATION_ANALYSIS.md"
echo "   - docs/fixes/HERMES_HALLUCINATION_MITIGATION_PLAN.md"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ 验证完成${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
