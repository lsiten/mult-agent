import { CheckCircle2, Edit3 } from "lucide-react";

interface DraftField {
  label: string;
  value?: string;
  tags?: string[];
  full?: boolean;
  highlight?: boolean;
}

interface RecruitRequirementDraftCardProps {
  label: string;
  status: string;
  title: string;
  fields: DraftField[];
  descriptionLabel: string;
  description: string;
  modifyLabel: string;
  confirmLabel: string;
}

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-[#343b36] bg-[#171717] px-3 py-1.5 text-sm text-[#bbcabe]">
      {label}
    </span>
  );
}

export function RecruitRequirementDraftCard({
  label,
  status,
  title,
  fields,
  descriptionLabel,
  description,
  modifyLabel,
  confirmLabel,
}: RecruitRequirementDraftCardProps) {
  const company = fields[0];
  const role = fields[1];
  const salary = fields[2];
  const headcount = fields[3];
  const skills = fields.find((field) => field.tags);

  return (
    <div className="overflow-hidden rounded-lg border border-[#3a433d] bg-[#111a14]">
      <div className="flex items-start justify-between border-b border-[#2f3631] px-6 py-6">
        <div>
          <p className="font-mono text-sm tracking-[0.16em] text-[#3fe18b]">{label}</p>
          <h3 className="mt-5 text-3xl font-bold leading-tight text-[#fafafa]">{title}</h3>
        </div>
        <span className="rounded-full border border-[rgba(62,207,142,0.45)] px-4 py-1.5 text-sm font-medium text-[#60eca8]">
          {status}
        </span>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-6 md:grid-cols-2">
          {[company, role, salary, headcount].filter(Boolean).map((field) => (
            <div key={field.label}>
              <p className="mb-2 text-sm tracking-[0.12em] text-[#898989]">{field.label}</p>
              <p className={`text-xl font-semibold ${field.highlight ? "text-[#60eca8]" : "text-[#fafafa]"}`}>
                {field.value}
              </p>
            </div>
          ))}
        </div>

        {skills?.tags ? (
          <div>
            <p className="mb-3 text-sm tracking-[0.12em] text-[#898989]">{skills.label}</p>
            <div className="flex flex-wrap gap-3">
              {skills.tags.map((tag) => (
                <Tag key={tag} label={tag} />
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-3 text-sm tracking-[0.12em] text-[#898989]">{descriptionLabel}</p>
          <p className="text-base leading-8 text-[#bbcabe]">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 border-t border-[#2f3631] px-6 py-5 sm:grid-cols-2">
        <button className="inline-flex items-center justify-center gap-2 rounded-full border border-[#2e2e2e] bg-[#0f0f0f] px-5 py-3 text-sm font-semibold text-[#fafafa] transition-colors hover:bg-[#171717]">
          <Edit3 className="h-4 w-4" />
          {modifyLabel}
        </button>
        <button className="inline-flex items-center justify-center gap-2 rounded-full border border-[#fafafa] bg-[#0f0f0f] px-5 py-3 text-sm font-semibold text-[#fafafa] transition-colors hover:bg-[#fafafa] hover:text-[#0f0f0f]">
          <CheckCircle2 className="h-4 w-4" />
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
