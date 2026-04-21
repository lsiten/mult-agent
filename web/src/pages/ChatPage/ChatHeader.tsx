import { useState } from "react";
import { Edit2, Trash2, Check, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatSettingsStore } from "@/stores/useChatSettingsStore";
import { useI18n } from "@/i18n";

interface ChatHeaderProps {
  sessionId: string;
  title: string;
  onTitleUpdate: (title: string) => void;
  onDelete: () => void;
}

export function ChatHeader({
  title,
  onTitleUpdate,
  onDelete,
}: ChatHeaderProps) {
  const { t } = useI18n();
  const { hideToolCalls, toggleToolCallsVisibility } = useChatSettingsStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onTitleUpdate(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="border-b border-border/50 bg-card/30 px-6 py-3 flex items-center justify-between">
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            className="h-8"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className="h-8 w-8 p-0"
            title={t.common.save || "保存"}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-8 w-8 p-0"
            title={t.common.cancel || "取消"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold truncate flex-1">{title}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleToolCallsVisibility}
              className="h-8 w-8 p-0"
              title={hideToolCalls ? t.chat.toolInvocation.showToolCalls : t.chat.toolInvocation.hideToolCalls}
            >
              {hideToolCalls ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-8 w-8 p-0"
              title={t.chat.editTitle || "编辑标题"}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 w-8 p-0 text-error hover:text-error"
              title={t.chat.deleteSession || "删除会话"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
