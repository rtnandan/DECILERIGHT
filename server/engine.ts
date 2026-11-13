import { appendLinks } from "../src/lib/attachments";
import { composeEmail, pickSignature } from "../src/lib/compose";
import { normalizeEmail } from "../src/lib/email-utils";
import { inSendingWindow, parseFollowUps, replyAction } from "../src/lib/followups";
import { assignAccounts, MANUAL_BATCH_SIZE, remainingAllowance, SENDS_PER_RUN } from "../src/lib/sending-rules";
import type {
  Attachment,
  Campaign,
  DashboardDailyMetric,
  DashboardStats,
  EmailMessage,
  InboxThreadItem,
  Lead,
  SendingAccount,
} from "../src/lib/types";
import { sendViaSmtp, syncRepliesFromImap } from "./mail";
import { newId, readDb, todayDateKey, writeDb } from "./store";

export function buildDashboardPayload() {
  const db = readDb();
  const now = new Date();
  const dailyMap = new Map<string, DashboardDailyMetric>();

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, {
      date: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sent: 0,
      replies: 0,
      bounces: 0,
    });
  }

  const todayKey = todayDateKey();
  let totalSent = 0;
  let sentToday = 0;
  let totalReplies = 0;
  let positiveReplies = 0;
  let bounces = 0;

  for (const m of db.messages) {
    const dateKey = m.created_at.slice(0, 10);
    const bucket = dailyMap.get(dateKey);
    if (m.direction === "outbound") {
      if (bucket) {
        bucket.sent += 1;
        totalSent += 1;
      }
      if (dateKey === todayKey) sentToday += 1;
    } else {
      if (m.category === "bounce") {
        bounces += 1;
        if (bucket) bucket.bounces += 1;
      } else if (m.category !== "out_of_office") {
        totalReplies += 1;
        if (bucket) bucket.replies += 1;
        if (m.category === "interested" || m.category === "question") {
          positiveReplies += 1;
        }
      }
    }
  }

  const totalOutboundAllTime = db.messages.filter((m) => m.direction === "outbound").length;
  const denom = Math.max(1, totalOutboundAllTime);

  const stats: DashboardStats = {
    total_sent: totalSent,
    sent_today: sentToday,
    total_replies: totalReplies,
    positive_replies: positiveReplies,
    reply_rate: totalOutboundAllTime ? Number(((totalReplies / denom) * 100).toFixed(1)) : 0,
    positive_rate: totalOutboundAllTime ? Number(((positiveReplies / denom) * 100).toFixed(1)) : 0,
    bounce_rate: totalOutboundAllTime ? Number(((bounces / denom) * 100).toFixed(1)) : 0,
    active_campaigns: db.campaigns.filter((c) => c.status === "running").length,
    open_threads: db.conversations.filter((c) => c.status === "open").length,
    verified_leads: db.leads.filter((l) => l.email_check === "valid").length,
    daily_series: Array.from(dailyMap.values()),
  };

  const campaigns = db.campaigns.map((c) => {
    const cls = db.campaign_leads.filter((cl) => cl.campaign_id === c.id);
    return {
      ...c,
      enrolled_count: cls.length,
      replied_count: cls.filter((cl) => cl.status === "replied").length,
    };
  });

  const leadMap = new Map(db.leads.map((l) => [l.id, l]));
  const campMap = new Map(db.campaigns.map((c) => [c.id, c]));
  const msgsByThread = new Map<string, EmailMessage[]>();
  for (const m of db.messages) {
    const arr = msgsByThread.get(m.thread_id) ?? [];
    arr.push(m);
    msgsByThread.set(m.thread_id, arr);
  }

  const recentThreads = db.conversations
    .slice()
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    .slice(0, 6)
    .map((conv) => {
      const lead = leadMap.get(conv.lead_id);
      const tMsgs = msgsByThread.get(conv.thread_id) ?? [];
      const lastMessage = tMsgs[tMsgs.length - 1];
      if (!lead || !lastMessage) return null;
      return {
        conv,
        lead,
        lastMessage,
        campaign: conv.campaign_id ? campMap.get(conv.campaign_id) ?? null : null,
      };
    })
    .filter(Boolean) as {
    conv: InboxThreadItem["state"];
    lead: Lead;
    lastMessage: EmailMessage;
    campaign: Campaign | null;
  }[];

  return { stats, campaigns, recentThreads, accounts: db.accounts };
}

