import type { BehaviorRules, FollowUpStep } from "./types";

export const MAX_FOLLOW_UPS = 8;
export const DELAY_PRESETS = [3, 5, 7, 13, 21] as const;

export type FollowUp = FollowUpStep;

export function parseFollowUps(raw: unknown): FollowUp[] {
  if (!Array.isArray(raw)) return [];
  const out: FollowUp[] = [];
  for (const s of raw.slice(0, MAX_FOLLOW_UPS)) {
    const body = typeof s?.body === "string" ? s.body : "";
    if (!body.trim()) break;
    const d = Math.round(Number(s?.delay_days));
    out.push({
      body,
      delay_days: Number.isFinite(d) ? Math.min(365, Math.max(1, d)) : 3,
      attachments: Array.isArray(s?.attachments) ? s.attachments : [],
    });
  }
  return out;
}

export function nextFollowUp(
  c: { follow_ups: unknown },
  cl: { current_step: number; last_sent_at: string | null; sequence_stopped_at: string | null },
): { n: number; body: string; delay_days: number; dueAt: Date } | null {
  if (cl.sequence_stopped_at || !cl.last_sent_at) return null;
  const steps = parseFollowUps(c.follow_ups);
  const step = steps[cl.current_step - 1];
  if (cl.current_step < 1 || !step) return null;
  const dueAt = new Date(new Date(cl.last_sent_at).getTime() + step.delay_days * 86_400_000);
  return { n: cl.current_step, body: step.body, delay_days: step.delay_days, dueAt };
}

export function stepLabel(step: number, isManual: boolean): string {
  if (isManual) return "Your reply";
  if (step === 99) return "Check-in";
  return step === 0 ? "First email" : `Follow-up ${step}`;
}

export type ReplyAction = "stop" | "continue" | "nurture";

export const DEFAULT_BEHAVIOR: BehaviorRules = {
  out_of_office: "continue",
  later_check_in: false,
  later_delay_days: 21,
  later_body: "Hi {{first_name|there}}, circling back as you suggested — is now a better time to talk?",
  stop_on_reply: true,
  stop_on_bounce: true,
  stop_on_unsubscribe: true,
};

export function parseBehavior(raw: unknown): BehaviorRules {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<BehaviorRules>;
  const d = Math.round(Number(o.later_delay_days));
  return {
    out_of_office: o.out_of_office === "stop" ? "stop" : "continue",
    later_check_in: o.later_check_in === true,
    later_delay_days: Number.isFinite(d) ? Math.min(365, Math.max(1, d)) : DEFAULT_BEHAVIOR.later_delay_days,
    later_body: typeof o.later_body === "string" ? o.later_body : DEFAULT_BEHAVIOR.later_body,
    stop_on_reply: o.stop_on_reply !== false,
    stop_on_bounce: o.stop_on_bounce !== false,
    stop_on_unsubscribe: o.stop_on_unsubscribe !== false,
  };
}

export function replyAction(category: string | null, b: BehaviorRules): ReplyAction {
  if (category === "out_of_office") return b.out_of_office === "continue" ? "continue" : "stop";
  if (category === "follow_up_later" && b.later_check_in && b.later_body.trim()) return "nurture";
  return "stop";
}

export type SendingWindow = {
  send_start_hour: number;
  send_end_hour: number;
  send_weekdays_only: boolean;
};

export function inSendingWindow(now: Date, timeZone: string, w: SendingWindow): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const day = parts.find((p) => p.type === "weekday")?.value ?? "";
    if (w.send_weekdays_only && (day === "Sat" || day === "Sun")) return false;
    const start = w.send_start_hour ?? 0;
    const end = w.send_end_hour ?? 24;
    if (start >= end) return true;
    return hour >= start && hour < end;
  } catch {
    return true;
  }
}
