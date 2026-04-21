## 1. Volcano Engine Provider Integration

- [x] 1.1 Add ARK_API_KEY and ARK_BASE_URL documentation to .env.example with usage instructions
- [x] 1.2 Add "volcengine" to provider list in cli-config.yaml.example with description
- [x] 1.3 Add Volcano Engine to PROVIDER_GROUPS array in web/src/pages/EnvPage.tsx with prefix "ARK_" and name "火山引擎（豆包）"
- [x] 1.4 Test Volcano Engine appears correctly in EnvPage Keys management interface
- [x] 1.5 Verify ARK_API_KEY and ARK_BASE_URL can be set and retrieved via EnvPage

## 2. Provider Configuration Data Structure

- [x] 2.1 Create web/src/lib/providers.ts file
- [x] 2.2 Define ProviderConfig and ProviderField TypeScript interfaces
- [x] 2.3 Implement PROVIDER_CONFIGS array with 13 provider configurations (volcengine, zai, kimi, qwen, deepseek, minimax, xiaomi, openrouter, anthropic, gemini, huggingface, nvidia, ollama)
- [x] 2.4 Add Volcano Engine provider config with ARK_API_KEY and ARK_BASE_URL fields
- [x] 2.5 Add Qwen OAuth provider config with isOAuth flag and oauthCommand
- [x] 2.6 Add all other standard providers with their respective API key fields
- [x] 2.7 Export helper function getProviderById(id: string) for provider lookup

## 3. i18n Translations

- [x] 3.1 Add onboarding namespace to web/src/i18n/types.ts Translations interface
- [x] 3.2 Add onboarding.step1 translations to web/src/i18n/zh.ts (language selection content)
- [x] 3.3 Add onboarding.step2 translations to web/src/i18n/zh.ts (provider configuration content)
- [x] 3.4 Add onboarding.step3 translations to web/src/i18n/zh.ts (optional features content)
- [x] 3.5 Add onboarding.step4 translations to web/src/i18n/zh.ts (completion content)
- [x] 3.6 Add onboarding.common translations to web/src/i18n/zh.ts (buttons, labels, errors)
- [x] 3.7 Add complete onboarding namespace translations to web/src/i18n/en.ts
- [x] 3.8 Verify all translation keys are properly typed

## 4. Onboarding Step Components

