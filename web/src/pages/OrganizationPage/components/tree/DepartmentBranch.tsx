import { Building2 } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { Translations } from "@/i18n/types";
import { api, type OrgCompany, type OrgDepartment } from "@/lib/api";
import { getPositionTreeWidth } from "../../orgLayout";
import type { OrgCreateHandler, OrgDeleteHandler, OrgEditHandler } from "../../types";
import { nodeColor } from "../../utils";
import { ChildBranch } from "../ChildBranch";
import { OrgNodeCard } from "../OrgNodeCard";
import { PositionBranch } from "./PositionBranch";

interface DepartmentBranchProps {
  company: OrgCompany;
  department: OrgDepartment;
  t: Translations;
  onCreate: OrgCreateHandler;
  onDelete: OrgDeleteHandler;
  onEdit: OrgEditHandler;
  onRefresh: () => void;
  allDepartments?: OrgDepartment[];
}

export function DepartmentBranch({
  company,
  department,
  t,
  onCreate,
  onDelete,
  onEdit,
  onRefresh,
  allDepartments,
}: DepartmentBranchProps) {
  const color = nodeColor(department.accent_color, company.accent_color);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleToggleManagement = async (checked: boolean) => {
    setLoading(true);
    try {
      await api.setDepartmentAsManagement(department.id, checked);
      toast({
        title: t.organization.managementDepartmentUpdated,
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

  const managementBadge = department.is_management_department ? (
    <Tooltip content={t.organization.managementDepartment} side="top" delay={150}>
      <Building2 className="h-4 w-4 text-blue-500" />
    </Tooltip>
  ) : null;

  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        type="department"
        name={
          <div className="flex items-center gap-2">
            <span>{department.name}</span>
            {managementBadge}
          </div>
        }
        subtitle={department.description || department.goal}
        icon={department.icon}
        color={color}
        stats={[
          [t.organization.positions, department.position_count ?? department.positions?.length ?? 0],
          [t.organization.agents, department.agent_count ?? 0],
        ]}
        actions={
          <Tooltip content={t.organization.setManagementDepartment} side="left" delay={150}>
            <Switch
              checked={Boolean(department.is_management_department)}
              onCheckedChange={handleToggleManagement}
              disabled={loading}
            />
          </Tooltip>
        }
        deleteTitle={t.organization.delete}
        onDelete={() => onDelete("department", department)}
        onEdit={() => onEdit("department", department, { company, department })}
      />

      <ChildBranch
        color={color}
        items={department.positions ?? []}
        addLabel={t.organization.createPosition}
        onAdd={() => onCreate("position", { company, department })}
        getItemWidth={getPositionTreeWidth}
        render={(position) => (
          <PositionBranch
            company={company}
            department={department}
            position={position}
            t={t}
            onCreate={onCreate}
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
