import type { Translations } from "@/i18n/types";
import type { OrgCompany, OrgDepartment } from "@/lib/api";
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
}

export function DepartmentBranch({
  company,
  department,
  t,
  onCreate,
  onEdit,
  onRefresh,
}: DepartmentBranchProps) {
  const color = nodeColor(department.accent_color, company.accent_color);
  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        type="department"
        name={department.name}
        subtitle={department.description || department.goal}
        icon={department.icon}
        color={color}
        stats={[
          [t.organization.positions, department.position_count ?? department.positions?.length ?? 0],
          [t.organization.agents, department.agent_count ?? 0],
        ]}
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
          />
        )}
      />
    </div>
  );
}
