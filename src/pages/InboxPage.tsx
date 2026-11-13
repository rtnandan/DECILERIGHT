import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Ban,
  CheckCircle2,
  ExternalLink,
  Link2,
  Mail,
  Paperclip,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Video,
} from "lucide-react";
import { api } from "../lib/api";
import { getVideoEmbedUrl } from "../lib/attachments";
import { stepLabel } from "../lib/followups";
import type { Attachment, InboxThreadItem } from "../lib/types";
import { AttachmentsPicker } from "../components/app/AttachmentsPicker";
import { ConfirmDialog } from "../components/app/ConfirmDialog";
import { TemplatePicker } from "../components/app/TemplatePicker";
import { PageHeader, StatusTag, formatDateTime, formatShortDate } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

type SubFilter = "all" | "unread" | "replied" | "sent";

function threadDirectionBadge(item: InboxThreadItem): { label: string; tone: string } {
  const last = item.last_message;
  if (last.direction === "inbound") {
    if (last.category === "bounce") {
      return { label: "Bounced", tone: "bg-danger-soft text-destructive" };
    }
    if (last.category === "out_of_office") {
      return { label: "Auto OOO", tone: "bg-warning-soft text-warning" };
    }
    if (last.category === "unsubscribe") {
      return { label: "Unsubscribed", tone: "bg-danger-soft text-destructive" };
    }
    return item.state.unread
      ? { label: "New reply", tone: "bg-signal text-signal-foreground" }
      : { label: "Replied", tone: "bg-success-soft text-success" };
  }
  if (last.is_manual) {
    return { label: "You replied", tone: "bg-muted text-muted-foreground" };
  }
  if (last.step > 0) {
    return { label: `Follow-up ${last.step}`, tone: "bg-muted text-muted-foreground" };
  }
  return { label: "New mail sent", tone: "bg-muted text-muted-foreground" };
}

