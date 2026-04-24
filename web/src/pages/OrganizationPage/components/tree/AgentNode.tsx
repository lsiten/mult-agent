import { Crown, MessageCircle, MoreVertical, Shield } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { Translations } from "@/i18n/types";
import { api, type OrgAgent, type OrgCompany, type OrgDepartment, type OrgPosition } from "@/lib/api";
import type { OrgDeleteHandler, OrgEditHandler } from "../../types";
import { nodeColor } from "../../utils";
import { OrgNodeCard } from "../OrgNodeCard";

interface AgentNodeProps {
  agent: OrgAgent;
  company: OrgCompany;
  department: OrgDepartment;
  position: OrgPosition;
  t: Translations;
  onDelete: OrgDeleteHandler;
  onEdit: OrgEditHandler;
  onRefresh?: () => void;
  allDepartments?: OrgDepartment[]; // 用于查找管理部门
}

export function AgentNode({
  agent,
  company,
  department,
  position,
  t,
  onDelete,
  onEdit,
  onRefresh,
  allDepartments = [],
}: AgentNodeProps) {
  const color = nodeColor(agent.accent_color, position.accent_color);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showManagerSelect, setShowManagerSelect] = useState(false);
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

  const handleSetManager = async (managerId: string) => {
    setLoading(true);
    try {
      const id = managerId === "none" ? null : Number(managerId);
      await api.updateAgent(agent.id, { manager_agent_id: id });
      toast({
        title: t.organization.directManagerUpdated,
        variant: "default",
      });
      setShowManagerSelect(false);
      onRefresh?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: t.common.operationFailed,
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // 收集可选的负责人列表
  const availableManagers: Array<{ id: number; name: string; category: string }> = [];

  // 1. 本岗位的负责人
  const positionLeaders = (position.agents ?? []).filter(
    (a) => a.id !== agent.id && (a.leadership_role === 'primary' || a.leadership_role === 'deputy')
  );
  positionLeaders.forEach((a) => {
    availableManagers.push({
      id: a.id,
      name: a.display_name || a.name,
      category: t.organization.positionLeader,
    });
  });

  // 2. 本部门管理岗位的负责人（如果本岗位不是管理岗位）
  if (!position.is_management_position) {
    const deptPositions = department.positions ?? [];
    deptPositions.forEach((pos) => {
      if (pos.is_management_position && pos.id !== position.id) {
        const leaders = (pos.agents ?? []).filter(
          (a) => a.id !== agent.id && (a.leadership_role === 'primary' || a.leadership_role === 'deputy')
        );
        leaders.forEach((a) => {
          if (!availableManagers.find((m) => m.id === a.id)) {
            availableManagers.push({
              id: a.id,
              name: a.display_name || a.name,
              category: t.organization.departmentLeader,
            });
          }
        });
      }
    });
  }

  // 3. 管理部门的负责人（如果有管理部门）
  if (department.managing_department_id) {
    const managingDept = allDepartments.find((d) => d.id === department.managing_department_id);
    if (managingDept) {
      const managingPositions = managingDept.positions ?? [];
      managingPositions.forEach((pos) => {
        if (pos.is_management_position) {
          const leaders = (pos.agents ?? []).filter(
            (a) => a.id !== agent.id && (a.leadership_role === 'primary' || a.leadership_role === 'deputy')
          );
          leaders.forEach((a) => {
            if (!availableManagers.find((m) => m.id === a.id)) {
              availableManagers.push({
                id: a.id,
                name: a.display_name || a.name,
                category: t.organization.managingDepartmentLeader,
              });
            }
          });
        }
      });
    }
  }

  // 如果当前负责人不在可选列表中，尝试从本岗位、本部门、所有部门中查找并添加
  if (agent.manager_agent_id && !availableManagers.find((m) => m.id === agent.manager_agent_id)) {
    let foundManager: OrgAgent | undefined;
    let category = t.organization.currentManager;

    // 搜索范围 1：本岗位所有 agents
    foundManager = (position.agents ?? []).find((a) => a.id === agent.manager_agent_id);

    // 搜索范围 2：本部门所有岗位的 agents
    if (!foundManager) {
      for (const pos of department.positions ?? []) {
        foundManager = (pos.agents ?? []).find((a) => a.id === agent.manager_agent_id);
        if (foundManager) {
          break;
        }
      }
    }

    // 搜索范围 3：所有部门的所有岗位的 agents（公司层级）
    if (!foundManager && company.departments) {
      for (const dept of company.departments) {
        if (!dept.positions) continue;
        for (const pos of dept.positions) {
          foundManager = (pos.agents ?? []).find((a) => a.id === agent.manager_agent_id);
          if (foundManager) {
            break;
          }
        }
        if (foundManager) break;
      }
    }

    // 如果找到了，添加到列表顶部
    if (foundManager) {
      availableManagers.unshift({
        id: foundManager.id,
        name: foundManager.display_name || foundManager.name,
        category: category,
      });
    } else {
      // 如果还是没找到，添加一个占位项（显示 id）
      availableManagers.unshift({
        id: agent.manager_agent_id,
        name: `Agent ${agent.manager_agent_id}`,
        category: t.organization.currentManager,
      });
    }
  }

  const currentManager = agent.manager_agent_id
    ? availableManagers.find((m) => m.id === agent.manager_agent_id)
    : null;

  const currentManagerDisplay = currentManager
    ? `${currentManager.name}-${currentManager.id}`
    : agent.manager_agent_id
    ? `Agent-${agent.manager_agent_id}`
    : null;

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
        <div className="flex gap-1">
          {/* 设置直属负责人 */}
          <Popover open={showManagerSelect} onOpenChange={setShowManagerSelect}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" disabled={loading} title={t.organization.setDirectManager}>
                <MessageCircle className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t.organization.setDirectManager}</label>
                <Select
                  value={agent.manager_agent_id?.toString() || "none"}
                  onValueChange={handleSetManager}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.organization.selectManager} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t.common.none}</SelectItem>
                    {availableManagers.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {`${m.name}-${m.id} (${m.category})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentManagerDisplay && (
                  <Badge variant="outline" className="text-xs">
                    {t.organization.currentManager}: {currentManagerDisplay}
                  </Badge>
                )}
                {availableManagers.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t.organization.noAvailableManagers}</p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* 设置负责人角色 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" disabled={loading} title={t.organization.setLeadershipRole}>
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
        </div>
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
      deleteTitle={t.organization.delete}
      onDelete={() => onDelete("agent", agent)}
      onEdit={() => onEdit("agent", agent, { company, department, position })}
    />
  );
}
