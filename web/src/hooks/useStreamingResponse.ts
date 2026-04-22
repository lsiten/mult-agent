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
  const [currentTool, setCurrentTool] = useState<{ name: string; startTime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const startStreaming = useCallback(async (
    sessionId: string,
    message: string,
    attachments?: Array<{id: string, name: string, type: string, size: number, url: string}>,
    selectedSkills?: string[],
    isRetry = false
  ) => {
    if (!isRetry) {
      retryCountRef.current = 0;
    }

    setIsStreaming(true);
    setStreamingContent("");
    setToolCalls([]);
    setToolUseMessages([]);
    setSkillUseMessages([]);
    setCurrentTool(null);
    setError(null);

    const url = await api.getStreamUrl(sessionId, message, attachments, selectedSkills);
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

      // Listen for tool_use events (new)
      eventSource.addEventListener("tool_use", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE] tool_use event received:", data);

          const message: SessionMessage = {
            role: "tool_use",
            content: null,
            timestamp: Date.now() / 1000,
            metadata: {
              tool_invocations: data.invocations || [],
            },
          };
          setToolUseMessages(prev => [...prev, message]);
        } catch (err) {
          console.error("Failed to parse tool_use event:", err);
        }
      });

      // Listen for skill_loaded events
      eventSource.addEventListener("skill_loaded", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE] skill_loaded event received:", data);

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

      // Listen for tool_progress events
      eventSource.addEventListener("tool_progress", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE] tool_progress event received:", data);

          if (data.status === "started") {
            setCurrentTool({ name: data.tool, startTime: Date.now() });
          } else if (data.status === "completed") {
            setCurrentTool(null);
          }
        } catch (err) {
          console.error("Failed to parse tool_progress event:", err);
        }
      });

      // Listen for done event
      eventSource.addEventListener("done", (event) => {
        console.log("[SSE] Done event received:", event.data);
        setIsStreaming(false);
        setStreamingContent(""); // Clear streaming content
        setCurrentTool(null);
        eventSource.close();
        resolve(fullContent);
      });

      // Listen for cancelled event
      eventSource.addEventListener("cancelled", (event) => {
        console.log("[SSE] Cancelled event received:", event.data);
        setIsStreaming(false);
        setStreamingContent("");
        setCurrentTool(null);
        eventSource.close();
        reject(new Error("Task cancelled by user"));
      });

      // Listen for error event
      eventSource.addEventListener("error_event", (event) => {
        try {
          const data = JSON.parse(event.data);
          setError(data.error || "Unknown error");
          setIsStreaming(false);
          eventSource.close();
          reject(new Error(data.error || "Unknown error"));
        } catch (err) {
          console.error("Failed to parse error event:", err);
        }
      });

      // Handle connection errors with retry
      eventSource.onerror = (err) => {
        console.error("[SSE] Error:", err);
        eventSource.close();

        // Retry logic
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const delay = 1000 * retryCountRef.current; // 1s, 2s, 3s
          console.log(`[SSE] Retrying in ${delay}ms (attempt ${retryCountRef.current}/${maxRetries})`);

          setError(`连接断开，正在重试 (${retryCountRef.current}/${maxRetries})...`);

          setTimeout(() => {
            startStreaming(sessionId, message, attachments, selectedSkills, true)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          console.error("[SSE] Max retries reached");
          setError("连接失败，请重试");
          setIsStreaming(false);
          reject(new Error("连接失败，已达到最大重试次数"));
        }
      };
    });
  }, [maxRetries]);

  const stopStreaming = useCallback(async () => {
    const sessionId = currentSessionRef.current;

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
    currentTool,
    error,
    startStreaming,
    stopStreaming,
  };
}
