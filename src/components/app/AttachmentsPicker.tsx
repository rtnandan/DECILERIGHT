import React, { useRef, useState } from "react";
import { FileText, Link2, Paperclip, PlayCircle, Upload, Video, X } from "lucide-react";
import { api } from "../../lib/api";
import {
  detectVideoProvider,
  formatBytes,
  MAX_ATTACHMENT_BYTES,
  totalFileBytes,
  type Attachment,
} from "../../lib/attachments";
import { useToast } from "../ui/ToastProvider";

interface AttachmentsPickerProps {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
}

export function AttachmentsPicker({ value, onChange, disabled }: AttachmentsPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const { notify } = useToast();
  const [uploading, setUploading] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLabel, setVideoLabel] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      let currentBytes = totalFileBytes(value);
      const next = [...value];
      for (const file of Array.from(files)) {
        if (currentBytes + file.size > MAX_ATTACHMENT_BYTES) {
          notify("Attachment limit exceeded", {
            description: "Total attachments cannot exceed 20 MB per email (for larger videos, paste a Loom link).",
            kind: "error",
          });
          break;
        }
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || "");
            const idx = result.indexOf(",");
            resolve(idx >= 0 ? result.slice(idx + 1) : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const uploaded = await api.uploadAttachment({
          name: file.name,
          type: file.type || "application/octet-stream",
          dataBase64,
        });
        next.push(uploaded);
        currentBytes += file.size;
      }
      onChange(next);
      setVideoOpen(false);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (videoFileRef.current) videoFileRef.current.value = "";
    }
  }

  function addLink() {
    const trimmedUrl = url.trim();
    if (!/^https?:\/\/.+/.test(trimmedUrl)) {
      notify("Enter a valid URL starting with http:// or https://", { kind: "error" });
      return;
    }
    onChange([
      ...value,
      {
        kind: "link",
        url: trimmedUrl,
        label: label.trim() || trimmedUrl,
      },
    ]);
    setLabel("");
    setUrl("");
    setLinkOpen(false);
  }

  function addVideoLink() {
    const trimmedUrl = videoUrl.trim();
    if (!/^https?:\/\/.+/.test(trimmedUrl)) {
      notify("Paste a valid Loom or video URL starting with https://", { kind: "error" });
      return;
    }
    const provider = detectVideoProvider(trimmedUrl);
    const fallbackLabel = provider === "loom" ? "Watch Loom walkthrough" : "Watch video";
    onChange([
      ...value,
      {
        kind: "video",
        url: trimmedUrl,
        label: videoLabel.trim() || fallbackLabel,
        provider,
      },
    ]);
    setVideoLabel("");
    setVideoUrl("");
    setVideoOpen(false);
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((att, idx) => (
            <li
              key={`${att.kind}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {att.kind === "file" ? (
                  att.type.startsWith("video/") ? (
                    <Video className="h-3.5 w-3.5 text-signal shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )
                ) : att.kind === "video" ? (
                  <PlayCircle className="h-3.5 w-3.5 text-signal shrink-0" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 text-signal shrink-0" />
                )}
                <span className="truncate font-medium">
                  {att.kind === "file" ? att.name : att.label}
                </span>
                {att.kind === "video" && (
                  <span className="font-mono text-[10px] uppercase rounded bg-signal-soft px-1.5 py-0.5 text-signal shrink-0">
                    {att.provider === "loom" ? "Loom" : "Video"}
                  </span>
                )}
                <span className="tabular text-muted-foreground shrink-0 truncate max-w-[200px]">
                  {att.kind === "file" ? formatBytes(att.size) : att.url}
                </span>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== idx))}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            aria-label="Attach files"
          />
          <input
            ref={videoFileRef}
            type="file"
            accept="video/*,.mp4,.mov,.webm,.m4v"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            aria-label="Attach video file"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span>{uploading ? "Uploading..." : "Attach file"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setVideoOpen((v) => !v);
              setLinkOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              videoOpen
                ? "border-signal bg-signal-soft text-signal"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            <Video className="h-3.5 w-3.5 text-signal" />
            <span>Attach Loom / Video</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkOpen((v) => !v);
              setVideoOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              linkOpen
                ? "border-signal bg-signal-soft text-signal"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Add link</span>
          </button>
        </div>
      )}

      {videoOpen && !disabled && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">
              Send a Loom video link or upload a video file (max 20 MB)
            </span>
            <button
              type="button"
              disabled={uploading}
              onClick={() => videoFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              <span>{uploading ? "Uploading..." : "Upload video file (.mp4/.mov)"}</span>
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={videoLabel}
              onChange={(e) => setVideoLabel(e.target.value)}
              placeholder="Video title, e.g. 60-sec Loom for {{company}}"
              className="h-8 rounded-md border border-input bg-card px-2.5 text-xs sm:w-52 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.loom.com/share/..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addVideoLink();
                }
              }}
              className="h-8 flex-1 rounded-md border border-input bg-card px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={addVideoLink}
              className="h-8 rounded-md bg-signal px-3 text-xs font-medium text-signal-foreground hover:opacity-90 whitespace-nowrap shrink-0"
            >
              Attach Loom
            </button>
          </div>
        </div>
      )}

      {linkOpen && !disabled && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2.5 sm:flex-row sm:items-center">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Link label, e.g. Case Studies"
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs sm:w-48 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
            className="h-8 flex-1 rounded-md border border-input bg-card px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={addLink}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 whitespace-nowrap shrink-0"
          >
            Add link
          </button>
        </div>
      )}
    </div>
  );
}
