import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { api, type SessionMessage } from "@/lib/api";

export interface ToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  status: "pending" | "success" | "error";
}

interface SessionStreamingState {
  isStreaming: boolean;
  streamingContent: string;
  toolCalls: ToolCall[];
  toolUseMessages: SessionMessage[];
  skillUseMessages: SessionMessage[];
  authRequestMessages: SessionMessage[];
  textSegments: SessionMessage[];
  currentTool: { name: string; startTime: number } | null;
  error: string | null;
  // Saved parameters for resume
  lastMessage: string | null;
  lastAttachments: Array<{id: string, name: string, type: string, size: number, url: string}> | undefined;
  lastSelectedSkills: string[] | undefined;
  lastAgentId: number | null;
  retryCount: number;
  stopRequested: boolean;
}

type StreamingAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
};

type ToolInvocation = NonNullable<
  NonNullable<SessionMessage["metadata"]>["tool_invocations"]
>[number];

const defaultSessionState: SessionStreamingState = {
  isStreaming: false,
  streamingContent: "",
  toolCalls: [],
  toolUseMessages: [],
  skillUseMessages: [],
  authRequestMessages: [],
  textSegments: [],
  currentTool: null,
  error: null,
  lastMessage: null,
  lastAttachments: undefined,
  lastSelectedSkills: undefined,
  lastAgentId: null,
  retryCount: 0,
  stopRequested: false,
};

