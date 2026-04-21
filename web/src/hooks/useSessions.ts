import { useState, useCallback, useEffect } from "react";
import { api, type SessionInfo } from "@/lib/api";

export interface GroupedSessions {
  today: SessionInfo[];
  yesterday: SessionInfo[];
  thisWeek: SessionInfo[];
  earlier: SessionInfo[];
}

export function useSessions(source: string = "electron-chat") {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async (limit = 20, offset = 0) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listSessions({ limit, offset, source });
      setSessions(response.sessions);

      // Don't auto-select any session - let user explicitly choose
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  const createSession = useCallback(async (title?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.createSession({
        source,
        user_id: "local-user",
        title,
      });

      const newSession: SessionInfo = {
        id: response.session_id,
        source,
        model: null,
        title: response.title,
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
      localStorage.setItem("lastSessionId", response.session_id);

      return response.session_id;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    localStorage.setItem("lastSessionId", sessionId);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await api.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      // If deleting current session, switch to another
      if (currentSessionId === sessionId) {
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
  }, [sessions, currentSessionId, switchSession]);

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

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

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
