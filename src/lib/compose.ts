import { renderTemplate, type LeadLike } from "./email-utils";
import { appendLinks, type Attachment } from "./attachments";

export const OPT_OUT_LINE = `P.S. If this isn't relevant, just reply "unsubscribe" and I won't email you again.`;

export function composeEmail(opts: {
  subject: string;
  body: string;
  signature?: string | null | undefined;
  lead: LeadLike;
  optOut?: boolean;
  attachments?: Attachment[] | undefined;
}) {
  const subject = renderTemplate(opts.subject, opts.lead);
  let body = appendLinks(renderTemplate(opts.body, opts.lead).trimEnd(), opts.attachments ?? []);
  if (opts.signature?.trim()) body += `\n\n${renderTemplate(opts.signature, opts.lead).trim()}`;
  if (opts.optOut) body += `\n\n${OPT_OUT_LINE}`;
  return { subject, body };
}

const PROMO_WORDS = [
  "free",
  "offer",
  "discount",
  "deal",
  "limited time",
  "act now",
  "click here",
  "buy now",
  "guarantee",
  "100%",
  "risk-free",
  "special promotion",
  "newsletter",
  "% off",
  "sale",
];

export function inboxWarnings(subject: string, body: string): string[] {
  const w: string[] = [];
  const text = `${subject}\n${body}`.toLowerCase();
  const links = body.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > 1) w.push(`Contains ${links} links. Keep to 1 link max, ideally 0 in first touch.`);
  else if (links === 1) w.push("Contains 1 link. First-touch emails with zero links land in Primary inbox more often.");
  const promo = PROMO_WORDS.filter((p) =>
    new RegExp(`(^|[^a-z])${p.replace(/[%.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text),
  );
  if (promo.length) w.push(`Promotional trigger words detected: ${promo.map((p) => `"${p}"`).join(", ")}.`);
  if (/!{2,}|!\s*$/m.test(subject) || (subject.match(/!/g)?.length ?? 0) > 0)
    w.push("Avoid exclamation marks in the subject line.");
  const capsWords = subject
    .split(/\s+/)
    .filter((x) => x.length > 3 && x === x.toUpperCase() && /[A-Z]/.test(x));
  if (capsWords.length) w.push("Avoid ALL-CAPS words in the subject line.");
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 180) w.push(`Body is ${words} words. Keep cold emails concise (50–150 words).`);
  return w;
}

export function pickSignature(
  accountSignature: string | null | undefined,
  defaultSignature: string | null | undefined,
): string {
  return accountSignature?.trim() ? accountSignature : (defaultSignature ?? "");
}
