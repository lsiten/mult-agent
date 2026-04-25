import { useState, useCallback, useEffect } from "react";
import { api, type SessionInfo, type SessionListResponse } from "@/lib/api";
import { useAgent } from "@/contexts/AgentContext";

function getLastSessionStorageKey(agentId: number | null): string {
  return `lastSessionId:${agentId ?? "master"}`;
}

export interface GroupedSessions {
  today: SessionInfo[];
  yesterday: SessionInfo[];
  thisWeek: SessionInfo[];
  earlier: SessionInfo[];
}

export function useSessions(source: string = "electron-chat", agentId: number | null = null) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isReady } = useAgent();
  const storageKey = getLastSessionStorageKey(agentId);

  const loadSessions = useCallback(async (limit = 20, offset = 0): Promise<SessionListResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listSessions({ limit, offset, source });
      setSessions(response.sessions);

      // Don't auto-select any session - let user explicitly choose
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
    // agentId is included so SWR-style re-fetches happen when the active
    // org identity changes (the header ``X-Hermes-Agent-Id`` stamped by
    // fetchJSON scopes the response; we just need to trigger the reload).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, agentId]);

  const createSession = useCallback(async (title?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Generate default title if not provided
      const defaultTitle = title || `新对话 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

      const response = await api.createSession({
        source,
        user_id: "local-user",
        title: defaultTitle,
        agent_id: agentId || undefined,  // Pass agent_id for Sub Agent isolation
      });

      const newSession: SessionInfo = {
        id: response.session_id,
        source,
        model: null,
        title: response.title || defaultTitle,
        started_at: response.created_at,
        ended_at: null,
        last_active: response.created_at,
        is_active: true,
        message_count: 0,
        tool_call_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        preview: null,
      };

      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(response.session_id);
      localStorage.setItem(storageKey, response.session_id);

      return response.session_id;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [source, agentId, storageKey]);

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    localStorage.setItem(storageKey, sessionId);
  }, [storageKey]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await api.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      // If deleting current session, switch to another
      if (currentSessionId === sessionId) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignore storage errors
        }
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          switchSession(remaining[0].id);
        } else {
          setCurrentSessionId(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [sessions, currentSessionId, switchSession, storageKey]);

  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      await api.updateSession(sessionId, { title });
      setSessions(prev =>
        prev.map(s => (s.id === sessionId ? { ...s, title } : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  const groupSessions = useCallback((sessionList: SessionInfo[]): GroupedSessions => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      today: sessionList.filter(s => s.last_active * 1000 > oneDayAgo),
      yesterday: sessionList.filter(s => {
        const ts = s.last_active * 1000;
        return ts <= oneDayAgo && ts > twoDaysAgo;
      }),
      thisWeek: sessionList.filter(s => {
        const ts = s.last_active * 1000;
        return ts <= twoDaysAgo && ts > oneWeekAgo;
      }),
      earlier: sessionList.filter(s => s.last_active * 1000 <= oneWeekAgo),
    };
  }, []);

  // Reset scoped state whenever the active agent identity changes so the
  // sidebar, ``currentSessionId`` and cached lastSessionId don't leak across
  // master/sub-agent switches.  ``loadSessions`` is invoked right after so
  // the new scope's list is fetched with the correct ``X-Hermes-Agent-Id``.
  useEffect(() => {
    setSessions([]);
    setCurrentSessionId(null);

    // ⛔ 等待 Agent 就绪后再加载会话列表
    // 防止 Sub Agent 切换时过早发起请求导致加载主 Agent 数据
    if (!isReady) {
      return;
    }

    void loadSessions().then((response) => {
      try {
        const lastSessionId = localStorage.getItem(storageKey);
        if (!lastSessionId) {
          return;
        }
        if (response.sessions.some(session => session.id === lastSessionId)) {
          setCurrentSessionId(lastSessionId);
        }
      } catch {
        // ignore storage errors (Safari private mode, quota, etc.)
      }
    });
  }, [loadSessions, isReady, agentId, storageKey]);

  return {
    sessions,
    currentSessionId,
    isLoading,
    error,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    groupSessions,
  };
}
