import { MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { Translations } from "@/i18n/types";
import type { OrgAgent, OrgCompany, OrgDepartment, OrgPosition } from "@/lib/api";
import type { OrgEditHandler } from "../../types";
import { nodeColor } from "../../utils";
import { OrgNodeCard } from "../OrgNodeCard";

interface AgentNodeProps {
  agent: OrgAgent;
  company: OrgCompany;
  department: OrgDepartment;
  position: OrgPosition;
  t: Translations;
  onEdit: OrgEditHandler;
}

export function AgentNode({
  agent,
  company,
  department,
  position,
  t,
  onEdit,
}: AgentNodeProps) {
  const color = nodeColor(agent.accent_color, position.accent_color);
  const navigate = useNavigate();
  const profileReady = agent.profile_agent?.profile_status === "ready";
  const workspacePath = agent.workspace?.root_path || agent.workspace_path || "";
  const profileHomePath = agent.profile_agent?.profile_home || "";

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
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <span>{t.organization.workspace}</span>
              {workspacePath ? (
                <Tooltip content={workspacePath} side="top" delay={150}>
                  <Badge variant="outline">{t.organization.enabled}</Badge>
                </Tooltip>
              ) : (
                <Badge variant="outline">{t.organization.disabled}</Badge>
              )}
            </div>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <span>{t.organization.profileHome}</span>
              {profileHomePath ? (
                <Tooltip content={profileHomePath} side="top" delay={150}>
                  <Badge variant="outline">{t.organization.enabled}</Badge>
                </Tooltip>
              ) : (
                <Badge variant="outline">{t.organization.disabled}</Badge>
              )}
            </div>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <span>{t.organization.status}</span>
              <Badge variant="outline">{agent.status || t.common.unknown}</Badge>
            </div>
          </div>
          <div className="mt-2 flex ">
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-50 shrink-0 justify-center px-3"
              title={profileReady ? t.chat.openChatHint : t.chat.profileNotReady}
              disabled={!profileReady}
              onClick={(event) => {
                event.stopPropagation();
                if (!profileReady) return;
                navigate(`/?agentId=${agent.id}`);
              }}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{t.chat.openChat}</span>
            </Button>
          </div>
        </div>
      }
      onEdit={() => onEdit("agent", agent, { company, department, position })}
    />
  );
}
