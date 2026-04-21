## Context

The Hermes Agent Electron app currently lacks a guided first-run experience. New users must navigate to the "Keys" tab and configure API keys manually from 40+ provider options without guidance. This design introduces a 4-step onboarding wizard that appears on first launch, guiding users through language selection, LLM provider setup, and optional feature configuration.

**Current State:**
- ConfigManager copies `.env.example` on first run but provides no UI guidance
- EnvPage displays all 40+ providers equally, overwhelming new users
- No first-run detection mechanism exists
- Browser automation uses Browserbase or local Chromium, but CDP connection is not exposed in UI
- i18n system exists (zh.ts, en.ts) but lacks onboarding-specific translations

**Constraints:**
- Must not require new dependencies (use existing shadcn/ui components)
- Must remain non-blocking (modal overlay, not full-screen takeover)
- Must support incremental configuration save to prevent data loss
- Must work with existing ConfigManager and EnvPage infrastructure
- Must maintain compatibility with existing `.env` and `cli-config.yaml` structure

## Goals / Non-Goals

**Goals:**
- Reduce time-to-first-successful-configuration from ~15 minutes to ~3 minutes
- Guide users through minimum viable configuration (language + LLM provider)
- Expose optional features (vision, browser, search) without overwhelming
- Support re-triggering onboarding for configuration updates
- Add Volcano Engine (Doubao) as a first-class Chinese LLM provider option
- Make CDP local browser connection discoverable and configurable
- Persist configuration incrementally to prevent loss on wizard dismissal

**Non-Goals:**
- Replacing the existing EnvPage (it remains the comprehensive management interface)
- Supporting all 40+ providers in onboarding (limit to ~13 most common ones)
- Implementing new configuration backends (continue using `.env` file)
- Adding complex validation logic (basic format checks only)
- Supporting configuration import/export
- Implementing multi-user or workspace-level configuration

## Decisions

### Decision 1: Modal-based wizard vs. dedicated window

**Choice:** Modal overlay within main window

**Rationale:**
- **Pro:** Non-blocking - users can dismiss and explore app even with incomplete config
- **Pro:** Simpler state management - shares React context with main app
- **Pro:** Faster to implement - reuses existing App.tsx routing and components
- **Con:** Limited screen space on small displays
- **Con:** Cannot show wizard while main process is initializing

**Alternatives Considered:**
- Dedicated BrowserWindow: Would require separate IPC channels, state synchronization, and window management. Rejected due to complexity and blocking UX.
- Full-screen page: Would block access to app until configuration is complete. Rejected to maintain user autonomy.

**Decision:** Modal overlay provides the best balance of user agency and implementation simplicity.

---

### Decision 2: When to trigger onboarding

**Choice:** Check for `.onboarding-complete` marker file in `userData/config/` on app ready

**Rationale:**
- **Pro:** Simple boolean check - no version tracking or state machine needed
- **Pro:** User can delete marker to re-trigger full onboarding
- **Pro:** Doesn't interfere with `.initialized` marker used by ConfigManager
- **Con:** Doesn't distinguish between "skipped" vs "completed" - both create marker

**Alternatives Considered:**
- Check for presence of any LLM API key: Would fail for users who manually configured before onboarding wizard existed. Rejected.
- Store onboarding state in config.yaml: Would complicate configuration schema. Rejected.
- Use localStorage in renderer: Would not persist across userData directory resets. Rejected.

**Decision:** Marker file in userData/config provides durable, simple first-run detection.

---

### Decision 3: Component architecture

**Choice:** Single `OnboardingModal` component with step components as children

```
OnboardingModal (manages wizard state, step navigation)
├── LanguageStep (language selection dropdown)
├── ProviderStep (dynamic form based on selected provider)
├── OptionalFeaturesStep (expandable sections for vision/browser/search)
└── CompletionStep (summary and completion CTA)
```

**Rationale:**
- **Pro:** Clear separation of concerns - each step is self-contained
- **Pro:** Easy to test individual steps in isolation
- **Pro:** Follows existing patterns in web/src/pages/ (multi-step forms)
- **Con:** Prop drilling for shared state (mitigated by React Context or state lifting)

**Alternatives Considered:**
- Single monolithic component with conditional rendering: Would result in 500+ line component. Rejected for maintainability.
- Separate route pages (/onboarding/step1, etc.): Would complicate modal overlay. Rejected.

**Decision:** Component-per-step provides maintainability and testability.

---

### Decision 4: Provider configuration data structure

**Choice:** Array of provider config objects with dynamic fields

