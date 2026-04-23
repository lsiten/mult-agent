import type { OrgDepartment, OrgPosition } from "@/lib/api";

export const ORG_NODE_WIDTH = 220;
export const ORG_BRANCH_GAP = 24;

export function getAgentTreeWidth() {
  return ORG_NODE_WIDTH;
}

export function getPositionTreeWidth(position: OrgPosition) {
  return Math.max(ORG_NODE_WIDTH, getTreeItemsWidth(position.agents ?? [], getAgentTreeWidth));
}

export function getDepartmentTreeWidth(department: OrgDepartment) {
  return Math.max(ORG_NODE_WIDTH, getTreeItemsWidth(department.positions ?? [], getPositionTreeWidth));
}

export function getTreeItemsWidth<T>(items: T[], getItemWidth: (item: T) => number) {
  if (items.length === 0) return 0;
  const itemsWidth = items.reduce((total, item) => total + getItemWidth(item), 0);
  return itemsWidth + Math.max(items.length - 1, 0) * ORG_BRANCH_GAP;
}
