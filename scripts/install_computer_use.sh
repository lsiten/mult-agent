#!/bin/bash
# Computer Use Installation Script
# Installs system dependencies for desktop automation

set -e

echo "🖥️  Computer Use Installation"
echo "=============================="
echo ""

# Detect platform
OS="$(uname -s)"
echo "Detected OS: $OS"
echo ""

# Install based on platform
case "$OS" in
    Darwin)
        echo "📦 Installing macOS dependencies..."

        # Check if brew is installed
        if ! command -v brew &> /dev/null; then
            echo "❌ Error: Homebrew not found"
            echo "   Install from: https://brew.sh"
            exit 1
        fi

        # Install cliclick
        if ! command -v cliclick &> /dev/null; then
            echo "   Installing cliclick..."
            brew install cliclick
            echo "   ✓ cliclick installed"
        else
            echo "   ✓ cliclick already installed"
        fi

        echo ""
        echo "📋 macOS Accessibility Permissions Required:"
        echo "   1. Open System Preferences"
        echo "   2. Go to Security & Privacy → Accessibility"
        echo "   3. Add Terminal or your Python interpreter"
        echo "   4. Restart Hermes Agent"
        ;;

    Linux)
        echo "📦 Installing Linux dependencies..."

        # Detect package manager
        if command -v apt-get &> /dev/null; then
            PKG_MANAGER="apt-get"
        elif command -v yum &> /dev/null; then
            PKG_MANAGER="yum"
        elif command -v dnf &> /dev/null; then
            PKG_MANAGER="dnf"
        else
            echo "❌ Error: No supported package manager found"
            exit 1
        fi

        echo "   Using package manager: $PKG_MANAGER"

        # Install xdotool and scrot
        if [ "$PKG_MANAGER" = "apt-get" ]; then
            sudo apt-get update
            sudo apt-get install -y xdotool scrot
        elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
            sudo $PKG_MANAGER install -y xdotool scrot
        fi

        echo "   ✓ xdotool installed"
        echo "   ✓ scrot installed"
        ;;

    *)
        echo "❌ Error: Unsupported OS: $OS"
        echo "   Computer Use supports macOS and Linux only"
        exit 1
        ;;
esac

# Install Python dependencies
echo ""
echo "🐍 Installing Python dependencies..."
pip3 install pillow --quiet
echo "   ✓ pillow installed"

# Verify installation
echo ""
echo "✅ Verifying installation..."

python3 -c "
import sys
sys.path.insert(0, '.')
from tools.registry import registry
import tools.computer_use_tool

available = registry.is_toolset_available('computer-use')
tools = registry.get_tool_names_for_toolset('computer-use')

print(f'   Toolset available: {available}')
print(f'   Registered tools: {len(tools)}')
for tool in tools:
    print(f'      - {tool}')
"

echo ""
echo "🎉 Computer Use installation complete!"
echo ""
echo "Test it:"
echo "   hermes"
echo "   > 截图看看桌面"
echo ""
