export interface LeadLike {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  designation?: string | null;
  industry?: string | null;
  email?: string | null;
  ai_line?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export const STANDARD_VARIABLES = [
  "first_name",
  "last_name",
  "company",
  "designation",
  "industry",
  "email",
  "ai_line",
] as const;

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "replied",
  "interested",
  "not_interested",
  "bounced",
  "unsubscribed",
] as const;

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function lookup(lead: LeadLike, key: string): string {
  const k = key.toLowerCase();
  const std = (lead as Record<string, unknown>)[k];
  if (typeof std === "string" && std.trim()) return std.trim();
  const custom = lead.custom_fields ?? {};
  for (const [ck, cv] of Object.entries(custom)) {
    if (ck.toLowerCase() === k && cv != null && String(cv).trim()) return String(cv).trim();
  }
  return "";
}

export function renderTemplate(template: string, lead: LeadLike): string {
  return template.replace(VAR_RE, (_m, key: string, fallback?: string) => {
    const v = lookup(lead, key);
    return v || (fallback ?? "");
  });
}

export function missingVariables(template: string, lead: LeadLike): string[] {
  const missing = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    const key = m[1] ?? "";
    const fallback = m[2];
    if (!lookup(lead, key) && fallback === undefined) missing.add(key);
  }
  return [...missing];
}

export function variablesIn(template: string): string[] {
  return [...new Set([...template.matchAll(VAR_RE)].map((m) => m[1] ?? ""))];
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
