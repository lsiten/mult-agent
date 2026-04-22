import { useState, useEffect } from "react";
import { Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentButtons } from "./AttachmentButtons";
import { AttachmentPreview } from "./AttachmentPreview";
import { VoiceInput } from "./VoiceInput";
import { SkillSelector } from "@/components/chat/SkillSelector";
import { SkillBadge } from "@/components/skills/SkillBadge";
import { useSkillSelectionStore } from "@/stores/useSkillSelectionStore";
import { useI18n } from "@/i18n";
import { type Attachment } from "@/hooks/useAttachments";

interface InputAreaProps {
  onSendMessage: (content: string) => void;
  onStopTask: () => void;
  disabled: boolean;
  isStreaming: boolean;
  currentTool?: { name: string; startTime: number } | null;
  attachments: Attachment[];
  onFileSelect: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  allUploaded: boolean;
}

export function InputArea({
  onSendMessage,
  onStopTask,
  disabled,
  isStreaming,
  currentTool,
  attachments,
  onFileSelect,
  onRemoveAttachment,
  allUploaded,
}: InputAreaProps) {
  const { t } = useI18n();
  const { skills, selectedSkills, deselectSkill } = useSkillSelectionStore();
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [toolElapsedTime, setToolElapsedTime] = useState(0);

  // Update elapsed time every second when a tool is running
  useEffect(() => {
    if (!currentTool) {
      setToolElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setToolElapsedTime(Math.floor((Date.now() - currentTool.startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentTool]);

  const canSend = !disabled && (input.trim() || (attachments.length > 0 && allUploaded));

  // Dynamic placeholder based on selected skills
  const placeholder = selectedSkills.length > 0
    ? `${t.chat.placeholder} (${selectedSkills.length} ${t.chat.skillSelector.selected})`
    : t.chat.placeholder;

  const handleSend = () => {
    if (!canSend) return;

    // Allow sending with just attachments or with text
    onSendMessage(input || "");
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTranscription = (text: string) => {
    // Append transcribed text to input
    setInput(prev => prev ? `${prev}\n${text}` : text);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileSelect(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith("image/"));

    if (imageItems.length > 0) {
      const files: File[] = [];
      imageItems.forEach(item => {
        const file = item.getAsFile();
        if (file) files.push(file);
      });

      if (files.length > 0) {
        onFileSelect(files);
      }
    }
  };

  return (
    <div
      className="border-t border-border/50 bg-card/30 py-4 relative max-h-[300px] flex flex-col overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
          <div className="text-primary font-semibold">
            拖放文件到此处
          </div>
        </div>
      )}

      <div className="px-6 flex flex-col min-w-0 overflow-hidden">
        {/* Current Tool Progress */}
        {isStreaming && currentTool && (
          <div className="mb-2 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                {currentTool.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {toolElapsedTime}s
              </span>
              <button
                onClick={onStopTask}
                className="ml-auto p-1 hover:bg-red-500/20 rounded transition-colors"
                title={t.chat.stopTask || "停止任务"}
              >
                <X className="h-4 w-4 text-red-500" />
              </button>
            </div>
          </div>
        )}

        {/* Selected Skills Display */}
        {selectedSkills.length > 0 && (
          <div className="mb-2 flex-shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {selectedSkills.map((skillName) => {
                const skill = skills.find(s => s.name === skillName);
                const unavailable = skill && !skill.enabled;
                return (
                  <SkillBadge
                    key={skillName}
                    name={skillName}
                    category={skill?.category}
                    unavailable={unavailable}
                    onRemove={() => deselectSkill(skillName)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="mb-3 max-h-[120px] overflow-y-auto overflow-x-hidden space-y-2 border-b border-border/30 pb-3 flex-shrink-0 min-w-0">
            <div className="flex flex-col gap-2 min-w-0">
              {attachments.map((att) => (
                <AttachmentPreview
                  key={att.id}
                  attachment={att}
                  onRemove={onRemoveAttachment}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-shrink-0 items-end">
          <div className="flex gap-1">
            <SkillSelector />
            <AttachmentButtons
              onFileSelect={onFileSelect}
              disabled={disabled}
            />
            <VoiceInput
              onTranscription={handleVoiceTranscription}
              disabled={disabled}
            />
          </div>

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            className="resize-none min-h-[60px] max-h-[200px] flex-1"
            disabled={disabled}
          />

          <Button
            onClick={isStreaming ? onStopTask : handleSend}
            disabled={!isStreaming && !canSend}
            className="self-end"
            variant={isStreaming ? "destructive" : "default"}
            title={
              isStreaming
                ? t.chat.stopTask || "停止任务"
                : (!allUploaded && attachments.length > 0
                    ? t.chat.waitForUpload
                    : undefined)
            }
          >
            {isStreaming ? (
              <X className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
