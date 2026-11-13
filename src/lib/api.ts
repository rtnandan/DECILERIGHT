import type {
  AppSettings,
  Attachment,
  Campaign,
  DashboardStats,
  EmailMessage,
  InboxThreadItem,
  Lead,
  SendingAccount,
  Suppression,
  Template,
} from "./types";

const TOKEN_KEY = "decile_workspace_token";

export function getStoredAuthToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredAuthToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

async function serverReq<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredAuthToken();
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    setStoredAuthToken("");
    window.dispatchEvent(new Event("decile-auth-expired"));
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface DashboardPayload {
  stats: DashboardStats;
  campaigns: (Campaign & { enrolled_count: number; replied_count: number })[];
  recentThreads: {
    conv: InboxThreadItem["state"];
    lead: Lead;
    lastMessage: EmailMessage;
    campaign: Campaign | null;
  }[];
  accounts: SendingAccount[];
}

export interface CampaignDetailPayload {
  campaign: Campaign;
  recipients: {
    id: string;
    campaign_id: string;
    lead_id: string;
    account_id: string | null;
    current_step: number;
    status: string;
    last_sent_at: string | null;
    next_send_at: string | null;
    sequence_stopped_at: string | null;
    stop_reason: string | null;
    error: string | null;
    lead: Lead;
    account: SendingAccount | null;
  }[];
  accounts: SendingAccount[];
  settings: AppSettings;
}

