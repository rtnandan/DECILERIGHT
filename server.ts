import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { normalizeEmail } from "./src/lib/email-utils";
import { parseBehavior, parseFollowUps } from "./src/lib/followups";
import { providerByKey } from "./src/lib/providers";
import type { Attachment, Campaign, Lead, SendingAccount, Template } from "./src/lib/types";
import { draftEmailCopy, draftThreadReply, generateAiIcebreakers } from "./server/ai";
import {
  buildDashboardPayload,
  buildInboxPayload,
  replyToThreadServer,
  runCheckInboxServer,
  runSendBatchServer,
  sendTestEmailServer,
} from "./server/engine";
import {
  lookupMxForEmail,
  resolveWorkingMailboxCandidate,
  verifyEmailAddressServer,
  verifyImapConnection,
  verifySmtpConnection,
} from "./server/mail";
import {
  createSessionToken,
  deleteAccountCredential,
  getAccountCredential,
  hashWorkspacePassword,
  newId,
  readDb,
  saveAccountCredential,
  UPLOADS_DIR,
  verifySessionToken,
  verifyWorkspacePassword,
  writeDb,
} from "./server/store";

const PORT = Number(process.env.PORT) || 3000;

function extractToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie || "";
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === "decile_session") {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function setSessionCookie(res: express.Response, token: string) {
  res.setHeader(
    "Set-Cookie",
    `decile_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
  );
}

function clearSessionCookie(res: express.Response) {
  res.setHeader("Set-Cookie", "decile_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "35mb" }));

  // --- Simple Workspace Login ---
  app.get("/api/auth/session", (req, res) => {
    const db = readDb();
    const envPass = process.env.WORKSPACE_PASSWORD?.trim();
    const configured = Boolean(db.workspace_auth || envPass);
    const token = extractToken(req);
    const session = verifySessionToken(token);
    res.json({
      configured,
      authenticated: Boolean(configured && session),
      email: session?.email ?? "",
    });
  });

  app.post("/api/auth/setup", (req, res) => {
    const db = readDb();
    const envPass = process.env.WORKSPACE_PASSWORD?.trim();
    if (db.workspace_auth || envPass) {
      return res.status(400).json({ error: "Workspace login is already configured. Please sign in." });
    }
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }
    const { hash, salt } = hashWorkspacePassword(password);
    db.workspace_auth = {
      email: cleanEmail,
      password_hash: hash,
      salt,
      updated_at: new Date().toISOString(),
    };
    writeDb(db);
    const token = createSessionToken(cleanEmail);
    setSessionCookie(res, token);
    res.json({ ok: true, email: cleanEmail, token });
  });

  app.post("/api/auth/login", (req, res) => {
    const db = readDb();
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const envPass = process.env.WORKSPACE_PASSWORD?.trim();
    const envEmail = process.env.WORKSPACE_EMAIL?.trim().toLowerCase();

    if (db.workspace_auth) {
      if (cleanEmail !== db.workspace_auth.email || !verifyWorkspacePassword(password, db.workspace_auth)) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      const token = createSessionToken(db.workspace_auth.email);
      setSessionCookie(res, token);
      return res.json({ ok: true, email: db.workspace_auth.email, token });
    }

    if (envPass) {
      if ((envEmail && cleanEmail !== envEmail) || password !== envPass) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      const token = createSessionToken(cleanEmail);
      setSessionCookie(res, token);
      return res.json({ ok: true, email: cleanEmail, token });
    }

    return res.status(400).json({ error: "Workspace login is not set up yet." });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Protect workspace /api/* routes (exempt public auth endpoints and /api/public/* cron hooks)
  app.use("/api", (req, res, next) => {
    const openPaths = ["/auth/session", "/auth/setup", "/auth/login", "/auth/logout"];
    if (openPaths.includes(req.path) || req.path.startsWith("/public/")) {
      return next();
    }
    const session = verifySessionToken(extractToken(req));
    if (!session) {
      return res.status(401).json({ error: "Please sign in to access this workspace." });
    }
    next();
  });

  app.post("/api/auth/update-password", (req, res) => {
    const db = readDb();
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || db.workspace_auth?.email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email address is required." });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }
    const { hash, salt } = hashWorkspacePassword(password);
    db.workspace_auth = {
      email: cleanEmail,
      password_hash: hash,
      salt,
      updated_at: new Date().toISOString(),
    };
    writeDb(db);
    const token = createSessionToken(cleanEmail);
    setSessionCookie(res, token);
    res.json({ ok: true, email: cleanEmail, token });
  });

  // --- Dashboard ---
  app.get("/api/dashboard", (_req, res) => {
    res.json(buildDashboardPayload());
  });

  // --- Campaigns ---
  app.get("/api/campaigns", (_req, res) => {
    const db = readDb();
    const list = db.campaigns
      .map((c) => {
        const mine = db.campaign_leads.filter((cl) => cl.campaign_id === c.id);
        return {
          ...c,
          enrolled_count: mine.length,
          active_count: mine.filter((cl) => cl.status === "active" || cl.status === "pending").length,
          replied_count: mine.filter((cl) => cl.status === "replied").length,
          completed_count: mine.filter((cl) => cl.status === "completed").length,
        };
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    res.json(list);
  });

  app.post("/api/campaigns", (req, res) => {
    const db = readDb();
    const {
      name,
      subject,
      body,
      account_ids,
      daily_limit,
      follow_ups,
      attachments,
      lead_ids,
    } = req.body as {
      name: string;
      subject: string;
      body: string;
      account_ids: string[];
      daily_limit: number;
      follow_ups?: Campaign["follow_ups"];
      attachments?: Attachment[];
      lead_ids?: string[];
    };
    if (!name?.trim()) return res.status(400).json({ error: "Campaign name is required." });
    const nowIso = new Date().toISOString();
    const created: Campaign = {
      id: newId("cmp"),
      name: name.trim(),
      status: "draft",
      account_ids: Array.isArray(account_ids) ? account_ids : [],
      subject: subject ?? "",
      body: body ?? "",
      attachments: Array.isArray(attachments) ? attachments : [],
      follow_ups: parseFollowUps(follow_ups ?? []),
      daily_limit: Math.max(1, Number(daily_limit) || 50),
      sent_today: 0,
      behavior: parseBehavior(db.settings.default_behavior),
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.campaigns.push(created);

    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      const suppressed = new Set(db.suppressions.map((s) => normalizeEmail(s.email)));
      for (const lid of lead_ids) {
        const lead = db.leads.find((l) => l.id === lid);
        if (!lead || suppressed.has(normalizeEmail(lead.email))) continue;
        db.campaign_leads.push({
          id: newId("cl"),
          campaign_id: created.id,
          lead_id: lid,
          account_id: null,
          current_step: 0,
          status: "pending",
          last_sent_at: null,
          next_send_at: null,
          sequence_stopped_at: null,
          stop_reason: null,
          error: null,
        });
      }
    }
    writeDb(db);
    res.json(created);
  });

  app.get("/api/campaigns/:id", (req, res) => {
    const db = readDb();
    const campaign = db.campaigns.find((c) => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const leadMap = new Map(db.leads.map((l) => [l.id, l]));
    const accMap = new Map(db.accounts.map((a) => [a.id, a]));
    const recipients = db.campaign_leads
      .filter((cl) => cl.campaign_id === campaign.id)
      .map((cl) => {
        const lead = leadMap.get(cl.lead_id);
        if (!lead) return null;
        return {
          ...cl,
          lead,
          account: cl.account_id ? accMap.get(cl.account_id) ?? null : null,
        };
      })
      .filter(Boolean);
    res.json({ campaign, recipients, accounts: db.accounts, settings: db.settings });
  });

  app.patch("/api/campaigns/:id", (req, res) => {
    const db = readDb();
    const camp = db.campaigns.find((c) => c.id === req.params.id);
    if (!camp) return res.status(404).json({ error: "Campaign not found." });
    const patch = req.body as Partial<Campaign>;
    if (patch.name !== undefined) camp.name = patch.name.trim();
    if (patch.status !== undefined) camp.status = patch.status;
    if (patch.account_ids !== undefined) camp.account_ids = patch.account_ids;
    if (patch.subject !== undefined) camp.subject = patch.subject;
    if (patch.body !== undefined) camp.body = patch.body;
    if (patch.attachments !== undefined) camp.attachments = patch.attachments;
    if (patch.follow_ups !== undefined) camp.follow_ups = parseFollowUps(patch.follow_ups);
    if (patch.daily_limit !== undefined) camp.daily_limit = Math.max(1, Number(patch.daily_limit) || 50);
    if (patch.behavior !== undefined) camp.behavior = parseBehavior(patch.behavior);
    camp.updated_at = new Date().toISOString();
    writeDb(db);
    res.json(camp);
  });

  app.delete("/api/campaigns/:id", (req, res) => {
    const db = readDb();
    db.campaigns = db.campaigns.filter((c) => c.id !== req.params.id);
    db.campaign_leads = db.campaign_leads.filter((cl) => cl.campaign_id !== req.params.id);
    writeDb(db);
    res.json({ ok: true });
  });

  app.post("/api/campaigns/:id/enroll", (req, res) => {
    const db = readDb();
    const { leadIds } = req.body as { leadIds: string[] };
    const existing = new Set(
      db.campaign_leads.filter((cl) => cl.campaign_id === req.params.id).map((cl) => cl.lead_id),
    );
    const suppressed = new Set(db.suppressions.map((s) => normalizeEmail(s.email)));
    let added = 0;
    let skipped = 0;
    for (const lid of leadIds ?? []) {
      const lead = db.leads.find((l) => l.id === lid);
      if (!lead || existing.has(lid) || suppressed.has(normalizeEmail(lead.email))) {
        skipped += 1;
        continue;
      }
      db.campaign_leads.push({
        id: newId("cl"),
        campaign_id: req.params.id,
        lead_id: lid,
        account_id: null,
        current_step: 0,
        status: "pending",
        last_sent_at: null,
        next_send_at: null,
        sequence_stopped_at: null,
        stop_reason: null,
        error: null,
      });
      existing.add(lid);
      added += 1;
    }
    writeDb(db);
    res.json({ added, skipped });
  });

  app.post("/api/campaigns/:id/test-email", async (req, res) => {
    try {
      const result = await sendTestEmailServer(req.params.id, req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Leads ---
  app.get("/api/leads", (_req, res) => {
    const db = readDb();
    res.json(db.leads.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
  });

  app.post("/api/leads", (req, res) => {
    const db = readDb();
    const input = req.body as Partial<Lead>;
    const email = normalizeEmail(input.email ?? "");
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email address is required." });
    }
    if (db.leads.some((l) => normalizeEmail(l.email) === email)) {
      return res.status(400).json({ error: "A contact with this email already exists." });
    }
    const created: Lead = {
      id: newId("lead"),
      email,
      first_name: (input.first_name ?? "").trim(),
      last_name: (input.last_name ?? "").trim(),
      company: (input.company ?? "").trim(),
      designation: (input.designation ?? "").trim(),
      industry: (input.industry ?? "").trim(),
      tags: Array.isArray(input.tags) ? input.tags : [],
      status: input.status ?? "new",
      email_check: input.email_check ?? "unchecked",
      email_check_reason: input.email_check_reason ?? null,
      email_checked_at: input.email_checked_at ?? null,
      ai_line: input.ai_line ?? null,
      ai_line_at: null,
      custom_fields: input.custom_fields ?? {},
      created_at: new Date().toISOString(),
    };
    db.leads.push(created);
    writeDb(db);
    res.json(created);
  });

  app.post("/api/leads/import", (req, res) => {
    const db = readDb();
    const { rows } = req.body as { rows: Partial<Lead>[] };
    const seen = new Set(db.leads.map((l) => normalizeEmail(l.email)));
    let imported = 0;
    let skipped = 0;
    for (const row of rows ?? []) {
      const email = normalizeEmail(row.email ?? "");
      if (!email || !email.includes("@") || seen.has(email)) {
        skipped += 1;
        continue;
      }
      db.leads.push({
        id: newId("lead"),
        email,
        first_name: String(row.first_name ?? "").trim(),
        last_name: String(row.last_name ?? "").trim(),
        company: String(row.company ?? "").trim(),
        designation: String(row.designation ?? "").trim(),
        industry: String(row.industry ?? "").trim(),
        tags: Array.isArray(row.tags) ? row.tags : [],
        status: "new",
        email_check: "unchecked",
        email_check_reason: null,
        email_checked_at: null,
        ai_line: null,
        ai_line_at: null,
        custom_fields: {},
        created_at: new Date().toISOString(),
      });
      seen.add(email);
      imported += 1;
    }
    writeDb(db);
    res.json({ imported, skipped });
  });

  app.patch("/api/leads/:id", (req, res) => {
    const db = readDb();
    const lead = db.leads.find((l) => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    Object.assign(lead, req.body);
    writeDb(db);
    res.json(lead);
  });

  app.delete("/api/leads/:id", (req, res) => {
    const db = readDb();
    db.leads = db.leads.filter((l) => l.id !== req.params.id);
    db.campaign_leads = db.campaign_leads.filter((cl) => cl.lead_id !== req.params.id);
    writeDb(db);
    res.json({ ok: true });
  });

  app.post("/api/leads/verify", async (req, res) => {
    try {
      const db = readDb();
      const { leadIds } = req.body as { leadIds: string[] };
      const targets = db.leads.filter((l) => (leadIds ?? []).includes(l.id)).slice(0, 25);
      const counts = { valid: 0, risky: 0, invalid: 0 };
      const updated: Lead[] = [];
      const nowIso = new Date().toISOString();

      for (const lead of targets) {
        const check = await verifyEmailAddressServer(lead.email);
        lead.email_check = check.result;
        lead.email_check_reason = check.reason;
        lead.email_checked_at = nowIso;
        counts[check.result === "valid" ? "valid" : check.result === "risky" ? "risky" : "invalid"] += 1;
        updated.push(lead);
      }
      writeDb(db);
      res.json({ counts, updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Unified Inbox ---
  app.get("/api/inbox", (req, res) => {
    const status = (req.query.status as "open" | "closed" | "all") || "open";
    res.json(buildInboxPayload(status));
  });

  app.post("/api/inbox/:threadId/reply", async (req, res) => {
    try {
      const result = await replyToThreadServer(req.params.threadId, req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch("/api/inbox/:threadId/state", (req, res) => {
    const db = readDb();
    const conv = db.conversations.find((c) => c.thread_id === req.params.threadId);
    if (!conv) return res.status(404).json({ error: "Conversation not found." });
    const { status, unread } = req.body as { status?: "open" | "closed"; unread?: boolean };
    if (status) {
      conv.status = status;
      conv.closed_at = status === "closed" ? new Date().toISOString() : null;
      if (status === "open") conv.auto_closed = false;
    }
    if (unread !== undefined) conv.unread = unread;
    writeDb(db);
    res.json(conv);
  });

  // --- Templates ---
  app.get("/api/templates", (_req, res) => {
    const db = readDb();
    res.json(db.templates.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  });

  app.post("/api/templates", (req, res) => {
    const db = readDb();
    const input = req.body as Partial<Template>;
    const nowIso = new Date().toISOString();
    const created: Template = {
      id: newId("tpl"),
      name: (input.name || "Untitled Template").trim(),
      kind: input.kind || "email",
      subject: input.subject || "",
      body: input.body || "",
      tags: Array.isArray(input.tags) ? input.tags : [],
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.templates.push(created);
    writeDb(db);
    res.json(created);
  });

  app.patch("/api/templates/:id", (req, res) => {
    const db = readDb();
    const tpl = db.templates.find((t) => t.id === req.params.id);
    if (!tpl) return res.status(404).json({ error: "Template not found." });
    const patch = req.body as Partial<Template>;
    if (patch.name !== undefined) tpl.name = patch.name.trim();
    if (patch.kind !== undefined) tpl.kind = patch.kind;
    if (patch.subject !== undefined) tpl.subject = patch.subject;
    if (patch.body !== undefined) tpl.body = patch.body;
    if (patch.tags !== undefined) tpl.tags = patch.tags;
    tpl.updated_at = new Date().toISOString();
    writeDb(db);
    res.json(tpl);
  });

  app.delete("/api/templates/:id", (req, res) => {
    const db = readDb();
    db.templates = db.templates.filter((t) => t.id !== req.params.id);
    writeDb(db);
    res.json({ ok: true });
  });

  // --- Email Accounts (Manual Auto-MX SMTP + IMAP) ---
  app.get("/api/accounts", (_req, res) => {
    const db = readDb();
    res.json(db.accounts);
  });

  app.post("/api/accounts/detect-mx", async (req, res) => {
    try {
      const { email } = req.body as { email: string };
      if (!email?.includes("@")) {
        return res.status(400).json({ error: "Enter a valid email address." });
      }
      const result = await lookupMxForEmail(email);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/accounts", async (req, res) => {
    try {
      const db = readDb();
      const {
        email,
        display_name,
        provider_label,
        smtp_host,
        smtp_port,
        imap_host,
        imap_port,
        password,
        daily_limit,
        warmup_enabled,
        warmup_daily_cap,
      } = req.body as Partial<SendingAccount> & { password?: string };

      const normalizedEmail = normalizeEmail(email ?? "");
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return res.status(400).json({ error: "Valid email address is required." });
      }
      if (!password?.trim()) {
        return res.status(400).json({ error: "Password or app password is required." });
      }
      if (db.accounts.some((a) => normalizeEmail(a.email) === normalizedEmail)) {
        return res.status(400).json({ error: "This mailbox is already connected." });
      }

      const mxResult = await lookupMxForEmail(normalizedEmail);
      const preset = providerByKey(provider_label || mxResult.detected.providerKey);
      const candidates = [
        ...(smtp_host
          ? [
              {
                smtpHost: smtp_host.trim(),
                smtpPort: Number(smtp_port) || 465,
                imapHost: (imap_host || preset.imapHost || smtp_host).trim(),
                imapPort: Number(imap_port) || 993,
              },
            ]
          : []),
        ...mxResult.detected.candidates,
      ];

      const working = await resolveWorkingMailboxCandidate({
        email: normalizedEmail,
        password: password.trim(),
        candidates,
      });

      const accountId = newId("acc");
      saveAccountCredential(accountId, {
        email: normalizedEmail,
        password: password.trim(),
        smtp_host: working.smtpHost,
        smtp_port: working.smtpPort,
        imap_host: working.imapHost,
        imap_port: working.imapPort,
      });

      const nowIso = new Date().toISOString();
      const created: SendingAccount = {
        id: accountId,
        email: normalizedEmail,
        display_name: (display_name || normalizedEmail.split("@")[0] || "").trim(),
        provider: "smtp",
        provider_label: provider_label || mxResult.detected.providerKey || "custom",
        smtp_host: working.smtpHost,
        smtp_port: working.smtpPort,
        imap_host: working.imapHost,
        imap_port: working.imapPort,
        daily_limit: Math.max(1, Number(daily_limit) || 50),
        warmup_enabled: Boolean(warmup_enabled ?? false),
        warmup_daily_cap: Math.max(1, Number(warmup_daily_cap) || 30),
        sent_today: 0,
        health_score: 100,
        signature: "",
        status: "active",
        has_credentials: true,
        last_synced_at: nowIso,
        created_at: nowIso,
      };
      db.accounts.push(created);
      writeDb(db);
      res.json(created);
    } catch (err) {
      res.status(400).json({
        error: `Mailbox authentication failed: ${(err as Error).message}`,
      });
    }
  });

  app.post("/api/accounts/:id/test", async (req, res) => {
    try {
      const cred = getAccountCredential(req.params.id);
      if (!cred) {
        return res.status(404).json({ error: "Credentials not found for this mailbox." });
      }
      await verifySmtpConnection({
        email: cred.email,
        password: cred.password,
        smtpHost: cred.smtp_host,
        smtpPort: cred.smtp_port,
      });
      await verifyImapConnection({
        email: cred.email,
        password: cred.password,
        imapHost: cred.imap_host,
        imapPort: cred.imap_port,
      });
      res.json({ ok: true, smtp: true, imap: true });
    } catch (err) {
      res.status(400).json({ error: `Connection test failed: ${(err as Error).message}` });
    }
  });

  app.patch("/api/accounts/:id", (req, res) => {
    const db = readDb();
    const acc = db.accounts.find((a) => a.id === req.params.id);
    if (!acc) return res.status(404).json({ error: "Account not found." });
    const patch = req.body as Partial<SendingAccount>;
    if (patch.display_name !== undefined) acc.display_name = patch.display_name;
    if (patch.daily_limit !== undefined) acc.daily_limit = Math.max(1, Number(patch.daily_limit) || 50);
    if (patch.warmup_enabled !== undefined) acc.warmup_enabled = Boolean(patch.warmup_enabled);
    if (patch.warmup_daily_cap !== undefined) acc.warmup_daily_cap = Math.max(1, Number(patch.warmup_daily_cap) || 30);
    if (patch.signature !== undefined) acc.signature = patch.signature;
    if (patch.status !== undefined) acc.status = patch.status;
    writeDb(db);
    res.json(acc);
  });

  app.delete("/api/accounts/:id", (req, res) => {
    const db = readDb();
    db.accounts = db.accounts.filter((a) => a.id !== req.params.id);
    deleteAccountCredential(req.params.id);
    writeDb(db);
    res.json({ ok: true });
  });

  // --- Settings & Suppressions ---
  app.get("/api/settings", (_req, res) => {
    const db = readDb();
    res.json({
      settings: db.settings,
      suppressions: db.suppressions.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    });
  });

  app.patch("/api/settings", (req, res) => {
    const db = readDb();
    db.settings = {
      ...db.settings,
      ...req.body,
      tracking_pixels_disabled: true,
      click_tracking_disabled: true,
    };
    writeDb(db);
    res.json(db.settings);
  });

  app.post("/api/suppressions", (req, res) => {
    const db = readDb();
    const { email, reason, source } = req.body as {
      email: string;
      reason?: "unsubscribed" | "bounced" | "manual";
      source?: string;
    };
    const norm = normalizeEmail(email ?? "");
    if (!norm || !norm.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }
    if (!db.suppressions.some((s) => normalizeEmail(s.email) === norm)) {
      db.suppressions.push({
        id: newId("sup"),
        email: norm,
        reason: reason ?? "manual",
        source: source ?? "Manual",
        created_at: new Date().toISOString(),
      });
      writeDb(db);
    }
    res.json(db.suppressions.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
  });

  app.delete("/api/suppressions/:id", (req, res) => {
    const db = readDb();
    db.suppressions = db.suppressions.filter((s) => s.id !== req.params.id);
    writeDb(db);
    res.json({ ok: true });
  });

  // --- Optional AI Copilot (kept aside cleanly unless GEMINI_API_KEY is configured) ---
  app.get("/api/copilot/status", (_req, res) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    const configured = Boolean(key && key !== "MY_GEMINI_API_KEY");
    res.json({ configured });
  });

  app.post("/api/copilot/lines", async (req, res) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key || key === "MY_GEMINI_API_KEY") {
      return res.json({ available: false, written: 0, skipped: 0, generated: [] });
    }
    try {
      const db = readDb();
      const { leadIds, overwrite } = req.body as { leadIds: string[]; overwrite?: boolean };
      const targets = db.leads
        .filter((l) => (leadIds ?? []).includes(l.id) && (overwrite || !l.ai_line))
        .slice(0, 15);
      const generated = await generateAiIcebreakers(targets, db.settings.ai_context);
      for (const g of generated) {
        const lead = db.leads.find((l) => l.id === g.id);
        if (lead) lead.ai_line = g.line;
      }
      writeDb(db);
      res.json({
        available: true,
        written: generated.length,
        skipped: (leadIds?.length ?? 0) - targets.length,
        generated,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/copilot/draft", async (req, res) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key || key === "MY_GEMINI_API_KEY") {
      return res.json({ available: false });
    }
    try {
      const db = readDb();
      const { brief, kind, tone } = req.body as {
        brief: string;
        kind?: "email" | "follow_up" | "reply";
        tone?: string;
      };
      const result = await draftEmailCopy({
        brief: brief.trim(),
        kind: kind ?? "email",
        tone: tone ?? "",
        context: db.settings.ai_context,
      });
      res.json({ available: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/copilot/reply", async (req, res) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key || key === "MY_GEMINI_API_KEY") {
      return res.json({ available: false, body: "" });
    }
    try {
      const db = readDb();
      const { threadId, instruction } = req.body as { threadId: string; instruction?: string };
      const conv = db.conversations.find((c) => c.thread_id === threadId);
      const lead = conv ? db.leads.find((l) => l.id === conv.lead_id) : undefined;
      const msgs = db.messages
        .filter((m) => m.thread_id === threadId)
        .map((m) => ({ direction: m.direction, body: m.body, created_at: m.created_at }));
      const body = await draftThreadReply({
        lead: lead ?? { first_name: "", last_name: "", company: "", designation: "", industry: "" },
        messages: msgs,
        instruction: instruction ?? "",
        context: db.settings.ai_context,
      });
      res.json({ available: true, body });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Attachments ---
  app.post("/api/attachments/upload", (req, res) => {
    const { name, type, dataBase64 } = req.body as {
      name: string;
      type: string;
      dataBase64: string;
    };
    if (!name || !dataBase64) return res.status(400).json({ error: "File data required." });
    const buf = Buffer.from(dataBase64, "base64");
    if (buf.byteLength > 20 * 1024 * 1024) {
      return res.status(400).json({ error: "Attachment exceeds 20MB limit." });
    }
    const safeName = `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buf);
    res.json({
      kind: "file",
      path: safeName,
      name,
      size: buf.byteLength,
      type: type || "application/octet-stream",
    });
  });

  // --- Background Job Triggers (Manual + Public Cron Endpoints) ---
  app.post("/api/jobs/send-batch", async (req, res) => {
    try {
      const { manual } = req.body as { manual?: boolean };
      res.json(await runSendBatchServer(manual !== false));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/jobs/check-inbox", async (_req, res) => {
    try {
      res.json(await runCheckInboxServer());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/public/jobs/send-batch", async (req, res) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      res.json(await runSendBatchServer(false));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/public/jobs/check-inbox", async (req, res) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      res.json(await runCheckInboxServer());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Background Scheduler (1 min send-batch, 10 min inbox sync) ---
  let sendingTick = false;
  setInterval(async () => {
    if (sendingTick) return;
    sendingTick = true;
    try {
      await runSendBatchServer(false);
    } catch {
      // ignore transient background errors
    } finally {
      sendingTick = false;
    }
  }, 60_000);

  let inboxTick = false;
  setInterval(async () => {
    if (inboxTick) return;
    inboxTick = true;
    try {
      await runCheckInboxServer();
    } catch {
      // ignore transient background errors
    } finally {
      inboxTick = false;
    }
  }, 10 * 60_000);

  // --- Vite / Production Static Serving ---
  if (process.env.NODE_ENV === "production") {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DECILE Outreach live server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
