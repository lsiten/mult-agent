import { useState, useEffect, useRef, useCallback } from "react";
import { Send, X, Loader2 } from "lucide-react";
import { AttachmentButtons } from "./AttachmentButtons";
import { AttachmentPreview } from "./AttachmentPreview";
import { VoiceInput } from "./VoiceInput";
import { SkillSelector } from "@/components/chat/SkillSelector";
import { SkillBadge } from "@/components/skills/SkillBadge";
import { TiptapEditor, type TiptapEditorRef } from "@/components/chat/TiptapEditor";
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
  currentCompanyId?: number;
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
  currentCompanyId,
}: InputAreaProps) {
  const { t } = useI18n();
  const { skills, selectedSkills, deselectSkill } = useSkillSelectionStore();
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [toolElapsedTime, setToolElapsedTime] = useState(0);
  const editorRef = useRef<TiptapEditorRef>(null);

  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      if (!disabled && editorRef.current) {
        editorRef.current.focus();
      }
    });
  }, [disabled]);

  // Update elapsed time every second when a tool is running
  useEffect(() => {
    if (!currentTool) {
      const id = setTimeout(() => setToolElapsedTime(0), 0);
      return () => clearTimeout(id);
    }

    const interval = setInterval(() => {
      setToolElapsedTime(Math.floor((Date.now() - currentTool.startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentTool]);

  // Re-focus when the input becomes available again
  useEffect(() => {
    restoreFocus();
  }, [restoreFocus]);

  // Dynamic placeholder based on selected skills
  const placeholder = selectedSkills.length > 0
    ? `${t.chat.placeholder} (${selectedSkills.length} ${t.chat.skillSelector.selected})`
    : t.chat.placeholder;

  const canSend =
    !disabled &&
    (input.trim().length > 0 || (attachments.length > 0 && allUploaded));

  const handleSend = () => {
    if (!canSend) return;
    onSendMessage(input || "");
    setInput("");
    editorRef.current?.clear();
    restoreFocus();
  };

  const handleVoiceTranscription = (text: string) => {
    setInput((prev) => (prev ? `${prev}\n${text}` : text));
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
                const skill = skills.find((s) => s.name === skillName);
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

        <div className="flex gap-2 flex-shrink-0">
          <div className="flex gap-1 items-center">
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

          {/* Input + Send button container */}
          <div className="flex-1 flex items-stretch gap-0 rounded-md shadow-[0_0_0_1px_hsl(var(--border)/0.5)] focus-within:shadow-[0_0_0_1px_hsl(var(--foreground)/0.25)] transition-shadow overflow-hidden relative">
            <TiptapEditor
              ref={editorRef}
              value={input}
              onChange={setInput}
              onSend={handleSend}
              placeholder={placeholder}
              currentCompanyId={currentCompanyId}
              className="flex-1"
            />

            <button
              onClick={(e) => {
                e.preventDefault();
                if (isStreaming) {
                  onStopTask();
                } else {
                  handleSend();
                }
              }}
              onMouseDown={(e) => e.preventDefault()}
              disabled={!isStreaming && !canSend}
              type="button"
              className={`w-12 h-full shrink-0 rounded-none inline-flex items-center justify-center transition-colors border-0 outline-none focus:outline-none focus-visible:outline-none ${
                isStreaming
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-foreground/90 text-background hover:bg-foreground"
              } disabled:opacity-50 disabled:pointer-events-none`}
              title={
                isStreaming
                  ? t.chat.stopTask || "停止任务"
                  : !allUploaded && attachments.length > 0
                    ? t.chat.waitForUpload
                    : undefined
              }
            >
              {isStreaming ? (
                <X className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
