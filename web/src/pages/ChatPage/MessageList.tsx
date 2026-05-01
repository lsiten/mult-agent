import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { MessageBubble } from "./MessageBubble";
import { type SessionMessage } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";

interface MessageListProps {
  messages: SessionMessage[];
  streamingContent: string;
  isStreaming: boolean;
  toolUseMessages: SessionMessage[];
  skillUseMessages: SessionMessage[];
  authRequestMessages: SessionMessage[];
  textSegments: SessionMessage[];
  currentCompanyId?: number;
}

type ListItem =
  | { type: "message"; message: SessionMessage; index: number }
  | { type: "streaming"; content: string }
  | { type: "loading" }
  | { type: "loading-more" };

const INITIAL_MESSAGE_COUNT = 30;
const LOAD_MORE_COUNT = 20;

export function MessageList({ messages, streamingContent, isStreaming, toolUseMessages, skillUseMessages, authRequestMessages, textSegments }: MessageListProps) {
  const { t } = useI18n();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [displayedMessageCount, setDisplayedMessageCount] = useState(INITIAL_MESSAGE_COUNT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const topReachedHandledRef = useRef(false);

  // Reset displayed count when switching sessions (messages array changes drastically)
  useEffect(() => {
    const id = setTimeout(() => setDisplayedMessageCount(INITIAL_MESSAGE_COUNT), 0);
    return () => clearTimeout(id);
  }, [messages.length === 0]); // Reset when messages are cleared (new session)

  // Build list items including streaming content and real-time events
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const transientToolInvocationIds = new Set(
      toolUseMessages.flatMap(msg =>
        msg.metadata?.tool_invocations?.map(inv => inv.id).filter(Boolean) ?? []
      )
    );

    // Determine how many historical messages to show
    const totalHistoricalMessages = messages.length;
    const hiddenMessageCount = Math.max(0, totalHistoricalMessages - displayedMessageCount);
    const visibleMessages = messages
      .slice(hiddenMessageCount)
      .filter(msg => {
        if (!isStreaming || msg.role !== "tool_use") {
          return true;
        }

        const persistedToolId = msg.metadata?.tool_invocations?.[0]?.id;
        return !persistedToolId || !transientToolInvocationIds.has(persistedToolId);
      });

    // Add loading indicator at top if there are hidden messages and currently loading
    if (hiddenMessageCount > 0 && isLoadingMore) {
      items.push({ type: "loading-more" });
    }

    // Add visible historical messages
    visibleMessages.forEach((msg, idx) => {
      items.push({
        type: "message",
        message: msg,
        index: hiddenMessageCount + idx,
      });
    });

    // Only show streaming messages during active streaming
    // After streaming completes, messages are reloaded from backend
    if (isStreaming) {
      // Merge and sort streaming messages by timestamp for chronological order
      // Include textSegments (completed text before tools/skills)
      const streamingMessages: SessionMessage[] = [
        ...textSegments,
        ...skillUseMessages,
        ...authRequestMessages,
        ...toolUseMessages,
      ];

      // Sort by timestamp to interleave text and tool calls
      streamingMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Add sorted streaming messages
      streamingMessages.forEach(msg => {
        items.push({ type: "message", message: msg, index: items.length });
      });
    }

    if (isStreaming) {
      if (streamingContent) {
        items.push({ type: "streaming", content: streamingContent });
      } else {
        items.push({ type: "loading" });
      }
    }

    return items;
  }, [messages, displayedMessageCount, streamingContent, isStreaming, toolUseMessages, skillUseMessages, authRequestMessages, textSegments]);

  // Track if this is the initial render
  const isInitialMount = useRef(true);

  // Note: Auto-scroll is handled by Virtuoso's followOutput prop
  // No manual scrolling needed

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMoreRef.current) return;

    const totalMessages = messages.length;
    const hiddenCount = Math.max(0, totalMessages - displayedMessageCount);

    // Don't load if no more messages
    if (hiddenCount === 0) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    // Simulate loading delay for UX
    await new Promise(resolve => setTimeout(resolve, 300));

    setDisplayedMessageCount(prev => prev + LOAD_MORE_COUNT);
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
  }, [displayedMessageCount, messages.length]);

  // Handle scroll to top - auto load more messages
  const handleAtTopStateChange = useCallback((atTop: boolean) => {
    if (!atTop) {
      topReachedHandledRef.current = false;
      return;
    }

    if (topReachedHandledRef.current || isLoadingMoreRef.current) {
      return;
    }

    const totalMessages = messages.length;
    const hiddenCount = Math.max(0, totalMessages - displayedMessageCount);
    if (hiddenCount > 0) {
      topReachedHandledRef.current = true;
      setTimeout(() => {
        void handleLoadMore();
      }, 0);
    }
  }, [displayedMessageCount, handleLoadMore, messages.length]);

  const followOutput = useCallback((isAtBottom: boolean) => {
    return isAtBottom ? "smooth" : false;
  }, []);

  // Mark when we've done initial mount
  useEffect(() => {
    if (listItems.length > 0 && isInitialMount.current) {
      isInitialMount.current = false;
    }
  }, [listItems.length]);

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height: "100%" }}
      totalCount={listItems.length}
      alignToBottom
      followOutput={followOutput}
      atTopStateChange={handleAtTopStateChange}
      itemContent={(index) => {
        const item = listItems[index];

        if (item.type === "loading-more") {
          return (
            <div className="py-4 flex justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.chat.loadingMore}
              </div>
            </div>
          );
        }

        if (item.type === "message") {
          return (
            <div className="py-2">
              <MessageBubble message={item.message} currentCompanyId={currentCompanyId} />
            </div>
          );
        }

        if (item.type === "streaming") {
          return (
            <div className="py-2">
              <MessageBubble
                message={{
                  role: "assistant",
                  content: item.content,
                }}
                isStreaming
              />
            </div>
          );
        }

        // type === "loading"
        return (
          <div className="py-2 flex justify-start">
            <div className="bg-success/10 rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-success" />
            </div>
          </div>
        );
      }}
    />
  );
}
