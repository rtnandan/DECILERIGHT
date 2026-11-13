import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, FilePlus2, Info, Send, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { inboxWarnings } from "../lib/compose";
import type { Lead } from "../lib/types";
import { PageHeader, StatusTag } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

export function CopilotPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [tab, setTab] = useState<"writer" | "lines">("writer");
  const [copilotConfigured, setCopilotConfigured] = useState<boolean | null>(null);

  // Copywriter state
  const [kind, setKind] = useState<"email" | "follow_up" | "reply">("email");
  const [tone, setTone] = useState("warm, direct, peer-to-peer");
  const [brief, setBrief] = useState("");
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [subjectIdeas, setSubjectIdeas] = useState<string[]>([]);
  const [copiedField, setCopiedField] = useState<string>("");

  // Batch AI lines state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [generatingLines, setGeneratingLines] = useState(false);

  async function loadAll() {
    try {
      const [statusRes, rows] = await Promise.all([api.getCopilotStatus(), api.listLeads()]);
      setCopilotConfigured(statusRes.configured);
      setLeads(rows);
      setSelectedLeadIds(rows.filter((l) => !l.ai_line).slice(0, 15).map((l) => l.id));
    } catch {
      setCopilotConfigured(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleGenerateCopy(e: React.FormEvent) {
    e.preventDefault();
    if (!copilotConfigured || brief.trim().length < 5) return;
    setGeneratingCopy(true);
    try {
      const res = await api.draftWithAi({ brief, kind, tone });
      setDraftSubject(res.subject);
      setDraftBody(res.body);
      setSubjectIdeas(res.subjectIdeas);
      notify("Draft generated", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setGeneratingCopy(false);
    }
  }

  async function handleSaveTemplate() {
    if (!draftBody.trim()) return;
    try {
      await api.createTemplate({
        name: draftSubject || `Draft (${kind})`,
        kind,
        subject: draftSubject,
        body: draftBody,
        tags: ["ai-copilot"],
      });
      notify("Saved to Templates", { kind: "success" });
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleCreateCampaign() {
    if (!draftBody.trim()) return;
    try {
      const accounts = await api.listAccounts();
      const created = await api.createCampaign({
        name: draftSubject || "Outreach Campaign",
        subject: draftSubject || "Quick question for {{company}}",
        body: draftBody,
        account_ids: accounts.filter((a) => a.status === "active").map((a) => a.id),
        daily_limit: 50,
      });
      notify("Campaign created from draft", { kind: "success" });
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleGenerateLines() {
    if (!copilotConfigured || !selectedLeadIds.length) return;
    setGeneratingLines(true);
    try {
      const r = await api.generateAiLines(selectedLeadIds.slice(0, 15), overwrite);
      notify(`Wrote ${r.written} personalized opening line(s)`, {
        description: r.skipped > 0 ? `${r.skipped} skipped` : undefined,
        kind: "success",
      });
      await loadAll();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setGeneratingLines(false);
    }
  }

  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(""), 1500);
  }

  const warnings = draftBody ? inboxWarnings(draftSubject, draftBody) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Optional Writing Studio"
        title="AI Copilot"
        description="Write high-deliverability email copy using your company context and batch-personalize {{ai_line}} opening sentences."
        actions={
          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              onClick={() => setTab("writer")}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                tab === "writer" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              Copywriter &amp; Subject Lab
            </button>
            <button
              type="button"
              onClick={() => setTab("lines")}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                tab === "lines" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              Batch AI Icebreakers
            </button>
          </div>
        }
      />

      {copilotConfigured === false && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-5 py-4 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-signal shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              AI Copilot is set aside for now
            </p>
            <p className="leading-relaxed">
              Campaign sending, Gmail/SMTP connections, reply syncing, and templates work fully without an AI key. Whenever you are ready to enable AI copywriting, add <code className="font-mono text-foreground">GEMINI_API_KEY</code> in your environment secrets.
            </p>
          </div>
        </div>
      )}

      {tab === "writer" ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <form onSubmit={handleGenerateCopy} className="lg:col-span-5 rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Campaign Brief</h2>
            <div>
              <label className="block text-xs font-medium mb-1.5">Format</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "email", label: "First Email" },
                    { id: "follow_up", label: "Follow-up" },
                    { id: "reply", label: "Inbox Reply" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKind(opt.id)}
                    className={`rounded-md border py-2 text-xs font-medium ${
                      kind === opt.id
                        ? "border-signal bg-signal-soft text-signal"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Tone</label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="warm, concise, peer-to-peer"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                What are you pitching and to whom?
              </label>
              <textarea
                rows={6}
                required
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Describe your offer, target role, and goal..."
                className="w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={!copilotConfigured || generatingCopy || brief.trim().length < 5}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-signal px-4 py-2.5 text-xs font-medium text-signal-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {!copilotConfigured
                  ? "Paused until GEMINI_API_KEY is added"
                  : generatingCopy
                    ? "Writing draft..."
                    : "Generate draft & subject ideas"}
              </span>
            </button>
          </form>

          <div className="lg:col-span-7 rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <h2 className="text-base font-semibold text-foreground">Draft Composer</h2>
              {draftBody && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    <span>Save template</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCampaign}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Use in campaign</span>
                  </button>
                </div>
              )}
            </div>

            {kind === "email" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">Primary Subject</label>
                  {draftSubject && (
                    <button
                      type="button"
                      onClick={() => copyText("subj", draftSubject)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {copiedField === "subj" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Email Body</label>
                {draftBody && (
                  <button
                    type="button"
                    onClick={() => copyText("body", draftBody)}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {copiedField === "body" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                )}
              </div>
              <textarea
                rows={8}
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Write or paste your email copy here to run a live deliverability audit and save as a template or campaign..."
                className="w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed"
              />
            </div>

            {subjectIdeas.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-foreground">Alternative subject lines (click to swap)</div>
                <div className="flex flex-wrap gap-1.5">
                  {subjectIdeas.map((idea, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDraftSubject(idea)}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-signal transition-colors text-left"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {draftBody && (
              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                {warnings.length === 0 ? (
                  <span className="text-success font-medium">Deliverability audit: Clean (zero spam triggers)</span>
                ) : (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Batch Personalization ({`{{ai_line}}`})
              </h2>
              <p className="text-xs text-muted-foreground">
                Select up to 15 contacts per batch to generate tailored 1-sentence opening lines using role, company, and industry.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                <span>Overwrite existing</span>
              </label>
              <button
                type="button"
                disabled={!copilotConfigured || generatingLines || selectedLeadIds.length === 0}
                onClick={handleGenerateLines}
                className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  {!copilotConfigured
                    ? "Paused (no API key)"
                    : generatingLines
                      ? "Generating..."
                      : `Generate for ${Math.min(15, selectedLeadIds.length)} lead(s)`}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2.5 pr-3 w-8" />
                  <th className="py-2.5 pr-4 font-medium">Contact</th>
                  <th className="py-2.5 pr-4 font-medium">Company &amp; Role</th>
                  <th className="py-2.5 pr-4 font-medium">Current {`{{ai_line}}`}</th>
                  <th className="py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                      No contacts added yet. Add or import leads on the Contacts &amp; Leads page.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => {
                    const checked = selectedLeadIds.includes(lead.id);
                    return (
                      <tr key={lead.id} className="hover:bg-muted/30">
                        <td className="py-3 pr-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedLeadIds((prev) =>
                                checked
                                  ? prev.filter((x) => x !== lead.id)
                                  : prev.length < 15
                                    ? [...prev, lead.id]
                                    : prev,
                              )
                            }
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">
                            {lead.first_name} {lead.last_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{lead.email}</div>
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          <div className="font-medium">{lead.company || "—"}</div>
                          <div className="text-muted-foreground">{lead.designation || "—"}</div>
                        </td>
                        <td className="py-3 pr-4 text-xs max-w-md">
                          {lead.ai_line ? (
                            <span className="text-foreground">{lead.ai_line}</span>
                          ) : (
                            <span className="text-muted-foreground">Empty</span>
                          )}
                        </td>
                        <td className="py-3">
                          <StatusTag value={lead.ai_line ? "valid" : "unchecked"} label={lead.ai_line ? "Ready" : "Empty"} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
