import { memo } from "react";
import { type SessionMessage } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { AttachmentDisplay } from "./AttachmentDisplay";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ToolInvocationGroup } from "@/components/chat/ToolInvocationMessage";
import { SkillInvocationMessage } from "@/components/chat/SkillInvocationMessage";
import { AuthorizationRequestMessage } from "@/components/chat/AuthorizationRequestMessage";
import { ArchitectureMessage } from "@/components/chat/ArchitectureMessage";
import { Badge } from "@/components/ui/badge";
import { useChatSettingsStore } from "@/stores/useChatSettingsStore";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";

interface MessageBubbleProps {
  message: SessionMessage;
  isStreaming?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const { t, locale } = useI18n();
  const { hideToolCalls } = useChatSettingsStore();

  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isAssistant = message.role === "assistant";
  const isToolUse = message.role === "tool_use";
  const isSkillUse = message.role === "skill_use";
  const isAuthRequest = message.role === "authorization_request";
  const isAgentMessage = !!message.sender_agent_role;

  const timestamp = message.timestamp ? formatDateTime(message.timestamp, locale) : null;

  // Handle authorization_request message type (always show)
  if (isAuthRequest && message.metadata?.authorization) {
    return (
      <div className="flex justify-start">
        <AuthorizationRequestMessage authorization={message.metadata.authorization} className="max-w-[80%]" />
      </div>
    );
  }

  // Handle tool_use message type
  if (isToolUse && message.metadata?.tool_invocations) {
    // Hide if user has toggled tool calls off
    if (hideToolCalls) return null;

    return (
      <div className="flex justify-start">
        <ToolInvocationGroup invocations={message.metadata.tool_invocations} className="max-w-[80%]" />
      </div>
    );
  }

  // Handle skill_use message type (always show)
  if (isSkillUse && message.metadata?.skills) {
    return (
      <div className="flex justify-start">
        <SkillInvocationMessage skills={message.metadata.skills} className="max-w-[80%]" />
      </div>
    );
  }

  const isArchitecture = message.type === "architecture";

  return (
    <div className={cn("flex gap-2", isAgentMessage ? "justify-start" : "justify-end")}>
      {isAgentMessage && (
        <div className="flex flex-col items-center gap-1 mt-1">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
            {message.sender_agent_role?.[0] || "A"}
          </div>
          <Badge variant="outline" className="text-xs">
            {message.sender_agent_role}
          </Badge>
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3 break-words overflow-wrap-anywhere min-w-0",
          isUser && "bg-primary/10 text-primary",
          isSystem && "bg-muted/30 text-muted-foreground",
          isAssistant && !isAgentMessage && "bg-success/10 text-success",
          isAgentMessage && "bg-muted"
        )}
        style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
      >
        {isArchitecture ? (
          <ArchitectureMessage
            mermaidCode={message.mermaid_code || ""}
            senderRole={message.sender_agent_role || ""}
            senderName={message.sender_agent_name}
            content={message.content || ""}
            version={message.architecture_version}
          />
        ) : (
          <>
            <div className="text-xs opacity-60 mb-1 flex items-center justify-between gap-2">
              <span>{isAgentMessage ? message.sender_agent_role : t.chat.roles[message.role]}</span>
              {timestamp && <span className="text-[10px]">{timestamp}</span>}
            </div>
            {message.content && (
              <div className={cn(isStreaming && "animate-pulse")}>
                <Markdown content={message.content} />
              </div>
            )}
          </>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentDisplay attachments={message.attachments} />
        )}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <ToolCallDisplay toolCalls={message.tool_calls} />
        )}
      </div>
    </div>
  );
});
