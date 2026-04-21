#!/bin/bash

# Test Setup Script
# Installs Playwright and runs initial verification

set -e

echo "🔧 Setting up automated tests..."
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js first."
    exit 1
fi

# Install dependencies
echo "1. Installing Playwright and dependencies..."
npm install --save-dev @playwright/test playwright

echo ""
echo "✓ Dependencies installed"
echo ""

# Build TypeScript
echo "2. Building TypeScript..."
npm run build

echo ""
echo "✓ Build complete"
echo ""

# Run quick check
echo "3. Running quick verification..."
echo ""

if node tests/quick-check.js; then
    echo ""
    echo "✅ Setup complete! Tests are ready."
    echo ""
    echo "Next steps:"
    echo "  - Run full test suite: npm test"
    echo "  - Run UI mode: npm run test:ui"
    echo "  - Run debug mode: npm run test:debug"
    echo ""
else
    echo ""
    echo "⚠️  Quick check failed. Please review the output above."
    echo ""
    exit 1
fi
