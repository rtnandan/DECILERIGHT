import React from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground text-balance">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </header>
  );
}

const TONE_MAP: Record<string, string> = {
  running: "bg-success-soft text-success border-success/25",
  active: "bg-success-soft text-success border-success/25",
  valid: "bg-success-soft text-success border-success/25",
  interested: "bg-success-soft text-success border-success/25",
  open: "bg-signal-soft text-signal border-signal/25",
  replied: "bg-info-soft text-info border-info/25",
  question: "bg-info-soft text-info border-info/25",
  paused: "bg-warning-soft text-warning border-warning/25",
  risky: "bg-warning-soft text-warning border-warning/25",
  follow_up_later: "bg-warning-soft text-warning border-warning/25",
  out_of_office: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  closed: "bg-muted text-muted-foreground border-border",
  completed: "bg-muted text-muted-foreground border-border",
  unchecked: "bg-muted text-muted-foreground border-border",
  new: "bg-muted text-muted-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
  contacted: "bg-info-soft text-info border-info/25",
  error: "bg-danger-soft text-destructive border-destructive/25",
  invalid: "bg-danger-soft text-destructive border-destructive/25",
  bounced: "bg-danger-soft text-destructive border-destructive/25",
  unsubscribed: "bg-danger-soft text-destructive border-destructive/25",
  not_interested: "bg-danger-soft text-destructive border-destructive/25",
};

export function StatusTag({ value, label }: { value: string; label?: string }) {
  const key = value.toLowerCase();
  const cls = TONE_MAP[key] ?? "bg-muted text-muted-foreground border-border";
  const text = label ?? value.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium capitalize whitespace-nowrap shrink-0 ${cls}`}
    >
      {text}
    </span>
  );
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
