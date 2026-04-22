import { useEffect, useRef, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { MessageBubble } from "./MessageBubble";
import { type SessionMessage } from "@/lib/api";
import { Loader2, ChevronUp } from "lucide-react";
import { useI18n } from "@/i18n";

interface MessageListProps {
  messages: SessionMessage[];
  streamingContent: string;
  isStreaming: boolean;
  toolUseMessages: SessionMessage[];
  skillUseMessages: SessionMessage[];
}

type ListItem =
  | { type: "message"; message: SessionMessage; index: number }
  | { type: "streaming"; content: string }
  | { type: "loading" }
  | { type: "load-more" };

const INITIAL_MESSAGE_COUNT = 30;
const LOAD_MORE_COUNT = 20;

export function MessageList({ messages, streamingContent, isStreaming, toolUseMessages, skillUseMessages }: MessageListProps) {
  const { t } = useI18n();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const shouldAutoScroll = useRef(true);
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

    // Add "Load More" button if there are hidden messages
    if (hiddenMessageCount > 0) {
      items.push({ type: "load-more" });
    }

    // Add visible historical messages
    visibleMessages.forEach((msg, idx) => {
      items.push({
        type: "message",
        message: msg,
        index: hiddenMessageCount + idx,
      });
    });

    // Add skill_use messages from streaming
    skillUseMessages.forEach(msg => {
      items.push({ type: "message", message: msg, index: items.length });
    });

    // Add tool_use messages from streaming
    toolUseMessages.forEach(msg => {
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
  }, [messages, displayedMessageCount, streamingContent, isStreaming, toolUseMessages, skillUseMessages]);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    if (shouldAutoScroll.current && listItems.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: listItems.length - 1,
        behavior: "smooth",
      });
    }
  }, [listItems.length, streamingContent]);

  // Initial scroll to bottom when messages first load
  useEffect(() => {
    if (messages.length > 0 && listItems.length > 0) {
      // Use setTimeout to ensure Virtuoso has rendered
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: listItems.length - 1,
          behavior: "auto",
        });
      }, 100);
    }
  }, [messages.length > 0 && listItems.length > 0]); // Only on initial load

  const handleLoadMore = async () => {
    if (isLoadingMore) return;

    setIsLoadingMore(true);

    // Simulate loading delay for UX
    await new Promise(resolve => setTimeout(resolve, 300));

    setDisplayedMessageCount(prev => prev + LOAD_MORE_COUNT);
    setIsLoadingMore(false);
  };

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height: "100%" }}
      totalCount={listItems.length}
      followOutput="smooth"
      itemContent={(index) => {
        const item = listItems[index];

        if (item.type === "load-more") {
          return (
            <div className="py-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t.chat.loadingMore}
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    {t.chat.loadMore}
                  </>
                )}
              </button>
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
      atBottomStateChange={(atBottom) => {
        shouldAutoScroll.current = atBottom;
      }}
    />
  );
}
