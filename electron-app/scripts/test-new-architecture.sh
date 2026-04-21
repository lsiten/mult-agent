#!/bin/bash
# 测试新架构启动流程

set -e

echo "========================================="
echo "测试新架构启动流程"
echo "========================================="
echo ""

# 1. 确保编译最新
echo "[1/4] 编译 TypeScript..."
npm run build:main

# 2. 检查关键文件存在
echo "[2/4] 检查关键文件..."
files=(
  "dist/main.js"
  "dist/main-new.js"
  "dist/main-old.js"
  "dist/core/application.js"
  "dist/core/service.interface.js"
  "dist/services/gateway.service.js"
  "dist/services/window.service.js"
)

for file in "${files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ 缺失文件: $file"
    exit 1
  fi
  echo "  ✓ $file"
done

# 3. 运行所有测试
echo "[3/4] 运行单元测试和集成测试..."
npm run test:unit

# 4. 检查测试覆盖率
echo "[4/4] 检查测试覆盖率..."
npm run test:coverage 2>&1 | grep -E "(Lines|Statements|Functions|Branches)" || true

echo ""
echo "========================================="
echo "✅ 新架构验证完成"
echo "========================================="
echo ""
echo "可以启动应用测试:"
echo "  npm start              # 使用新架构"
echo "  npm run start:old      # 使用旧架构（对比用）"
echo ""
