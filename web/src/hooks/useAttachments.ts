import { useState, useCallback } from "react";
import { api } from "@/lib/api";

export interface Attachment {
  id: string;
  type: "file" | "image";
  name: string;
  size: number;
  mimeType: string;
  localFile?: File;
  preview?: string;
  uploadStatus: "pending" | "uploading" | "uploaded" | "error";
  uploadProgress?: number;
  serverPath?: string;
  error?: string;
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addAttachment = useCallback((file: File) => {
    const id = `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const type = file.type.startsWith("image/") ? "image" : "file";

    const attachment: Attachment = {
      id,
      type,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      localFile: file,
      uploadStatus: "pending",
      uploadProgress: 0,
    };

    // Create preview for images
    if (type === "image") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = e.target?.result as string;
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, preview } : a))
        );
      };
      reader.readAsDataURL(file);
    }

    setAttachments((prev) => [...prev, attachment]);
    return id;
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const updateAttachmentStatus = useCallback(
    (id: string, status: Attachment["uploadStatus"]) => {
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, uploadStatus: status } : a))
      );
    },
    []
  );

  const updateAttachmentProgress = useCallback((id: string, progress: number) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, uploadProgress: progress } : a))
    );
  }, []);

  const updateAttachmentPath = useCallback((id: string, serverPath: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, serverPath } : a))
    );
  }, []);

  const setAttachmentError = useCallback((id: string, error: string) => {
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, uploadStatus: "error", error } : a
      )
    );
  }, []);

  const uploadAttachment = useCallback(
    async (id: string, sessionId: string) => {
      const attachment = attachments.find((a) => a.id === id);
      if (!attachment || !attachment.localFile) {
        throw new Error("Attachment not found");
      }

      updateAttachmentStatus(id, "uploading");

      try {
        const result = await api.uploadAttachment(
          attachment.localFile,
          sessionId,
          (progress) => {
            updateAttachmentProgress(id, progress);
          }
        );

        console.log("[useAttachments] Upload result:", result);
        updateAttachmentPath(id, result.url);
        updateAttachmentStatus(id, "uploaded");

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        setAttachmentError(id, message);
        throw error;
      }
    },
    [
      attachments,
      updateAttachmentStatus,
      updateAttachmentProgress,
      updateAttachmentPath,
      setAttachmentError,
    ]
  );

  const uploadAll = useCallback(
    async (sessionId: string) => {
      const pending = attachments.filter((a) => a.uploadStatus === "pending");

      // Get BASE URL for Electron environment
      const BASE = typeof window !== 'undefined' && (window as any).electronAPI
        ? 'http://localhost:8642'
        : '';

      const results = await Promise.all(
        pending.map(async (a) => {
          const result = await uploadAttachment(a.id, sessionId);
          // Convert relative URL to absolute URL for Electron
          const absoluteUrl = result.url.startsWith('http')
            ? result.url
            : `${BASE}${result.url}`;
          return {
            id: a.id,
            name: a.name,
            type: a.type as "file" | "image",
            size: a.size,
            url: absoluteUrl,
          };
        })
      );

      return results;
    },
    [attachments, uploadAttachment]
  );

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const allUploaded = attachments.every((a) => a.uploadStatus === "uploaded");
  const hasAttachments = attachments.length > 0;
  const isUploading = attachments.some((a) => a.uploadStatus === "uploading");

  return {
    attachments,
    addAttachment,
    removeAttachment,
    uploadAttachment,
    uploadAll,
    clearAttachments,
    allUploaded,
    hasAttachments,
    isUploading,
  };
}
