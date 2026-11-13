import React, { useEffect, useState } from "react";
import { KeyRound, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { AppSettings, Suppression } from "../lib/types";
import { PageHeader, StatusTag, formatShortDate } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "UTC",
];

export function SettingsPage() {
  const { notify } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [saving, setSaving] = useState(false);

  const [newSuppressEmail, setNewSuppressEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [updatingAuth, setUpdatingAuth] = useState(false);

  async function load() {
    try {
      const [res, session] = await Promise.all([
        api.getSettings(),
        api.getAuthSession().catch(() => ({ email: "" })),
      ]);
      setSettings(res.settings);
      setSuppressions(res.suppressions);
      if (session.email) setLoginEmail(session.email);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      notify("Settings saved", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSuppression(e: React.FormEvent) {
    e.preventDefault();
    if (!newSuppressEmail.trim()) return;
    try {
      const updated = await api.addSuppression({
        email: newSuppressEmail.trim(),
        reason: "manual",
        source: "Settings blocklist",
      });
      setSuppressions(updated);
      setNewSuppressEmail("");
      notify("Added to global suppression list", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleRemoveSuppression(id: string) {
    try {
      await api.deleteSuppression(id);
      setSuppressions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleUpdateLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || loginPassword.length < 4) return;
    setUpdatingAuth(true);
    try {
      await api.updateWorkspacePassword({ email: loginEmail.trim(), password: loginPassword });
      setLoginPassword("");
      notify("Workspace login updated", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setUpdatingAuth(false);
    }
  }

  if (!settings) {
    return <PageHeader eyebrow="Configuration" title="Settings" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Configuration"
        title="Settings & Suppression"
        description="Control your global sending schedule, AI Copilot company context, fallback signature, and opt-out blocklist."
      />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Sending Window */}
          <section className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Sending Schedule Window</h2>
            <p className="text-xs text-muted-foreground">
              Background send-batch jobs only dispatch campaign steps inside this local window.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Start hour (0–23)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={settings.send_start_hour}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      send_start_hour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  className="tabular h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">End hour (1–24)</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={settings.send_end_hour}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      send_end_hour: Math.min(24, Math.max(1, Number(e.target.value) || 24)),
                    })
                  }
                  className="tabular h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Time zone</label>
                <select
                  value={settings.time_zone}
                  onChange={(e) => setSettings({ ...settings, time_zone: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Auto-close inactive threads (days)</label>
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
                  className="tabular h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={settings.send_weekdays_only}
                onChange={(e) =>
                  setSettings({ ...settings, send_weekdays_only: e.target.checked })
                }
              />
              <span>Send on weekdays only (Monday – Friday)</span>
            </label>
          </section>

          {/* Company Context & Signature */}
          <section className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">AI Context &amp; Global Signature</h2>

            <div>
              <label className="block text-xs font-medium mb-1">
                Company context (used by AI Copilot &amp; Icebreaker Generator)
              </label>
              <textarea
                rows={4}
                value={settings.ai_context}
                onChange={(e) => setSettings({ ...settings, ai_context: e.target.value })}
                className="w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Default fallback signature (used if mailbox signature is blank)
              </label>
              <textarea
                rows={3}
                value={settings.default_signature}
                onChange={(e) => setSettings({ ...settings, default_signature: e.target.value })}
                className="w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed"
              />
            </div>
          </section>
        </div>

        {/* Deliverability Lock Banner & Save */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4">
          <div className="flex items-center gap-2.5 text-xs text-foreground">
            <ShieldCheck className="h-4 w-4 text-success shrink-0" />
            <span>
              <strong>Deliverability Lock:</strong> Open-tracking pixels and click-tracking link redirects are permanently disabled to maximize primary inbox placement.
            </span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving..." : "Save settings"}</span>
          </button>
        </div>
      </form>

      {/* Global Suppression List */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Global Suppression List</h2>
            <p className="text-xs text-muted-foreground">
              Unsubscribes and hard bounces are blocked across every campaign and mailbox.
            </p>
          </div>
          <form onSubmit={handleAddSuppression} className="flex items-center gap-2">
            <input
              type="email"
              required
              value={newSuppressEmail}
              onChange={(e) => setNewSuppressEmail(e.target.value)}
              placeholder="Block email address..."
              className="h-9 w-60 rounded-md border border-input bg-background px-3 text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 h-9 text-xs font-medium hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Block</span>
            </button>
          </form>
        </div>

        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Reason</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Added</th>
                <th className="px-4 py-2.5 font-medium text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {suppressions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No suppressed email addresses yet. Unsubscribes and bounces are added automatically.
                  </td>
                </tr>
              ) : (
                suppressions.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">{s.email}</td>
                    <td className="px-4 py-2.5">
                      <StatusTag value={s.reason} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.source}</td>
                    <td className="tabular px-4 py-2.5 text-xs text-muted-foreground">
                      {formatShortDate(s.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveSuppression(s.id)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Remove suppression"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Workspace Login Credentials */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Workspace Login</h2>
          <p className="text-xs text-muted-foreground">
            Update the email and password used to enter this DECILE Outreach workspace.
          </p>
        </div>
        <form onSubmit={handleUpdateLogin} className="grid gap-3 sm:grid-cols-3 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">Workspace email</label>
            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">New password (min 4 chars)</label>
            <input
              type="password"
              required
              minLength={4}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Enter new password"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={updatingAuth}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 h-9 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{updatingAuth ? "Updating..." : "Update login"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