export const api = {
  // --- Workspace Auth ---
  getAuthSession: () =>
    serverReq<{ configured: boolean; authenticated: boolean; email: string }>("/api/auth/session"),

  setupWorkspaceAuth: async (payload: { email: string; password: string }) => {
    const res = await serverReq<{ ok: boolean; email: string; token: string }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredAuthToken(res.token);
    return res;
  },

  loginWorkspace: async (payload: { email: string; password: string }) => {
    const res = await serverReq<{ ok: boolean; email: string; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res.token) setStoredAuthToken(res.token);
    return res;
  },

  updateWorkspacePassword: async (payload: { email: string; password: string }) => {
    const res = await serverReq<{ ok: boolean; email: string; token: string }>(
      "/api/auth/update-password",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    if (res.token) setStoredAuthToken(res.token);
    return res;
  },

  logoutWorkspace: async () => {
    await serverReq<{ ok: boolean }>("/api/auth/logout", { method: "POST" }).catch(() => {});
    setStoredAuthToken("");
  },

  getDashboard: () => serverReq<DashboardPayload>("/api/dashboard"),

  // --- Campaigns ---
  listCampaigns: () =>
    serverReq<
      (Campaign & {
        enrolled_count: number;
        active_count: number;
        replied_count: number;
        completed_count: number;
      })[]
    >("/api/campaigns"),

  createCampaign: (payload: {
    name: string;
    subject: string;
    body: string;
    account_ids: string[];
    daily_limit: number;
    follow_ups?: Campaign["follow_ups"];
    attachments?: Attachment[];
    lead_ids?: string[];
  }) =>
    serverReq<Campaign>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getCampaign: (id: string) =>
    serverReq<CampaignDetailPayload>(`/api/campaigns/${encodeURIComponent(id)}`),

  updateCampaign: (id: string, patch: Partial<Campaign>) =>
    serverReq<Campaign>(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteCampaign: (id: string) =>
    serverReq<{ ok: boolean }>(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  enrollLeads: (campaignId: string, leadIds: string[]) =>
    serverReq<{ added: number; skipped: number }>(
      `/api/campaigns/${encodeURIComponent(campaignId)}/enroll`,
      {
        method: "POST",
        body: JSON.stringify({ leadIds }),
      },
    ),

  sendTestEmail: (
    campaignId: string,
    payload: { toEmail: string; accountId?: string; sampleLeadId?: string },
  ) =>
    serverReq<{ ok: boolean; mode: string; preview: { subject: string; body: string } }>(
      `/api/campaigns/${encodeURIComponent(campaignId)}/test-email`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  // --- Leads ---
  listLeads: () => serverReq<Lead[]>("/api/leads"),

  createLead: (payload: Partial<Lead>) =>
    serverReq<Lead>("/api/leads", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  importLeads: (rows: Partial<Lead>[]) =>
    serverReq<{ imported: number; skipped: number }>("/api/leads/import", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),

  updateLead: (id: string, patch: Partial<Lead>) =>
    serverReq<Lead>(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteLead: (id: string) =>
    serverReq<{ ok: boolean }>(`/api/leads/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  verifyLeads: (leadIds: string[]) =>
    serverReq<{
      counts: { valid: number; risky: number; invalid: number };
      updated: Lead[];
    }>("/api/leads/verify", {
      method: "POST",
      body: JSON.stringify({ leadIds }),
    }),

  // --- Unified Inbox ---
  getInbox: (status: "open" | "closed" | "all" = "open") =>
    serverReq<{ threads: InboxThreadItem[]; counts: { open: number; closed: number } }>(
      `/api/inbox?status=${encodeURIComponent(status)}`,
    ),

  replyToThread: (threadId: string, payload: { body: string; attachments?: Attachment[] }) =>
    serverReq<{ ok: boolean; message: EmailMessage; mode: string }>(
      `/api/inbox/${encodeURIComponent(threadId)}/reply`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  updateThreadState: (
    threadId: string,
    patch: { status?: "open" | "closed"; unread?: boolean },
  ) =>
    serverReq<InboxThreadItem["state"]>(`/api/inbox/${encodeURIComponent(threadId)}/state`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // --- Templates ---
  listTemplates: () => serverReq<Template[]>("/api/templates"),

  createTemplate: (payload: Partial<Template>) =>
    serverReq<Template>("/api/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTemplate: (id: string, patch: Partial<Template>) =>
    serverReq<Template>(`/api/templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteTemplate: (id: string) =>
    serverReq<{ ok: boolean }>(`/api/templates/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // --- Email Accounts ---
  listAccounts: () => serverReq<SendingAccount[]>("/api/accounts"),

  detectMx: (email: string) =>
    serverReq<{
      domain: string;
      mxRecords: string[];
      detected: {
        providerKey: string;
        candidates: { smtpHost: string; smtpPort: number; imapHost: string; imapPort: number }[];
      };
    }>("/api/accounts/detect-mx", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  createAccount: (payload: Partial<SendingAccount> & { password?: string }) =>
    serverReq<SendingAccount>("/api/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  testAccount: (id: string) =>
    serverReq<{ ok: boolean; smtp: boolean; imap: boolean }>(
      `/api/accounts/${encodeURIComponent(id)}/test`,
      { method: "POST" },
    ),

  updateAccount: (id: string, patch: Partial<SendingAccount>) =>
    serverReq<SendingAccount>(`/api/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteAccount: (id: string) =>
    serverReq<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // --- Settings & Suppressions ---
  getSettings: () =>
    serverReq<{ settings: AppSettings; suppressions: Suppression[] }>("/api/settings"),

  updateSettings: (patch: Partial<AppSettings>) =>
    serverReq<AppSettings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  addSuppression: (payload: {
    email: string;
    reason?: "unsubscribed" | "bounced" | "manual";
    source?: string;
  }) =>
    serverReq<Suppression[]>("/api/suppressions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteSuppression: (id: string) =>
    serverReq<{ ok: boolean }>(`/api/suppressions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // --- Optional AI Copilot (kept aside unless GEMINI_API_KEY is configured) ---
  getCopilotStatus: () => serverReq<{ configured: boolean }>("/api/copilot/status"),

  generateAiLines: async (leadIds: string[], overwrite = false) => {
    const res = await serverReq<{
      available: boolean;
      written: number;
      skipped: number;
      generated: { id: string; line: string }[];
    }>("/api/copilot/lines", {
      method: "POST",
      body: JSON.stringify({ leadIds, overwrite }),
    });
    if (!res.available) {
      throw new Error("AI Copilot is paused — add GEMINI_API_KEY in Secrets when you are ready.");
    }
    return { written: res.written, skipped: res.skipped, generated: res.generated };
  },

  draftWithAi: async (payload: {
    brief: string;
    kind: "email" | "follow_up" | "reply";
    tone?: string;
  }) => {
    const res = await serverReq<{
      available: boolean;
      subject: string;
      body: string;
      subjectIdeas: string[];
    }>("/api/copilot/draft", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.available) {
      throw new Error("AI Copilot is paused — add GEMINI_API_KEY in Secrets when you are ready.");
    }
    return { subject: res.subject, body: res.body, subjectIdeas: res.subjectIdeas };
  },

  draftReplyWithAi: async (threadId: string, instruction?: string) => {
    const res = await serverReq<{ available: boolean; body: string }>("/api/copilot/reply", {
      method: "POST",
      body: JSON.stringify({ threadId, instruction }),
    });
    if (!res.available) {
      throw new Error("AI Copilot is paused — add GEMINI_API_KEY in Secrets when you are ready.");
    }
    return { body: res.body };
  },

  // --- Attachments & Jobs ---
  uploadAttachment: (payload: { name: string; type: string; dataBase64: string }) =>
    serverReq<Extract<Attachment, { kind: "file" }>>("/api/attachments/upload", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  runSendBatch: (manual = true) =>
    serverReq<{ sent: number; skipped: number; failed: number; notes: string[] }>(
      "/api/jobs/send-batch",
      {
        method: "POST",
        body: JSON.stringify({ manual }),
      },
    ),

  runCheckInbox: () =>
    serverReq<{
      syncedAccounts: number;
      newReplies: number;
      autoClosedThreads: number;
      nurtureScheduled: number;
    }>("/api/jobs/check-inbox", {
      method: "POST",
    }),
};
