import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Pause, Play, RefreshCw, Send } from "lucide-react";
import { api, type DashboardPayload } from "../lib/api";
import { ConfirmDialog } from "../components/app/ConfirmDialog";
import { PageHeader, StatusTag, formatDateTime } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

export function DashboardPage() {
  const { notify } = useToast();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyBatch, setBusyBatch] = useState(false);
  const [confirmBatchOpen, setConfirmBatchOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await api.getDashboard());
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function executeSendBatch() {
    setBusyBatch(true);
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
      setBusyBatch(false);
    }
  }

  async function toggleCampaign(id: string, currentStatus: string) {
    const nextStatus = currentStatus === "running" ? "paused" : "running";
    try {
      await api.updateCampaign(id, { status: nextStatus });
      notify(`Campaign ${nextStatus}`, { kind: "success" });
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  if (loading || !data) {
    return (
      <div>
        <PageHeader eyebrow="Overview" title="Deliverability & Outreach Ledger" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { stats, campaigns, recentThreads, accounts } = data;
  const maxSent = Math.max(...stats.daily_series.map((d) => d.sent), 10);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Outreach & Deliverability"
        description="Plain-text and clean HTML delivery with open pixels and click-tracking links disabled."
        actions={
          <>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              disabled={busyBatch}
              onClick={() => setConfirmBatchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{busyBatch ? "Sending batch..." : "Send next batch"}</span>
            </button>
          </>
        }
      />

      {accounts.length === 0 && campaigns.length === 0 && (
        <section className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Workspace Setup Checklist</h2>
              <p className="text-xs text-muted-foreground">
                Complete these three steps to launch your first live outreach sequence.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Link
              to="/accounts"
              className="rounded-md border border-border bg-background p-4 hover:border-signal transition-colors block"
            >
              <div className="font-mono text-[11px] uppercase tracking-wider text-signal">Step 1</div>
              <div className="mt-1 text-sm font-semibold text-foreground">Connect a Mailbox</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Add Gmail, Zoho, Outlook, or custom SMTP/IMAP credentials with auto-MX detection.
              </p>
            </Link>
            <Link
              to="/leads"
              className="rounded-md border border-border bg-background p-4 hover:border-signal transition-colors block"
            >
              <div className="font-mono text-[11px] uppercase tracking-wider text-signal">Step 2</div>
              <div className="mt-1 text-sm font-semibold text-foreground">Import Contacts</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload a CSV or add prospects, then run live DNS/MX email verification.
              </p>
            </Link>
            <Link
              to="/campaigns"
              className="rounded-md border border-border bg-background p-4 hover:border-signal transition-colors block"
            >
              <div className="font-mono text-[11px] uppercase tracking-wider text-signal">Step 3</div>
              <div className="mt-1 text-sm font-semibold text-foreground">Launch Sequence</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Build up to 8 follow-ups with automatic reply, bounce, and opt-out stopping.
              </p>
            </Link>
          </div>
        </section>
      )}

      {/* Metric Strip */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Sent (14d)</div>
          <div className="tabular mt-2 text-2xl font-semibold text-foreground">{stats.total_sent}</div>
          <div className="tabular mt-1 text-xs text-muted-foreground">{stats.sent_today} sent today</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Replies</div>
          <div className="tabular mt-2 text-2xl font-semibold text-foreground">{stats.total_replies}</div>
          <div className="tabular mt-1 text-xs text-success">{stats.reply_rate}% reply rate</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Positive Intent</div>
          <div className="tabular mt-2 text-2xl font-semibold text-foreground">{stats.positive_rate}%</div>
          <div className="tabular mt-1 text-xs text-muted-foreground">
            {stats.positive_replies} interested threads
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Bounce Rate</div>
          <div className="tabular mt-2 text-2xl font-semibold text-foreground">{stats.bounce_rate}%</div>
          <div className="mt-1 text-xs text-muted-foreground">Threshold &lt; 2.0%</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Active Campaigns</div>
          <div className="tabular mt-2 text-2xl font-semibold text-foreground">{stats.active_campaigns}</div>
          <div className="tabular mt-1 text-xs text-signal">{stats.open_threads} open inbox threads</div>
        </div>
      </section>

      {/* 14-Day Activity + Mailbox Capacity */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">14-Day Send &amp; Reply Volume</h2>
              <p className="text-xs text-muted-foreground">Daily outbound emails vs. human replies captured</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-primary" /> Sent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-signal" /> Replies
              </span>
            </div>
          </div>

          <div className="grid grid-cols-14 gap-1.5 items-end h-44 pt-4">
            {stats.daily_series.map((day) => {
              const sentPct = day.sent > 0 ? Math.max(4, Math.round((day.sent / maxSent) * 100)) : 2;
              const replyPct = day.replies > 0 ? Math.max(4, Math.round((day.replies / maxSent) * 100)) : 0;
              return (
                <div key={day.date} className="group flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="w-full flex items-end justify-center gap-0.5 flex-1">
                    <div
                      title={`${day.label}: ${day.sent} sent`}
                      style={{ height: `${sentPct}%` }}
                      className={`w-2.5 sm:w-3 rounded-t-xs transition-colors ${
                        day.sent > 0 ? "bg-primary/85 group-hover:bg-primary" : "bg-muted"
                      }`}
                    />
                    {replyPct > 0 && (
                      <div
                        title={`${day.label}: ${day.replies} replies`}
                        style={{ height: `${replyPct}%` }}
                        className="w-2 sm:w-2.5 rounded-t-xs bg-signal"
                      />
                    )}
                  </div>
                  <span className="tabular text-[10px] text-muted-foreground -rotate-45 origin-top-left sm:rotate-0 truncate">
                    {day.label.split(" ")[1]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-base font-semibold text-foreground">Sending Mailboxes</h2>
              <Link to="/accounts" className="text-xs font-medium text-signal hover:underline">
                Manage
              </Link>
            </div>
            {accounts.length === 0 ? (
              <div className="py-6 text-xs text-muted-foreground">
                No mailboxes connected yet.{" "}
                <Link to="/accounts" className="text-signal font-medium hover:underline">
                  Connect one now
                </Link>
                .
              </div>
            ) : (
              <div className="space-y-3.5">
                {accounts.map((acc) => {
                  const cap = acc.warmup_enabled
                    ? Math.min(acc.daily_limit, acc.warmup_daily_cap)
                    : acc.daily_limit;
                  const pct = Math.min(100, Math.round((acc.sent_today / Math.max(1, cap)) * 100));
                  return (
                    <div key={acc.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-foreground truncate">{acc.email}</span>
                        <span className="tabular text-muted-foreground shrink-0">
                          {acc.sent_today}/{cap}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Verified Contacts</span>
            <span className="tabular font-medium text-foreground">{stats.verified_leads}</span>
          </div>
        </div>
      </section>

      {/* Active Campaigns & Inbox Highlights */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">Campaigns</h2>
            <Link to="/campaigns" className="text-xs font-medium text-signal hover:underline">
              All campaigns
            </Link>
          </div>
          <div className="divide-y divide-border">
            {campaigns.length === 0 ? (
              <div className="px-5 py-8 text-xs text-muted-foreground">
                No campaigns created yet.{" "}
                <Link to="/campaigns" className="text-signal font-medium hover:underline">
                  Create your first campaign
                </Link>
                .
              </div>
            ) : (
              campaigns.map((cmp) => (
                <div key={cmp.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/30">
                  <div className="min-w-0">
                    <Link
                      to={`/campaigns/${cmp.id}`}
                      className="text-sm font-medium text-foreground hover:text-signal transition-colors truncate block"
                    >
                      {cmp.name}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="tabular">{cmp.enrolled_count} enrolled</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular">{cmp.replied_count} replied</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular">{cmp.follow_ups.length + 1} steps</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <StatusTag value={cmp.status} />
                    {cmp.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => toggleCampaign(cmp.id, cmp.status)}
                        className="rounded border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={cmp.status === "running" ? "Pause campaign" : "Start campaign"}
                      >
                        {cmp.status === "running" ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">Inbox Highlights</h2>
            <Link to="/inbox" className="text-xs font-medium text-signal hover:underline">
              Open Unified Inbox
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentThreads.length === 0 ? (
              <div className="px-5 py-8 text-xs text-muted-foreground">
                No email threads yet. Outbound sends and synced replies appear here automatically.
              </div>
            ) : (
              recentThreads.map(({ conv, lead, lastMessage, campaign }) => (
                <Link
                  key={conv.thread_id}
                  to={`/inbox?thread=${conv.thread_id}`}
                  className="flex items-start justify-between gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {lead.first_name} {lead.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {lead.company}
                      </span>
                      {lastMessage.category && <StatusTag value={lastMessage.category} />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {lastMessage.body}
                    </p>
                    <div className="mt-1 text-[11px] text-muted-foreground/80 flex items-center gap-2">
                      <span>{campaign?.name ?? "Direct thread"}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular">{formatDateTime(lastMessage.created_at)}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmBatchOpen}
        title="Dispatch live email batch?"
        description="This will send real emails via your connected SMTP mailboxes to eligible recipients in running campaigns."
        confirmLabel="Send batch now"
        busy={busyBatch}
        onConfirm={executeSendBatch}
        onCancel={() => setConfirmBatchOpen(false)}
      />
    </div>
  );
}
