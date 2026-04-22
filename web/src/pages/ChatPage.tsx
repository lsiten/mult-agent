import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./ChatPage/Sidebar";
import { ChatArea } from "./ChatPage/ChatArea";
import { useSessions } from "@/hooks/useSessions";
import { useStreamingResponse } from "@/hooks/useStreamingResponse";
import { useAttachments } from "@/hooks/useAttachments";
import { useSkillSelectionStore } from "@/stores/useSkillSelectionStore";
import { useToast } from "@/hooks/useToast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { api, type SessionMessage } from "@/lib/api";

export function ChatPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { showToast } = useToast();
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const { selectedSkills, clearSelection: clearSkills } = useSkillSelectionStore();

  const {
    sessions,
    currentSessionId,
    isLoading: sessionsLoading,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    groupSessions,
    loadSessions,
  } = useSessions();

  const {
    streamingContent,
    isStreaming,
    toolUseMessages,
    skillUseMessages,
    currentTool,
    startStreaming,
    stopStreaming,
  } = useStreamingResponse();

  const {
    attachments,
    addAttachment,
    removeAttachment,
    uploadAll,
    clearAttachments,
    allUploaded,
    isUploading,
  } = useAttachments();

  // Compute grouped sessions
  const groupedSessions = groupSessions(sessions);

  const handleNewChat = useCallback(async () => {
    try {
      const newSessionId = await createSession();
      if (newSessionId) {
        setMessages([]);
      }
    } catch (error) {
      showToast("创建会话失败", "error");
    }
  }, [createSession, showToast]);

  const handleSessionSelect = useCallback(async (sessionId: string) => {
    await switchSession(sessionId);
    // Messages will be loaded by useEffect when currentSessionId changes
  }, [switchSession]);

  const handleSessionDelete = useCallback(async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      showToast("会话已删除", "success");
    } catch (error) {
      showToast("删除会话失败", "error");
    }
  }, [deleteSession, showToast]);

  const handleTitleUpdate = useCallback(async (title: string) => {
    if (!currentSessionId) return;

    try {
      await updateSessionTitle(currentSessionId, title);
      showToast("标题已更新", "success");
    } catch (error) {
      showToast("更新标题失败", "error");
    }
  }, [currentSessionId, updateSessionTitle, showToast]);

  const handleCurrentSessionDelete = useCallback(() => {
    if (currentSessionId) {
      handleSessionDelete(currentSessionId);
    }
  }, [currentSessionId, handleSessionDelete]);

  const handleSendMessage = async (content: string) => {
    console.log("[ChatPage] handleSendMessage called with:", content);
    let sid = currentSessionId;
    console.log("[ChatPage] Current session ID:", sid);

    // Create session if none exists
    if (!sid) {
      try {
        sid = await createSession();
        console.log("[ChatPage] Created new session:", sid);
        if (!sid) {
          showToast("创建会话失败", "error");
          return;
        }
        // Clear messages when creating new session
        setMessages([]);
      } catch (error) {
        console.error("[ChatPage] Failed to create session:", error);
        showToast("创建会话失败", "error");
        return;
      }
    }

    // Upload attachments first if any and get the uploaded data
    let attachmentData: Array<{id: string, name: string, type: "file" | "image", size: number, url: string}> | undefined;
    if (attachments.length > 0) {
      try {
        const uploaded = await uploadAll(sid);
        attachmentData = uploaded.length > 0 ? uploaded : undefined;
        console.log("[ChatPage] Uploaded attachment data:", attachmentData);
      } catch (error) {
        showToast("文件上传失败", "error");
        return;
      }
    }

    // Save selected skills before clearing
    const skillsToSend = [...selectedSkills];

    // Clear attachments and selected skills from input immediately after sending
    clearAttachments();
    clearSkills();

    // Add user message to display with attachments
    const userMsg: SessionMessage = {
      role: "user",
      content,
      timestamp: Date.now() / 1000,
      attachments: attachmentData,
    };
    setMessages(prev => [...prev, userMsg]);

    // Start streaming with attachments and selected skills
    console.log("[ChatPage] Starting stream with session:", sid, "skills:", skillsToSend);
    try {
      const finalContent = await startStreaming(sid, content, attachmentData, skillsToSend);
      console.log("[ChatPage] Streaming completed, final content length:", finalContent.length);

      // After streaming completes, add assistant message
      const assistantMsg: SessionMessage = {
        role: "assistant",
        content: finalContent,
        timestamp: Date.now() / 1000,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Reload sessions to get updated title from backend
      await loadSessions();
    } catch (error) {
      console.error("[ChatPage] Streaming error:", error);

      // Check if error is due to invalid skills
      if (error instanceof Error && error.message.includes("Unknown skills")) {
        showToast("所选技能不可用，请重新选择", "error");
      } else if (error instanceof Error && error.message.includes("Cannot change skills")) {
        showToast("无法在会话中途更改技能", "error");
      } else {
        showToast(error instanceof Error ? error.message : "发送失败", "error");
      }
    }
  };

  const handleFileSelect = useCallback((files: File[]) => {
    files.forEach(file => addAttachment(file));
  }, [addAttachment]);

  // Load messages when currentSessionId changes
  useEffect(() => {
    if (currentSessionId) {
      api.getSessionMessages(currentSessionId)
        .then(data => setMessages(data.messages || []))
        .catch(error => {
          console.error("Failed to load messages:", error);
          setMessages([]);
        });
    } else {
      setMessages([]);
    }
  }, [currentSessionId]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      ctrlOrCmd: true,
      handler: handleNewChat,
      description: "新建会话",
    },
    {
      key: "/",
      ctrlOrCmd: true,
      handler: () => setSidebarCollapsed(!sidebarCollapsed),
      description: "切换侧边栏",
    },
    {
      key: "k",
      ctrlOrCmd: true,
      handler: () => {
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      description: "聚焦搜索",
    },
  ]);

  return (
    <div className="flex h-full">
      <Sidebar
        sessions={sessions}
        groupedSessions={groupedSessions}
        currentSessionId={currentSessionId}
        isCollapsed={sidebarCollapsed}
        onNewChat={handleNewChat}
        onSessionSelect={handleSessionSelect}
        onSessionDelete={handleSessionDelete}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <ChatArea
        sessionId={currentSessionId}
        sessionTitle={sessions.find(s => s.id === currentSessionId)?.title || null}
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        toolUseMessages={toolUseMessages}
        skillUseMessages={skillUseMessages}
        currentTool={currentTool}
        isLoading={sessionsLoading || isUploading}
        onSendMessage={handleSendMessage}
        onStopTask={stopStreaming}
        onTitleUpdate={handleTitleUpdate}
        onDeleteSession={handleCurrentSessionDelete}
        attachments={attachments}
        onFileSelect={handleFileSelect}
        onRemoveAttachment={removeAttachment}
        allUploaded={allUploaded}
      />
    </div>
  );
}
