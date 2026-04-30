import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./ChatPage/Sidebar";
import { ChatArea } from "./ChatPage/ChatArea";
import { useSessions } from "@/hooks/useSessions";
import { useStreamingResponse } from "@/hooks/useStreamingResponse";
import { useAttachments } from "@/hooks/useAttachments";
import { useSkillSelectionStore } from "@/stores/useSkillSelectionStore";
import { useToast } from "@/hooks/useToast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { WorkScope } from "@/components/WorkSelector";
import { api, type SessionMessage } from "@/lib/api";

export function ChatPage({ scope }: { scope?: WorkScope }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { showToast } = useToast();
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const attemptedResumeSessionsRef = useRef<Set<string>>(new Set());
  const { selectedSkills, clearSelection: clearSkills } = useSkillSelectionStore();

  const location = useLocation();

  // ``agentId`` query parameter selects which provisioned sub-agent should
  // drive this chat.  ``null`` means the master agent.  The global
  // ``AgentIdentitySwitcher`` in the app header is the sole UI that mutates
  // this query parameter; we just consume it here to thread ``agentId``
  // through to the streaming endpoint.
  const activeAgentId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("agentId");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);

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
  } = useSessions("electron-chat", activeAgentId);

  const {
    streamingContent,
    isStreaming,
    toolUseMessages,
    skillUseMessages,
    authRequestMessages,
    textSegments,
    currentTool,
    startStreaming,
    resumeStreaming,
    stopStreaming,
    resetStreamingState,
  } = useStreamingResponse(currentSessionId);
  const resumeStreamingRef = useRef(resumeStreaming);
  const resetStreamingStateRef = useRef(resetStreamingState);

  useEffect(() => {
    resumeStreamingRef.current = resumeStreaming;
    resetStreamingStateRef.current = resetStreamingState;
  }, [resumeStreaming, resetStreamingState]);

  const {
    attachments,
    addAttachment,
    removeAttachment,
    uploadAll,
    clearAttachments,
    allUploaded,
    isUploading,
  } = useAttachments();

  useEffect(() => {
    if (currentSessionId) {
      attemptedResumeSessionsRef.current.delete(currentSessionId);
    }
  }, [currentSessionId]);

  // Compute grouped sessions
  const groupedSessions = groupSessions(sessions);

  // Compute current session title (same fallback logic as SessionItem)
  const currentSessionTitle = useMemo(() => {
    if (!currentSessionId) return null;
    const session = sessions.find(s => s.id === currentSessionId);
    // Use title, fallback to preview, then to "新对话"
    return session?.title || session?.preview || "新对话";
  }, [sessions, currentSessionId]);

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
    if (sessionId === currentSessionId) {
      return;
    }
    // Refresh sessions list first to get latest titles
    await loadSessions(activeAgentId || undefined);
    // Then switch to the selected session
    switchSession(sessionId);
    // Messages will be loaded by useEffect when currentSessionId changes
  }, [currentSessionId, switchSession, loadSessions, activeAgentId]);

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

  const refreshCurrentSessionState = useCallback(async (sessionId: string) => {
    const [messageResponse, sessionResponse] = await Promise.all([
      api.getSessionMessages(sessionId),
      loadSessions(),
    ]);

    const latestSession = sessionResponse.sessions.find(
      session => session.id === sessionId
    );

    return {
      messages: messageResponse.messages || [],
      isActive: Boolean(latestSession?.has_active_stream || latestSession?.is_active),
    };
  }, [loadSessions]);

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

    attemptedResumeSessionsRef.current.delete(sid);

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

    // Update session title immediately if it's still default
    const currentSession = sessions.find(s => s.id === sid);
    console.log("[ChatPage] Current session:", currentSession?.id, "title:", currentSession?.title);
    const isDefaultTitle = !currentSession?.title ||
                          currentSession.title.trim() === "" ||
                          currentSession.title.startsWith("新对话 ");
    console.log("[ChatPage] isDefaultTitle:", isDefaultTitle);

    if (isDefaultTitle) {
      // Generate title from first 30 chars of message
      const newTitle = content.slice(0, 30) + (content.length > 30 ? "..." : "");
      console.log("[ChatPage] Updating title immediately:", newTitle);

      // Update backend first
      try {
        await updateSessionTitle(sid, newTitle);
        console.log("[ChatPage] Title updated successfully");
      } catch (err) {
        console.error("[ChatPage] Failed to update title:", err);
      }
    } else {
      console.log("[ChatPage] Skipping title update, not default title");
    }

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
      const finalContent = await startStreaming(sid, content, attachmentData, skillsToSend, activeAgentId);
      console.log("[ChatPage] Streaming completed, final content length:", finalContent.length);

      // After streaming completes, reload messages from backend to get the split messages
      console.log("[ChatPage] Reloading messages from backend...");
      const response = await api.getSessionMessages(sid);
      setMessages(response.messages);
      console.log("[ChatPage] Messages reloaded, count:", response.messages.length);

      // Reload sessions to get updated title from backend
      console.log("[ChatPage] Reloading sessions to fetch updated title...");
      await loadSessions();
      console.log("[ChatPage] Sessions reloaded, current sessions:", sessions.length);
    } catch (error) {
      console.error("[ChatPage] Streaming error:", error);

      if (error instanceof Error && error.message.includes("Session already has an active stream")) {
        try {
          attemptedResumeSessionsRef.current.add(sid);
          await resumeStreamingRef.current(sid, activeAgentId);
          return;
        } catch (resumeError) {
          console.error("[ChatPage] Failed to resume existing active stream:", resumeError);
        }
      }

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

  // Load messages when the selected session changes.
  // Do not depend on `isStreaming`, otherwise a newly-sent optimistic user
  // message gets overwritten by stale backend data right after send.
  useEffect(() => {
    let cancelled = false;

    if (currentSessionId) {
      void refreshCurrentSessionState(currentSessionId)
        .then(({ messages: nextMessages, isActive }) => {
          if (cancelled) return;

          setMessages(nextMessages);

          if (isActive && !attemptedResumeSessionsRef.current.has(currentSessionId)) {
            attemptedResumeSessionsRef.current.add(currentSessionId);
            void resumeStreamingRef.current(currentSessionId, activeAgentId).catch(error => {
              console.error("[ChatPage] Failed to resume active session:", error);
            });
          } else if (!isActive) {
            attemptedResumeSessionsRef.current.delete(currentSessionId);
          }
        })
        .catch(error => {
          if (cancelled) return;
          console.error("Failed to load messages:", error);
          setMessages([]);
        });
    } else {
      setMessages([]);
    }

    return () => {
      cancelled = true;
    };
  }, [activeAgentId, currentSessionId, refreshCurrentSessionState]);
  const effectiveIsStreaming = isStreaming;

  // Clear in-memory chat state whenever the active agent identity changes
  // so that stale transcripts from the previous master/sub-agent scope are
  // not visible during the brief window before ``useSessions`` reloads the
  // new scope's session list.  Scheduled via setTimeout(0) to avoid the
  // cascading-render lint (the same pattern used elsewhere in ChatPage).
  useEffect(() => {
    const tid = setTimeout(() => setMessages([]), 0);
    return () => clearTimeout(tid);
  }, [activeAgentId]);

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

  const currentCompanyId = scope?.type === "company" ? scope.company.id : undefined;

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
        sessionTitle={currentSessionTitle}
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={effectiveIsStreaming}
        toolUseMessages={toolUseMessages}
        skillUseMessages={skillUseMessages}
        authRequestMessages={authRequestMessages}
        textSegments={textSegments}
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
        currentCompanyId={currentCompanyId}
      />
    </div>
  );
}