export function useStreamingResponse(currentSessionId: string | null = null) {
  // Store streaming state per session, so switching sessions restores correct state
  const [sessionStates, setSessionStates] = useState<Map<string, SessionStreamingState>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const currentMessageRef = useRef<string | null>(null);
  const currentAttachmentsRef = useRef<StreamingAttachment[] | undefined>(undefined);
  const currentSelectedSkillsRef = useRef<string[] | undefined>(undefined);
  const currentAgentIdRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const maxRetries = 3;

  // Get current session state
  const currentState = useMemo(() => {
    if (!currentSessionId) return defaultSessionState;
    return sessionStates.get(currentSessionId) ?? defaultSessionState;
  }, [currentSessionId, sessionStates]);

  const updateSessionState = useCallback((
    sessionId: string,
    updater: (prev: SessionStreamingState) => Partial<SessionStreamingState>,
  ) => {
    setSessionStates(prev => {
      const next = new Map(prev);
      const prevState = prev.get(sessionId) ?? defaultSessionState;
      next.set(sessionId, { ...prevState, ...updater(prevState) });
      return next;
    });
  }, []);

  const closeCurrentEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeCurrentEventSource();
    };
  }, [closeCurrentEventSource]);

  const {
    isStreaming,
    streamingContent,
    toolCalls,
    toolUseMessages,
    skillUseMessages,
    authRequestMessages,
    textSegments,
    currentTool,
    error,
  } = currentState;

  const connectStream = useCallback(async function connectStreamImpl({
    sessionId,
    url,
    message,
    attachments,
    selectedSkills,
    agentId,
    forceMaster = false,
    isRetry = false,
    isResume = false,
  }: {
    sessionId: string;
    url: string;
    message?: string | null;
    attachments?: StreamingAttachment[];
    selectedSkills?: string[];
    agentId?: number | null;
    forceMaster?: boolean;
    isRetry?: boolean;
    isResume?: boolean;
  }): Promise<string> {
    console.log("[SSE] Connecting:", url, isResume ? "(resume)" : "(new)", isRetry ? `(retry ${retryCountRef.current}/${maxRetries})` : "");
    closeCurrentEventSource();
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    return new Promise<string>((resolve, reject) => {
      let fullContent = isResume ? (sessionStates.get(sessionId)?.streamingContent ?? "") : "";
      const completedTextSegments: string[] = [];
      let serverErrorHandled = false;

      const closeEventSource = () => {
        eventSource.close();
        if (eventSourceRef.current === eventSource) {
          eventSourceRef.current = null;
        }
      };

      const flushFullContentSegment = () => {
        if (fullContent.trim()) {
          completedTextSegments.push(fullContent);
        }
        fullContent = "";
      };

      eventSource.addEventListener("connected", () => {
        console.log("[SSE] Connected:", sessionId, isResume ? "(resume)" : "(new)");
        updateSessionState(sessionId, prev => ({
          ...prev,
          isStreaming: true,
          error: null,
        }));
      });

      eventSource.addEventListener("resume_state", (event) => {
        try {
          const data = JSON.parse(event.data);
          const resumedInvocations = Array.isArray(data.tool_invocations) ? data.tool_invocations : [];
          const resumedMessages: SessionMessage[] = resumedInvocations.map((inv: ToolInvocation) => ({
            role: "tool_use",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: { tool_invocations: [inv] },
          }));

          fullContent = typeof data.streaming_content === "string" ? data.streaming_content : "";

          updateSessionState(sessionId, prev => ({
            ...prev,
            isStreaming: true,
            error: null,
            streamingContent: fullContent,
            toolUseMessages: resumedMessages,
            currentTool: data.current_tool
              ? {
                  name: data.current_tool.name,
                  startTime: Number(data.current_tool.startTime) || Date.now(),
                }
              : null,
          }));
        } catch (err) {
          console.error("Failed to parse resume_state event:", err);
        }
      });

      eventSource.addEventListener("content", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.delta) {
            fullContent += data.delta;
            updateSessionState(sessionId, () => ({
              streamingContent: fullContent,
            }));
          }
        } catch (err) {
          console.error("Failed to parse content event:", err);
          updateSessionState(sessionId, () => ({
            ...defaultSessionState,
            error: "Failed to parse server response",
          }));
          closeEventSource();
          reject(new Error("Failed to parse content event from server"));
        }
      });

      eventSource.addEventListener("tool_call", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.tool && data.args) {
            const toolCall: ToolCall = {
              id: `tool_${Date.now()}`,
              tool: data.tool,
              args: data.args,
              status: "pending",
            };
            updateSessionState(sessionId, prev => ({
              toolCalls: [...prev.toolCalls, toolCall],
            }));
          }
        } catch (err) {
          console.error("Failed to parse tool_call event:", err);
        }
      });

      eventSource.addEventListener("tool_use", (event) => {
        try {
          const data = JSON.parse(event.data);
          const newInvocations = data.invocations || [];
          const newMessages: SessionMessage[] = newInvocations.map((inv: ToolInvocation) => ({
            role: "tool_use",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: {
              tool_invocations: [inv],
            },
          }));

          updateSessionState(sessionId, prev => {
            const nextTextSegments = prev.streamingContent.trim()
              ? [
                  ...prev.textSegments,
                  {
                    role: "assistant" as const,
                    content: prev.streamingContent,
                    timestamp: Date.now() / 1000,
                  },
                ]
              : prev.textSegments;

            return {
              streamingContent: "",
              textSegments: nextTextSegments,
              toolUseMessages: [...prev.toolUseMessages, ...newMessages],
            };
          });
          flushFullContentSegment();
        } catch (err) {
          console.error("Failed to parse tool_use event:", err);
        }
      });

      eventSource.addEventListener("skill_loaded", (event) => {
        try {
          const data = JSON.parse(event.data);
          const skillMessage: SessionMessage = {
            role: "skill_use",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: {
              skills: data.skills || [],
            },
          };
          updateSessionState(sessionId, prev => {
            const nextTextSegments = prev.streamingContent.trim()
              ? [
                  ...prev.textSegments,
                  {
                    role: "assistant" as const,
                    content: prev.streamingContent,
                    timestamp: Date.now() / 1000,
                  },
                ]
              : prev.textSegments;

            return {
              streamingContent: "",
              textSegments: nextTextSegments,
              skillUseMessages: [...prev.skillUseMessages, skillMessage],
            };
          });
          flushFullContentSegment();
        } catch (err) {
          console.error("Failed to parse skill_loaded event:", err);
        }
      });

      eventSource.addEventListener("authorization_request", (event) => {
        try {
          const data = JSON.parse(event.data);
          const authMessage: SessionMessage = {
            role: "authorization_request",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: {
              authorization: data.authorization || {},
            },
          };
          updateSessionState(sessionId, prev => {
            const nextTextSegments = prev.streamingContent.trim()
              ? [
                  ...prev.textSegments,
                  {
                    role: "assistant" as const,
                    content: prev.streamingContent,
                    timestamp: Date.now() / 1000,
                  },
                ]
              : prev.textSegments;

            return {
              streamingContent: "",
              textSegments: nextTextSegments,
              authRequestMessages: [...prev.authRequestMessages, authMessage],
            };
          });
          flushFullContentSegment();
        } catch (err) {
          console.error("Failed to parse authorization_request event:", err);
        }
      });

      eventSource.addEventListener("tool_progress", (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.status === "started") {
            updateSessionState(sessionId, () => ({
              currentTool: { name: data.tool, startTime: Date.now() },
            }));
          } else if (data.status === "completed") {
            updateSessionState(sessionId, prev => ({
              currentTool: null,
              toolUseMessages: prev.toolUseMessages.map(msg => {
                if (!msg.metadata?.tool_invocations) {
                  return msg;
                }

                const updatedInvocations: ToolInvocation[] = msg.metadata.tool_invocations.map(inv =>
                  inv.id === data.id
                    ? {
                        ...inv,
                        status: "success" as const,
                        duration: typeof data.duration === "number" ? data.duration : undefined,
                      }
                    : inv
                );

                return {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    tool_invocations: updatedInvocations,
                  },
                };
              }),
            }));
          }
        } catch (err) {
          console.error("Failed to parse tool_progress event:", err);
        }
      });

      eventSource.addEventListener("done", (event) => {
        console.log("[SSE] Completed normally:", event.data);
        stopRequestedRef.current = false;
        serverErrorHandled = true;
        updateSessionState(sessionId, () => ({
          ...defaultSessionState,
        }));
        closeEventSource();
        const finalSegments = [...completedTextSegments];
        if (fullContent.trim()) {
          finalSegments.push(fullContent);
        }
        resolve(finalSegments.join("\n\n"));
      });

      eventSource.addEventListener("cancelled", (event) => {
        const messageEvent = event as MessageEvent;
        console.log("[SSE] Cancelled event received:", messageEvent.data);
        stopRequestedRef.current = false;
        serverErrorHandled = true;
        updateSessionState(sessionId, () => ({
          ...defaultSessionState,
        }));
        closeEventSource();
        reject(new Error("Task cancelled by user"));
      });

      eventSource.addEventListener("error", (event) => {
        if (stopRequestedRef.current) {
          return;
        }
        serverErrorHandled = true;
        try {
          const messageEvent = event as MessageEvent;
          const data = JSON.parse(messageEvent.data);
          updateSessionState(sessionId, () => ({
            ...defaultSessionState,
            error: data.error || "Unknown error",
          }));
          closeEventSource();
          reject(new Error(data.error || "Unknown error"));
        } catch (err) {
          console.error("Failed to parse error event:", err);
        }
      });

      eventSource.onerror = (err) => {
        if (stopRequestedRef.current || serverErrorHandled) {
          return;
        }

        console.error("[SSE] Error:", err);
        closeEventSource();

        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const delay = 1000 * retryCountRef.current;

          updateSessionState(sessionId, prev => ({
            ...prev,
            error: `连接断开，正在重连 (${retryCountRef.current}/${maxRetries})...`,
            retryCount: retryCountRef.current,
          }));

          setTimeout(() => {
            if (stopRequestedRef.current) {
              return;
            }

            api.getResumeStreamUrl(sessionId, agentId ?? null, forceMaster)
              .then((resumeUrl) => connectStreamImpl({
                sessionId,
                url: resumeUrl,
                message,
                attachments,
                selectedSkills,
                agentId,
                forceMaster,
                isRetry: true,
                isResume: true,
              }))
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          updateSessionState(sessionId, () => ({
            ...defaultSessionState,
            error: "连接失败，请重试",
          }));
          reject(new Error("连接失败，已达到最大重试次数"));
        }
      };
    });
  }, [closeCurrentEventSource, maxRetries, sessionStates, updateSessionState]);

  const startStreaming = useCallback(async (
    sessionId: string,
    message: string,
    attachments?: StreamingAttachment[],
    selectedSkills?: string[],
    agentId?: number | null,
    forceMaster = false,
    isRetry = false
  ) => {
    currentSessionRef.current = sessionId;
    currentMessageRef.current = message;
    currentAttachmentsRef.current = attachments;
    currentSelectedSkillsRef.current = selectedSkills;
    currentAgentIdRef.current = agentId ?? null;

    if (!isRetry) {
      retryCountRef.current = 0;
    }
    stopRequestedRef.current = false;

    updateSessionState(sessionId, () => ({
      ...defaultSessionState,
      isStreaming: true,
      lastMessage: message,
      lastAttachments: attachments,
      lastSelectedSkills: selectedSkills,
      lastAgentId: agentId ?? null,
      retryCount: retryCountRef.current,
      stopRequested: false,
    }));

    const url = await api.getStreamUrl(sessionId, message, attachments, selectedSkills, agentId, forceMaster);
    return connectStream({
      sessionId,
      url,
      message,
      attachments,
      selectedSkills,
      agentId,
      forceMaster,
      isRetry,
      isResume: false,
    });
  }, [connectStream, updateSessionState]);

  const resumeStreaming = useCallback(async (
    sessionIdOverride?: string | null,
    agentIdOverride?: number | null,
    forceMaster = false,
    isRetry = false,
  ) => {
    const sessionId = sessionIdOverride ?? currentSessionId ?? currentSessionRef.current;
    if (!sessionId) {
      return Promise.resolve("");
    }

    const sessionState = sessionStates.get(sessionId) ?? defaultSessionState;
    const message = sessionState.lastMessage ?? currentMessageRef.current;
    const attachments = sessionState.lastAttachments ?? currentAttachmentsRef.current;
    const selectedSkills = sessionState.lastSelectedSkills ?? currentSelectedSkillsRef.current;
    const agentId = agentIdOverride ?? sessionState.lastAgentId ?? currentAgentIdRef.current;

    currentSessionRef.current = sessionId;
    currentMessageRef.current = message;
    currentAttachmentsRef.current = attachments;
    currentSelectedSkillsRef.current = selectedSkills;
    currentAgentIdRef.current = agentId ?? null;

    if (!isRetry) {
      retryCountRef.current = 0;
    }
    stopRequestedRef.current = false;

    updateSessionState(sessionId, prev => ({
      ...defaultSessionState,
      isStreaming: true,
      lastMessage: message,
      lastAttachments: attachments,
      lastSelectedSkills: selectedSkills,
      lastAgentId: agentId ?? null,
      retryCount: retryCountRef.current,
      stopRequested: false,
      textSegments: prev.textSegments,
      skillUseMessages: prev.skillUseMessages,
      authRequestMessages: prev.authRequestMessages,
    }));

    const url = await api.getResumeStreamUrl(sessionId, agentId, forceMaster);
    return connectStream({
      sessionId,
      url,
      message,
      attachments,
      selectedSkills,
      agentId,
      forceMaster,
      isRetry,
      isResume: true,
    });
  }, [connectStream, currentSessionId, sessionStates, updateSessionState]);

  const stopStreaming = useCallback(async () => {
    const sessionId = currentSessionId ?? currentSessionRef.current;
    stopRequestedRef.current = true;

    closeCurrentEventSource();
    console.log("[SSE] Connection closed due to manual stop");

    if (sessionId) {
      try {
        await api.stopStream(sessionId);
      } catch (error) {
        console.error("[SSE] Failed to stop task:", error);
      }

      updateSessionState(sessionId, () => ({
        ...defaultSessionState,
      }));
    }

    currentSessionRef.current = null;
  }, [closeCurrentEventSource, currentSessionId, updateSessionState]);

  const resetStreamingState = useCallback((sessionId?: string | null) => {
    const targetSessionId = sessionId ?? currentSessionId ?? currentSessionRef.current;
    if (!targetSessionId) {
      return;
    }

    if (currentSessionRef.current === targetSessionId) {
      closeCurrentEventSource();
      currentSessionRef.current = null;
      currentMessageRef.current = null;
      currentAttachmentsRef.current = undefined;
      currentSelectedSkillsRef.current = undefined;
      currentAgentIdRef.current = null;
      retryCountRef.current = 0;
      stopRequestedRef.current = false;
    }

    updateSessionState(targetSessionId, () => ({
      ...defaultSessionState,
    }));
  }, [closeCurrentEventSource, currentSessionId, updateSessionState]);

  return {
    isStreaming,
    streamingContent,
    toolCalls,
    toolUseMessages,
    skillUseMessages,
    authRequestMessages,
    textSegments,
    currentTool,
    error,
    startStreaming,
    resumeStreaming,
    stopStreaming,
    resetStreamingState,
  };
}
