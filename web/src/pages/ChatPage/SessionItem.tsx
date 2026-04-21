import { useState, memo } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type SessionInfo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/date";
import { useI18n } from "@/i18n";

interface SessionItemProps {
  session: SessionInfo;
  isActive: boolean;
  isFocused?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export const SessionItem = memo(function SessionItem({ session, isActive, isFocused = false, onSelect, onDelete }: SessionItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { locale } = useI18n();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除此会话吗？")) {
      onDelete();
    }
  };

  const displayTitle = session.title || session.preview || "未命名会话";
  const truncatedTitle = displayTitle.length > 30
    ? displayTitle.slice(0, 30) + "..."
    : displayTitle;

  const relativeTime = formatRelativeTime(session.last_active, locale);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        isActive && "bg-primary/10 text-primary",
        !isActive && isFocused && "ring-2 ring-primary/50",
        !isActive && !isFocused && "hover:bg-accent/50 text-foreground"
      )}
    >
      <MessageSquare className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{truncatedTitle}</div>
        <div className="text-xs text-muted-foreground">
          {relativeTime}
          {session.message_count > 0 && ` · ${session.message_count} 条消息`}
        </div>
      </div>

      {(isHovered || isActive) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          className="w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
});
