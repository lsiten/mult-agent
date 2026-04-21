import { memo } from "react";
import { X, File, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Attachment } from "@/hooks/useAttachments";
import { formatBytes } from "@/lib/date";
import { useI18n } from "@/i18n";

interface AttachmentPreviewProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
}

function getFileIcon(type: string) {
  if (type === "image") {
    return <ImageIcon className="h-5 w-5" />;
  }
  return <File className="h-5 w-5" />;
}

export const AttachmentPreview = memo(function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const { locale } = useI18n();

  const statusColor = {
    pending: "border-border",
    uploading: "border-primary",
    uploaded: "border-success",
    error: "border-error",
  }[attachment.uploadStatus];

  // Show image thumbnail for images
  const showThumbnail = attachment.type === "image" && attachment.preview;

  return (
    <div
      className={`flex items-center gap-2 p-2 border ${statusColor} rounded-lg bg-card min-w-0`}
      style={{ width: '100%', maxWidth: '100%' }}
    >
      {showThumbnail ? (
        <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-muted">
          <img
            src={attachment.preview}
            alt={attachment.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="text-muted-foreground flex-shrink-0">
          {getFileIcon(attachment.type)}
        </div>
      )}

      <div className="flex-1 min-w-0 overflow-hidden" style={{ width: 0 }}>
        <div className="text-sm font-medium truncate whitespace-nowrap overflow-hidden text-ellipsis" title={attachment.name}>{attachment.name}</div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(attachment.size, locale)}
        </div>

        {attachment.uploadStatus === "uploading" && attachment.uploadProgress !== undefined && (
          <div className="w-full bg-border rounded-full h-1 mt-1">
            <div
              className="bg-primary h-1 rounded-full transition-all"
              style={{ width: `${attachment.uploadProgress}%` }}
            />
          </div>
        )}

        {attachment.uploadStatus === "error" && attachment.error && (
          <div className="text-xs text-error mt-1">{attachment.error}</div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {attachment.uploadStatus === "uploading" && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {attachment.uploadStatus === "uploaded" && (
          <div className="text-xs text-success">✓</div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(attachment.id)}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
