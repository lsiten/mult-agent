# Onboarding Reset Feature

## Overview

Added a "Re-run Setup Wizard" button to the Config page that allows users to easily reopen the onboarding wizard without manually deleting files.

## Implementation

### Backend Changes

1. **electron-app/src/main.ts**
   - Added `onboarding:reset` IPC handler that:
     - Deletes the `.onboarding-complete` marker file
     - Sends `onboarding:status` event to renderer with `needsOnboarding: true`
     - Returns `{ ok: true }` on success

2. **electron-app/src/preload.ts**
   - Added `resetOnboarding()` method to `ElectronAPI` interface
   - Exposed IPC handler via `contextBridge`

### Frontend Changes

3. **web/src/App.tsx**
   - Updated `window.electronAPI` type definition to include `resetOnboarding` method

4. **web/src/pages/ConfigPage.tsx**
   - Added `handleReopenSetup()` handler that:
     - Calls `window.electronAPI.resetOnboarding()`
     - Shows success toast notification
   - Added reset button with Settings2 icon
   - Button only appears when running in Electron environment (checks for `window.electronAPI`)

5. **web/src/i18n/types.ts, en.ts, zh.ts**
   - Added `config.reopenSetup` translation key
     - English: "Re-run Setup Wizard"
     - Chinese: "重新运行设置向导"
   - Added `config.setupReopened` for toast notification
     - English: "Setup wizard reopened"
     - Chinese: "设置向导已重新打开"

## UI Location

The button appears in the Config page header, after the "Reset to defaults" button and before the YAML/Form toggle:

```
[Export] [Import] [Reset] [Re-run Setup] | [YAML/Form] [Save]
```

## User Flow

1. User opens Config page
2. User clicks the Settings2 icon button (tooltip: "Re-run Setup Wizard")
3. Toast notification appears: "Setup wizard reopened"
4. Onboarding modal automatically opens
5. User can go through the setup wizard again

## Technical Details

- Button conditionally rendered: `{window.electronAPI?.resetOnboarding && <Button>...}`
- Uses existing onboarding infrastructure - no duplication
- IPC handler immediately notifies renderer of status change
- Works seamlessly with existing onboarding state management

## Testing

### Manual Test

1. Build and start Electron app:
   ```bash
   cd electron-app
   npm run build
   npm start
   ```

2. Navigate to Config page
3. Verify reset button appears (Settings2 icon)
4. Click the button
5. Verify toast notification appears
6. Verify onboarding modal opens

### Automated Test

Created `tests/test-reset-button.js` for automated verification (needs refinement for CI).

## Files Modified

- `electron-app/src/main.ts` - IPC handler
- `electron-app/src/preload.ts` - API exposure
- `web/src/App.tsx` - Type definition
- `web/src/pages/ConfigPage.tsx` - UI and handler
- `web/src/i18n/types.ts` - Translation types
- `web/src/i18n/en.ts` - English translations
- `web/src/i18n/zh.ts` - Chinese translations

## Notes

- Button only appears in Electron environment (not in web-only deployments)
- Uses existing Settings2 icon from lucide-react
- Follows existing UI patterns and styling
- Fully internationalized (English and Chinese)
