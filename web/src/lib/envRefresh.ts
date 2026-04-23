/**
 * Cross-cutting "the ``.env`` file just changed" notification.
 *
 * Several independent parts of the UI cache environment-variable state
 * (e.g. ``OAuthProvidersCard``, ``EnvPage``, the master-agent visibility
 * hook, ``App.tsx`` configuration warning banner). They are normally
 * populated on mount and re-fetched on user action within their own card,
 * but when the setup wizard is re-launched from the Env page, the wizard
 * writes directly to ``.env`` — and the rest of the UI never knows it
 * happened.
 *
 * To avoid prop-drilling a shared refresh callback down through pages, we
 * broadcast a DOM ``CustomEvent`` on ``window`` whenever ``.env`` is
 * mutated outside of the caller's own state machine (today: after
 * ``OnboardingWizard`` completion / skip). Interested components subscribe
 * with :func:`onEnvRefresh` in a ``useEffect`` and re-fetch.
 *
 * Why a DOM event instead of React Context:
 *   - Existing components are already scattered across multiple pages and
 *     are not wrapped in a shared provider.
 *   - Subscribers live in ``useEffect`` and naturally clean up on unmount,
 *     so there's no leak risk.
 *   - It's trivially testable (``window.dispatchEvent`` works in jsdom).
 */
const EVENT_NAME = "hermes:env-refresh";

/** Fire the refresh signal. Safe to call from any renderer code. */
export function emitEnvRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/**
 * Subscribe to the refresh signal.
 *
 * Returns an unsubscribe function so callers can wire this straight into
 * ``useEffect`` without an extra wrapper:
 *
 *   useEffect(() => onEnvRefresh(() => refetch()), [refetch]);
 */
export function onEnvRefresh(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => handler();
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