```typescript
interface ProviderConfig {
  id: string;                    // "volcengine", "openrouter", etc.
  name: string;                  // Display name
  emoji: string;                 // Visual identifier
  description: string;           // One-line description
  docsUrl: string;               // Link to get API key
  fields: ProviderField[];       // Dynamic form fields
  isOAuth?: boolean;             // Special OAuth handling
  oauthCommand?: string;         // CLI command for OAuth login
}

interface ProviderField {
  key: string;                   // Environment variable name
  label: string;                 // Form label
  type: "text" | "password" | "url";
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
}
```

**Rationale:**
- **Pro:** Single source of truth for provider metadata
- **Pro:** Easy to add new providers by appending to array
- **Pro:** Dynamic form generation eliminates code duplication
- **Pro:** Supports OAuth edge case (Qwen) without special-casing in UI logic
- **Con:** Less type-safe than individual provider components

**Alternatives Considered:**
- Provider-specific components: Would require 13+ similar components. Rejected for DRY violation.
- Backend-driven provider list: Would require API endpoint and server-side config. Rejected as over-engineering for 13 static providers.

**Decision:** Config-driven dynamic forms balance flexibility and simplicity.

---

### Decision 5: Configuration persistence strategy

**Choice:** Incremental save via IPC on step completion

**Flow:**
1. User completes step N
2. Frontend calls `window.electron.setEnvVar(key, value)` for each field
3. Main process appends/updates `.env` file via ConfigManager
4. User proceeds to step N+1

**Rationale:**
- **Pro:** No data loss if user dismisses wizard mid-flow
- **Pro:** Re-opening wizard pre-fills with existing values from `.env`
- **Pro:** Reuses existing `setEnvVar` IPC handler from EnvPage
- **Con:** Partial configuration might confuse users who expect atomic save

**Alternatives Considered:**
- Save only on final "Complete" button: Would lose data if wizard is dismissed. Rejected due to bad UX.
- Save to temporary staging area, commit on completion: Would require new state management layer. Rejected as unnecessary complexity.
- Use localStorage/IndexedDB for wizard state: Would not survive userData directory changes. Rejected.

**Decision:** Incremental save provides safety net without added complexity.

---

### Decision 6: Browser CDP configuration approach

**Choice:** Add CDP as third radio button option in browser section, alongside existing Chromium and Browserbase

**Rationale:**
- **Pro:** `BROWSER_CDP_URL` environment variable already exists in system
- **Pro:** Browser tool already prioritizes CDP when set
- **Pro:** No backend changes needed - purely UI exposure
- **Con:** Requires explaining WebSocket URLs to non-technical users

**Alternatives Considered:**
- Separate "Advanced" section: Would bury the feature. Rejected.
- Auto-detect running Chrome: Would require active port scanning. Rejected for security/privacy concerns.

**Decision:** Explicit configuration as equal option alongside Chromium and Browserbase provides clarity without magic.

---

### Decision 7: Volcano Engine provider integration

**Choice:** Add to provider config array with standard fields (ARK_API_KEY, ARK_BASE_URL)

**Rationale:**
- **Pro:** No special-casing in onboarding logic
- **Pro:** Also appears in EnvPage via PROVIDER_GROUPS update
- **Pro:** Follows OpenRouter/Anthropic pattern (key + optional base URL)
- **Con:** Requires updates to 3 files (.env.example, cli-config.yaml.example, EnvPage.tsx)

**Alternatives Considered:**
- Plugin architecture for providers: Would enable third-party providers but adds significant complexity. Rejected as over-engineering.

**Decision:** Standard provider pattern keeps implementation simple.

---

### Decision 8: i18n namespace organization

**Choice:** Add `onboarding` namespace to existing zh.ts and en.ts

```typescript
// zh.ts
export const zh: Translations = {
  // ... existing namespaces
  onboarding: {
    step1: { title: "选择语言", ... },
    step2: { title: "配置 LLM 供应商", ... },
    // ...
  }
}
```

**Rationale:**
- **Pro:** Follows existing namespace pattern (app, status, sessions, etc.)
- **Pro:** Avoids collision with existing keys
- **Pro:** Easy to locate all onboarding strings
- **Con:** Requires TypeScript type updates in types.ts

**Alternatives Considered:**
- Flat keys like `onboardingStep1Title`: Would pollute top-level namespace. Rejected.
- Separate i18n file: Would require additional loading logic. Rejected.

**Decision:** Dedicated namespace maintains organization without complexity.

## Risks / Trade-offs

### Risk 1: Wizard dismissal leaves partial configuration
**Risk:** User configures LLM provider but dismisses wizard before optional features, then forgets to configure browser automation later.

**Mitigation:** Display persistent banner at top of app when LLM is configured but wizard is incomplete. Banner includes "Complete Setup" button to re-open wizard.

---

