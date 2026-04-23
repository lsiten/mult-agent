import type { OrgAgent, OrgCompany, OrgDepartment, OrgPosition } from "@/lib/api";

export type OrgNodeType = "company" | "department" | "position" | "agent";

export type OrgDialogItem = OrgCompany | OrgDepartment | OrgPosition | OrgAgent;

export interface OrgDialogParent {
  company?: OrgCompany;
  department?: OrgDepartment;
  position?: OrgPosition;
}

export type OrgNodeValues = Record<string, string>;

export type OrgCreateHandler = (type: OrgNodeType, parent: OrgDialogParent) => void;

export type OrgEditHandler = (type: OrgNodeType, item: OrgDialogItem, parent: OrgDialogParent) => void;

export type OrgProvisionHandler = (agent: OrgAgent) => void;
