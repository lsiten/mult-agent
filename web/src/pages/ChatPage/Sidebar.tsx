import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { SessionList } from "./SessionList";
import { KeyboardShortcutsButton, KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { useI18n } from "@/i18n";
import { type SessionInfo } from "@/lib/api";
import { type GroupedSessions } from "@/hooks/useSessions";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface SidebarProps {
  sessions: SessionInfo[];
  groupedSessions: GroupedSessions;
  currentSessionId: string | null;
  isCollapsed: boolean;
  onNewChat: () => void;
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onToggleCollapse: () => void;
}

export function Sidebar({
  sessions,
  groupedSessions,
  currentSessionId,
  isCollapsed,
  onNewChat,
  onSessionSelect,
  onSessionDelete,
  onToggleCollapse,
}: SidebarProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredSessions = searchQuery
    ? sessions.filter(
        s =>
          s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.preview?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  // Flatten sessions for keyboard navigation
  const flatSessions = useMemo(() => {
    if (searchQuery) {
      return filteredSessions;
    }
    return [
      ...groupedSessions.today,
      ...groupedSessions.yesterday,
      ...groupedSessions.thisWeek,
      ...groupedSessions.earlier,
    ];
  }, [searchQuery, filteredSessions, groupedSessions]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if collapsed or in input field
      if (isCollapsed) return;

      const target = e.target as HTMLElement;
      const isInInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev + 1;
          return next < flatSessions.length ? next : prev;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev - 1;
          return next >= 0 ? next : 0;
        });
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        const session = flatSessions[focusedIndex];
        if (session) {
          onSessionSelect(session.id);
        }
      } else if (e.key === "Escape" && isInInput) {
        e.preventDefault();
        setSearchQuery("");
        searchInputRef.current?.blur();
        setFocusedIndex(-1);
      } else if (e.key === "?" && !isInInput) {
        e.preventDefault();
        setShowShortcutsHelp(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCollapsed, focusedIndex, flatSessions, onSessionSelect]);

  // Update focused index when current session changes
  useEffect(() => {
    if (currentSessionId) {
      const index = flatSessions.findIndex(s => s.id === currentSessionId);
      if (index >= 0) {
        const id = setTimeout(() => setFocusedIndex(index), 0);
        return () => clearTimeout(id);
      }
    }
  }, [currentSessionId, flatSessions]);

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-border/50 bg-card/30 flex flex-col items-center py-4 gap-2">
        <Tooltip content={`${t.chat.newChat} (⌘N)`} side="right">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewChat}
            className="w-10 h-10 p-0"
            title={t.chat.newChat}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content={`${t.chat.expandSidebar} (⌘/)`} side="right">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="w-10 h-10 p-0 mt-auto"
            title={t.chat.expandSidebar}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border/50 bg-card/30 flex flex-col">
      {/* Header */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Tooltip content="⌘N" side="bottom">
            <Button onClick={onNewChat} className="flex-1" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t.chat.newChat}
            </Button>
          </Tooltip>
          <Tooltip content="⌘/" side="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="w-9 h-9 p-0"
              title={t.chat.collapseSidebar}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>

        <Tooltip content="⌘K" side="bottom">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.chat.searchPlaceholder}
              className="pl-9 h-9"
            />
          </div>
        </Tooltip>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {filteredSessions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery ? t.common.noResults : t.chat.noSessions}
          </div>
        ) : (
          <SessionList
            groupedSessions={
              searchQuery
                ? {
                    today: filteredSessions,
                    yesterday: [],
                    thisWeek: [],
                    earlier: [],
                  }
                : groupedSessions
            }
            currentSessionId={currentSessionId}
            focusedIndex={focusedIndex}
            onSessionSelect={onSessionSelect}
            onSessionDelete={(id) => setDeleteConfirm(id)}
          />
        )}
      </div>

      {/* Footer with Keyboard Shortcuts */}
      <div className="p-2 border-t border-border/50">
        <KeyboardShortcutsButton onClick={() => setShowShortcutsHelp(true)} />
      </div>

      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp
        open={showShortcutsHelp}
        onOpenChange={setShowShortcutsHelp}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。会话的所有消息将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm) {
                  onSessionDelete(deleteConfirm);
                  setDeleteConfirm(null);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
