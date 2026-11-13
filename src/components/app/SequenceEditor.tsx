import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { DELAY_PRESETS, MAX_FOLLOW_UPS } from "../../lib/followups";
import type { FollowUpStep } from "../../lib/types";
import { AttachmentsPicker } from "./AttachmentsPicker";
import { TemplatePicker } from "./TemplatePicker";

interface SequenceEditorProps {
  steps: FollowUpStep[];
  onChange: (next: FollowUpStep[]) => void;
  disabled?: boolean;
}

export function SequenceEditor({ steps, onChange, disabled }: SequenceEditorProps) {
  function updateStep(idx: number, patch: Partial<FollowUpStep>) {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addStep() {
    if (steps.length >= MAX_FOLLOW_UPS) return;
    const defaultDelay = DELAY_PRESETS[Math.min(steps.length, DELAY_PRESETS.length - 1)] ?? 5;
    onChange([
      ...steps,
      {
        delay_days: defaultDelay,
        body: "Hi {{first_name|there}}, just following up on my previous note regarding {{company}}.",
        attachments: [],
      },
    ]);
  }

  function removeStep(idx: number) {
    onChange(steps.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Follow-up sequence</h3>
          <p className="text-xs text-muted-foreground">
            Up to {MAX_FOLLOW_UPS} automated steps in the same email thread. Stops automatically on reply, bounce, or opt-out.
          </p>
        </div>
        {!disabled && steps.length < MAX_FOLLOW_UPS && (
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add step ({steps.length}/{MAX_FOLLOW_UPS})</span>
          </button>
        )}
      </div>

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">No follow-up steps configured yet.</p>
          {!disabled && (
            <button
              type="button"
              onClick={addStep}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Follow-up 1</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step, idx) => {
            const isPreset = (DELAY_PRESETS as readonly number[]).includes(step.delay_days);
            return (
              <div key={idx} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                      Step {idx + 2} · Follow-up {idx + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">Wait</span>
                    <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
                      {DELAY_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={disabled}
                          onClick={() => updateStep(idx, { delay_days: preset })}
                          className={`tabular rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                            step.delay_days === preset
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {preset}d
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        disabled={disabled}
                        value={step.delay_days}
                        onChange={(e) =>
                          updateStep(idx, {
                            delay_days: Math.min(365, Math.max(1, Number(e.target.value) || 1)),
                          })
                        }
                        aria-label={`Custom delay days for follow-up ${idx + 1}`}
                        className={`tabular h-7 w-16 rounded border px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring ${
                          !isPreset ? "border-signal" : "border-input"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">days after previous</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <TemplatePicker
                      kinds={["follow_up", "email"]}
                      disabled={disabled}
                      onPick={(tpl) => updateStep(idx, { body: tpl.body })}
                    />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-destructive transition-colors"
                        aria-label={`Remove follow-up ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={4}
                  disabled={disabled}
                  value={step.body}
                  onChange={(e) => updateStep(idx, { body: e.target.value })}
                  placeholder="Write follow-up copy... Use {{first_name|there}} or {{company}}"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />

                <AttachmentsPicker
                  value={step.attachments ?? []}
                  onChange={(attachments) => updateStep(idx, { attachments })}
                  disabled={disabled}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
