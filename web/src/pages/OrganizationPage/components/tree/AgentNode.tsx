import { Crown, MessageCircle, MoreVertical, Shield } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { Translations } from "@/i18n/types";
import { api, type OrgAgent, type OrgCompany, type OrgDepartment, type OrgPosition } from "@/lib/api";
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
  onRefresh?: () => void;
}

export function AgentNode({
  agent,
  company,
  department,
  position,
  t,
  onEdit,
  onRefresh,
}: AgentNodeProps) {
  const color = nodeColor(agent.accent_color, position.accent_color);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const profileReady = agent.profile_agent?.profile_status === "ready";
  const workspacePath = agent.workspace?.root_path || agent.workspace_path || "";
  const profileHomePath = agent.profile_agent?.profile_home || "";

  const handleSetLeader = async (role: 'primary' | 'deputy' | 'none') => {
    setLoading(true);
    try {
      await api.setAgentAsLeader(agent.id, role);
      toast({
        title: t.organization.leaderRoleUpdated,
        variant: "default",
      });
      onRefresh?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('409')) {
        toast({
          title: t.organization.primaryLeaderConflict,
          variant: "destructive",
        });
      } else {
        toast({
          title: t.common.operationFailed,
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const leadershipBadge = agent.leadership_role === 'primary' ? (
    <Tooltip content={t.organization.primaryLeader} side="top" delay={150}>
      <Crown className="h-4 w-4 text-yellow-500" />
    </Tooltip>
  ) : agent.leadership_role === 'deputy' ? (
    <Tooltip content={t.organization.deputyLeader} side="top" delay={150}>
      <Shield className="h-4 w-4 text-blue-500" />
    </Tooltip>
  ) : null;

  return (
    <OrgNodeCard
      type="agent"
      name={
        <div className="flex items-center gap-2">
          <span>{agent.display_name || agent.name}</span>
          {leadershipBadge}
        </div>
      }
      subtitle={agent.role_summary}
      avatarUrl={agent.avatar_url}
      color={color}
      stats={[[t.organization.profileStatus, agent.profile_agent?.profile_status ?? agent.status]]}
      actions={
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={loading}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                disabled={agent.leadership_role === 'primary' || loading}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetLeader('primary');
                }}
              >
                <Crown className="mr-2 h-4 w-4" />
                {t.organization.setPrimaryLeader}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                disabled={agent.leadership_role === 'deputy' || loading}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetLeader('deputy');
                }}
              >
                <Shield className="mr-2 h-4 w-4" />
                {t.organization.setDeputyLeader}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                disabled={agent.leadership_role === 'none' || loading}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetLeader('none');
                }}
              >
                {t.organization.removeLeader}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      }
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
