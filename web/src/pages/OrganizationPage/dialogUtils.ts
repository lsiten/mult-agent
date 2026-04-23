import type { Translations } from "@/i18n/types";
import type {
  OrgAgent,
  OrgCompany,
  OrgDepartment,
  OrgPosition,
  OrganizationTreeResponse,
} from "@/lib/api";
import type { OrgDialogItem, OrgDialogParent, OrgNodeType, OrgNodeValues } from "./types";
import { DEFAULT_COLOR } from "./utils";

export function initialOrgNodeValues(
  type: OrgNodeType,
  item: OrgDialogItem | null,
  parent: OrgDialogParent,
  tree: OrganizationTreeResponse,
): OrgNodeValues {
  if (type === "company") {
    const company = item as OrgCompany | null;
    return {
      name: company?.name ?? "",
      goal: company?.goal ?? "",
      description: company?.description ?? "",
      icon: company?.icon ?? "",
      accent_color: company?.accent_color ?? DEFAULT_COLOR,
    };
  }

  if (type === "department") {
    const department = item as OrgDepartment | null;
    const company = parent.company ?? tree.companies.find((entry) => entry.id === department?.company_id);
    return {
      company_id: String(company?.id ?? ""),
      company_name: company?.name ?? "",
      name: department?.name ?? "",
      goal: department?.goal ?? "",
      description: department?.description ?? "",
      icon: department?.icon ?? "",
      accent_color: department?.accent_color ?? company?.accent_color ?? DEFAULT_COLOR,
    };
  }

  if (type === "position") {
    const position = item as OrgPosition | null;
    const department = parent.department ?? findDepartment(tree, position?.department_id);
    return {
      department_id: String(department?.id ?? ""),
      department_name: department?.name ?? "",
      name: position?.name ?? "",
      goal: position?.goal ?? "",
      responsibilities: position?.responsibilities ?? "",
      headcount: position?.headcount == null ? "" : String(position.headcount),
      template_key: position?.template_key ?? "",
      icon: position?.icon ?? "",
      accent_color: position?.accent_color ?? department?.accent_color ?? DEFAULT_COLOR,
    };
  }

  const agent = item as OrgAgent | null;
  const position = parent.position ?? findPosition(tree, agent?.position_id);
  return {
    position_id: String(position?.id ?? ""),
    position_name: position?.name ?? "",
    name: agent?.name ?? "",
    role_summary: agent?.role_summary ?? "",
    service_goal: agent?.service_goal ?? "",
    employee_no: agent?.employee_no ?? "",
    display_name: agent?.display_name ?? "",
    avatar_url: agent?.avatar_url ?? "",
    accent_color: agent?.accent_color ?? position?.accent_color ?? DEFAULT_COLOR,
  };
}

export function createOrgNodeLabel(type: OrgNodeType, t: Translations) {
  if (type === "company") return t.organization.createCompany;
  if (type === "department") return t.organization.createDepartment;
  if (type === "position") return t.organization.createPosition;
  return t.organization.createAgent;
}

export function orgNodeLabel(type: OrgNodeType, t: Translations) {
  if (type === "company") return t.organization.company;
  if (type === "department") return t.organization.department;
  if (type === "position") return t.organization.position;
  return t.organization.agent;
}

function findDepartment(tree: OrganizationTreeResponse, id?: number | null) {
  if (!id) return undefined;
  for (const company of tree.companies) {
    const department = company.departments?.find((entry) => entry.id === id);
    if (department) return department;
  }
  return undefined;
}

function findPosition(tree: OrganizationTreeResponse, id?: number | null) {
  if (!id) return undefined;
  for (const company of tree.companies) {
    for (const department of company.departments ?? []) {
      const position = department.positions?.find((entry) => entry.id === id);
      if (position) return position;
    }
  }
  return undefined;
}
