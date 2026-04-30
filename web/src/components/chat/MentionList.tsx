/**
 * MentionList - Tippy-based suggestion list for Tiptap mention extension
 */

import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { User, Building2, Loader2 } from "lucide-react";
import type { OrgCompany } from "@/lib/api";
import { api } from "@/lib/api";

export interface MentionItem {
  id: number;
  label: string;
  name: string;
  positionName: string;
  departmentName: string;
}

interface AgentData {
  id: number;
  name: string;
  displayName: string;
  positionName: string;
  departmentName: string;
  companyId: number;
}

interface MentionListProps {
  query: string;
  command: (item: MentionItem) => void;
  currentCompanyId?: number;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ query, command, currentCompanyId }, ref) => {
    const [items, setItems] = useState<AgentData[]>([]);
    const [allAgents, setAllAgents] = useState<AgentData[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const flattenAgents = (company: OrgCompany): AgentData[] => {
      const result: AgentData[] = [];
      const departments = company.departments || [];
      departments.forEach((dept) => {
        const positions = dept.positions || [];
        positions.forEach((pos) => {
          const agents = pos.agents || [];
          agents.forEach((agent) => {
            result.push({
              id: agent.id,
              name: agent.name,
              displayName: agent.display_name || agent.name,
              positionName: pos.name,
              departmentName: dept.name,
              companyId: company.id,
            });
          });
        });
      });
      return result;
    };

    // Load agents
    useEffect(() => {
      if (!currentCompanyId) return;

      let cancelled = false;
      const load = async () => {
        setLoading(true);
        try {
          const data = await api.getOrgCompanyTree(currentCompanyId);
          if (!cancelled && data?.company) {
            const flattened = flattenAgents(data.company);
            setAllAgents(flattened);
          }
        } catch (error) {
          console.error("Failed to load agents:", error);
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      load();
      return () => { cancelled = true; };
    }, [currentCompanyId]);

    // Filter on query change
    useEffect(() => {
      if (!query) {
        setItems(allAgents);
        setSelectedIndex(0);
        return;
      }

      const q = query.toLowerCase();
      const filtered = allAgents.filter(
        (a) =>
          a.displayName.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.positionName.toLowerCase().includes(q) ||
          a.departmentName.toLowerCase().includes(q)
      );
      setItems(filtered);
      setSelectedIndex(0);
    }, [query, allAgents]);

    // Select item
    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command({
          id: item.id,
          label: item.displayName,
          name: item.name,
          positionName: item.positionName,
          departmentName: item.departmentName,
        });
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + items.length) % items.length
          );
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          selectItem(selectedIndex);
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="w-80 bg-popover border border-border rounded-md shadow-lg max-h-[280px] overflow-y-auto p-1">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            加载中
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            未找到智能体
          </div>
        ) : (
          items.map((agent, index) => (
            <button
              key={agent.id}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full flex items-start gap-2 px-2 py-1.5 text-left text-sm rounded-sm transition-colors ${
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              }`}
            >
              <User className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">
                    {agent.displayName}
                  </span>
                  <Badge
                    variant="outline"
                    className="h-4 px-1 text-[10px] shrink-0"
                  >
                    {agent.positionName}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center">
                  <Building2 className="h-3 w-3 mr-1 shrink-0" />
                  {agent.departmentName}
                </div>
              </div>
            </button>
          ))
        )}
        {!loading && allAgents.length > 0 && (
          <div className="p-2 border-t border-border text-xs text-muted-foreground">
            {items.length === allAgents.length
              ? `共 ${allAgents.length} 个智能体`
              : `${items.length} / ${allAgents.length} 个智能体`}
          </div>
        )}
      </div>
    );
  }
);
