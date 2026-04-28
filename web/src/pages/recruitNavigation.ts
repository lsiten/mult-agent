import type { ComponentType } from "react";

export type RecruitPageId = "dashboard" | "workspace" | "requirements" | "talent" | "settings";

export interface RecruitNavItemConfig {
  id: RecruitPageId;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

export interface RecruitPageProps {
  currentPage: RecruitPageId;
  onNavigate: (page: RecruitPageId) => void;
}
