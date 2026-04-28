import { useCallback, useEffect, useState } from "react";

export type EntryUiMode = "hermes" | "recruit";

const DOUBLE_TAP_WINDOW_MS = 450;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

export function useEntryShortcutManager() {
  const [mode, setMode] = useState<EntryUiMode>("recruit");
  const [lastDPressAt, setLastDPressAt] = useState(0);

  const toggleMode = useCallback(() => {
    setMode((currentMode) => (currentMode === "hermes" ? "recruit" : "hermes"));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== "d") return;

      const now = Date.now();
      if (now - lastDPressAt <= DOUBLE_TAP_WINDOW_MS) {
        event.preventDefault();
        setLastDPressAt(0);
        toggleMode();
        return;
      }

      setLastDPressAt(now);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastDPressAt, toggleMode]);

  return { mode, setMode, toggleMode };
}
