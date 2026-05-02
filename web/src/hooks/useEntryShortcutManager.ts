import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

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
  const location = useLocation();
  // Default to "hermes" when related to organization features (agentId, companyId, or on /organization path)
  // Otherwise default to "recruit"
  const getDefaultMode = (): EntryUiMode => {
    const params = new URLSearchParams(location.search);
    if (params.has("agentId") || params.has("companyId") || location.pathname === "/organization") {
      return "hermes";
    }
    return "recruit";
  };

  const [mode, setMode] = useState<EntryUiMode>(getDefaultMode());
  const [lastDPressAt, setLastDPressAt] = useState(0);

  // Switch to hermes mode for organization related pages
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("agentId") || params.has("companyId") || location.pathname === "/organization") {
      setMode("hermes");
    }
  }, [location.search, location.pathname]);

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