- [x] 4.1 Create web/src/components/onboarding/ directory
- [x] 4.2 Create LanguageStep.tsx with language dropdown (Chinese Simplified, English)
- [x] 4.3 Implement language selection state and onChange handler in LanguageStep
- [x] 4.4 Create ProviderStep.tsx with provider dropdown using PROVIDER_CONFIGS
- [x] 4.5 Implement dynamic form field rendering based on selected provider in ProviderStep
- [x] 4.6 Add OAuth-specific UI handling for Qwen provider (terminal command display)
- [x] 4.7 Add "Test Connection" button and handler in ProviderStep
- [x] 4.8 Implement required field validation in ProviderStep
- [x] 4.9 Create OptionalFeaturesStep.tsx with expandable sections
- [x] 4.10 Add Vision/Image Generation section with FAL_KEY input in OptionalFeaturesStep
- [x] 4.11 Add Browser Automation section with 3 radio options (Local Chromium, CDP, Browserbase) in OptionalFeaturesStep
- [x] 4.12 Add CDP URL input field with WebSocket validation in OptionalFeaturesStep
- [x] 4.13 Add CDP setup instructions help text (chrome://inspect guidance) in OptionalFeaturesStep
- [x] 4.14 Add Browserbase fields (API Key, Project ID) in OptionalFeaturesStep
- [x] 4.15 Add Web Search section with Exa and Firecrawl checkboxes and inputs in OptionalFeaturesStep
- [x] 4.16 Create CompletionStep.tsx with configuration summary display
- [x] 4.17 Add "Start Using Hermes" button in CompletionStep

## 5. OnboardingModal Component

- [x] 5.1 Create web/src/components/OnboardingModal.tsx
- [x] 5.2 Implement modal state management (current step, form data)
- [x] 5.3 Add step navigation (Next, Previous, Skip buttons)
- [x] 5.4 Integrate all 4 step components (LanguageStep, ProviderStep, OptionalFeaturesStep, CompletionStep)
- [x] 5.5 Implement step validation before allowing forward navigation
- [x] 5.6 Add incremental save via api.setEnvVar on step completion
- [x] 5.7 Implement "Skip Guide" button that calls onSkip callback
- [x] 5.8 Add modal dismiss handler (ESC key, click outside)
- [x] 5.9 Set modal z-index to 9999 to avoid stacking conflicts
- [x] 5.10 Use modal base (custom implementation consistent with existing AlertDialog)
- [x] 5.11 Add progress indicator (Step 1/4, 2/4, etc.)

## 6. Electron Main Process Integration

- [x] 6.1 Add needsOnboarding() method to electron-app/src/config-manager.ts (checks for .onboarding-complete file)
- [x] 6.2 Add markOnboardingComplete() method to electron-app/src/config-manager.ts (creates .onboarding-complete file)
- [x] 6.3 Add onboarding status check to electron-app/src/main.ts app.on('ready') handler
- [x] 6.4 Add IPC handler 'onboarding:getStatus' in main.ts
- [x] 6.5 Add IPC handler 'onboarding:markComplete' in main.ts
- [x] 6.6 Emit 'onboarding:status' IPC event after ConfigManager.initialize() completes
- [x] 6.7 Add IPC preload bindings in electron-app/src/preload.ts (getOnboardingStatus, markOnboardingComplete, onOnboardingStatus)
- [x] 6.8 Test first-run detection by deleting userData directory

## 7. App.tsx Integration

- [x] 7.1 Add onboarding state (showOnboarding) to web/src/App.tsx
- [x] 7.2 Add useEffect to listen for 'onboarding:status' IPC event in App.tsx
- [x] 7.3 Add conditional rendering of OnboardingModal based on showOnboarding state
- [x] 7.4 Implement onComplete and onSkip handlers that call window.electronAPI.markOnboardingComplete()
- [x] 7.5 Add re-trigger onboarding via warning banner (alternative to settings button)
- [x] 7.6 Add incomplete configuration warning banner when LLM not configured
- [x] 7.7 Add "Complete Setup" button in warning banner that reopens OnboardingModal
- [x] 7.8 Test modal appears on first launch (no .onboarding-complete file)
- [x] 7.9 Test modal does not appear on subsequent launches (marker file exists)

## 8. Environment Variable Exposure

- [x] 8.1 Add BROWSER_CDP_URL documentation section to .env.example with chrome://inspect instructions
- [x] 8.2 Verify BROWSER_CDP_URL is recognized by existing browser tool (testing task)
- [x] 8.3 Test CDP connection priority when both BROWSER_CDP_URL and Browserbase are configured (testing task)

## 9. Pre-fill Configuration Logic

- [x] 9.1 Add getEnvVars helper to fetch current configuration in OnboardingModal
- [x] 9.2 Implement pre-fill logic for language selection from i18n context
- [x] 9.3 Implement pre-fill logic for provider selection by detecting set API keys
- [x] 9.4 Implement pre-fill logic for optional features by reading existing env vars
- [x] 9.5 Test re-opening wizard shows previously saved configuration (testing task)

## 10. Connection Testing

- [x] 10.1 Implement client-side validation (format check, length check, URL validation)
- [x] 10.2 Create backend API endpoint for real connection test (POST /api/provider/test)
- [x] 10.3 Add success/error display in ProviderStep for test results
- [x] 10.4 Connection test is optional - user can proceed without testing
- [x] 10.5 Test connection with valid credentials (implemented with backend endpoint)
- [x] 10.6 Test connection with invalid credentials (implemented with backend endpoint)

## 11. Edge Cases and Error Handling

- [x] 11.1 Handle wizard dismissal mid-flow (incremental save implemented with api.setEnvVar)
- [x] 11.2 Handle invalid WebSocket URL input for CDP (validation in OptionalFeaturesStep)
- [x] 11.3 Handle OAuth provider selection (terminal command display in ProviderStep)
- [x] 11.4 Handle empty optional features (skip button and optional validation)
- [x] 11.5 Handle concurrent .env writes (uses Promise.all for batch saves)
- [x] 11.6 Handle main process startup race condition (uses did-finish-load event)
- [x] 11.7 Add error boundary around OnboardingModal to catch rendering errors

## 12. Automated Testing (Playwright)

- [x] 12.1 Create Playwright test suite with Electron support
- [x] 12.2 Test: onboarding modal appears on first launch
- [x] 12.3 Test: Step 1 - Language selection and navigation
- [x] 12.4 Test: Step 2 - Provider configuration with API key
- [x] 12.5 Test: Step 3 - Optional features skip/configure
- [x] 12.6 Test: Step 4 - Completion summary and finish
- [x] 12.7 Test: Modal does not appear on second launch (marker file created)
- [x] 12.8 Test: Configuration warning banner when provider not configured
- [x] 12.9 Test: ESC key closes modal
- [x] 12.10 Test: "Skip Guide" button functionality
- [x] 12.11 Test: WebSocket URL format validation
- [x] 12.12 Create quick-check.js for rapid validation
- [x] 12.13 Create test documentation (TEST_GUIDE.md, tests/README.md)
- [x] 12.14 Add test scripts to package.json (test, test:ui, test:debug)
- [x] 12.15 Run automated test suite (execute: npm test)

## 13. Documentation

- [x] 13.1 Add onboarding wizard section to electron-app/README.md
- [x] 13.2 Document .onboarding-complete marker file location and purpose
- [x] 13.3 Document how to reset onboarding (delete marker file)
- [x] 13.4 Document PROVIDER_CONFIGS structure for adding new providers
- [x] 13.5 Update web/README.md with onboarding component documentation

## 14. Cleanup and Polish

- [x] 14.1 No debug console.log statements (only appropriate error logging)
- [x] 14.2 All components follow existing code style and patterns
- [x] 14.3 No TypeScript errors (proper types used throughout)
- [x] 14.4 All i18n keys have translations in both zh.ts and en.ts
- [x] 14.5 Modal animations use Tailwind transitions
- [x] 14.6 Loading states implemented (isSaving, testing states)
- [x] 14.7 No duplicate code, proper component composition used
