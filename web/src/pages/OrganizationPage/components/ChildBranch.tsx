import type React from "react";
import { Plus } from "lucide-react";
import { getTreeItemsWidth, ORG_BRANCH_GAP, ORG_NODE_WIDTH } from "../orgLayout";
import { alphaColor, nodeKey } from "../utils";

interface ChildBranchProps<T> {
  items: T[];
  color: string;
  addLabel: string;
  onAdd: () => void;
  getItemWidth?: (item: T) => number;
  render: (item: T) => React.ReactNode;
}

export function ChildBranch<T>({
  items,
  color,
  addLabel,
  onAdd,
  getItemWidth = () => ORG_NODE_WIDTH,
  render,
}: ChildBranchProps<T>) {
  const itemWidths = items.map(getItemWidth);
  const branchWidth = Math.max(getTreeItemsWidth(items, getItemWidth), ORG_NODE_WIDTH);
  const branchHeight = 48;
  const parentX = branchWidth / 2;
  const lineColor = alphaColor(color, 0.72);
  return (
    <div className="flex flex-col items-center">
      <div className="h-5 w-px" style={{ backgroundColor: alphaColor(color, 0.62) }} />
      <button
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-foreground/10"
        type="button"
        aria-label={addLabel}
        style={{ borderColor: color, color }}
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
      </button>
      {items.length > 0 ? (
        <div className="relative" style={{ width: branchWidth }}>
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={branchWidth}
            height={branchHeight}
            viewBox={`0 0 ${branchWidth} ${branchHeight}`}
            aria-hidden="true"
          >
            {items.map((item, index) => {
              const previousWidth = itemWidths.slice(0, index).reduce((total, width) => total + width, 0);
              const childX = previousWidth + index * ORG_BRANCH_GAP + itemWidths[index] / 2;
              const midY = items.length === 1 ? branchHeight / 2 : 22;
              return (
                <path
                  key={nodeKey(item, index)}
                  d={`M ${parentX} 0 C ${parentX} ${midY}, ${childX} ${midY}, ${childX} ${branchHeight}`}
                  fill="none"
                  stroke={lineColor}
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>
          <div className="flex gap-6 pt-12">
            {items.map((item, index) => (
              <div
                key={nodeKey(item, index)}
                className="flex flex-col items-center"
                style={{ width: itemWidths[index] }}
              >
                {render(item)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
