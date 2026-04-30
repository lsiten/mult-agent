import type { OrgDepartment, Workflow, WorkflowEdge, WorkflowInstance } from "@/lib/api";

export interface WorkflowNodeData {
  department: OrgDepartment;
  taskCount?: number;
  isActive?: boolean;
}

export interface WorkflowEdgeData {
  action_description: string;
  trigger_condition?: string;
}

export type WorkflowMode = "view" | "edit";
