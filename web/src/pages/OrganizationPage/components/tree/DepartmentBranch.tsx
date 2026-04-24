import { Building2, MoreVertical } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { Translations } from "@/i18n/types";
import { api, type OrgCompany, type OrgDepartment } from "@/lib/api";
import { getPositionTreeWidth } from "../../orgLayout";
import type { OrgCreateHandler, OrgEditHandler } from "../../types";
import { nodeColor } from "../../utils";
import { ChildBranch } from "../ChildBranch";
import { OrgNodeCard } from "../OrgNodeCard";
import { PositionBranch } from "./PositionBranch";

interface DepartmentBranchProps {
  company: OrgCompany;
  department: OrgDepartment;
  t: Translations;
  onCreate: OrgCreateHandler;
  onEdit: OrgEditHandler;
  onRefresh: () => void;
  allDepartments?: OrgDepartment[];
}

export function DepartmentBranch({
  company,
  department,
  t,
  onCreate,
  onEdit,
  onRefresh,
  allDepartments,
}: DepartmentBranchProps) {
  const color = nodeColor(department.accent_color, company.accent_color);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showManagingSelect, setShowManagingSelect] = useState(false);

  const handleSetManagingDepartment = async (managingDeptId: string) => {
    setLoading(true);
    try {
      const id = managingDeptId === "none" ? null : Number(managingDeptId);
      await api.setManagingDepartment(department.id, id);
      toast({
        title: t.organization.managingDepartmentUpdated,
        variant: "default",
      });
      setShowManagingSelect(false);
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

  // 过滤可选的管理部门（排除自己和子部门）
  const availableDepartments = (company.departments ?? []).filter(
    (d) => d.id !== department.id && d.parent_id !== department.id
  );

  const managingDeptName = department.managing_department_id
    ? company.departments?.find((d) => d.id === department.managing_department_id)?.name
    : null;

  const managingBadge = managingDeptName ? (
    <Tooltip content={`${t.organization.managedBy}: ${managingDeptName}`} side="top" delay={150}>
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
            {managingBadge}
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
          <Popover open={showManagingSelect} onOpenChange={setShowManagingSelect}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" disabled={loading}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t.organization.setManagingDepartment}</label>
                <Select
                  value={department.managing_department_id?.toString() || "none"}
                  onValueChange={handleSetManagingDepartment}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.organization.setManagingDepartment} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t.common.none}</SelectItem>
                    {availableDepartments.map((d) => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {managingDeptName && (
                  <Badge variant="outline" className="text-xs">
                    {t.organization.managedBy}: {managingDeptName}
                  </Badge>
                )}
              </div>
            </PopoverContent>
          </Popover>
        }
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
            onEdit={onEdit}
            onRefresh={onRefresh}
            allDepartments={allDepartments}
          />
        )}
      />
    </div>
  );
}
