import type { Attachment } from "./types";

export type FileAttachment = Extract<Attachment, { kind: "file" }>;
export type LinkAttachment = Extract<Attachment, { kind: "link" }>;
export type VideoAttachment = Extract<Attachment, { kind: "video" }>;
export type { Attachment };

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function detectVideoProvider(url: string): "loom" | "youtube" | "vimeo" | "video" {
  const lower = url.toLowerCase();
  if (lower.includes("loom.com")) return "loom";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("vimeo.com")) return "vimeo";
  return "video";
}

export function getVideoEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("loom.com")) {
      const match = parsed.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/);
      if (match?.[1]) return `https://www.loom.com/embed/${match[1]}`;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const match = parsed.pathname.match(/\/(\d+)/);
      if (match?.[1]) return `https://player.vimeo.com/video/${match[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const a of raw) {
    if (a?.kind === "file" && typeof a.path === "string" && typeof a.name === "string") {
      out.push({
        kind: "file",
        path: a.path,
        name: a.name,
        size: Number(a.size) || 0,
        type: String(a.type || "application/octet-stream"),
      });
    } else if (a?.kind === "link" && typeof a.url === "string" && /^https?:\/\//.test(a.url)) {
      out.push({
        kind: "link",
        url: a.url,
        label: typeof a.label === "string" && a.label.trim() ? a.label.trim() : a.url,
      });
    } else if (a?.kind === "video" && typeof a.url === "string" && /^https?:\/\//.test(a.url)) {
      out.push({
        kind: "video",
        url: a.url,
        label:
          typeof a.label === "string" && a.label.trim()
            ? a.label.trim()
            : detectVideoProvider(a.url) === "loom"
              ? "Watch Loom video"
              : "Watch video",
        provider: detectVideoProvider(a.url),
      });
    }
  }
  return out;
}

export function totalFileBytes(list: Attachment[]): number {
  return list.reduce((n, a) => n + (a.kind === "file" ? a.size : 0), 0);
}

export function appendLinks(body: string, list: Attachment[]): string {
  const linkLines: string[] = [];
  for (const a of list) {
    if (a.kind === "link") {
      linkLines.push(`[${a.label}](${a.url})`);
    } else if (a.kind === "video") {
      const prefix = a.provider === "loom" ? "▶ Watch Loom Video" : "▶ Watch Video";
      linkLines.push(`[${prefix}: ${a.label}](${a.url})`);
    }
  }
  if (!linkLines.length) return body;
  return `${body.trimEnd()}\n\n${linkLines.join("\n")}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
