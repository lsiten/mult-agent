import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, setActiveAgentId, type OrgAgent } from "@/lib/api";

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
}

export function useAgentSwitcher(): AgentSwitcherState {
  const location = useLocation();
  const navigate = useNavigate();

  const activeAgentId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("agentId");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);

  const [activeAgent, setActiveAgent] = useState<OrgAgent | null>(null);
  const [availableAgents, setAvailableAgents] = useState<OrgAgent[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);

  // Keep the api module's global mirror in sync so every ``fetchJSON``
  // call automatically stamps the right ``X-Hermes-Agent-Id`` header.
  useEffect(() => {
    setActiveAgentId(activeAgentId);
  }, [activeAgentId]);

  useEffect(() => {
    let cancelled = false;
    if (activeAgentId == null) {
      setActiveAgent(null);
      return () => {
        cancelled = true;
      };
    }
    api
      .getAgent(activeAgentId)
      .then((agent) => {
        if (!cancelled) setActiveAgent(agent);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[useAgentSwitcher] Failed to load agent", activeAgentId, err);
        setActiveAgent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgentId]);

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

  return {
    activeAgentId,
    activeAgent,
    availableAgents,
    agentsLoaded,
    loadAgents,
    switchToAgent,
  };
}
