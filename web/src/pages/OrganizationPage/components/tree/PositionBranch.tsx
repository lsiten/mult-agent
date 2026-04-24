import type { Translations } from "@/i18n/types";
import type { OrgCompany, OrgDepartment, OrgPosition } from "@/lib/api";
import { getAgentTreeWidth } from "../../orgLayout";
import type { OrgCreateHandler, OrgEditHandler } from "../../types";
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
  onEdit,
  onRefresh,
  allDepartments,
}: PositionBranchProps) {
  const color = nodeColor(position.accent_color, department.accent_color);
  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        type="position"
        name={position.name}
        subtitle={position.goal || position.responsibilities}
        icon={position.icon}
        color={color}
        stats={[[t.organization.agents, position.agent_count ?? position.agents?.length ?? 0]]}
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
            onEdit={onEdit}
            onRefresh={onRefresh}
            allDepartments={allDepartments}
          />
        )}
      />
    </div>
  );
}