export function buildInboxPayload(statusFilter: "open" | "closed" | "all") {
  const db = readDb();
  const leadMap = new Map(db.leads.map((l) => [l.id, l]));
  const campMap = new Map(db.campaigns.map((c) => [c.id, c]));
  const accMap = new Map(db.accounts.map((a) => [a.id, a]));
  const msgsByThread = new Map<string, EmailMessage[]>();

  for (const m of db.messages) {
    const arr = msgsByThread.get(m.thread_id) ?? [];
    arr.push(m);
    msgsByThread.set(m.thread_id, arr);
  }

  const allItems: InboxThreadItem[] = [];
  for (const conv of db.conversations) {
    const lead = leadMap.get(conv.lead_id);
    const tMsgs = (msgsByThread.get(conv.thread_id) ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const lastMessage = tMsgs[tMsgs.length - 1];
    if (!lead || !lastMessage) continue;
    const acc = accMap.get(conv.account_id);
    const camp = conv.campaign_id ? campMap.get(conv.campaign_id) : undefined;
    allItems.push({
      state: conv,
      lead,
      campaign: camp ? { id: camp.id, name: camp.name } : null,
      account: acc
        ? {
            id: acc.id,
            email: acc.email,
            display_name: acc.display_name,
            signature: acc.signature,
          }
        : {
            id: conv.account_id,
            email: lastMessage.direction === "outbound" ? lastMessage.from_email : lastMessage.to_email,
            display_name: "",
            signature: "",
          },
      messages: tMsgs,
      last_message: lastMessage,
    });
  }

  allItems.sort((a, b) => b.state.last_message_at.localeCompare(a.state.last_message_at));
  const openCount = allItems.filter((i) => i.state.status === "open").length;
  const closedCount = allItems.filter((i) => i.state.status === "closed").length;
  const filtered =
    statusFilter === "all" ? allItems : allItems.filter((i) => i.state.status === statusFilter);

  return { threads: filtered, counts: { open: openCount, closed: closedCount } };
}

export async function sendTestEmailServer(
  campaignId: string,
  payload: { toEmail: string; accountId?: string; sampleLeadId?: string },
) {
  const db = readDb();
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new Error("Campaign not found.");

  const acc =
    (payload.accountId && db.accounts.find((a) => a.id === payload.accountId)) ||
    db.accounts.find((a) => campaign.account_ids.includes(a.id) && a.status === "active") ||
    db.accounts.find((a) => a.status === "active");

  if (!acc) {
    throw new Error("No active mailbox found. Connect an email account first.");
  }

  const sampleLead =
    (payload.sampleLeadId && db.leads.find((l) => l.id === payload.sampleLeadId)) ||
    db.leads[0] || {
      first_name: "Alex",
      last_name: "Rivera",
      company: "Example Co",
      designation: "Founder",
      industry: "SaaS",
      email: payload.toEmail,
      ai_line: "",
      custom_fields: {},
    };

  const composed = composeEmail({
    subject: campaign.subject || "Test email",
    body: campaign.body,
    signature: pickSignature(acc.signature, db.settings.default_signature),
    lead: sampleLead,
    optOut: true,
    attachments: campaign.attachments,
  });

  await sendViaSmtp({
    accountId: acc.id,
    displayName: acc.display_name,
    to: payload.toEmail.trim(),
    subject: `[TEST] ${composed.subject}`,
    body: composed.body,
    attachments: campaign.attachments,
  });

  return { ok: true, mode: "smtp", preview: composed };
}

export async function replyToThreadServer(
  threadId: string,
  payload: { body: string; attachments?: Attachment[] },
) {
  const db = readDb();
  const conv = db.conversations.find((c) => c.thread_id === threadId);
  if (!conv) throw new Error("Conversation thread not found.");
  const lead = db.leads.find((l) => l.id === conv.lead_id);
  if (!lead) throw new Error("Contact record missing.");
  const account = db.accounts.find((a) => a.id === conv.account_id) ?? db.accounts.find((a) => a.status === "active");
  if (!account) throw new Error("Sending mailbox missing or disconnected.");

  const threadMsgs = db.messages
    .filter((m) => m.thread_id === threadId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastMsg = threadMsgs[threadMsgs.length - 1];
  const baseSubj = (lastMsg?.subject || "Re: Following up").replace(/^re:\s*/i, "");
  const subject = `Re: ${baseSubj}`;
  const signature = pickSignature(account.signature, db.settings.default_signature);
  const bodyWithLinks = appendLinks(payload.body.trim(), payload.attachments ?? []);
  const fullBody = signature.trim() ? `${bodyWithLinks}\n\n${signature.trim()}` : bodyWithLinks;

  const sent = await sendViaSmtp({
    accountId: account.id,
    displayName: account.display_name,
    to: lead.email,
    subject,
    body: fullBody,
    inReplyTo: lastMsg?.message_id_header ?? null,
    references: threadMsgs.map((m) => m.message_id_header).filter(Boolean),
    attachments: payload.attachments ?? [],
  });

  const nowIso = new Date().toISOString();
  const msg: EmailMessage = {
    id: newId("msg"),
    thread_id: threadId,
    campaign_id: conv.campaign_id,
    lead_id: lead.id,
    account_id: account.id,
    direction: "outbound",
    step: 0,
    is_manual: true,
    from_email: account.email,
    to_email: lead.email,
    subject,
    body: fullBody,
    attachments: payload.attachments ?? [],
    message_id_header: sent.messageId,
    in_reply_to: lastMsg?.message_id_header ?? null,
    category: null,
    created_at: nowIso,
  };
  db.messages.push(msg);
  conv.last_message_at = nowIso;
  conv.unread = false;
  writeDb(db);

  return { ok: true, message: msg, mode: "smtp" };
}

export async function runSendBatchServer(manual: boolean): Promise<{
  sent: number;
  skipped: number;
  failed: number;
  notes: string[];
}> {
  const db = readDb();
  if (!manual && !inSendingWindow(new Date(), db.settings.time_zone, db.settings)) {
    return {
      sent: 0,
      skipped: 0,
      failed: 0,
      notes: [`Outside sending hours (${db.settings.send_start_hour}:00–${db.settings.send_end_hour}:00 ${db.settings.time_zone}).`],
    };
  }

  const runningCampaigns = db.campaigns.filter((c) => c.status === "running");
  if (runningCampaigns.length === 0) {
    return { sent: 0, skipped: 0, failed: 0, notes: ["No running campaigns to process."] };
  }

  const suppressedEmails = new Set(db.suppressions.map((s) => normalizeEmail(s.email)));
  const leadMap = new Map(db.leads.map((l) => [l.id, l]));
  const accMap = new Map(db.accounts.map((a) => [a.id, a]));
  const today = todayDateKey();
  const now = new Date();
  const notes: string[] = [];

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const maxBatch = manual ? MANUAL_BATCH_SIZE : SENDS_PER_RUN;

  for (const camp of runningCampaigns) {
    const steps = parseFollowUps(camp.follow_ups);
    const eligibleAccounts = camp.account_ids
      .map((id) => accMap.get(id))
      .filter((a): a is SendingAccount => Boolean(a && a.status === "active" && a.has_credentials));

    if (eligibleAccounts.length === 0) {
      notes.push(`Campaign "${camp.name}" has no active connected mailboxes.`);
      continue;
    }

    const dueItems = db.campaign_leads.filter((cl) => {
      if (cl.campaign_id !== camp.id || cl.sequence_stopped_at) return false;
      if (cl.status === "pending" && cl.current_step === 0) return true;
      if (cl.status === "active") {
        if (!cl.next_send_at) return true;
        return new Date(cl.next_send_at).getTime() <= now.getTime();
      }
      return false;
    });

    if (dueItems.length === 0) continue;

    const totalAccountRemaining = eligibleAccounts.reduce((sum, a) => {
      const cap = a.warmup_enabled ? Math.min(a.daily_limit, a.warmup_daily_cap) : a.daily_limit;
      return sum + Math.max(0, cap - a.sent_today);
    }, 0);

    const allowance = remainingAllowance({
      accountDailyLimit: totalAccountRemaining + eligibleAccounts.reduce((s, a) => s + a.sent_today, 0),
      accountSentToday: eligibleAccounts.reduce((s, a) => s + a.sent_today, 0),
      campaignDailyLimit: camp.daily_limit,
      campaignSentToday: camp.sent_today,
      slotsThisRun: Math.max(1, maxBatch - sentCount),
    });

    if (allowance <= 0) {
      skippedCount += dueItems.length;
      notes.push(`Daily cap reached for "${camp.name}".`);
      continue;
    }

    const assignedIds = assignAccounts(
      eligibleAccounts.map((a) => {
        const cap = a.warmup_enabled ? Math.min(a.daily_limit, a.warmup_daily_cap) : a.daily_limit;
        return { id: a.id, remaining: Math.max(0, cap - a.sent_today) };
      }),
      Math.min(allowance, dueItems.length),
    );

    for (let i = 0; i < dueItems.length; i++) {
      if (sentCount >= maxBatch) break;
      const cl = dueItems[i]!;
      const lead = leadMap.get(cl.lead_id);
      if (!lead) {
        skippedCount += 1;
        continue;
      }
      if (suppressedEmails.has(normalizeEmail(lead.email)) || lead.email_check === "invalid") {
        cl.status = suppressedEmails.has(normalizeEmail(lead.email)) ? "unsubscribed" : "bounced";
        cl.sequence_stopped_at = now.toISOString();
        cl.stop_reason = suppressedEmails.has(normalizeEmail(lead.email)) ? "suppressed" : "invalid_email";
        skippedCount += 1;
        continue;
      }

      const preferredAcc = cl.account_id ? accMap.get(cl.account_id) : null;
      const chosenId =
        preferredAcc && preferredAcc.status === "active" && preferredAcc.has_credentials
          ? preferredAcc.id
          : assignedIds[i];
      const acc = chosenId ? accMap.get(chosenId) : null;
      if (!acc) {
        skippedCount += 1;
        continue;
      }

      const stepIndex = cl.current_step;
      let stepBody = camp.body;
      let stepAttachments = camp.attachments;
      if (stepIndex === 99) {
        stepBody = camp.behavior.later_body;
        stepAttachments = [];
      } else if (stepIndex > 0) {
        const fu = steps[stepIndex - 1];
        if (!fu) {
          cl.status = "completed";
          cl.next_send_at = null;
          skippedCount += 1;
          continue;
        }
        stepBody = fu.body;
        stepAttachments = fu.attachments ?? [];
      }

      const priorMsgs = db.messages
        .filter((m) => m.campaign_id === camp.id && m.lead_id === lead.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const threadId = priorMsgs[0]?.thread_id ?? newId("thr");
      const lastPrior = priorMsgs[priorMsgs.length - 1];

      const composed = composeEmail({
        subject: stepIndex === 0 ? camp.subject : `Re: ${camp.subject.replace(/^re:\s*/i, "")}`,
        body: stepBody,
        signature: pickSignature(acc.signature, db.settings.default_signature),
        lead,
        optOut: stepIndex === 0,
        attachments: stepAttachments,
      });

      try {
        const res = await sendViaSmtp({
          accountId: acc.id,
          displayName: acc.display_name,
          to: lead.email,
          subject: composed.subject,
          body: composed.body,
          inReplyTo: lastPrior?.message_id_header ?? null,
          references: priorMsgs.map((m) => m.message_id_header).filter(Boolean),
          attachments: stepAttachments,
        });

        const sentIso = new Date().toISOString();
        db.messages.push({
          id: newId("msg"),
          thread_id: threadId,
          campaign_id: camp.id,
          lead_id: lead.id,
          account_id: acc.id,
          direction: "outbound",
          step: stepIndex,
          is_manual: false,
          from_email: acc.email,
          to_email: lead.email,
          subject: composed.subject,
          body: composed.body,
          attachments: stepAttachments,
          message_id_header: res.messageId,
          in_reply_to: lastPrior?.message_id_header ?? null,
          category: null,
          created_at: sentIso,
        });

        const existingConv = db.conversations.find((c) => c.thread_id === threadId);
        if (existingConv) {
          existingConv.status = "open";
          existingConv.last_message_at = sentIso;
          existingConv.closed_at = null;
          existingConv.auto_closed = false;
          existingConv.unread = false;
        } else {
          db.conversations.push({
            thread_id: threadId,
            lead_id: lead.id,
            campaign_id: camp.id,
            account_id: acc.id,
            status: "open",
            last_message_at: sentIso,
            closed_at: null,
            auto_closed: false,
            unread: false,
          });
        }

        const nextStepObj = stepIndex === 99 ? null : steps[stepIndex];
        cl.account_id = acc.id;
        cl.last_sent_at = sentIso;
        cl.error = null;
        if (!nextStepObj) {
          cl.status = "completed";
          cl.next_send_at = null;
        } else {
          cl.current_step = stepIndex + 1;
          cl.status = "active";
          cl.next_send_at = new Date(Date.now() + nextStepObj.delay_days * 86_400_000).toISOString();
        }

        acc.sent_today += 1;
        db.account_daily_dates[acc.id] = today;
        camp.sent_today += 1;
        db.campaign_daily_dates[camp.id] = today;
        if (lead.status === "new") lead.status = "contacted";

        sentCount += 1;
      } catch (err) {
        failedCount += 1;
        cl.error = (err as Error).message;
        notes.push(`${lead.email}: ${(err as Error).message}`);
      }
    }
  }

  writeDb(db);
  return { sent: sentCount, skipped: skippedCount, failed: failedCount, notes };
}

export async function runCheckInboxServer(): Promise<{
  syncedAccounts: number;
  newReplies: number;
  autoClosedThreads: number;
  nurtureScheduled: number;
}> {
  const db = readDb();
  const leadByEmail = new Map(db.leads.map((l) => [normalizeEmail(l.email), l]));
  const existingMsgIds = new Set(db.messages.map((m) => m.message_id_header).filter(Boolean));
  const msgByHeaderId = new Map(db.messages.map((m) => [m.message_id_header, m]));
  const campMap = new Map(db.campaigns.map((c) => [c.id, c]));
  const suppressedSet = new Set(db.suppressions.map((s) => normalizeEmail(s.email)));

  let syncedAccounts = 0;
  let newReplies = 0;
  let nurtureScheduled = 0;

  for (const acc of db.accounts) {
    if (acc.status !== "active" || !acc.has_credentials) continue;
    try {
      const inboundList = await syncRepliesFromImap(acc.id);
      syncedAccounts += 1;
      acc.last_synced_at = new Date().toISOString();

      for (const inbound of inboundList) {
        if (existingMsgIds.has(inbound.message_id_header)) continue;
        const senderEmail = normalizeEmail(inbound.from_email);
        const replyParent = inbound.in_reply_to ? msgByHeaderId.get(inbound.in_reply_to) : undefined;
        const lead =
          (replyParent && db.leads.find((l) => l.id === replyParent.lead_id)) ||
          leadByEmail.get(senderEmail);

        if (!lead) continue;

        const matchingConv = db.conversations.find((c) => c.lead_id === lead.id);
        const threadId = replyParent?.thread_id || matchingConv?.thread_id || newId("thr");
        const campaignId = replyParent?.campaign_id || matchingConv?.campaign_id || null;

        const msg: EmailMessage = {
          id: newId("msg"),
          thread_id: threadId,
          campaign_id: campaignId,
          lead_id: lead.id,
          account_id: acc.id,
          direction: "inbound",
          step: 0,
          is_manual: false,
          from_email: senderEmail,
          to_email: acc.email,
          subject: inbound.subject,
          body: inbound.body,
          attachments: [],
          message_id_header: inbound.message_id_header,
          in_reply_to: inbound.in_reply_to,
          category: inbound.category,
          created_at: inbound.received_at,
        };
        db.messages.push(msg);
        existingMsgIds.add(inbound.message_id_header);
        msgByHeaderId.set(inbound.message_id_header, msg);
        newReplies += 1;

        const existingConv = db.conversations.find((c) => c.thread_id === threadId);
        if (existingConv) {
          existingConv.status = "open";
          existingConv.last_message_at = msg.created_at;
          existingConv.closed_at = null;
          existingConv.auto_closed = false;
          existingConv.unread = true;
        } else {
          db.conversations.push({
            thread_id: threadId,
            lead_id: lead.id,
            campaign_id: campaignId,
            account_id: acc.id,
            status: "open",
            last_message_at: msg.created_at,
            closed_at: null,
            auto_closed: false,
            unread: true,
          });
        }

        const activeCls = db.campaign_leads.filter(
          (cl) => cl.lead_id === lead.id && !cl.sequence_stopped_at,
        );
        for (const cl of activeCls) {
          const camp = campMap.get(cl.campaign_id);
          if (!camp) continue;
          const action = replyAction(inbound.category, camp.behavior);
          if (inbound.category === "unsubscribe" || inbound.category === "bounce") {
            if (!suppressedSet.has(normalizeEmail(lead.email))) {
              db.suppressions.push({
                id: newId("sup"),
                email: normalizeEmail(lead.email),
                reason: inbound.category === "bounce" ? "bounced" : "unsubscribed",
                source: `IMAP sync (${acc.email})`,
                created_at: new Date().toISOString(),
              });
              suppressedSet.add(normalizeEmail(lead.email));
            }
            cl.status = inbound.category === "bounce" ? "bounced" : "unsubscribed";
            cl.sequence_stopped_at = new Date().toISOString();
            cl.stop_reason = inbound.category;
            cl.next_send_at = null;
            lead.status = inbound.category === "bounce" ? "bounced" : "unsubscribed";
          } else if (action === "nurture") {
            cl.current_step = 99;
            cl.status = "active";
            cl.next_send_at = new Date(
              Date.now() + camp.behavior.later_delay_days * 86_400_000,
            ).toISOString();
            nurtureScheduled += 1;
          } else if (action === "stop") {
            cl.status = "replied";
            cl.sequence_stopped_at = new Date().toISOString();
            cl.stop_reason = inbound.category || "replied";
            cl.next_send_at = null;
            lead.status =
              inbound.category === "interested"
                ? "interested"
                : inbound.category === "not_interested"
                  ? "not_interested"
                  : "replied";
          }
        }
      }
    } catch {
      // Continue syncing remaining accounts
    }
  }

  let autoClosedThreads = 0;
  const cutoff = Date.now() - db.settings.auto_close_days * 86_400_000;
  for (const conv of db.conversations) {
    if (conv.status === "open" && conv.last_message_at && new Date(conv.last_message_at).getTime() < cutoff) {
      conv.status = "closed";
      conv.closed_at = new Date().toISOString();
      conv.auto_closed = true;
      conv.unread = false;
      autoClosedThreads += 1;
    }
  }

  writeDb(db);
  return { syncedAccounts, newReplies, autoClosedThreads, nurtureScheduled };
}
