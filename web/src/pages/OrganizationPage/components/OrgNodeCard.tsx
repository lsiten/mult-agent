import type React from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { OrgNodeType } from "../types";
import { NodeMark } from "./NodeMark";

interface OrgNodeCardProps {
  type: OrgNodeType;
  name: string | React.ReactNode;
  subtitle?: string | null;
  icon?: string | null;
  avatarUrl?: string | null;
  color: string;
  stats?: Array<[string, number | string]>;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  onDelete?: () => void;
  deleteTitle?: string;
  onEdit: () => void;
}

export function OrgNodeCard({
  type,
  name,
  subtitle,
  icon,
  avatarUrl,
  color,
  stats,
  actions,
  footer,
  onDelete,
  deleteTitle,
  onEdit,
}: OrgNodeCardProps) {
  const nameStr = typeof name === 'string' ? name : '';
  return (
    <article
      className="group grid w-[220px] gap-3 rounded-lg border border-border bg-background p-3 text-left shadow-sm transition-colors hover:border-foreground/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <NodeMark icon={icon} avatarUrl={avatarUrl} color={color} type={type} name={nameStr} />
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold tracking-normal">{name}</div>
            {subtitle ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{subtitle}</div> : null}
          </div>
        </div>
        {(actions || onDelete) && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
            {onDelete ? (
              <Tooltip content={deleteTitle ?? "Delete"} side="top" delay={150}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            ) : null}
          </div>
        )}
      </div>
      {stats?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {stats.map(([label, value]) => (
            <Badge key={label} variant="outline" className="max-w-full truncate">
              {label}: {value}
            </Badge>
          ))}
        </div>
      ) : null}
      {footer}
    </article>
  );
}
