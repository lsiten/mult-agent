## Why

New users installing the Hermes Agent Electron app face a steep learning curve when first launching the application. They must manually discover the "Keys" tab, navigate through 40+ provider options, and configure necessary API keys without guidance. This results in poor first-run experience and increased support burden. An interactive onboarding wizard will guide users through essential configuration (language preference, LLM provider setup, optional features) in a step-by-step flow, reducing friction and enabling users to start using Hermes immediately.

## What Changes

- **Add 4-step onboarding wizard**: Language selection → LLM provider configuration → Optional features (vision, browser, search) → Completion
- **Add Volcano Engine (Doubao) LLM provider support**: New provider option with ARK API configuration
- **Add CDP local browser connection**: Allow users to connect Hermes to their local Chrome browser via Chrome DevTools Protocol for browser automation
- **Extend i18n support**: Add onboarding-specific translations for Chinese (Simplified) and English
- **Add first-run detection**: Check for `.onboarding-complete` marker file to determine if wizard should appear
- **Add re-trigger capability**: Allow users to re-open the onboarding wizard from settings or menu

## Capabilities

### New Capabilities

- `electron-onboarding`: First-run onboarding wizard system with multi-step configuration flow, language selection, dynamic provider forms, optional feature toggles, and completion state persistence
- `llm-provider-volcengine`: Volcano Engine (Doubao/豆包) LLM provider integration supporting ARK API with configurable base URL
- `browser-cdp-connection`: Chrome DevTools Protocol local browser connection configuration for connecting Hermes browser automation to user's local Chrome instance

### Modified Capabilities

<!-- No existing capabilities are being modified -->

## Impact

**Frontend Components**:
- New: `web/src/components/OnboardingModal.tsx` - Multi-step wizard component
- New: `web/src/components/onboarding/` - Step components (LanguageStep, ProviderStep, OptionalFeaturesStep, CompletionStep)
- Modified: `web/src/App.tsx` - Integration of onboarding modal with first-run detection
- Modified: `web/src/i18n/zh.ts` and `web/src/i18n/en.ts` - Add onboarding namespace translations
- Modified: `web/src/i18n/types.ts` - Extend Translations type

**Electron Main Process**:
- Modified: `electron-app/src/main.ts` - Add first-run detection and IPC handlers for onboarding status
- Modified: `electron-app/src/config-manager.ts` - Add onboarding completion marker management

**Environment Variables**:
- New: `ARK_API_KEY` - Volcano Engine API key
- New: `ARK_BASE_URL` - Volcano Engine base URL (optional)
- Exposed: `BROWSER_CDP_URL` - CDP WebSocket endpoint (already exists in system, now exposed in UI)

**Configuration Files**:
- Modified: `.env.example` - Add Volcano Engine provider section
- Modified: `cli-config.yaml.example` - Add volcengine to provider list
- Modified: `web/src/pages/EnvPage.tsx` - Add Volcano Engine to PROVIDER_GROUPS

**Dependencies**:
- No new dependencies required (uses existing UI components from shadcn/ui)
