import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type MasterAsset } from "@/lib/api";

/**
 * Frontend state for the per-provider Public / Private toggle that lives on
 * the master agent's Env page.
 *
 * ``visibilityMap`` keys are provider ids as defined by the backend
 * ``PROVIDER_ENV_KEYS`` table (e.g. ``openrouter``, ``volcengine``). Callers
 * use these ids to look up whether a provider is configured (``inherit_ready``)
 * and whether it is currently Public / Private. A missing entry means the
 * master agent's asset scanner has not produced a row for that provider yet —
 * typically because the underlying provider is not part of the whitelist.
 *
 * Callers are expected to:
 *   1. ``refresh()`` after saving / clearing env vars on the page so the
 *      ``inherit_ready`` flag is kept in sync with ``.env``.
 *   2. Call ``setVisibility(providerId, next)`` which optimistically updates
 *      the local map and rolls back on error.
 *
 * The hook does not filter by visibility because the page needs to render
 * both Public and Private rows (to show the toggle in either state).
 */
export interface MasterProviderVisibilityState {
  visibilityMap: Record<string, MasterAsset>;
  loading: boolean;
  error: string | null;
  /** Provider id currently being toggled (``null`` when idle). */
  pendingProvider: string | null;
  refresh: () => Promise<void>;
  /** Optimistically toggle and persist. Rolls back local state on failure. */
  setVisibility: (
    providerId: string,
    visibility: "public" | "private",
  ) => Promise<void>;
}

export function useMasterProviderVisibility(
  enabled: boolean,
): MasterProviderVisibilityState {
  const [assets, setAssets] = useState<MasterAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      // Rescan first so UI reflects the current ``.env`` after edits; the
      // scanner is idempotent and cheap (bounded by ENV_WHITELIST size).
      await api.refreshMasterAssets();
      const rows = await api.listMasterAssets({ asset_type: "env_provider" });
      setAssets(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setAssets([]);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const visibilityMap = useMemo(() => {
    const m: Record<string, MasterAsset> = {};
    for (const a of assets) {
      if (a.asset_type === "env_provider") m[a.asset_key] = a;
    }
    return m;
  }, [assets]);

  const setVisibility = useCallback(
    async (providerId: string, visibility: "public" | "private") => {
      const prev = assets;
      // Optimistic update so the toggle feels responsive. The server call is
      // the source of truth and is re-written below on success.
      setAssets((rows) =>
        rows.map((r) =>
          r.asset_type === "env_provider" && r.asset_key === providerId
            ? { ...r, visibility }
            : r,
        ),
      );
      setPendingProvider(providerId);
      try {
        const updated = await api.setProviderVisibility(providerId, visibility);
        setAssets((rows) => {
          let found = false;
          const next = rows.map((r) => {
            if (r.id === updated.id) {
              found = true;
              return updated;
            }
            return r;
          });
          return found ? next : [...next, updated];
        });
      } catch (e) {
        setAssets(prev);
        setError(String(e));
        throw e;
      } finally {
        setPendingProvider(null);
      }
    },
    [assets],
  );

  return { visibilityMap, loading, error, pendingProvider, refresh, setVisibility };
}
