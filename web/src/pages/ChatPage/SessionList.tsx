import { useMemo, useRef, useEffect } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { SessionItem } from "./SessionItem";
import { useI18n } from "@/i18n";
import { type GroupedSessions } from "@/hooks/useSessions";
import { type SessionInfo } from "@/lib/api";

interface SessionListProps {
  groupedSessions: GroupedSessions;
  currentSessionId: string | null;
  focusedIndex?: number;
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
}

type ListItem =
  | { type: "header"; title: string }
  | { type: "session"; session: SessionInfo };

export function SessionList({
  groupedSessions,
  currentSessionId,
  focusedIndex = -1,
  onSessionSelect,
  onSessionDelete,
}: SessionListProps) {
  const { t } = useI18n();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Flatten sessions for focus index mapping
  const flatSessions = useMemo<SessionInfo[]>(() => {
    return [
      ...groupedSessions.today,
      ...groupedSessions.yesterday,
      ...groupedSessions.thisWeek,
      ...groupedSessions.earlier,
    ];
  }, [groupedSessions]);

  // Flatten grouped sessions into a single list with headers
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    const addGroup = (title: string, sessions: SessionInfo[]) => {
      if (sessions.length > 0) {
        items.push({ type: "header", title });
        sessions.forEach(session => {
          items.push({ type: "session", session });
        });
      }
    };

    addGroup(t.chat.today, groupedSessions.today);
    addGroup(t.chat.yesterday, groupedSessions.yesterday);
    addGroup(t.chat.thisWeek, groupedSessions.thisWeek);
    addGroup(t.chat.earlier, groupedSessions.earlier);

    return items;
  }, [groupedSessions, t]);

  // Map flat session index to list item index
  const getListIndexFromSessionIndex = (sessionIdx: number): number => {
    if (sessionIdx < 0 || sessionIdx >= flatSessions.length) return -1;

    const targetSession = flatSessions[sessionIdx];
    return listItems.findIndex(
      item => item.type === "session" && item.session.id === targetSession.id
    );
  };

  // Auto-scroll to focused session
  useEffect(() => {
    if (focusedIndex >= 0 && virtuosoRef.current) {
      const listIndex = getListIndexFromSessionIndex(focusedIndex);
      if (listIndex >= 0) {
        virtuosoRef.current.scrollToIndex({
          index: listIndex,
          align: "center",
          behavior: "smooth",
        });
      }
    }
  }, [focusedIndex]);

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height: "100%" }}
      totalCount={listItems.length}
      itemContent={(index) => {
        const item = listItems[index];

        if (item.type === "header") {
          return (
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
              {item.title}
            </div>
          );
        }

        // Calculate session index in flat list
        const sessionIndex = flatSessions.findIndex(s => s.id === item.session.id);
        const isFocused = sessionIndex === focusedIndex;

        return (
          <div className="px-2 py-0.5">
            <SessionItem
              session={item.session}
              isActive={item.session.id === currentSessionId}
              isFocused={isFocused}
              onSelect={() => onSessionSelect(item.session.id)}
              onDelete={() => onSessionDelete(item.session.id)}
            />
          </div>
        );
      }}
    />
  );
}
