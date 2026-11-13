import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import PostalMime from "postal-mime";
import { detectMailbox, type ServerCandidate } from "../src/lib/mailbox-detect";
import { isValidEmail, normalizeEmail } from "../src/lib/email-utils";
import { toHtml, toPlainText } from "../src/lib/rich-text";
import { getAccountCredential, UPLOADS_DIR } from "./store";
import type { EmailCheckStatus, ReplyCategory } from "../src/lib/types";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
  "throwawaymail.com",
]);

export async function lookupMxForEmail(email: string): Promise<{
  domain: string;
  mxRecords: string[];
  detected: ReturnType<typeof detectMailbox>;
}> {
  const domain = (email.trim().toLowerCase().split("@")[1] ?? "").replace(/\.$/, "");
  if (!domain) {
    return { domain: "", mxRecords: [], detected: detectMailbox(email, []) };
  }
  try {
    const records = await dns.promises.resolveMx(domain);
    const sorted = records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    return { domain, mxRecords: sorted, detected: detectMailbox(email, sorted) };
  } catch {
    return { domain, mxRecords: [], detected: detectMailbox(email, []) };
  }
}

export async function verifyEmailAddressServer(rawEmail: string): Promise<{
  result: EmailCheckStatus;
  reason: string;
}> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { result: "invalid", reason: "Invalid email syntax" };
  }
  const domain = email.split("@")[1] ?? "";
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { result: "invalid", reason: "Disposable inbox domain" };
  }
  try {
    const mx = await dns.promises.resolveMx(domain);
    if (!mx.length) {
      return { result: "invalid", reason: "Domain has no mail (MX) records" };
    }
    const primary = mx.sort((a, b) => a.priority - b.priority)[0]?.exchange ?? "mail server";
    if (/^(info|support|sales|hello|contact|admin)@/.test(email)) {
      return { result: "risky", reason: `Role-based inbox · MX: ${primary}` };
    }
    return { result: "valid", reason: `MX verified (${primary})` };
  } catch {
    return { result: "invalid", reason: "Domain MX lookup failed" };
  }
}

