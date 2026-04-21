# Electron Onboarding Wizard - Implementation Summary

## 概述

为 Hermes Agent Electron 应用实现了完整的首次启动引导向导，包含4个步骤的配置流程。

## 功能特性

### 1. 多语言支持
- **中文/英文** 完整UI翻译
- 语言切换实时生效
- 所有供应商名称和描述多语言化

### 2. 默认供应商策略
- **中文用户**: 默认选择 **火山引擎（豆包）**
- **英文用户**: 默认选择 **Anthropic (Claude)**
- 支持14个LLM供应商配置

### 3. 四步引导流程

#### Step 1: 语言选择
- 选择界面语言（中文/英文）
- 实时切换UI显示

#### Step 2: LLM供应商配置
- 选择供应商（火山引擎、Anthropic、OpenRouter等）
- 输入API Key
- 可选Base URL配置
- OAuth供应商特殊处理

#### Step 3: 可选功能配置
- Vision & Image Generation (FAL.ai)
- Browser Automation (Local/CDP/Browserbase)
- Web Search & Scraping (Exa/Firecrawl)
- 可跳过此步骤

#### Step 4: 完成总结
- 显示配置摘要
- 保存配置并标记完成

### 4. 用户体验
- ✅ 首次启动自动显示
- ✅ 第二次启动不再显示
- ✅ ESC键快速关闭
- ✅ Skip Guide按钮跳过配置
- ✅ 配置验证和错误提示
- ✅ 进度指示器 (Step 1/4, 2/4...)

## 技术实现

### 架构
```
electron-app/
├── src/
│   ├── config-manager.ts       # 配置管理，onboarding状态
│   ├── preload.ts              # IPC通信接口
│   └── main.ts                 # 主进程，发送onboarding状态
web/
├── src/
│   ├── components/
│   │   ├── OnboardingModal.tsx              # 主modal组件
│   │   └── onboarding/
│   │       ├── LanguageStep.tsx             # 步骤1
│   │       ├── ProviderStep.tsx             # 步骤2
│   │       ├── OptionalFeaturesStep.tsx     # 步骤3
│   │       └── CompletionStep.tsx           # 步骤4
│   ├── i18n/
│   │   ├── en.ts                            # 英文翻译
│   │   ├── zh.ts                            # 中文翻译
│   │   └── types.ts                         # 类型定义
│   └── lib/
│       └── providers.ts                      # 供应商配置
```

### 关键文件

#### 1. ConfigManager (`src/config-manager.ts`)
```typescript
needsOnboarding(): boolean {
  const markerFile = path.join(this.configDir, '.onboarding-complete');
  return !fs.existsSync(markerFile);
}

markOnboardingComplete(): void {
  const markerFile = path.join(this.configDir, '.onboarding-complete');
  fs.writeFileSync(markerFile, new Date().toISOString());
}
```

#### 2. Main Process (`src/main.ts`)
```typescript
// IPC handlers
ipcMain.handle('onboarding:getStatus', () => {
  return { needsOnboarding: configManager.needsOnboarding() };
});

ipcMain.handle('onboarding:markComplete', () => {
  configManager.markOnboardingComplete();
  return { ok: true };
});

// Send initial status after window loads
mainWindow.webContents.once('did-finish-load', () => {
  mainWindow?.webContents.send('onboarding:status', { needsOnboarding });
});
```

#### 3. React App (`web/src/App.tsx`)
```typescript
// Fetch onboarding status on mount
useEffect(() => {
  const checkOnboarding = async () => {
    if (window.electronAPI?.getOnboardingStatus) {
      const status = await window.electronAPI.getOnboardingStatus();
      setShowOnboarding(status.needsOnboarding);
    }
  };
  checkOnboarding();
}, []);
```

#### 4. Provider Configuration (`web/src/lib/providers.ts`)
```typescript
export function getDefaultProviderId(locale: string): string {
  if (locale === "zh") {
    return "volcengine"; // 火山引擎
  } else {
    return "anthropic";  // Anthropic
  }
}
```

## 测试

### 自动化测试
```bash
npm test
```

**测试覆盖**:
- ✅ Modal在首次启动时显示
- ✅ Skip Guide按钮关闭modal
- ✅ ESC键关闭modal

**测试配置**: `playwright.config.js`
- Timeout: 90秒
- Retries: 1次
- Workers: 1 (串行执行)

### 手动测试
```bash
npm run dev:quick
```

首次启动会显示onboarding wizard。

## 配置存储

### 1. Marker File
路径: `{userData}/config/.onboarding-complete`
内容: ISO timestamp

### 2. Environment Variables  
路径: `{userData}/.env`
格式:
```env
ANTHROPIC_API_KEY=sk-xxx...
ARK_API_KEY=xxx...
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

## 支持的供应商

1. 🔥 火山引擎（豆包/Doubao）
2. 🤖 智谱 GLM / Z.AI
3. 🌙 Kimi / 月之暗面
4. 🌟 通义千问 (OAuth)
5. 🧠 DeepSeek
6. 🚀 MiniMax
7. 📱 小米 MiMo
8. 🤖 Anthropic (Claude)
9. 💚 OpenAI
10. 🔍 Google Gemini
11. 🤗 Hugging Face
12. 🟢 NVIDIA NIM
13. 🦙 Ollama Cloud
14. 🔀 OpenRouter

## 开发者指南

### 添加新的供应商

1. 在 `web/src/lib/providers.ts` 添加配置:
```typescript
{
  id: "new-provider",
  name: "Provider Name",
  emoji: "🎯",
  description: "Description",
  docsUrl: "https://...",
  fields: [
    {
      key: "NEW_PROVIDER_API_KEY",
      label: "API Key",
      type: "password",
      required: true,
    }
  ],
}
```

2. 在 `web/src/i18n/en.ts` 和 `zh.ts` 添加翻译:
```typescript
providers: {
  "new-provider": {
    name: "Provider Name",
    description: "Description text"
  }
}
```

### 修改默认供应商

编辑 `web/src/lib/providers.ts`:
```typescript
export function getDefaultProviderId(locale: string): string {
  if (locale === "zh") {
    return "your-provider-id"; // 中文默认
  } else {
    return "your-provider-id"; // 英文默认
  }
}
```

## 已知问题

### 测试timing问题
部分E2E测试在首次运行时可能超时，重试后通常会通过。这是Electron + React + Playwright的常见问题。

**解决方案**:
- 增加timeout配置
- 添加更多waitForTimeout
- 使用waitForFunction等待状态就绪

### 清理问题
测试cleanup时可能遇到 `ENOTEMPTY` 错误。这是因为Electron进程可能still持有文件handle。

**解决方案**:
- 使用 `{ force: true, maxRetries: 3 }`
- 让OS自动清理临时目录

## 更新日志

### 2026-04-19
- ✅ 实现完整的4步onboarding流程
- ✅ 添加中英文多语言支持
- ✅ 实现供应商多语言翻译
- ✅ 中文默认火山引擎，英文默认Anthropic
- ✅ 添加E2E自动化测试
- ✅ 修复race condition问题
- ✅ 优化用户体验（ESC关闭、Skip Guide等）

## 参考资料

- [Playwright Electron Testing](https://playwright.dev/docs/api/class-electron)
- [React Context API](https://react.dev/reference/react/useContext)
- [Electron IPC Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
