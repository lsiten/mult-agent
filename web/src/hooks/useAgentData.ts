import { useEffect, useCallback, useState } from "react";
import { useAgent } from "@/contexts/AgentContext";

/**
 * Hook for loading data that depends on the active Agent identity.
 *
 * Automatically reloads when:
 * - Agent switches (activeAgentId changes)
 * - Agent becomes ready (isReady: false → true)
 *
 * Prevents premature loading when Sub Agent is starting up.
 *
 * @example
 * ```tsx
 * const { data, isLoading, reload } = useAgentData(
 *   async () => {
 *     const [status, sessions] = await Promise.all([
 *       api.getStatus(),
 *       api.getSessions(50)
 *     ]);
 *     return { status, sessions };
 *   },
 *   { autoReload: 5000 } // Optional: auto-refresh every 5s
 * );
 * ```
 */
export function useAgentData<T>(
  loadFn: () => Promise<T>,
  options?: {
    autoReload?: number; // Auto-refresh interval in ms
    skipWhenNotReady?: boolean; // Skip loading when Agent not ready (default: true)
  }
) {
  const { isReady, activeAgentId } = useAgent();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const skipWhenNotReady = options?.skipWhenNotReady ?? true;

  const reload = useCallback(async () => {
    // Skip if Agent not ready (unless explicitly disabled)
    if (skipWhenNotReady && !isReady) {
      console.log('[useAgentData] Agent not ready, skipping load');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await loadFn();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.error('[useAgentData] Load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [loadFn, isReady, skipWhenNotReady]);

  // Reload when Agent changes or becomes ready
  useEffect(() => {
    reload();
  }, [reload, activeAgentId, isReady]);

  // Auto-reload interval
  useEffect(() => {
    if (!options?.autoReload) return;

    const interval = setInterval(() => {
      if (isReady || !skipWhenNotReady) {
        reload();
      }
    }, options.autoReload);

    return () => clearInterval(interval);
  }, [reload, options?.autoReload, isReady, skipWhenNotReady]);

  return { data, isLoading, error, reload };
}
