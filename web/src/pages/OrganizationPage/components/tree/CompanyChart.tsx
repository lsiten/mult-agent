import type { Translations } from "@/i18n/types";
import type { OrgCompany } from "@/lib/api";
import { getDepartmentTreeWidth } from "../../orgLayout";
import type { OrgCreateHandler, OrgDeleteHandler, OrgEditHandler } from "../../types";
import { nodeColor } from "../../utils";
import { ChildBranch } from "../ChildBranch";
import { OrgNodeCard } from "../OrgNodeCard";
import { DepartmentBranch } from "./DepartmentBranch";

interface CompanyChartProps {
  company: OrgCompany;
  t: Translations;
  onCreate: OrgCreateHandler;
  onDelete: OrgDeleteHandler;
  onEdit: OrgEditHandler;
  onRefresh: () => void;
}

export function CompanyChart({ company, t, onCreate, onDelete, onEdit, onRefresh }: CompanyChartProps) {
  return (
    <div className="mx-auto flex w-max min-w-full flex-col items-center">
      <OrgNodeCard
        type="company"
        name={company.name}
        subtitle={company.description || company.goal}
        icon={company.icon}
        color={nodeColor(company.accent_color)}
        stats={[
          [t.organization.departments, company.department_count ?? company.departments?.length ?? 0],
          [t.organization.positions, company.position_count ?? 0],
          [t.organization.agents, company.agent_count ?? 0],
        ]}
        deleteTitle={t.organization.delete}
        onDelete={() => onDelete("company", company)}
        onEdit={() => onEdit("company", company, { company })}
      />

      <ChildBranch
        color={nodeColor(company.accent_color)}
        items={company.departments ?? []}
        addLabel={t.organization.createDepartment}
        onAdd={() => onCreate("department", { company })}
        getItemWidth={getDepartmentTreeWidth}
        render={(department) => (
          <DepartmentBranch
            company={company}
            department={department}
            t={t}
            onCreate={onCreate}
            onDelete={onDelete}
            onEdit={onEdit}
            onRefresh={onRefresh}
            allDepartments={company.departments}
          />
        )}
      />
    </div>
  );
}
