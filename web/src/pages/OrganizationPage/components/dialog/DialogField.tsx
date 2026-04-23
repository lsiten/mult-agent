import type React from "react";

interface DialogFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

export function DialogField({ label, required, children }: DialogFieldProps) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-display text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