### Risk 2: Provider list grows beyond 13 options
**Risk:** Dropdown becomes overwhelming if many providers are added later.

**Mitigation 1:** Group providers by region (China vs International) using `<SelectGroup>` components.
**Mitigation 2:** Consider paginated or searchable dropdown if list exceeds 20 providers.

---

### Risk 3: CDP connection instructions unclear for non-technical users
**Risk:** Users unfamiliar with Chrome DevTools Protocol cannot find WebSocket URL.

**Mitigation:** Provide screenshot or animated GIF in help tooltip showing chrome://inspect page with WebSocket URL highlighted. Consider adding "Copy URL" browser extension link.

---

### Risk 4: Volcano Engine API format changes
**Risk:** ARK API key format or base URL structure changes, breaking validation.

**Mitigation:** Keep validation minimal (non-empty string for key, valid HTTP URL for base). Rely on "Test Connection" to catch actual issues. Document ARK API version assumptions in .env.example.

---

### Risk 5: Modal z-index conflicts with other overlays
**Risk:** Toast notifications, context menus, or other modals might appear behind onboarding wizard.

**Mitigation:** Set OnboardingModal z-index to 9999 and verify it exceeds all other UI elements. Use Radix UI Dialog primitive which handles focus trapping and stacking correctly.

---

### Risk 6: Electron main process startup race condition
**Risk:** Renderer tries to read onboarding status before ConfigManager finishes initializing.

**Mitigation:** Emit `onboarding:status` IPC event AFTER ConfigManager.initialize() completes in main.ts. Renderer waits for event before showing wizard.

## Migration Plan

**Phase 1: Add Volcano Engine provider (can deploy independently)**
1. Update `.env.example` with ARK_API_KEY and ARK_BASE_URL documentation
2. Update `cli-config.yaml.example` provider comment list
3. Update `web/src/pages/EnvPage.tsx` PROVIDER_GROUPS array
4. Deploy and verify Volcano Engine appears in Keys page

**Phase 2: Create onboarding UI components (can test in isolation)**
1. Create `web/src/components/onboarding/` directory with step components
2. Create `web/src/components/OnboardingModal.tsx` shell
3. Add provider config data structure to `web/src/lib/providers.ts`
4. Add i18n translations to zh.ts and en.ts
5. Test modal in Storybook or dedicated /onboarding-test route

**Phase 3: Integrate with Electron main process**
1. Add `.onboarding-complete` marker check to `electron-app/src/main.ts`
2. Add IPC handler `onboarding:getStatus` and `onboarding:markComplete`
3. Add IPC preload bindings in `preload.ts`
4. Update `electron-app/src/config-manager.ts` with marker file utilities

**Phase 4: Wire up to App.tsx**
1. Add onboarding state to App.tsx
2. Listen for `onboarding:status` IPC event
3. Conditionally render OnboardingModal
4. Add re-trigger capability in settings menu
5. Add incomplete configuration warning banner

**Phase 5: Testing and rollout**
1. Test fresh install flow (delete userData directory)
2. Test wizard dismissal and re-trigger
3. Test each provider configuration (especially OAuth edge case)
4. Test optional features save/skip paths
5. Deploy to beta testers, gather feedback, iterate

**Rollback Strategy:**
- If critical bug found post-deployment: Remove OnboardingModal from App.tsx render tree (wizard won't appear, app functions normally)
- Remove `.onboarding-complete` check from main.ts to skip detection
- Volcano Engine provider addition is backwards-compatible and can remain

## Open Questions

1. **Should we add analytics tracking for onboarding funnel?**
   - Pros: Understand where users drop off, optimize friction points
   - Cons: Privacy considerations, requires analytics infrastructure
   - Decision needed: Before Phase 4

2. **Should "Skip Guide" immediately create marker, or wait until user configures LLM?**
   - Option A: Create marker immediately (wizard never re-appears)
   - Option B: Only create marker after LLM configured (wizard re-appears on next launch)
   - Decision needed: Before Phase 3

3. **Should we support importing configuration from another Hermes installation?**
   - Pros: Power users could share configs, reduce repeated setup
   - Cons: Security risk (secrets in transit), scope creep
   - Recommendation: Defer to future iteration, not part of MVP

4. **Should we show "What's New" in onboarding for existing users who upgrade?**
   - Pros: Educate about Volcano Engine and CDP features
   - Cons: Annoying for users who just want to use the app
   - Recommendation: Defer to separate "What's New" modal, not part of onboarding

5. **How to handle Chinese users who need VPN to access international providers?**
   - Current: No special handling, test connection will fail
   - Option: Detect network and suggest Chinese providers first
   - Decision needed: Before Phase 5 (beta testing phase)
