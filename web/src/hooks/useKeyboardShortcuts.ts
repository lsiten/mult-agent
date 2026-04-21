import { useEffect, useCallback } from "react";

export type ShortcutHandler = () => void;

export interface KeyboardShortcut {
  key: string;
  ctrlOrCmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description?: string;
}

/**
 * Hook for registering keyboard shortcuts
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 'k', ctrlOrCmd: true, handler: () => focusSearch() },
 *   { key: 'n', ctrlOrCmd: true, handler: () => createNew() },
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const cmdOrCtrl = shortcut.ctrlOrCmd
          ? event.metaKey || event.ctrlKey
          : true;
        const shift = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const alt = shortcut.alt ? event.altKey : !event.altKey;

        // Special handling for Escape - always allow
        if (shortcut.key === "Escape" && event.key === "Escape") {
          event.preventDefault();
          shortcut.handler();
          return;
        }

        // For other shortcuts, skip if in input field (unless explicitly allowed)
        if (isInputField && shortcut.key !== "Escape") {
          continue;
        }

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          cmdOrCtrl &&
          shift &&
          alt
        ) {
          event.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
