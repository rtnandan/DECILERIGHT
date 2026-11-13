import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Mail,
  Pause,
  Play,
  Save,
  Send,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { api, type CampaignDetailPayload } from "../lib/api";
import { composeEmail, inboxWarnings, pickSignature } from "../lib/compose";
import { STANDARD_VARIABLES, toCsv } from "../lib/email-utils";
import type { Attachment, BehaviorRules, CampaignStatus, FollowUpStep, Lead } from "../lib/types";
import { AttachmentsPicker } from "../components/app/AttachmentsPicker";
import { ConfirmDialog } from "../components/app/ConfirmDialog";
import { SequenceEditor } from "../components/app/SequenceEditor";
import { TemplatePicker } from "../components/app/TemplatePicker";
import { PageHeader, StatusTag, formatDateTime } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const [data, setData] = useState<CampaignDetailPayload | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [confirmBatchOpen, setConfirmBatchOpen] = useState(false);

  const [tab, setTab] = useState<"sequence" | "behavior" | "recipients">("sequence");

  // Local editable draft fields
  const [name, setName] = useState("");
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpStep[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [behavior, setBehavior] = useState<BehaviorRules | null>(null);
  const [previewLeadId, setPreviewLeadId] = useState<string>("");

  // Modals
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollIds, setEnrollIds] = useState<string[]>([]);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [detail, leads] = await Promise.all([api.getCampaign(id), api.listLeads()]);
      setData(detail);
      setAllLeads(leads);
      setName(detail.campaign.name);
      setStatus(detail.campaign.status);
      setSubject(detail.campaign.subject);
      setBody(detail.campaign.body);
      setAttachments(detail.campaign.attachments ?? []);
      setFollowUps(detail.campaign.follow_ups ?? []);
      setAccountIds(detail.campaign.account_ids ?? []);
      setDailyLimit(detail.campaign.daily_limit);
      setBehavior(detail.campaign.behavior);
      if (!previewLeadId && (detail.recipients[0]?.lead || leads[0])) {
        setPreviewLeadId(detail.recipients[0]?.lead.id ?? leads[0]!.id);
      }
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function saveChanges(nextStatus?: CampaignStatus) {
    if (!id || !behavior) return;
    setSaving(true);
    try {
      const targetStatus = nextStatus ?? status;
      await api.updateCampaign(id, {
        name,
        status: targetStatus,
        subject,
        body,
        attachments,
        follow_ups: followUps,
        account_ids: accountIds,
        daily_limit: dailyLimit,
        behavior,
      });
      setStatus(targetStatus);
      notify(nextStatus ? `Campaign status set to ${nextStatus}` : "Campaign saved", {
        kind: "success",
      });
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function executeSendBatch() {
    setRunningBatch(true);
    try {
      const r = await api.runSendBatch(true);
      notify(`Batch complete: ${r.sent} sent, ${r.skipped} skipped`, {
        description: r.notes[0],
        kind: r.failed > 0 && r.sent === 0 ? "error" : "success",
      });
      setConfirmBatchOpen(false);
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setRunningBatch(false);
    }
  }

  async function handleTestSend(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !testEmail.trim()) return;
    setSendingTest(true);
    try {
      const r = await api.sendTestEmail(id, {
        toEmail: testEmail.trim(),
        accountId: accountIds[0],
        sampleLeadId: previewLeadId,
      });
      notify(`Test email sent (${r.mode})`, {
        description: `Subject: ${r.preview.subject}`,
        kind: "success",
      });
      setTestModalOpen(false);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setSendingTest(false);
    }
  }

  async function handleEnroll() {
    if (!id || !enrollIds.length) return;
    try {
      const r = await api.enrollLeads(id, enrollIds);
      notify(`Enrolled ${r.added} lead(s)`, {
        description: r.skipped > 0 ? `${r.skipped} skipped (already enrolled or suppressed)` : undefined,
        kind: "success",
      });
      setEnrollModalOpen(false);
      setEnrollIds([]);
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  function exportRecipientsCsv() {
    if (!data) return;
    const csv = toCsv(
      data.recipients.map((r) => ({
        email: r.lead.email,
        first_name: r.lead.first_name,
        company: r.lead.company,
        step: r.current_step,
        status: r.status,
        last_sent_at: r.last_sent_at ?? "",
        next_send_at: r.next_send_at ?? "",
        stop_reason: r.stop_reason ?? "",
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-recipients.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !data || !behavior) {
    return (
      <div>
        <PageHeader eyebrow="Campaign" title="Loading campaign..." />
      </div>
    );
  }

  const editable = status === "draft" || status === "paused";
  const sampleLead =
    allLeads.find((l) => l.id === previewLeadId) ??
    data.recipients[0]?.lead ?? {
      first_name: "Elena",
      last_name: "Rostova",
      company: "LatticeFlow",
      designation: "VP Marketing",
      industry: "B2B SaaS",
      email: "elena@latticeflow.io",
      ai_line: "Loved your breakdown on why product-led demos outperform static whitepapers.",
      custom_fields: {},
    };
  const primaryAccount =
    data.accounts.find((a) => accountIds.includes(a.id)) ?? data.accounts[0];
  const composedPreview = composeEmail({
    subject,
    body,
    signature: pickSignature(primaryAccount?.signature, data.settings.default_signature),
    lead: sampleLead,
    optOut: true,
    attachments,
  });
  const warnings = inboxWarnings(composedPreview.subject, composedPreview.body);

  const enrolledSet = new Set(data.recipients.map((r) => r.lead_id));
  const availableToEnroll = allLeads.filter((l) => !enrolledSet.has(l.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/campaigns" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Campaigns</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-foreground font-medium">{name}</span>
      </div>

      <PageHeader
        eyebrow={`Campaign · ${followUps.length + 1} sequence steps · ${data.recipients.length} recipients`}
        title={name}
        actions={
          <>
            <StatusTag value={status} />
            <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
              {(["draft", "running", "paused"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => saveChanges(st)}
                  className={`rounded px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                    status === st
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTestModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted whitespace-nowrap shrink-0"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Test email</span>
            </button>
            <button
              type="button"
              disabled={runningBatch}
              onClick={() => setConfirmBatchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{runningBatch ? "Sending..." : "Send batch"}</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => saveChanges()}
              className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
          </>
        }
      />

      {!editable && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-xs text-foreground">
          <span>
            This campaign is currently <strong>running</strong>. Pause it to edit sequence steps, attachments, or copy safely.
          </span>
          <button
            type="button"
            onClick={() => saveChanges("paused")}
            className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted shrink-0"
          >
            <Pause className="h-3 w-3" /> Pause to edit
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { key: "sequence", label: "Email & Sequence" },
          { key: "behavior", label: "Sending & Behavior" },
          { key: "recipients", label: `Recipients (${data.recipients.length})` },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key as typeof tab)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === item.key
                ? "border-signal text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "sequence" && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Initial Email */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                    Step 1 · Initial Email
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sent in primary plain-text + clean HTML without tracking pixels.
                  </p>
                </div>
                <TemplatePicker
                  kinds={["email"]}
                  disabled={!editable}
                  onPick={(tpl) => {
                    if (tpl.subject) setSubject(tpl.subject);
                    setBody(tpl.body);
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Subject line</label>
                <input
                  type="text"
                  disabled={!editable}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-medium text-foreground">Body copy</label>
                  <div className="flex flex-wrap items-center gap-1">
                    {STANDARD_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={!editable}
                        onClick={() => setBody((prev) => `${prev}${prev.endsWith(" ") || !prev ? "" : " "}{{${v}}}`)}
                        className="font-mono text-[11px] rounded border border-border bg-background px-1.5 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={7}
                  disabled={!editable}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-foreground mb-1.5">Attachments &amp; links</div>
                <AttachmentsPicker value={attachments} onChange={setAttachments} disabled={!editable} />
              </div>
            </div>

            {/* Follow-up Sequence Editor */}
            <SequenceEditor steps={followUps} onChange={setFollowUps} disabled={!editable} />
          </div>

          {/* Right Rail: Live Lead Preview & Deliverability Audit */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4 sticky top-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Live Inbox Preview</h3>
                <select
                  value={previewLeadId}
                  onChange={(e) => setPreviewLeadId(e.target.value)}
                  className="h-8 max-w-[180px] rounded border border-input bg-background px-2 text-xs focus:outline-none"
                >
                  {allLeads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.first_name} {l.last_name} ({l.company})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-border bg-background p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>From: {primaryAccount?.email ?? "No account selected"}</span>
                  <span className="font-mono text-[11px]">No tracking</span>
                </div>
                <div className="font-medium text-sm text-foreground border-b border-border pb-2">
                  {composedPreview.subject || "(No subject)"}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                  {composedPreview.body}
                </pre>
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  {warnings.length === 0 ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-success" />
                      <span>Primary-inbox deliverability check passed</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span>{warnings.length} deliverability note(s)</span>
                    </>
                  )}
                </div>
                {warnings.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "behavior" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground">Sending Mailboxes &amp; Caps</h3>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Campaign name</label>
              <input
                type="text"
                disabled={!editable}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Daily send limit</label>
              <input
                type="number"
                min={1}
                max={1000}
                disabled={!editable}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value) || 50)}
                className="tabular h-9 w-36 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">
                Assigned mailboxes (round-robin rotation)
              </label>
              <div className="space-y-2">
                {data.accounts.map((acc) => {
                  const checked = accountIds.includes(acc.id);
                  return (
                    <label
                      key={acc.id}
                      className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={checked}
                          onChange={() =>
                            setAccountIds((prev) =>
                              checked ? prev.filter((x) => x !== acc.id) : [...prev, acc.id],
                            )
                          }
                        />
                        <span className="font-medium text-foreground">{acc.email}</span>
                      </span>
                      <StatusTag value={acc.status} />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h3 className="text-base font-semibold text-foreground">Reply &amp; OOO Behavior Rules</h3>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                When an Out-of-Office (OOO) auto-reply is received
              </label>
              <div className="flex items-center gap-2">
                {(["continue", "stop"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={!editable}
                    onClick={() => setBehavior({ ...behavior, out_of_office: opt })}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize ${
                      behavior.out_of_office === opt
                        ? "border-signal bg-signal-soft text-signal"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {opt === "continue" ? "Continue sequence" : "Stop sequence"}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={behavior.later_check_in}
                  onChange={(e) => setBehavior({ ...behavior, later_check_in: e.target.checked })}
                />
                <span>Send a single check-in nurture (Step 99) on &ldquo;Not now / later&rdquo; replies</span>
              </label>
              {behavior.later_check_in && (
                <div className="space-y-2.5 pl-5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Delay after reply:</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      disabled={!editable}
                      value={behavior.later_delay_days}
                      onChange={(e) =>
                        setBehavior({ ...behavior, later_delay_days: Number(e.target.value) || 21 })
                      }
                      className="tabular h-7 w-16 rounded border border-input bg-background px-2 text-xs"
                    />
                    <span className="text-muted-foreground">days</span>
                  </div>
                  <textarea
                    rows={3}
                    disabled={!editable}
                    value={behavior.later_body}
                    onChange={(e) => setBehavior({ ...behavior, later_body: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "recipients" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Every enrolled contact stops automatically upon human reply, bounce, or unsubscribe request.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportRecipientsCsv}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={() => setEnrollModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Enroll leads</span>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Step</th>
                  <th className="px-4 py-3 font-medium">Mailbox</th>
                  <th className="px-4 py-3 font-medium">Last Sent</th>
                  <th className="px-5 py-3 font-medium">Reason / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recipients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-xs text-muted-foreground">
                      No leads enrolled in this campaign yet.
                    </td>
                  </tr>
                ) : (
                  data.recipients.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3">
                        <div className="font-medium text-foreground">
                          {r.lead.first_name} {r.lead.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.lead.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">{r.lead.company || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusTag value={r.status} />
                      </td>
                      <td className="tabular px-4 py-3 text-right text-xs text-foreground">
                        {r.current_step}/{followUps.length + 1}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.account?.email ?? "—"}
                      </td>
                      <td className="tabular px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(r.last_sent_at)}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {r.stop_reason ? r.stop_reason.replace(/_/g, " ") : "In sequence"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Test Email Modal */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Send Test Email</h3>
              <button type="button" onClick={() => setTestModalOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleTestSend} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Recipient email address</label>
                <input
                  type="email"
                  required
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@yourdomain.com"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTestModalOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="rounded-md bg-signal px-4 py-1.5 text-xs font-medium text-signal-foreground disabled:opacity-50"
                >
                  {sendingTest ? "Sending..." : "Send test"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll Leads Modal */}
      {enrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Enroll Contacts</h3>
              <button type="button" onClick={() => setEnrollModalOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {availableToEnroll.length === 0 ? (
              <p className="text-xs text-muted-foreground">All contacts are already enrolled in this campaign.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-border border border-border rounded-md">
                {availableToEnroll.map((l) => {
                  const checked = enrollIds.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEnrollIds((prev) =>
                              checked ? prev.filter((x) => x !== l.id) : [...prev, l.id],
                            )
                          }
                        />
                        <span className="font-medium text-foreground">
                          {l.first_name} {l.last_name}
                        </span>
                        <span className="text-muted-foreground">{l.email}</span>
                      </span>
                      <StatusTag value={l.email_check} />
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnrollModalOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={enrollIds.length === 0}
                onClick={handleEnroll}
                className="rounded-md bg-signal px-4 py-1.5 text-xs font-medium text-signal-foreground disabled:opacity-50"
              >
                Enroll ({enrollIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBatchOpen}
        title="Send next campaign batch?"
        description="This will dispatch live emails via your connected SMTP mailboxes to due recipients in running campaigns."
        confirmLabel="Send batch now"
        busy={runningBatch}
        onConfirm={executeSendBatch}
        onCancel={() => setConfirmBatchOpen(false)}
      />
    </div>
  );
}
