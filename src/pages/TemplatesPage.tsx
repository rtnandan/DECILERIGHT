import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Save, Send, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { inboxWarnings } from "../lib/compose";
import { STANDARD_VARIABLES } from "../lib/email-utils";
import type { Template } from "../lib/types";
import { PageHeader, formatShortDate } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

export function TemplatesPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<"all" | "email" | "follow_up" | "reply">("all");

  // Editor state
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"email" | "follow_up" | "reply">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(selectFirst = false) {
    try {
      const rows = await api.listTemplates();
      setTemplates(rows);
      if ((selectFirst || !selectedId) && rows[0]) {
        selectTemplate(rows[0]);
      } else if (rows.length === 0) {
        startNew();
      }
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  useEffect(() => {
    load(true);
  }, []);

  function selectTemplate(t: Template) {
    setSelectedId(t.id);
    setName(t.name);
    setKind(t.kind);
    setSubject(t.subject);
    setBody(t.body);
    setTagsText(t.tags.join(", "));
  }

  function startNew() {
    setSelectedId("new");
    setName("New Outreach Template");
    setKind("email");
    setSubject("Quick question for {{company}}");
    setBody("Hi {{first_name|there}},\n\n{{ai_line|}}\n\n");
    setTagsText("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (selectedId === "new" || !selectedId) {
        const created = await api.createTemplate({ name, kind, subject, body, tags });
        notify("Template created", { kind: "success" });
        await load();
        selectTemplate(created);
      } else {
        const updated = await api.updateTemplate(selectedId, { name, kind, subject, body, tags });
        notify("Template updated", { kind: "success" });
        await load();
        selectTemplate(updated);
      }
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteTemplate(id);
      notify("Template deleted", { kind: "info" });
      setSelectedId("");
      await load(true);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function createCampaignFromTemplate() {
    if (!body.trim()) return;
    try {
      const accounts = await api.listAccounts();
      const created = await api.createCampaign({
        name: `${name || "Template"} Campaign`,
        subject: subject || "Quick question for {{company}}",
        body,
        account_ids: accounts.filter((a) => a.status === "active").map((a) => a.id),
        daily_limit: 50,
      });
      notify("Campaign created from template", { kind: "success" });
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  const filtered = templates.filter((t) => (kindFilter === "all" ? true : t.kind === kindFilter));
  const warnings = inboxWarnings(subject, body);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="Templates"
        description="Reusable cold email, follow-up, and Unified Inbox reply snippets with real-time spam-trigger checks."
        actions={
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New template</span>
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left List */}
        <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
          <div className="border-b border-border p-3">
            <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-0.5 text-[11px]">
              {(["all", "email", "follow_up", "reply"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`rounded py-1 font-medium capitalize ${
                    kindFilter === k ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  {k === "follow_up" ? "Follow-up" : k}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border overflow-y-auto max-h-[540px]">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No templates yet. Create your first reusable email or reply snippet using the editor.
              </div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    selectedId === t.id ? "bg-accent/70" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground shrink-0">
                      {t.kind.replace("_", "-")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                    {t.subject || t.body}
                  </p>
                  <div className="mt-1 text-[11px] text-muted-foreground/80 flex items-center gap-2">
                    <span>{t.tags.join(" · ") || "Untagged"}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular">{formatShortDate(t.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Editor */}
        <form onSubmit={handleSave} className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="text-base font-semibold text-foreground">
              {selectedId === "new" ? "Create Template" : "Edit Template"}
            </h2>
            <div className="flex items-center gap-2">
              {selectedId && selectedId !== "new" && (
                <>
                  <button
                    type="button"
                    onClick={createCampaignFromTemplate}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Launch campaign</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedId)}
                    className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? "Saving..." : "Save template"}</span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Template name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="email">Initial Email</option>
                <option value="follow_up">Follow-up Step</option>
                <option value="reply">Inbox Reply</option>
              </select>
            </div>
          </div>

          {kind === "email" && (
            <div>
              <label className="block text-xs font-medium mb-1">Subject line</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-medium">Body</label>
              <div className="flex flex-wrap gap-1">
                {STANDARD_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBody((prev) => `${prev}${prev.endsWith(" ") || !prev ? "" : " "}{{${v}}}`)}
                    className="font-mono text-[11px] rounded border border-border bg-background px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={8}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Tags (comma separated)</label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="saas, first-touch, founder"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            />
          </div>

          <div className="border-t border-border pt-3 text-xs">
            {warnings.length === 0 ? (
              <div className="flex items-center gap-1.5 text-success font-medium">
                <ShieldCheck className="h-4 w-4" />
                <span>Clean primary-inbox deliverability profile</span>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-warning font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Deliverability tips:</span>
                </div>
                <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
