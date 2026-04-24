import { useState, useCallback, useRef } from "react";
import { api, type SessionMessage } from "@/lib/api";

export interface ToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  status: "pending" | "success" | "error";
}

export function useStreamingResponse() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [toolUseMessages, setToolUseMessages] = useState<SessionMessage[]>([]);
  const [skillUseMessages, setSkillUseMessages] = useState<SessionMessage[]>([]);
  const [authRequestMessages, setAuthRequestMessages] = useState<SessionMessage[]>([]);
  const [textSegments, setTextSegments] = useState<SessionMessage[]>([]); // Completed text segments
  const [currentTool, setCurrentTool] = useState<{ name: string; startTime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const maxRetries = 3;

  const startStreaming = useCallback(async (
    sessionId: string,
    message: string,
    attachments?: Array<{id: string, name: string, type: string, size: number, url: string}>,
    selectedSkills?: string[],
    agentId?: number | null,
    isRetry = false
  ) => {
    if (!isRetry) {
      retryCountRef.current = 0;
    }
    stopRequestedRef.current = false;

    setIsStreaming(true);
    setStreamingContent("");
    setToolCalls([]);
    setToolUseMessages([]);
    setSkillUseMessages([]);
    setAuthRequestMessages([]);
    setTextSegments([]);
    setCurrentTool(null);
    setError(null);

    const url = await api.getStreamUrl(sessionId, message, attachments, selectedSkills, agentId);
    console.log("[SSE] Starting stream from:", url, isRetry ? `(retry ${retryCountRef.current}/${maxRetries})` : "");
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    currentSessionRef.current = sessionId;

    return new Promise<string>((resolve, reject) => {
      let fullContent = "";

      console.log("[SSE] Starting stream from:", url);

      // Listen for content events
      eventSource.addEventListener("content", (event) => {
        try {
          console.log("[SSE] Content event received:", event.data);
          const data = JSON.parse(event.data);
          if (data.delta) {
            fullContent += data.delta;
            setStreamingContent(fullContent);
            console.log("[SSE] Updated content, length:", fullContent.length);
          }
        } catch (err) {
          console.error("Failed to parse content event:", err);
        }
      });

      // Listen for tool_call events (legacy)
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
            setToolCalls(prev => [...prev, toolCall]);
          }
        } catch (err) {
          console.error("Failed to parse tool_call event:", err);
        }
      });

      // Listen for tool_use events (new) - receives incremental updates
      // Each invocation is now a separate message for chronological ordering
      eventSource.addEventListener("tool_use", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE] tool_use event received:", data);

          const newInvocations = data.invocations || [];

          // Before adding tool messages, save current streaming text as a completed segment
          setStreamingContent(current => {
            if (current.trim()) {
              console.log("[SSE] Saving text segment before tool:", current.length, "chars");
              setTextSegments(prev => [...prev, {
                role: "assistant",
                content: current,
                timestamp: Date.now() / 1000,
              }]);
            }
            return ""; // Clear streaming content for next segment
          });

          // Create separate tool_use message for each new invocation
          const newMessages: SessionMessage[] = newInvocations.map((inv: any) => ({
            role: "tool_use",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: {
              tool_invocations: [inv],
            },
          }));

          setToolUseMessages(prev => [...prev, ...newMessages]);
        } catch (err) {
          console.error("Failed to parse tool_use event:", err);
        }
      });

      // Listen for skill_loaded events
      eventSource.addEventListener("skill_loaded", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE] skill_loaded event received:", data);

          // Save current text segment before skill message
          setStreamingContent(current => {
            if (current.trim()) {
              console.log("[SSE] Saving text segment before skill:", current.length, "chars");
              setTextSegments(prev => [...prev, {
                role: "assistant",
                content: current,
                timestamp: Date.now() / 1000,
              }]);
            }
            return "";
          });

          const message: SessionMessage = {
            role: "skill_use",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: {
              skills: data.skills || [],
            },
          };
          setSkillUseMessages(prev => [...prev, message]);
        } catch (err) {
          console.error("Failed to parse skill_loaded event:", err);
        }
      });

      // Listen for authorization_request events
      eventSource.addEventListener("authorization_request", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE] authorization_request event received:", data);

          // Save current text segment before authorization request
          setStreamingContent(current => {
            if (current.trim()) {
              console.log("[SSE] Saving text segment before auth request:", current.length, "chars");
              setTextSegments(prev => [...prev, {
                role: "assistant",
                content: current,
                timestamp: Date.now() / 1000,
              }]);
            }
            return "";
          });

          const message: SessionMessage = {
            role: "authorization_request",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: {
              authorization: data.authorization || {},
            },
          };
          setAuthRequestMessages(prev => [...prev, message]);
        } catch (err) {
          console.error("Failed to parse authorization_request event:", err);
        }
      });

      // Listen for tool_progress events
      eventSource.addEventListener("tool_progress", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE] tool_progress event received:", data);

          if (data.status === "started") {
            setCurrentTool({ name: data.tool, startTime: Date.now() });
          } else if (data.status === "completed") {
            setCurrentTool(null);

            // Update tool status in toolUseMessages
            // Since each tool is now a separate message, find the message with matching tool_call_id
            setToolUseMessages(prev => {
              if (prev.length === 0) return prev;

              const updated = prev.map(msg => {
                if (msg.metadata?.tool_invocations) {
                  const invocations = msg.metadata.tool_invocations;
                  const toolIndex = invocations.findIndex((inv: any) => inv.id === data.id);

                  if (toolIndex !== -1) {
                    // Found matching tool, update its status
                    const updatedInvocations = [...invocations];
                    updatedInvocations[toolIndex] = {
                      ...updatedInvocations[toolIndex],
                      status: "success",
                      duration: data.duration,
                    };

                    return {
                      ...msg,
                      metadata: {
                        ...msg.metadata,
                        tool_invocations: updatedInvocations,
                      },
                    };
                  }
                }
                return msg;
              });

              return updated;
            });
          }
        } catch (err) {
          console.error("Failed to parse tool_progress event:", err);
        }
      });

      // Listen for done event
      eventSource.addEventListener("done", (event) => {
        console.log("[SSE] Done event received:", event.data);
        stopRequestedRef.current = false;
        setIsStreaming(false);
        setStreamingContent(""); // Clear streaming content
        setTextSegments([]); // Clear completed text segments
        setToolUseMessages([]); // Clear tool messages
        setSkillUseMessages([]); // Clear skill messages
        setAuthRequestMessages([]); // Clear auth messages
        setCurrentTool(null);
        eventSource.close();
        resolve(fullContent);
      });

      // Listen for cancelled event
      eventSource.addEventListener("cancelled", (event) => {
        const messageEvent = event as MessageEvent;
        console.log("[SSE] Cancelled event received:", messageEvent.data);
        stopRequestedRef.current = false;
        setIsStreaming(false);
        setStreamingContent("");
        setTextSegments([]);
        setToolUseMessages([]);
        setSkillUseMessages([]);
        setAuthRequestMessages([]);
        setCurrentTool(null);
        eventSource.close();
        reject(new Error("Task cancelled by user"));
      });

      // Listen for error event
      eventSource.addEventListener("error", (event) => {
        if (stopRequestedRef.current) {
          console.log("[SSE] Ignoring error event because stop was requested");
          return;
        }
        try {
          const messageEvent = event as MessageEvent;
          const data = JSON.parse(messageEvent.data);
          console.log("[SSE] Error event received:", data);
          setError(data.error || "Unknown error");
          setIsStreaming(false);
          setStreamingContent("");
          setTextSegments([]);
          setToolUseMessages([]);
          setSkillUseMessages([]);
          setAuthRequestMessages([]);
          setCurrentTool(null);
          eventSource.close();
          reject(new Error(data.error || "Unknown error"));
        } catch (err) {
          console.error("Failed to parse error event:", err);
        }
      });

      // Handle connection errors with retry
      eventSource.onerror = (err) => {
        if (stopRequestedRef.current) {
          console.log("[SSE] Ignoring EventSource onerror because stop was requested");
          return;
        }
        console.error("[SSE] Error:", err);
        eventSource.close();

        // Retry logic
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const delay = 1000 * retryCountRef.current; // 1s, 2s, 3s
          console.log(`[SSE] Retrying in ${delay}ms (attempt ${retryCountRef.current}/${maxRetries})`);

          setError(`连接断开，正在重试 (${retryCountRef.current}/${maxRetries})...`);

          setTimeout(() => {
            if (stopRequestedRef.current) {
              console.log("[SSE] Skip retry because stop was requested");
              return;
            }
            startStreaming(sessionId, message, attachments, selectedSkills, agentId, true)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          console.error("[SSE] Max retries reached");
          setError("连接失败，请重试");
          setIsStreaming(false);
          setStreamingContent("");
          setTextSegments([]);
          setToolUseMessages([]);
          setSkillUseMessages([]);
          setAuthRequestMessages([]);
          reject(new Error("连接失败，已达到最大重试次数"));
        }
      };
    });
  }, [maxRetries]);

  const stopStreaming = useCallback(async () => {
    const sessionId = currentSessionRef.current;
    stopRequestedRef.current = true;

    // Close event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Call stop API if we have a session
    if (sessionId) {
      try {
        await api.stopStream(sessionId);
        console.log("[SSE] Stop request sent for session:", sessionId);
      } catch (err) {
        console.error("[SSE] Failed to stop stream:", err);
      }
    }

    setIsStreaming(false);
    setCurrentTool(null);
    currentSessionRef.current = null;
  }, []);

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
    stopStreaming,
  };
}