export async function verifySmtpConnection(input: {
  email: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: input.smtpHost,
    port: input.smtpPort,
    secure: input.smtpPort === 465,
    auth: { user: input.email, pass: input.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  await transporter.verify();
}

export async function verifyImapConnection(input: {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
}): Promise<void> {
  const client = new ImapFlow({
    host: input.imapHost,
    port: input.imapPort || 993,
    secure: (input.imapPort || 993) === 993,
    auth: { user: input.email, pass: input.password },
    logger: false,
    connectionTimeout: 10_000,
  });
  await client.connect();
  await client.logout().catch(() => {});
}

/**
 * Tries candidate SMTP host/ports cleanly (e.g. smtppro.zoho.in vs smtp.zoho.in)
 * so manual mailbox setup connects reliably on the first try.
 */
export async function resolveWorkingMailboxCandidate(input: {
  email: string;
  password: string;
  candidates: ServerCandidate[];
}): Promise<ServerCandidate> {
  let lastErr: Error | null = null;
  for (const cand of input.candidates) {
    try {
      await verifySmtpConnection({
        email: input.email,
        password: input.password,
        smtpHost: cand.smtpHost,
        smtpPort: cand.smtpPort,
      });
      return cand;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error("Could not connect to SMTP mail server with these credentials.");
}

export async function sendViaSmtp(input: {
  accountId: string;
  displayName: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: { kind: string; path?: string; name?: string }[];
}): Promise<{ messageId: string }> {
  const cred = getAccountCredential(input.accountId);
  if (!cred) {
    throw new Error("Encrypted SMTP credentials not found for this mailbox. Reconnect it in Email Accounts.");
  }

  const transporter = nodemailer.createTransport({
    host: cred.smtp_host,
    port: cred.smtp_port,
    secure: cred.smtp_port === 465,
    auth: { user: cred.email, pass: cred.password },
    connectionTimeout: 12_000,
  });

  const fileAttachments = (input.attachments ?? [])
    .filter((a) => a.kind === "file" && a.path)
    .map((a) => {
      const fullPath = path.join(UPLOADS_DIR, path.basename(a.path!));
      return fs.existsSync(fullPath) ? { filename: a.name || "attachment", path: fullPath } : null;
    })
    .filter(Boolean) as { filename: string; path: string }[];

  const info = await transporter.sendMail({
    from: input.displayName ? `"${input.displayName}" <${cred.email}>` : cred.email,
    to: input.to,
    subject: input.subject,
    text: toPlainText(input.body),
    html: toHtml(input.body), // Zero tracking pixels, zero click wrappers
    inReplyTo: input.inReplyTo ?? undefined,
    references: input.references?.length ? input.references : undefined,
    attachments: fileAttachments,
  });

  return {
    messageId: info.messageId || `<${crypto.randomUUID()}@${cred.email.split("@")[1] || "mail"}>`,
  };
}

export function classifyInboundReply(subject: string, body: string, fromEmail: string): ReplyCategory {
  const text = `${subject}\n${body}`.toLowerCase();
  const from = fromEmail.toLowerCase();

  if (
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    /delivery status notification|undeliverable|550 5\.1\.1|address not found|bounce/.test(text)
  ) {
    return "bounce";
  }
  if (/out of office|automatic reply|auto-reply|vacation|away from my desk|returning on/.test(text)) {
    return "out_of_office";
  }
  if (/\bunsubscribe\b|remove me|stop emailing|take me off|opt out/.test(text)) {
    return "unsubscribe";
  }
  if (/not now|next quarter|circle back|follow up later|check back in|busy right now|few weeks|next month/.test(text)) {
    return "follow_up_later";
  }
  if (/not interested|no thanks|pass for now|already have|don't need|no budget/.test(text)) {
    return "not_interested";
  }
  if (/\?/.test(body) && /pricing|cost|how|when|examples|deck|details/.test(text)) {
    return "question";
  }
  return "interested";
}

export interface SyncedInboundMessage {
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  message_id_header: string;
  in_reply_to: string | null;
  category: ReplyCategory;
  received_at: string;
}

export async function syncRepliesFromImap(accountId: string): Promise<SyncedInboundMessage[]> {
  const cred = getAccountCredential(accountId);
  if (!cred || !cred.imap_host) {
    throw new Error("IMAP credentials not found for this mailbox.");
  }

  const client = new ImapFlow({
    host: cred.imap_host,
    port: cred.imap_port || 993,
    secure: (cred.imap_port || 993) === 993,
    auth: { user: cred.email, pass: cred.password },
    logger: false,
  });

  const out: SyncedInboundMessage[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 14 * 86_400_000);
      const uids = await client.search({ since });
      const recentUids = (Array.isArray(uids) ? uids : []).slice(-30);
      if (recentUids.length > 0) {
        for await (const msg of client.fetch(recentUids, { source: true })) {
          if (!msg.source) continue;
          const parsed = await PostalMime.parse(msg.source);
          const fromEmail = parsed.from?.address?.toLowerCase() ?? "";
          if (!fromEmail) continue;
          const toEmail = parsed.to?.[0]?.address?.toLowerCase() ?? cred.email;
          const subject = parsed.subject ?? "";
          const body = (parsed.text || parsed.html?.replace(/<[^>]+>/g, " ") || "").trim();
          out.push({
            from_email: fromEmail,
            to_email: toEmail,
            subject,
            body: body.slice(0, 15000),
            message_id_header: parsed.messageId || `<imap-${msg.uid}@${cred.imap_host}>`,
            in_reply_to: parsed.inReplyTo || null,
            category: classifyInboundReply(subject, body, fromEmail),
            received_at: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
