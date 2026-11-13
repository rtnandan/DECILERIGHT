import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DEFAULT_BEHAVIOR } from "../src/lib/followups";
import type {
  AppSettings,
  Campaign,
  CampaignLead,
  ConversationState,
  EmailMessage,
  Lead,
  SendingAccount,
  Suppression,
  Template,
} from "../src/lib/types";

export interface EncryptedCredential {
  account_id: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  iv: string;
  tag: string;
  ciphertext: string;
  updated_at: string;
}

export interface WorkspaceAuthRecord {
  email: string;
  password_hash: string;
  salt: string;
  updated_at: string;
}

export interface DecileDatabase {
  workspace_auth: WorkspaceAuthRecord | null;
  settings: AppSettings;
  accounts: SendingAccount[];
  campaigns: Campaign[];
  leads: Lead[];
  campaign_leads: CampaignLead[];
  messages: EmailMessage[];
  conversations: ConversationState[];
  templates: Template[];
  suppressions: Suppression[];
  account_daily_dates: Record<string, string>;
  campaign_daily_dates: Record<string, string>;
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const CREDS_FILE = path.join(DATA_DIR, "credentials.json");
const DB_FILE = path.join(DATA_DIR, "decile-db.json");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function defaultDb(): DecileDatabase {
  return {
    workspace_auth: null,
    settings: {
      send_start_hour: 9,
      send_end_hour: 18,
      send_weekdays_only: true,
      time_zone: "UTC",
      auto_close_days: 14,
      ai_context: "",
      default_signature: "",
      default_follow_up_delays: [3, 5, 7],
      default_behavior: { ...DEFAULT_BEHAVIOR },
      tracking_pixels_disabled: true,
      click_tracking_disabled: true,
    },
    accounts: [],
    campaigns: [],
    leads: [],
    campaign_leads: [],
    messages: [],
    conversations: [],
    templates: [],
    suppressions: [],
    account_daily_dates: {},
    campaign_daily_dates: {},
  };
}

export function readDb(): DecileDatabase {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    const initial = defaultDb();
    writeDb(initial);
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Partial<DecileDatabase>;
    const base = defaultDb();
    const db: DecileDatabase = {
      ...base,
      ...raw,
      workspace_auth: raw.workspace_auth ?? null,
      settings: {
        ...base.settings,
        ...(raw.settings ?? {}),
        tracking_pixels_disabled: true,
        click_tracking_disabled: true,
      },
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [],
      leads: Array.isArray(raw.leads) ? raw.leads : [],
      campaign_leads: Array.isArray(raw.campaign_leads) ? raw.campaign_leads : [],
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      conversations: Array.isArray(raw.conversations) ? raw.conversations : [],
      templates: Array.isArray(raw.templates) ? raw.templates : [],
      suppressions: Array.isArray(raw.suppressions) ? raw.suppressions : [],
      account_daily_dates: raw.account_daily_dates ?? {},
      campaign_daily_dates: raw.campaign_daily_dates ?? {},
    };

    const today = todayDateKey();
    for (const acc of db.accounts) {
      if (db.account_daily_dates[acc.id] !== today) {
        acc.sent_today = 0;
      }
    }
    for (const camp of db.campaigns) {
      if (db.campaign_daily_dates[camp.id] !== today) {
        camp.sent_today = 0;
      }
    }
    return db;
  } catch {
    const initial = defaultDb();
    writeDb(initial);
    return initial;
  }
}

export function writeDb(db: DecileDatabase): void {
  ensureDirs();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

// --- AES-256-GCM Encrypted Mailbox Vault ---
function getEncryptionKey(): Buffer {
  const hex = process.env.MAIL_CREDENTIALS_KEY?.trim();
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  return crypto
    .createHash("sha256")
    .update(process.env.APP_URL || "decile-outreach-aes-key")
    .digest();
}

export function encryptSecret(plain: string): { iv: string; tag: string; ciphertext: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: enc.toString("hex"),
  };
}

export function decryptSecret(cred: EncryptedCredential): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(cred.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(cred.tag, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(cred.ciphertext, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

function loadVault(): Record<string, EncryptedCredential> {
  ensureDirs();
  if (!fs.existsSync(CREDS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8")) as Record<string, EncryptedCredential>;
  } catch {
    return {};
  }
}

function saveVault(vault: Record<string, EncryptedCredential>): void {
  ensureDirs();
  const tmp = `${CREDS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(vault, null, 2), "utf8");
  fs.renameSync(tmp, CREDS_FILE);
}

export function saveAccountCredential(
  accountId: string,
  data: {
    email: string;
    password: string;
    smtp_host: string;
    smtp_port: number;
    imap_host: string;
    imap_port: number;
  },
): void {
  const vault = loadVault();
  const enc = encryptSecret(data.password);
  vault[accountId] = {
    account_id: accountId,
    email: data.email.trim().toLowerCase(),
    smtp_host: data.smtp_host,
    smtp_port: data.smtp_port,
    imap_host: data.imap_host,
    imap_port: data.imap_port,
    ...enc,
    updated_at: new Date().toISOString(),
  };
  saveVault(vault);
}

export function getAccountCredential(accountId: string): (EncryptedCredential & { password: string }) | null {
  const vault = loadVault();
  const entry = vault[accountId];
  if (!entry) return null;
  return {
    ...entry,
    password: decryptSecret(entry),
  };
}

export function deleteAccountCredential(accountId: string): void {
  const vault = loadVault();
  if (vault[accountId]) {
    delete vault[accountId];
    saveVault(vault);
  }
}

// --- Simple Workspace Auth Helpers ---
export function hashWorkspacePassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, usedSalt, 64).toString("hex");
  return { hash, salt: usedSalt };
}

export function verifyWorkspacePassword(password: string, record: WorkspaceAuthRecord): boolean {
  const { hash } = hashWorkspacePassword(password, record.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(record.password_hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getSessionSecret(): Buffer {
  return crypto
    .createHash("sha256")
    .update(process.env.MAIL_CREDENTIALS_KEY || process.env.APP_URL || "decile-workspace-session-key")
    .digest();
}

export function createSessionToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      email: email.trim().toLowerCase(),
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): { email: string } | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      exp?: number;
    };
    if (!parsed.email || !parsed.exp || parsed.exp < Date.now()) return null;
    return { email: parsed.email };
  } catch {
    return null;
  }
}
