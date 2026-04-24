import { Crown } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { Translations } from "@/i18n/types";
import { api, type OrgCompany, type OrgDepartment, type OrgPosition } from "@/lib/api";
import { getAgentTreeWidth } from "../../orgLayout";
import type { OrgCreateHandler, OrgDeleteHandler, OrgEditHandler } from "../../types";
import { nodeColor } from "../../utils";
import { ChildBranch } from "../ChildBranch";
import { OrgNodeCard } from "../OrgNodeCard";
import { AgentNode } from "./AgentNode";

interface PositionBranchProps {
  company: OrgCompany;
  department: OrgDepartment;
  position: OrgPosition;
  t: Translations;
  onCreate: OrgCreateHandler;
  onDelete: OrgDeleteHandler;
  onEdit: OrgEditHandler;
  onRefresh: () => void;
  allDepartments?: OrgDepartment[];
}

export function PositionBranch({
  company,
  department,
  position,
  t,
  onCreate,
  onDelete,
  onEdit,
  onRefresh,
  allDepartments,
}: PositionBranchProps) {
  const color = nodeColor(position.accent_color, department.accent_color);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleToggleManagement = async (checked: boolean) => {
    setLoading(true);
    try {
      await api.setPositionAsManagement(position.id, checked);
      toast({
        title: t.organization.managementPositionUpdated,
        variant: "default",
      });
      onRefresh();
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

  const managementBadge = position.is_management_position ? (
    <Tooltip content={t.organization.managementPosition} side="top" delay={150}>
      <Crown className="h-4 w-4 text-yellow-500" />
    </Tooltip>
  ) : null;

  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        type="position"
        name={
          <div className="flex items-center gap-2">
            <span>{position.name}</span>
            {managementBadge}
          </div>
        }
        subtitle={position.goal || position.responsibilities}
        icon={position.icon}
        color={color}
        stats={[[t.organization.agents, position.agent_count ?? position.agents?.length ?? 0]]}
        actions={
          <Tooltip content={t.organization.setManagementPosition} side="left" delay={150}>
            <Switch
              checked={Boolean(position.is_management_position)}
              onCheckedChange={handleToggleManagement}
              disabled={loading}
            />
          </Tooltip>
        }
        deleteTitle={t.organization.delete}
        onDelete={() => onDelete("position", position)}
        onEdit={() => onEdit("position", position, { company, department, position })}
      />

      <ChildBranch
        color={color}
        items={position.agents ?? []}
        addLabel={t.organization.createAgent}
        onAdd={() => onCreate("agent", { company, department, position })}
        getItemWidth={getAgentTreeWidth}
        render={(agent) => (
          <AgentNode
            agent={agent}
            company={company}
            department={department}
            position={position}
            t={t}
            onDelete={onDelete}
            onEdit={onEdit}
            onRefresh={onRefresh}
            allDepartments={allDepartments}
          />
        )}
      />
    </div>
  );
}
