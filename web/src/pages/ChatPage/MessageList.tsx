import { useEffect, useRef, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { MessageBubble } from "./MessageBubble";
import { type SessionMessage } from "@/lib/api";
import { Loader2 } from "lucide-react";

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
  | { type: "loading" };

export function MessageList({ messages, streamingContent, isStreaming, toolUseMessages, skillUseMessages }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const shouldAutoScroll = useRef(true);

  // Build list items including streaming content and real-time events
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = messages.map((msg, idx) => ({
      type: "message",
      message: msg,
      index: idx,
    }));

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
  }, [messages, streamingContent, isStreaming, toolUseMessages, skillUseMessages]);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    if (shouldAutoScroll.current && listItems.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: listItems.length - 1,
        behavior: "smooth",
      });
    }
  }, [listItems.length, streamingContent]);

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height: "100%" }}
      totalCount={listItems.length}
      followOutput="smooth"
      itemContent={(index) => {
        const item = listItems[index];

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
