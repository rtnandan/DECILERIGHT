import React, { useEffect, useRef, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { api } from "../../lib/api";
import type { Template } from "../../lib/types";

interface TemplatePickerProps {
  kinds?: ("email" | "follow_up" | "reply")[];
  onPick: (t: { subject: string; body: string }) => void;
  disabled?: boolean;
}

export function TemplatePicker({ kinds, onPick, disabled }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .listTemplates()
      .then((rows) => setTemplates(rows))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = kinds ? templates.filter((t) => kinds.includes(t.kind)) : templates;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        <span>Use template</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-border bg-card p-1 shadow-md">
          {loading ? (
            <div className="p-3 text-xs text-muted-foreground">Loading templates...</div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No matching templates saved yet.</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border/50">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ subject: t.subject, body: t.body });
                      setOpen(false);
                    }}
                    className="w-full rounded px-3 py-2 text-left hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground truncate">{t.name}</span>
                      <span className="font-mono text-[10px] uppercase text-muted-foreground shrink-0">
                        {t.kind.replace("_", "-")}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t.subject || t.body.slice(0, 64)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
