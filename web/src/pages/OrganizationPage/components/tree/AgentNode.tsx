import { Loader2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Translations } from "@/i18n/types";
import type { OrgAgent, OrgCompany, OrgDepartment, OrgPosition } from "@/lib/api";
import type { OrgEditHandler, OrgProvisionHandler } from "../../types";
import { nodeColor } from "../../utils";
import { OrgNodeCard } from "../OrgNodeCard";

interface AgentNodeProps {
  agent: OrgAgent;
  company: OrgCompany;
  department: OrgDepartment;
  position: OrgPosition;
  provisioning: boolean;
  t: Translations;
  onEdit: OrgEditHandler;
  onProvision: OrgProvisionHandler;
}

export function AgentNode({
  agent,
  company,
  department,
  position,
  provisioning,
  t,
  onEdit,
  onProvision,
}: AgentNodeProps) {
  const color = nodeColor(agent.accent_color, position.accent_color);
  return (
    <OrgNodeCard
      type="agent"
      name={agent.display_name || agent.name}
      subtitle={agent.role_summary}
      avatarUrl={agent.avatar_url}
      color={color}
      stats={[[t.organization.profileStatus, agent.profile_agent?.profile_status ?? agent.status]]}
      footer={
        <div className="grid gap-1.5 border-t border-border/70 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>{t.organization.companySpace}</span>
            <Badge variant="outline">{t.organization.enabled}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>{t.organization.personalSpace}</span>
            <Badge variant="outline">{t.organization.disabled}</Badge>
          </div>
          <Button
            className="mt-2"
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onProvision(agent);
            }}
            disabled={provisioning}
          >
            {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {provisioning ? t.organization.provisioning : t.organization.provisionProfile}
          </Button>
        </div>
      }
      onEdit={() => onEdit("agent", agent, { company, department, position })}
    />
  );
}
