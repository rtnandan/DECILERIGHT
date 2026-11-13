import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Mail,
  Pause,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { presetForAccount, providerByKey } from "../lib/providers";
import type { SendingAccount } from "../lib/types";
import { PageHeader, StatusTag, formatDateTime } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

export function AccountsPage() {
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<SendingAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Selected account editable fields
  const [displayName, setDisplayName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [warmupEnabled, setWarmupEnabled] = useState(false);
  const [warmupCap, setWarmupCap] = useState(30);
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Connect a mailbox modal (auto-MX detection, encrypted SMTP/IMAP credentials)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [emailsPerDay, setEmailsPerDay] = useState(50);
  const [providerKey, setProviderKey] = useState("gmail");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(465);
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState(993);
  const [password, setPassword] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectedOnce, setDetectedOnce] = useState(false);
  const [showAdvancedCustom, setShowAdvancedCustom] = useState(false);
  const [creating, setCreating] = useState(false);
  const detectTimer = useRef<number | null>(null);

  async function load(selectFirst = false) {
    setLoading(true);
    try {
      const rows = await api.listAccounts();
      setAccounts(rows);
      if ((selectFirst || !selectedId) && rows[0]) {
        pickAccount(rows[0]);
      } else if (rows.length === 0) {
        setSelectedId("");
      }
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
  }, []);

  function pickAccount(acc: SendingAccount) {
    setSelectedId(acc.id);
    setDisplayName(acc.display_name);
    setDailyLimit(acc.daily_limit);
    setWarmupEnabled(acc.warmup_enabled);
    setWarmupCap(acc.warmup_daily_cap);
    setSignature(acc.signature);
  }

  function openWizard() {
    setEmail("");
    setSenderName("");
    setEmailsPerDay(50);
    setPassword("");
    setProviderKey("gmail");
    setSmtpHost("smtp.gmail.com");
    setSmtpPort(465);
    setImapHost("imap.gmail.com");
    setImapPort(993);
    setDetectedOnce(false);
    setShowAdvancedCustom(false);
    setWizardOpen(true);
  }

  async function runDetectMx(targetEmail: string) {
    const trimmed = targetEmail.trim();
    const parts = trimmed.split("@");
    if (parts.length !== 2 || !parts[1]?.includes(".")) return;

    setDetecting(true);
    try {
      const res = await api.detectMx(trimmed);
      setProviderKey(res.detected.providerKey);
      setDetectedOnce(true);
      const first = res.detected.candidates[0];
      if (first) {
        setSmtpHost(first.smtpHost);
        setSmtpPort(first.smtpPort);
        setImapHost(first.imapHost);
        setImapPort(first.imapPort);
      }
    } catch {
      // Keep quiet on transient lookup issues
    } finally {
      setDetecting(false);
    }
  }

  function handleEmailChange(nextEmail: string) {
    setEmail(nextEmail);
    if (detectTimer.current) window.clearTimeout(detectTimer.current);
    const parts = nextEmail.trim().split("@");
    if (parts.length === 2 && parts[1] && parts[1].includes(".")) {
      detectTimer.current = window.setTimeout(() => {
        runDetectMx(nextEmail);
      }, 350);
    } else {
      setDetectedOnce(false);
    }
  }

  async function handleConnectSmtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setCreating(true);
    try {
      const created = await api.createAccount({
        email: email.trim(),
        display_name: senderName.trim() || email.split("@")[0],
        provider: "smtp",
        provider_label: providerKey,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        imap_host: imapHost,
        imap_port: imapPort,
        password: password.trim(),
        daily_limit: emailsPerDay || 50,
        warmup_enabled: false,
        warmup_daily_cap: 30,
      });
      notify(`Connected ${created.email}`, { kind: "success" });
      setWizardOpen(false);
      await load();
      pickAccount(created);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function handleTestConnection(id: string) {
    setTesting(true);
    try {
      await api.testAccount(id);
      notify("SMTP & IMAP connection verified", {
        description: "Both outbound sending and inbound reply syncing succeeded.",
        kind: "success",
      });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setTesting(false);
    }
  }

  async function saveAccount() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const updated = await api.updateAccount(selectedId, {
        display_name: displayName,
        daily_limit: dailyLimit,
        warmup_enabled: warmupEnabled,
        warmup_daily_cap: warmupCap,
        signature,
      });
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      notify("Mailbox settings saved", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(acc: SendingAccount) {
    const next = acc.status === "active" ? "paused" : "active";
    try {
      const updated = await api.updateAccount(acc.id, { status: next });
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      notify(`${acc.email} is now ${next}`, { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function removeAccount(id: string) {
    try {
      await api.deleteAccount(id);
      setSelectedId("");
      notify("Mailbox removed", { kind: "info" });
      await load(true);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  const activeAccount = accounts.find((a) => a.id === selectedId) ?? null;
  const activePreset = activeAccount ? presetForAccount(activeAccount) : null;

  const detectedPreset = providerByKey(providerKey);
  const isGmailDetected = providerKey === "gmail";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deliverability Infrastructure"
        title="Email Accounts"
        description="Connect Gmail, Zoho Mail, Outlook, GoDaddy, or custom domain mailboxes with automatic MX detection and AES-256-GCM encrypted credentials."
        actions={
          <button
            type="button"
            onClick={openWizard}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Connect mailbox</span>
          </button>
        }
      />

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">
          Loading mailboxes...
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center space-y-3">
          <Mail className="h-7 w-7 text-signal mx-auto" />
          <h2 className="text-base font-semibold text-foreground">No mailboxes connected yet</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Enter your Gmail, Zoho, Outlook, or custom domain email and password — we detect the right SMTP and IMAP server settings automatically.
          </p>
          <button
            type="button"
            onClick={openWizard}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Connect a mailbox</span>
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Left List */}
          <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => pickAccount(acc)}
                className={`w-full text-left px-4 py-4 transition-colors ${
                  selectedId === acc.id ? "bg-accent/70" : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{acc.email}</span>
                  <StatusTag value={acc.status} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {acc.display_name || acc.email.split("@")[0]} · SMTP/IMAP
                  </span>
                  <span className="tabular">
                    {acc.sent_today}/
                    {acc.warmup_enabled ? Math.min(acc.daily_limit, acc.warmup_daily_cap) : acc.daily_limit} today
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Right Detail Panel */}
          {activeAccount && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-signal" />
                    <h2 className="text-lg font-semibold text-foreground">{activeAccount.email}</h2>
                    <StatusTag value={activeAccount.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    <span>{activePreset?.shortLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>Last synced: {formatDateTime(activeAccount.last_synced_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={testing}
                    onClick={() => handleTestConnection(activeAccount.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <Activity className="h-3.5 w-3.5 text-success" />
                    <span>{testing ? "Testing..." : "Test SMTP & IMAP"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleStatus(activeAccount)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    {activeAccount.status === "active" ? (
                      <>
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Activate
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAccount(activeAccount.id)}
                    className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label="Remove mailbox"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveAccount}
                    className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-1.5 text-xs font-medium text-signal-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{saving ? "Saving..." : "Save"}</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium mb-1">From display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Daily sending limit</label>
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value) || 50)}
                    className="tabular h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-md border border-border bg-background p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={warmupEnabled}
                      onChange={(e) => setWarmupEnabled(e.target.checked)}
                    />
                    <span>Enable Warmup Ramp Cap</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Warmup max/day:</span>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      disabled={!warmupEnabled}
                      value={warmupCap}
                      onChange={(e) => setWarmupCap(Number(e.target.value) || 30)}
                      className="tabular h-7 w-16 rounded border border-input bg-card px-2 text-xs disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled, outbound volume for this mailbox is capped at the warmup limit until domain reputation matures.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Mailbox Signature (supports markdown links like <code>[DECILE](https://decilemedia.co)</code>)
                </label>
                <textarea
                  rows={4}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Leave blank to use your global default signature from Settings."
                  className="w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed"
                />
              </div>

              {activePreset && (
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    <span>Connection &amp; DNS Profile</span>
                  </div>
                  <div className="font-mono text-muted-foreground">
                    SMTP: {activeAccount.smtp_host}:{activeAccount.smtp_port} · IMAP: {activeAccount.imap_host}:{activeAccount.imap_port}
                  </div>
                  {activePreset.spfInclude && (
                    <div className="font-mono text-muted-foreground">
                      Expected SPF include: {activePreset.spfInclude} · DKIM selectors:{" "}
                      {activePreset.dkimSelectors.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Connect a mailbox modal — auto-MX detection & encrypted app-password flow */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[490px] rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="flex items-start justify-between px-6 pt-6 pb-2">
              <div className="pr-4">
                <h3 className="font-display text-xl font-semibold text-foreground">
                  Connect a mailbox
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Enter the email and password — we find the right settings automatically. The password is stored encrypted and never shown again.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="text-muted-foreground hover:text-foreground pt-0.5"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConnectSmtp} className="px-6 pb-6 pt-3 space-y-4">
              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => runDetectMx(email)}
                  placeholder="you@company.com"
                  className="h-10 w-full rounded-md border border-input bg-[#EEF3FE] px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-signal/70"
                />

                {(detectedOnce || detecting) && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span>
                      {detecting ? "Detecting mail provider..." : detectedPreset.shortLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Provider Instructions & Quick Links Card */}
              <div className="rounded-md border border-border bg-muted/40 p-3.5 space-y-3 text-xs text-muted-foreground">
                <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
                  {detectedPreset.passwordSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>

                {(detectedPreset.extraLink || detectedPreset.passwordLink) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {detectedPreset.extraLink && (
                      <a
                        href={detectedPreset.extraLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <span>{detectedPreset.extraLink.label}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    )}
                    {detectedPreset.passwordLink && (
                      <a
                        href={detectedPreset.passwordLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <KeyRound className="h-3 w-3 text-muted-foreground" />
                        <span>{detectedPreset.passwordLink.label}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                )}

                {providerKey === "custom" && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedCustom((v) => !v)}
                      className="text-[11px] font-medium text-foreground underline underline-offset-2"
                    >
                      {showAdvancedCustom ? "Hide server host & port" : "Adjust SMTP / IMAP host & port"}
                    </button>
                    {showAdvancedCustom && (
                      <div className="mt-2.5 grid grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          placeholder="SMTP host"
                          className="col-span-3 h-8 rounded border border-input bg-card px-2 font-mono text-[11px]"
                        />
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(Number(e.target.value) || 465)}
                          className="tabular h-8 rounded border border-input bg-card px-2 text-[11px]"
                        />
                        <input
                          type="text"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                          placeholder="IMAP host"
                          className="col-span-3 h-8 rounded border border-input bg-card px-2 font-mono text-[11px]"
                        />
                        <input
                          type="number"
                          value={imapPort}
                          onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                          className="tabular h-8 rounded border border-input bg-card px-2 text-[11px]"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Password / App Password */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  {isGmailDetected ? "App password" : "Password (or app password)"}
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Sender name + Emails per day */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Sender name
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Emails per day
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={emailsPerDay}
                    onChange={(e) => setEmailsPerDay(Number(e.target.value) || 50)}
                    className="tabular h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-foreground hover:text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !email.trim() || !password.trim()}
                  className="rounded-md bg-signal px-5 py-2 text-xs font-semibold text-signal-foreground hover:opacity-90 disabled:opacity-45"
                >
                  {creating ? "Verifying..." : "Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
