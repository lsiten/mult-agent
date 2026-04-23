import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import { type SessionMessage } from "@/lib/api";
import { type Attachment } from "@/hooks/useAttachments";
import { useI18n } from "@/i18n";

interface ChatAreaProps {
  sessionId: string | null;
  sessionTitle: string | null;
  messages: SessionMessage[];
  streamingContent: string;
  isStreaming: boolean;
  toolUseMessages: SessionMessage[];
  skillUseMessages: SessionMessage[];
  authRequestMessages: SessionMessage[];
  currentTool?: { name: string; startTime: number } | null;
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onStopTask: () => void;
  onTitleUpdate: (title: string) => void;
  onDeleteSession: () => void;
  attachments: Attachment[];
  onFileSelect: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  allUploaded: boolean;
}

export function ChatArea({
  sessionId,
  sessionTitle,
  messages,
  streamingContent,
  isStreaming,
  toolUseMessages,
  skillUseMessages,
  authRequestMessages,
  currentTool,
  isLoading,
  onSendMessage,
  onStopTask,
  onTitleUpdate,
  onDeleteSession,
  attachments,
  onFileSelect,
  onRemoveAttachment,
  allUploaded,
}: ChatAreaProps) {
  const { t } = useI18n();

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="text-lg font-semibold">{t.chat.title}</div>
          <div className="text-sm">{t.chat.emptyState}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Chat Header */}
      <div className="flex-shrink-0">
        <ChatHeader
          sessionId={sessionId}
          title={sessionTitle || t.chat.newChat}
          onTitleUpdate={onTitleUpdate}
          onDelete={onDeleteSession}
        />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden px-6">
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
          toolUseMessages={toolUseMessages}
          skillUseMessages={skillUseMessages}
          authRequestMessages={authRequestMessages}
        />
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="flex-shrink-0 overflow-hidden">
        <InputArea
          onSendMessage={onSendMessage}
          onStopTask={onStopTask}
          disabled={isStreaming || isLoading}
          isStreaming={isStreaming}
          currentTool={currentTool}
          attachments={attachments}
          onFileSelect={onFileSelect}
          onRemoveAttachment={onRemoveAttachment}
          allUploaded={allUploaded}
        />
      </div>
    </div>
  );
}
