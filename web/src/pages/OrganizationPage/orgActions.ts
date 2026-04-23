import { api } from "@/lib/api";
import type {
  AgentPayload,
  CompanyPayload,
  DepartmentPayload,
  OrgCompany,
  PositionPayload,
} from "@/lib/api";
import type { OrgDialogParent, OrgDialogItem, OrgNodeType, OrgNodeValues } from "./types";
import { cleanPayload } from "./utils";

export interface DialogState {
  type: OrgNodeType;
  item: OrgDialogItem | null;
  parent: OrgDialogParent;
}

export async function persistOrgNode(
  state: DialogState,
  values: OrgNodeValues,
  currentCompany: OrgCompany | null,
): Promise<number | undefined> {
  if (state.type === "company") {
    const payload: CompanyPayload = cleanPayload({
      name: values.name,
      goal: values.goal,
      description: values.description,
      icon: values.icon,
      accent_color: values.accent_color,
    });
    if (state.item) {
      const company = await api.updateCompany(state.item.id, payload);
      return company.id;
    }
    const company = await api.createCompany(payload);
    return company.id;
  }

  if (state.type === "department") {
    const companyId = Number(values.company_id || state.parent.company?.id || currentCompany?.id);
    const payload: DepartmentPayload = cleanPayload({
      company_id: companyId,
      name: values.name,
      goal: values.goal,
      description: values.description,
      icon: values.icon,
      accent_color: values.accent_color,
    });
    if (state.item) {
      await api.updateDepartment(state.item.id, payload);
    } else {
      await api.createDepartment(payload);
    }
    return companyId;
  }

  if (state.type === "position") {
    const departmentId = Number(values.department_id || state.parent.department?.id);
    const payload: PositionPayload = cleanPayload({
      department_id: departmentId,
      name: values.name,
      goal: values.goal,
      responsibilities: values.responsibilities,
      icon: values.icon,
      accent_color: values.accent_color,
      headcount: values.headcount ? Number(values.headcount) : null,
      template_key: values.template_key,
    });
    if (state.item) {
      await api.updatePosition(state.item.id, payload);
    } else {
      await api.createPosition(payload);
    }
    return currentCompany?.id;
  }

  const positionId = Number(values.position_id || state.parent.position?.id);
  const payload: AgentPayload = cleanPayload({
    position_id: positionId,
    name: values.name,
    role_summary: values.role_summary,
    service_goal: values.service_goal,
    employee_no: values.employee_no,
    display_name: values.display_name,
    avatar_url: values.avatar_url,
    accent_color: values.accent_color,
  });
  if (state.item) {
    await api.updateAgent(state.item.id, payload);
  } else {
    await api.createAgent(payload);
  }
  return currentCompany?.id;
}
