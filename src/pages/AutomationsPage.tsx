import React, { useEffect, useState } from "react";
import { Play, RefreshCw, Save, Workflow } from "lucide-react";
import { api } from "../lib/api";
import { DELAY_PRESETS } from "../lib/followups";
import type { AppSettings } from "../lib/types";
import { ConfirmDialog } from "../components/app/ConfirmDialog";
import { PageHeader } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

export function AutomationsPage() {
  const { notify } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [confirmBatchOpen, setConfirmBatchOpen] = useState(false);
  const [runningSync, setRunningSync] = useState(false);

  async function load() {
    try {
      const res = await api.getSettings();
      setSettings(res.settings);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRules() {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        default_follow_up_delays: settings.default_follow_up_delays,
        default_behavior: settings.default_behavior,
        auto_close_days: settings.auto_close_days,
      });
      setSettings(updated);
      notify("Global automation rules saved", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function triggerSendBatch() {
    setRunningBatch(true);
    try {
      const res = await api.runSendBatch(false);
      notify(`Scheduled batch job: ${res.sent} sent, ${res.skipped} skipped`, {
        description: res.notes[0],
        kind: res.failed > 0 && res.sent === 0 ? "error" : "success",
      });
      setConfirmBatchOpen(false);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setRunningBatch(false);
    }
  }

  async function triggerInboxSync() {
    setRunningSync(true);
    try {
      const res = await api.runCheckInbox();
      notify("Inbox sync & auto-close completed", {
        description: `${res.syncedAccounts} mailboxes synced · ${res.autoClosedThreads} inactive thread(s) closed · ${res.nurtureScheduled} nurture check-ins`,
        kind: "success",
      });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setRunningSync(false);
    }
  }

  if (!settings) {
    return <PageHeader eyebrow="Workflow Engine" title="Automations" />;
  }

  const behavior = settings.default_behavior;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workflow Engine"
        title="Automations & Sequence Rules"
        description="Configure global follow-up cadence defaults, out-of-office handling, nurture check-ins, and background job runners."
        actions={
          <button
            type="button"
            disabled={saving}
            onClick={saveRules}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving..." : "Save rules"}</span>
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Default Follow-Up Delays */}
        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-signal" />
            <h2 className="text-base font-semibold text-foreground">Default Follow-up Cadence</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            New campaigns prefill these day delays for follow-up steps (up to 8 steps supported per sequence).
          </p>

          <div className="space-y-3">
            {settings.default_follow_up_delays.map((days, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                <span className="font-mono text-xs font-medium text-foreground">
                  Follow-up {idx + 1}
                </span>
                <div className="flex items-center gap-1.5">
                  {DELAY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const next = [...settings.default_follow_up_delays];
                        next[idx] = preset;
                        setSettings({ ...settings, default_follow_up_delays: next });
                      }}
                      className={`tabular rounded px-2 py-1 text-xs font-medium ${
                        days === preset
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset}d
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={days}
                    onChange={(e) => {
                      const next = [...settings.default_follow_up_delays];
                      next[idx] = Math.min(365, Math.max(1, Number(e.target.value) || 1));
                      setSettings({ ...settings, default_follow_up_delays: next });
                    }}
                    className="tabular h-7 w-14 rounded border border-input bg-card px-2 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Out-of-Office & Nurture Behavior */}
        <section className="rounded-lg border border-border bg-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-foreground">Reply &amp; OOO Behavior</h2>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-foreground">
              Out-of-Office (OOO) auto-responses
            </label>
            <div className="flex gap-2">
              {(["continue", "stop"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      default_behavior: { ...behavior, out_of_office: mode },
                    })
                  }
                  className={`rounded-md border px-3 py-2 text-xs font-medium ${
                    behavior.out_of_office === mode
                      ? "border-signal bg-signal-soft text-signal"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {mode === "continue" ? "Auto-resume sequence" : "Stop sequence immediately"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, automated vacation replies keep the lead active for the next scheduled step.
            </p>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={behavior.later_check_in}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_behavior: { ...behavior, later_check_in: e.target.checked },
                  })
                }
              />
              <span>Enable Step 99 Check-in Nurture for &ldquo;Not now / Later&rdquo; replies</span>
            </label>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Wait</span>
              <input
                type="number"
                min={1}
                max={365}
                value={behavior.later_delay_days}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_behavior: {
                      ...behavior,
                      later_delay_days: Math.max(1, Number(e.target.value) || 21),
                    },
                  })
                }
                className="tabular h-7 w-16 rounded border border-input bg-background px-2 text-xs"
              />
              <span className="text-muted-foreground">days before sending check-in</span>
            </div>

            <textarea
              rows={3}
              value={behavior.later_body}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  default_behavior: { ...behavior, later_body: e.target.value },
                })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
            />
          </div>

          <div className="border-t border-border pt-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Stop sequence on human reply</span>
              <span className="font-mono text-success">Always Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Stop &amp; suppress on bounce or unsubscribe</span>
              <span className="font-mono text-success">Always Active</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span>Auto-close inactive inbox threads after</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={settings.auto_close_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      auto_close_days: Math.max(1, Number(e.target.value) || 14),
                    })
                  }
                  className="tabular h-7 w-16 rounded border border-input bg-background px-2 text-xs text-foreground"
                />
                <span>days</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Scheduled Background Jobs */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Background Workers</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">Send Batch Worker</div>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                POST /api/public/jobs/send-batch · Every 1 min (* * * * *)
              </div>
            </div>
            <button
              type="button"
              disabled={runningBatch}
              onClick={() => setConfirmBatchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted shrink-0 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{runningBatch ? "Running..." : "Run now"}</span>
            </button>
          </div>

          <div className="rounded-md border border-border bg-background p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">Inbox Sync &amp; Auto-Close</div>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                Sync connected Gmail/IMAP inboxes &amp; auto-close inactive threads
              </div>
            </div>
            <button
              type="button"
              disabled={runningSync}
              onClick={triggerInboxSync}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted shrink-0 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{runningSync ? "Syncing..." : "Sync now"}</span>
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmBatchOpen}
        title="Run scheduled send batch?"
        description="Checks sending hours and dispatches due campaign emails through your connected SMTP mailboxes."
        confirmLabel="Run batch now"
        busy={runningBatch}
        onConfirm={triggerSendBatch}
        onCancel={() => setConfirmBatchOpen(false)}
      />
    </div>
  );
}
