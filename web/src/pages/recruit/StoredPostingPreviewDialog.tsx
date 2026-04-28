import { Database, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RecruitJobPosting } from "@/lib/api";

interface StoredPostingPreviewDialogProps {
  open: boolean;
  title: string;
  description: string;
  closeLabel: string;
  tableNameLabel: string;
  rows: RecruitJobPosting[];
  onOpenChange: (open: boolean) => void;
}

function formatSalary(row: RecruitJobPosting) {
  const { min, max, unit } = row.salary;
  if (min != null && max != null) return `${min}-${max}${unit ?? ""}`;
  if (min != null) return `${min}${unit ?? ""}`;
  if (max != null) return `${max}${unit ?? ""}`;
  return "-";
}

export function StoredPostingPreviewDialog({
  open,
  title,
  description,
  closeLabel,
  tableNameLabel,
  rows,
  onOpenChange,
}: StoredPostingPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-[#2e2e2e] bg-[#111a14] p-0 text-[#dde4dd]">
        <DialogHeader className="border-b border-[#2e2e2e] px-6 py-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(62,207,142,0.3)] bg-[#0e1510] text-[#60eca8]">
                <Database className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-semibold text-[#fafafa]">{title}</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-[#bbcabe]">
                  {description}
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full p-2 text-[#898989] transition-colors hover:bg-[#1a211c] hover:text-[#fafafa]"
              aria-label={closeLabel}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="inline-flex rounded-full border border-[rgba(62,207,142,0.3)] bg-[#0e1510] px-3 py-1 font-mono text-xs text-[#60eca8]">
            {tableNameLabel}: job_postings
          </div>
          <div className="max-h-[54vh] overflow-auto rounded-lg border border-[#2e2e2e]">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#171717] text-xs uppercase tracking-[0.12em] text-[#898989]">
                <tr>
                  <th className="border-b border-[#2e2e2e] px-4 py-3">ID</th>
                  <th className="border-b border-[#2e2e2e] px-4 py-3">Status</th>
                  <th className="border-b border-[#2e2e2e] px-4 py-3">Company</th>
                  <th className="border-b border-[#2e2e2e] px-4 py-3">Position</th>
                  <th className="border-b border-[#2e2e2e] px-4 py-3">City</th>
                  <th className="border-b border-[#2e2e2e] px-4 py-3">Salary</th>
                  <th className="border-b border-[#2e2e2e] px-4 py-3">Skills</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#242424] last:border-b-0">
                    <td className="px-4 py-3 font-mono text-[#60eca8]">{row.id}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{row.company_name || "-"}</td>
                    <td className="px-4 py-3">{row.position_title || "-"}</td>
                    <td className="px-4 py-3">{row.city || "-"}</td>
                    <td className="px-4 py-3 text-[#60eca8]">{formatSalary(row)}</td>
                    <td className="px-4 py-3">{row.skills.filter((item) => typeof item === "string").join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="border-t border-[#2e2e2e] px-6 py-5 sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-[#fafafa] bg-[#0f0f0f] px-5 py-2.5 text-sm font-semibold text-[#fafafa] transition-colors hover:bg-[#fafafa] hover:text-[#0f0f0f]"
          >
            {closeLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
