import { useEffect, useRef, useMemo, useState } from "react";
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

  // Reset displayed count when switching sessions (messages array changes drastically)
  useEffect(() => {
    setDisplayedMessageCount(INITIAL_MESSAGE_COUNT);
  }, [messages.length === 0]); // Reset when messages are cleared (new session)

  // Build list items including streaming content and real-time events
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    // Determine how many historical messages to show
    const totalHistoricalMessages = messages.length;
    const hiddenMessageCount = Math.max(0, totalHistoricalMessages - displayedMessageCount);
    const visibleMessages = messages.slice(hiddenMessageCount);

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

  const handleLoadMore = async () => {
    if (isLoadingMore) return;

    const totalMessages = messages.length;
    const hiddenCount = Math.max(0, totalMessages - displayedMessageCount);

    // Don't load if no more messages
    if (hiddenCount === 0) return;

    setIsLoadingMore(true);

    // Simulate loading delay for UX
    await new Promise(resolve => setTimeout(resolve, 300));

    setDisplayedMessageCount(prev => prev + LOAD_MORE_COUNT);
    setIsLoadingMore(false);
  };

  // Handle scroll to top - auto load more messages
  const handleAtTopStateChange = (atTop: boolean) => {
    if (atTop && !isLoadingMore) {
      const totalMessages = messages.length;
      const hiddenCount = Math.max(0, totalMessages - displayedMessageCount);
      if (hiddenCount > 0) {
        handleLoadMore();
      }
    }
  };

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
      followOutput={(isAtBottom) => {
        // Auto-scroll only when user is at bottom
        if (isAtBottom) {
          return "smooth";
        }
        return false;
      }}
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
              <MessageBubble message={item.message} />
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