export function InboxPage() {
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [subFilter, setSubFilter] = useState<SubFilter>("all");
  const [threads, setThreads] = useState<InboxThreadItem[]>([]);
  const [counts, setCounts] = useState({ open: 0, closed: 0 });
  const [selectedId, setSelectedId] = useState<string>(searchParams.get("thread") ?? "");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [copilotConfigured, setCopilotConfigured] = useState(false);
  const [expandedVideoKey, setExpandedVideoKey] = useState<string>("");

  // Reply composer state
  const [replyBody, setReplyBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [confirmReplyOpen, setConfirmReplyOpen] = useState(false);
  const [draftingAi, setDraftingAi] = useState(false);

  async function load(activeTab = tab) {
    setLoading(true);
    try {
      const [res, copilotRes] = await Promise.all([
        api.getInbox(activeTab),
        api.getCopilotStatus().catch(() => ({ configured: false })),
      ]);
      setCopilotConfigured(copilotRes.configured);
      setThreads(res.threads);
      setCounts(res.counts);
      if (res.threads.length > 0 && !res.threads.some((t) => t.state.thread_id === selectedId)) {
        setSelectedId(res.threads[0]!.state.thread_id);
      } else if (res.threads.length === 0) {
        setSelectedId("");
      }
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab);
  }, [tab]);

  const unreadCount = threads.filter((t) => t.state.unread).length;
  const repliedCount = threads.filter((t) => t.last_message.direction === "inbound").length;
  const sentCount = threads.filter((t) => t.last_message.direction === "outbound").length;

  const filtered = threads.filter((t) => {
    if (subFilter === "unread" && !t.state.unread) return false;
    if (subFilter === "replied" && t.last_message.direction !== "inbound") return false;
    if (subFilter === "sent" && t.last_message.direction !== "outbound") return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      `${t.lead.first_name} ${t.lead.last_name}`.toLowerCase().includes(q) ||
      t.lead.email.toLowerCase().includes(q) ||
      t.lead.company.toLowerCase().includes(q) ||
      t.last_message.subject.toLowerCase().includes(q) ||
      t.last_message.body.toLowerCase().includes(q)
    );
  });

  const active = filtered.find((t) => t.state.thread_id === selectedId) ?? filtered[0] ?? null;

  async function selectThread(threadId: string) {
    setSelectedId(threadId);
    setSearchParams({ thread: threadId });
    const target = threads.find((t) => t.state.thread_id === threadId);
    if (target?.state.unread) {
      await api.updateThreadState(threadId, { unread: false }).catch(() => {});
      setThreads((prev) =>
        prev.map((t) =>
          t.state.thread_id === threadId ? { ...t, state: { ...t.state, unread: false } } : t,
        ),
      );
    }
  }

  async function toggleUnread() {
    if (!active) return;
    const nextUnread = !active.state.unread;
    try {
      await api.updateThreadState(active.state.thread_id, { unread: nextUnread });
      setThreads((prev) =>
        prev.map((t) =>
          t.state.thread_id === active.state.thread_id
            ? { ...t, state: { ...t.state, unread: nextUnread } }
            : t,
        ),
      );
      notify(nextUnread ? "Marked as unread" : "Marked as read", { kind: "info" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function toggleThreadClosed() {
    if (!active) return;
    const nextStatus = active.state.status === "open" ? "closed" : "open";
    try {
      await api.updateThreadState(active.state.thread_id, { status: nextStatus });
      notify(nextStatus === "closed" ? "Conversation closed" : "Conversation reopened", {
        kind: "success",
      });
      await load(tab);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !replyBody.trim()) return;
    setConfirmReplyOpen(true);
  }

  async function executeSendReply() {
    if (!active || !replyBody.trim()) return;
    setSending(true);
    try {
      const r = await api.replyToThread(active.state.thread_id, {
        body: replyBody.trim(),
        attachments,
      });
      notify(`Reply sent (${r.mode})`, { kind: "success" });
      setConfirmReplyOpen(false);
      setReplyBody("");
      setAttachments([]);
      await load(tab);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setSending(false);
    }
  }

  async function handleAiDraftReply() {
    if (!active || !copilotConfigured) {
      notify("AI Copilot is paused for now — add GEMINI_API_KEY in Secrets whenever you are ready.", {
        kind: "info",
      });
      return;
    }
    setDraftingAi(true);
    try {
      const res = await api.draftReplyWithAi(active.state.thread_id);
      setReplyBody(res.body);
      notify("AI reply draft inserted", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setDraftingAi(false);
    }
  }

  async function suppressContact() {
    if (!active) return;
    try {
      await api.addSuppression({
        email: active.lead.email,
        reason: "unsubscribed",
        source: "Unified Inbox manual opt-out",
      });
      await api.updateThreadState(active.state.thread_id, { status: "closed" });
      notify(`${active.lead.email} suppressed & thread closed`, { kind: "info" });
      await load(tab);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function syncNow() {
    try {
      const res = await api.runCheckInbox();
      notify(`Synced ${res.syncedAccounts} mailboxes · ${res.newReplies} new`, {
        description: res.autoClosedThreads ? `${res.autoClosedThreads} inactive thread(s) auto-closed` : undefined,
        kind: "success",
      });
      await load(tab);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Conversations"
        title="Unified Inbox"
        description="Unread messages appear in bold with clear labels showing New replies, You replied, or New mail sent."
        actions={
          <button
            type="button"
            onClick={syncNow}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync replies</span>
          </button>
        }
      />

      {/* Split View Container */}
      <div className="grid min-h-[660px] rounded-lg border border-border bg-card overflow-hidden lg:grid-cols-[360px_1fr]">
        {/* Left Thread List */}
        <div className="flex flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="p-3 space-y-2.5 border-b border-border">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={() => setTab("open")}
                className={`rounded py-1.5 text-xs font-medium transition-colors ${
                  tab === "open" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Open ({counts.open})
              </button>
              <button
                type="button"
                onClick={() => setTab("closed")}
                className={`rounded py-1.5 text-xs font-medium transition-colors ${
                  tab === "closed" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Closed ({counts.closed})
              </button>
            </div>

            {/* Quick Status Sub-Filters: All | Unread | Replied | Sent */}
            <div className="grid grid-cols-4 gap-1 rounded-md bg-muted/60 p-1 text-[11px]">
              {(
                [
                  { key: "all", label: `All` },
                  { key: "unread", label: `Unread${unreadCount ? ` (${unreadCount})` : ""}` },
                  { key: "replied", label: `Replied${repliedCount ? ` (${repliedCount})` : ""}` },
                  { key: "sent", label: `Sent${sentCount ? ` (${sentCount})` : ""}` },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSubFilter(f.key)}
                  className={`rounded py-1 px-1 font-medium truncate transition-colors ${
                    subFilter === f.key
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contact, subject, message..."
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border max-h-[640px]">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading threads...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No {subFilter === "all" ? tab : subFilter} conversations found.
              </div>
            ) : (
              filtered.map((item) => {
                const isSelected = active?.state.thread_id === item.state.thread_id;
                const isUnread = item.state.unread;
                const badge = threadDirectionBadge(item);
                const contactName =
                  `${item.lead.first_name} ${item.lead.last_name}`.trim() || item.lead.email;

                return (
                  <button
                    key={item.state.thread_id}
                    type="button"
                    onClick={() => selectThread(item.state.thread_id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors border-l-2 ${
                      isSelected
                        ? "bg-accent/70 border-l-signal"
                        : isUnread
                          ? "bg-signal-soft/25 border-l-signal hover:bg-signal-soft/40"
                          : "border-l-transparent hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isUnread && (
                          <span
                            className="h-2 w-2 rounded-full bg-signal shrink-0"
                            title="Unread"
                          />
                        )}
                        <span
                          className={`text-sm truncate ${
                            isUnread ? "font-bold text-foreground" : "font-medium text-foreground/85"
                          }`}
                        >
                          {contactName}
                        </span>
                      </div>
                      <span
                        className={`tabular text-[11px] shrink-0 ${
                          isUnread ? "font-semibold text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {formatShortDate(item.last_message.created_at)}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span
                        className={`text-xs truncate ${
                          isUnread ? "font-semibold text-foreground" : "font-normal text-muted-foreground"
                        }`}
                      >
                        {item.last_message.subject || "(No subject)"}
                      </span>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 ${badge.tone}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <p
                      className={`mt-1 text-xs line-clamp-1 leading-relaxed ${
                        isUnread ? "font-semibold text-foreground" : "font-normal text-muted-foreground"
                      }`}
                    >
                      {item.last_message.direction === "outbound" ? "You: " : ""}
                      {item.last_message.body}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Conversation Pane */}
        <div className="flex flex-col min-w-0">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
              Select a conversation thread to read and reply.
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {`${active.lead.first_name} ${active.lead.last_name}`.trim() || active.lead.email}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {active.lead.designation ? `${active.lead.designation} · ` : ""}
                      {active.lead.company}
                    </span>
                    <StatusTag value={active.state.status} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{active.lead.email}</span>
                    <span aria-hidden="true">·</span>
                    <span>Mailbox: {active.account.email}</span>
                    {active.campaign && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{active.campaign.name}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={toggleUnread}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>{active.state.unread ? "Mark read" : "Mark unread"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={suppressContact}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span>Suppress</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleThreadClosed}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    {active.state.status === "open" ? (
                      <>
                        <Archive className="h-3.5 w-3.5" />
                        <span>Close thread</span>
                      </>
                    ) : (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        <span>Reopen thread</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-background/50 max-h-[380px]">
                {active.messages.map((msg) => {
                  const isInbound = msg.direction === "inbound";
                  const contactLabel =
                    `${active.lead.first_name} ${active.lead.last_name}`.trim() || active.lead.email;

                  return (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-4 space-y-2 ${
                        isInbound
                          ? "border-signal/35 bg-card shadow-xs"
                          : "border-border bg-muted/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 ${
                              isInbound
                                ? "bg-signal-soft text-signal font-semibold"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isInbound ? "Inbound Reply" : "Sent by you"}
                          </span>
                          <span className="font-semibold text-foreground">
                            {isInbound
                              ? contactLabel
                              : active.account.display_name || active.account.email}
                          </span>
                          <span className="text-muted-foreground">
                            {isInbound ? `<${msg.from_email}>` : `· ${stepLabel(msg.step, msg.is_manual)}`}
                          </span>
                          {msg.category && <StatusTag value={msg.category} />}
                        </div>
                        <span className="tabular text-muted-foreground">
                          {formatDateTime(msg.created_at)}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-muted-foreground">{msg.subject}</div>
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                        {msg.body}
                      </pre>
                      {msg.attachments.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-wrap gap-2">
                            {msg.attachments.map((att, idx) => {
                              const videoKey = `${msg.id}-${idx}`;
                              const embedUrl = att.kind === "video" ? getVideoEmbedUrl(att.url) : null;
                              const isExpanded = expandedVideoKey === videoKey;

                              if (att.kind === "video") {
                                return (
                                  <div
                                    key={idx}
                                    className="inline-flex items-center gap-2 rounded-md border border-signal/30 bg-signal-soft/40 px-2.5 py-1 text-xs text-foreground"
                                  >
                                    <PlayCircle className="h-3.5 w-3.5 text-signal shrink-0" />
                                    <span className="font-medium">{att.label}</span>
                                    {embedUrl && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedVideoKey(isExpanded ? "" : videoKey)
                                        }
                                        className="font-medium text-signal hover:underline"
                                      >
                                        {isExpanded ? "Hide player" : "Preview"}
                                      </button>
                                    )}
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                                    >
                                      <span>Open</span>
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                );
                              }

                              if (att.kind === "link") {
                                return (
                                  <a
                                    key={idx}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:border-signal"
                                  >
                                    <Link2 className="h-3 w-3 text-signal" />
                                    <span>{att.label}</span>
                                    <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                                  </a>
                                );
                              }

                              return (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                                >
                                  {att.type.startsWith("video/") ? (
                                    <Video className="h-3 w-3 text-signal" />
                                  ) : (
                                    <Paperclip className="h-3 w-3" />
                                  )}
                                  {att.name}
                                </span>
                              );
                            })}
                          </div>

                          {msg.attachments.map((att, idx) => {
                            const videoKey = `${msg.id}-${idx}`;
                            const embedUrl = att.kind === "video" ? getVideoEmbedUrl(att.url) : null;
                            if (expandedVideoKey !== videoKey || !embedUrl) return null;
                            return (
                              <div
                                key={`embed-${idx}`}
                                className="overflow-hidden rounded-md border border-border bg-black aspect-video max-w-lg"
                              >
                                <iframe
                                  src={embedUrl}
                                  title={att.kind === "video" ? att.label : "Video"}
                                  allowFullScreen
                                  className="h-full w-full border-0"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Reply Composer */}
              <form onSubmit={handleSendReply} className="border-t border-border bg-card p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <TemplatePicker
                      kinds={["reply", "email"]}
                      onPick={(tpl) => setReplyBody(tpl.body)}
                    />
                    <button
                      type="button"
                      disabled={draftingAi}
                      onClick={handleAiDraftReply}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-signal" />
                      <span>{draftingAi ? "Drafting..." : "Draft reply with AI"}</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Signature from {active.account.email} appended on send
                  </span>
                </div>

                <textarea
                  rows={4}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder={`Reply to ${active.lead.first_name || active.lead.email}...`}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                />

                <AttachmentsPicker value={attachments} onChange={setAttachments} />

                <div className="flex items-center justify-between pt-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Threaded via In-Reply-To headers
                  </span>
                  <button
                    type="submit"
                    disabled={sending || !replyBody.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{sending ? "Sending..." : "Send reply"}</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReplyOpen}
        title="Send email reply?"
        description={
          active
            ? `Send this reply from ${active.account.email} to ${active.lead.email}?`
            : "Send this email reply?"
        }
        confirmLabel="Send reply"
        busy={sending}
        onConfirm={executeSendReply}
        onCancel={() => setConfirmReplyOpen(false)}
      />
    </div>
  );
}
