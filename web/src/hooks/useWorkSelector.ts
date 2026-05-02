import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, type OrgCompany, type OrgAgent } from "@/lib/api";

export type WorkScope =
  | { type: "master" }
  | { type: "company"; company: OrgCompany }
  | { type: "director-office"; companyId: number };

export interface WorkSelectorState {
  /** Currently selected work scope */
  scope: WorkScope;
  /** All available companies */
  companies: OrgCompany[];
  /** Whether company data has been loaded */
  loaded: boolean;
  /** Select a work scope */
  selectScope: (scope: WorkScope) => void;
  /** Get agents for the current scope */
  agentsForScope: Record<number, OrgAgent[]>;
}

/**
 * Hook that manages the work scope selection (Master Agent vs Company).
 *
 * - The Master Agent is always available and doesn't belong to any company.
 * - Companies are loaded from the org tree and shown at the same level.
 * - When a company is selected, the agent switcher shows agents under that company.
 */
export function useWorkSelector(): WorkSelectorState {
  const location = useLocation();
  const [scope, setScope] = useState<WorkScope>({ type: "master" });
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [agentsForScope, setAgentsForScope] = useState<Record<number, OrgAgent[]>>({});

  const loadOrgData = useCallback(async () => {
    try {
      const tree = await api.getOrgTree();
      const cos = tree.companies ?? [];
      setCompanies(cos);

      // Pre-fetch agents per company
      const agentsMap: Record<number, OrgAgent[]> = {};
      for (const company of cos) {
        const agents: OrgAgent[] = [];
        for (const dept of company.departments ?? []) {
          for (const pos of dept.positions ?? []) {
            for (const agent of pos.agents ?? []) {
              agents.push(agent);
            }
          }
        }
        agentsMap[company.id] = agents;
      }
      setAgentsForScope(agentsMap);
      setLoaded(true);

      // Check URL for companyId parameter and auto-select the company
      const params = new URLSearchParams(location.search);
      const companyIdParam = params.get("companyId");
      if (companyIdParam) {
        const companyId = parseInt(companyIdParam, 10);
        if (!Number.isNaN(companyId)) {
          const company = cos.find((c) => c.id === companyId);
          if (company) {
            setScope({ type: "company", company });
          }
        }
      }
    } catch (err) {
      console.warn("[useWorkSelector] Failed to load org tree:", err);
      setLoaded(true);
    }
  }, [location.search]);

  useEffect(() => {
    loadOrgData();
  }, [loadOrgData]);

  // Also watch for companyId parameter changes after initial load
  useEffect(() => {
    if (!loaded || companies.length === 0) return;

    const params = new URLSearchParams(location.search);
    const companyIdParam = params.get("companyId");
    if (!companyIdParam) return;

    const companyId = parseInt(companyIdParam, 10);
    if (Number.isNaN(companyId)) return;

    const company = companies.find((c) => c.id === companyId);
    if (company && (scope.type !== "company" || scope.company.id !== companyId)) {
      setScope({ type: "company", company });
    }
  }, [location.search, companies, loaded, scope]);

  const selectScope = useCallback((newScope: WorkScope) => {
    setScope(newScope);
  }, []);

  return {
    scope,
    companies,
    loaded,
    selectScope,
    agentsForScope,
  };
}
