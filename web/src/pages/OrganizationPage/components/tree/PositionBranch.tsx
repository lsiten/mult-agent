import type { Translations } from "@/i18n/types";
import type { OrgCompany, OrgDepartment, OrgPosition } from "@/lib/api";
import type { OrgCreateHandler, OrgEditHandler, OrgProvisionHandler } from "../../types";
import { nodeColor } from "../../utils";
import { ChildBranch } from "../ChildBranch";
import { OrgNodeCard } from "../OrgNodeCard";
import { AgentNode } from "./AgentNode";

interface PositionBranchProps {
  company: OrgCompany;
  department: OrgDepartment;
  position: OrgPosition;
  provisioningId: number | null;
  t: Translations;
  onCreate: OrgCreateHandler;
  onEdit: OrgEditHandler;
  onProvision: OrgProvisionHandler;
}

export function PositionBranch({
  company,
  department,
  position,
  provisioningId,
  t,
  onCreate,
  onEdit,
  onProvision,
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
        render={(agent) => (
          <AgentNode
            agent={agent}
            company={company}
            department={department}
            position={position}
            provisioning={provisioningId === agent.id}
            t={t}
            onEdit={onEdit}
            onProvision={onProvision}
          />
        )}
      />
    </div>
  );
}
