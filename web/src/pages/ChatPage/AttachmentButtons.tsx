import { useRef } from "react";
import { Paperclip, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

interface AttachmentButtonsProps {
  onFileSelect: (files: File[]) => void;
  disabled?: boolean;
}

const ALLOWED_FILE_TYPES = [
  // Text files
  ".txt",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  // Code files
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".java",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  // Documents
  ".pdf",
  // Other
  ".csv",
  ".xml",
  ".html",
  ".css",
];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function AttachmentButtons({ onFileSelect, disabled }: AttachmentButtonsProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`文件 ${file.name} 超过 10MB 限制`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      onFileSelect(validFiles);
    }

    // Reset input
    if (e.target) {
      e.target.value = "";
    }
  };

  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title={t.chat.attachFile}
        className="h-9 w-9 p-0"
      >
        <Paperclip className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => imageInputRef.current?.click()}
        disabled={disabled}
        title={t.chat.attachImage}
        className="h-9 w-9 p-0"
      >
        <ImageIcon className="h-4 w-4" />
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_FILE_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />

      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept={IMAGE_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
