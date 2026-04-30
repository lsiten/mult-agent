import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "../types";

export const WorkflowNode = memo((props: NodeProps<WorkflowNodeData>) => {
  const { data, selected } = props;
  const { department, taskCount = 0, isActive } = data;
  const accent = department.accent_color || "#6366f1";

  return (
    <div
      className={cn(
        "w-[180px] rounded-lg border-2 bg-background shadow-md transition-all",
        selected && "ring-2 ring-primary/50",
        isActive && "shadow-lg"
      )}
      style={{
        borderColor: isActive ? accent : undefined,
        boxShadow: isActive ? `0 0 12px ${accent}40` : undefined,
      }}
    >
      <div
        className="h-1.5 rounded-t-lg"
        style={{ backgroundColor: accent }}
      />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{ backgroundColor: `${accent}20` }}
          >
            <Building2 className="h-4 w-4" style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {department.name}
            </p>
          </div>
          {taskCount > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: accent }}
            >
              {taskCount}
            </span>
          )}
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !bg-background"
        style={{ borderColor: accent }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !bg-background"
        style={{ borderColor: accent }}
      />
    </div>
  );
});

WorkflowNode.displayName = "WorkflowNode";
