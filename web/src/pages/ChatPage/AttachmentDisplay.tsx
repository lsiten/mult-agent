import { File, Download } from "lucide-react";
import { LazyImage } from "@/components/LazyImage";
import { formatBytes } from "@/lib/date";
import { useI18n } from "@/i18n";

interface Attachment {
  id: string;
  name: string;
  type: "file" | "image";
  size: number;
  url: string;
}

interface AttachmentDisplayProps {
  attachments: Attachment[];
}

export function AttachmentDisplay({ attachments }: AttachmentDisplayProps) {
  const { locale } = useI18n();
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((att) => {
        if (att.type === "image") {
          return (
            <div key={att.id} className="relative group">
              <LazyImage
                src={att.url}
                alt={att.name}
                className="max-w-sm max-h-64 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(att.url, "_blank")}
              />
              <div className="absolute bottom-2 right-2 bg-background/90 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                {att.name}
              </div>
            </div>
          );
        }

        // File attachment
        return (
          <a
            key={att.id}
            href={att.url}
            download={att.name}
            className="flex items-center gap-2 p-2 bg-card border border-border rounded hover:bg-accent transition-colors"
          >
            <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{att.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(att.size, locale)}
              </div>
            </div>
            <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </a>
        );
      })}
    </div>
  );
}
