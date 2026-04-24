import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, setActiveAgentId as apiSetActiveAgentId, type OrgAgent } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

/**
 * Drives the global "master / sub-agent" identity switcher.
 *
 * - ``activeAgentId`` is parsed from the ``agentId`` query parameter on every
 *   location change so that deep links and page refreshes preserve the
 *   chosen identity.
 * - ``availableAgents`` is lazily loaded the first time a consumer asks for
 *   it (usually when the dropdown is first opened) to avoid an unconditional
 *   extra API call on every page navigation.
 * - Switching agents always routes to ``/`` with the new query string so that
 *   the chat page picks it up.  When the user chooses the master agent we
 *   simply drop the query parameter.
 */
export interface AgentSwitcherState {
  activeAgentId: number | null;
  activeAgent: OrgAgent | null;
  availableAgents: OrgAgent[];
  agentsLoaded: boolean;
  loadAgents: () => Promise<void>;
  switchToAgent: (agentId: number | null) => void;
  // 错误状态
  startupError: { agentId: number; error: string } | null;
  retryStartup: () => void;
  clearError: () => void;
  // Agent 就绪状态（主 Agent 始终就绪，Sub Agent 需等待启动完成）
  isReady: boolean;
}

export function useAgentSwitcher(): AgentSwitcherState {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const activeAgentId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("agentId");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);

  const [activeAgent, setActiveAgent] = useState<OrgAgent | null>(null);
  const [availableAgents, setAvailableAgents] = useState<OrgAgent[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [startupError, setStartupError] = useState<{ agentId: number; error: string } | null>(null);
  const [isReady, setIsReady] = useState<boolean>(true); // 主 Agent 默认就绪

  // CRITICAL: Use useLayoutEffect to ensure API activeAgentId is set BEFORE any child component's useEffect runs
  // This prevents race conditions where useSessions/useAgentData fire before the API layer is updated
  useLayoutEffect(() => {
    console.log(`[useAgentSwitcher] (layoutEffect) Setting API activeAgentId to ${activeAgentId}`);
    apiSetActiveAgentId(activeAgentId);
  }, [activeAgentId]);

  // Load agent data and set isReady flag
  useEffect(() => {
    let cancelled = false;

    // Handle agent data loading
    if (activeAgentId == null) {
      console.log('[useAgentSwitcher] Switching to master Agent');
      setActiveAgent(null);
      setIsReady(false); // Temporarily mark as not ready

      // Wait for next tick to ensure all pending API calls complete
      setTimeout(() => {
        if (!cancelled) {
          console.log('[useAgentSwitcher] Master Agent ready');
          setIsReady(true); // 主 Agent 就绪
        }
      }, 0);

      return () => {
        cancelled = true;
      };
    }

    // Sub Agent 切换时标记为未就绪，防止其他组件提前发起请求
    setIsReady(false);
    console.log(`[useAgentSwitcher] Loading agent ${activeAgentId}...`);

    api
      .getAgent(activeAgentId)
      .then((agent) => {
        if (!cancelled) {
          console.log(`[useAgentSwitcher] Agent ${activeAgentId} loaded:`, agent.name);
          setActiveAgent(agent);
          // ✅ Agent 数据加载成功，标记为就绪
          setIsReady(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useAgentSwitcher] Failed to load agent", activeAgentId, err);

        // ⚠️ Sub Agent 启动失败，设置错误状态（触发 Modal）
        const errorMsg = err instanceof Error ? err.message : String(err);
        setStartupError({ agentId: activeAgentId, error: errorMsg });

        // ⛔ 清空 Agent 信息并回退到主 Agent（防止数据泄漏）
        // 虽然 URL 保持 agentId 参数（用于重试），但数据请求会回退到主 Gateway
        setActiveAgent(null);

        // 清空 API 层缓存，强制下次请求重新路由到主 Gateway
        apiSetActiveAgentId(null);

        // ⛔ 失败时也标记为就绪（回退到主 Agent）
        setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgentId, location.search, navigate, showToast]);

  const loadAgents = useCallback(async () => {
    try {
      const tree = await api.getOrgTree();
      const agents: OrgAgent[] = [];
      for (const company of tree.companies ?? []) {
        for (const dept of company.departments ?? []) {
          for (const pos of dept.positions ?? []) {
            for (const agent of pos.agents ?? []) {
              agents.push(agent);
            }
          }
        }
      }
      setAvailableAgents(agents);
      setAgentsLoaded(true);
    } catch (err) {
      console.warn("[useAgentSwitcher] Failed to load org tree:", err);
      setAgentsLoaded(true);
    }
  }, []);

  const switchToAgent = useCallback(
    (agentId: number | null) => {
      // 清除之前的错误状态
      setStartupError(null);

      const params = new URLSearchParams(location.search);
      if (agentId == null) {
        params.delete("agentId");
      } else {
        params.set("agentId", String(agentId));
      }
      const qs = params.toString();
      navigate(qs ? `/?${qs}` : "/", { replace: false });
    },
    [location.search, navigate],
  );

  const retryStartup = useCallback(() => {
    if (!startupError) return;
    const failedAgentId = startupError.agentId;
    // 清空错误状态
    setStartupError(null);

    // 先回到主 Agent，然后再切换到失败的 Agent
    // 这样可以强制触发完整的重新加载流程
    const params = new URLSearchParams(location.search);
    params.delete("agentId");
    navigate(`/?${params.toString()}`, { replace: true });

    // 短暂延迟后重新切换到目标 Agent
    setTimeout(() => {
      switchToAgent(failedAgentId);
    }, 100);
  }, [startupError, switchToAgent, location.search, navigate]);

  const clearError = useCallback(() => {
    setStartupError(null);
    // 清空错误时回到主 Agent
    const params = new URLSearchParams(location.search);
    params.delete("agentId");
    const qs = params.toString();
    navigate(qs ? `/?${qs}` : "/", { replace: true });
  }, [location.search, navigate]);

  return {
    activeAgentId,
    activeAgent,
    availableAgents,
    agentsLoaded,
    loadAgents,
    switchToAgent,
    startupError,
    retryStartup,
    clearError,
    isReady,
  };
}
