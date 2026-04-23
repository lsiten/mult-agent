import { BriefcaseBusiness, Building2, UserRound, UsersRound } from "lucide-react";
import type { OrgNodeType } from "../types";

interface NodeMarkProps {
  icon?: string | null;
  avatarUrl?: string | null;
  color: string;
  type: OrgNodeType;
  name: string;
}

export function NodeMark({ icon, avatarUrl, color, type, name }: NodeMarkProps) {
  const Icon =
    type === "company" ? Building2 : type === "department" ? UsersRound : type === "position" ? BriefcaseBusiness : UserRound;
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background text-sm font-semibold"
      style={{ borderColor: color, color }}
    >
      {avatarUrl ? <img className="h-full w-full object-cover" src={avatarUrl} alt={name} /> : icon ? <span>{icon}</span> : <Icon className="h-5 w-5" />}
    </span>
  );
}
