export interface Workflow {
  id: number;
  company_id: number;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  created_at: number;
  updated_at: number;
  edges?: WorkflowEdge[];
}

export interface WorkflowEdge {
  id: number;
  workflow_id: number;
  source_department_id: number;
  target_department_id: number;
  action_description: string;
  trigger_condition?: string;
  sort_order: number;
  created_at: number;
}

export interface WorkflowInstance {
  id: number;
  workflow_id: number;
  company_id: number;
  task_id: number;
  current_edge_id?: number;
  status: "running" | "completed" | "failed";
  started_at: number;
  completed_at?: number;
}

export interface WorkflowApiResponse {
  workflow: Workflow | null;
}

export interface WorkflowDepartment {
  id: number;
  code: string;
  name: string;
  goal?: string;
  accent_color?: string;
  sort_order?: number;
}

export interface WorkflowNodeData {
  department: WorkflowDepartment;
  taskCount?: number;
  isActive?: boolean;
}

export interface WorkflowEdgeData {
  action_description: string;
  trigger_condition?: string;
}

export type WorkflowMode = "view" | "edit";
