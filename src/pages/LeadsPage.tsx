import React, { useEffect, useState } from "react";
import {
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { Campaign, Lead } from "../lib/types";
import { PageHeader, StatusTag } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

export function LeadsPage() {
  const { notify } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [checkFilter, setCheckFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string[]>([]);

  const [verifying, setVerifying] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [copilotConfigured, setCopilotConfigured] = useState(false);

  // Add lead modal
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newTags, setNewTags] = useState("");

  // Import CSV modal
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState(
    "email,first_name,last_name,company,designation,industry,tags\n",
  );

  // Enroll modal
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [targetCampaignId, setTargetCampaignId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [l, c, copilotRes] = await Promise.all([
        api.listLeads(),
        api.listCampaigns(),
        api.getCopilotStatus().catch(() => ({ configured: false })),
      ]);
      setLeads(l);
      setCampaigns(c);
      setCopilotConfigured(copilotRes.configured);
      if (!targetCampaignId && c[0]) setTargetCampaignId(c[0].id);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const allTags = Array.from(new Set(leads.flatMap((l) => l.tags))).sort();

  const filtered = leads.filter((l) => {
    if (tagFilter !== "all" && !l.tags.includes(tagFilter)) return false;
    if (checkFilter !== "all" && l.email_check !== checkFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${l.first_name} ${l.last_name} ${l.email} ${l.company} ${l.designation} ${l.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function toggleAll() {
    if (selected.length === filtered.length) {
      setSelected([]);
    } else {
      setSelected(filtered.map((l) => l.id));
    }
  }

  async function handleBulkVerify() {
    const ids = selected.length > 0 ? selected : filtered.slice(0, 25).map((l) => l.id);
    if (!ids.length) return;
    setVerifying(true);
    try {
      const r = await api.verifyLeads(ids);
      notify("Email verification complete", {
        description: `${r.counts.valid} valid · ${r.counts.risky} risky · ${r.counts.invalid} invalid`,
        kind: "success",
      });
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setVerifying(false);
    }
  }

  async function handleGenerateAiLines() {
    if (!copilotConfigured) {
      notify("AI Copilot is paused for now — add GEMINI_API_KEY in Secrets whenever you are ready.", {
        kind: "info",
      });
      return;
    }
    const ids = (selected.length > 0 ? selected : filtered.filter((l) => !l.ai_line).map((l) => l.id)).slice(0, 15);
    if (!ids.length) {
      notify("All visible leads already have AI lines (select specific leads to regenerate).", {
        kind: "info",
      });
      return;
    }
    setGeneratingAi(true);
    try {
      const r = await api.generateAiLines(ids, selected.length > 0);
      notify(`Generated ${r.written} AI opening line(s)`, {
        description: r.skipped > 0 ? `${r.skipped} skipped` : undefined,
        kind: "success",
      });
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createLead({
        email: newEmail,
        first_name: newFirst,
        last_name: newLast,
        company: newCompany,
        designation: newRole,
        industry: newIndustry,
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      notify("Contact added", { kind: "success" });
      setAddOpen(false);
      setNewEmail("");
      setNewFirst("");
      setNewLast("");
      setNewCompany("");
      setNewRole("");
      setNewIndustry("");
      setNewTags("");
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleImportCsv(e: React.FormEvent) {
    e.preventDefault();
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      notify("Provide a header row and at least one contact row.", { kind: "error" });
      return;
    }
    const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = parseCsvLine(line);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        if (h === "tags") {
          obj.tags = (cols[idx] ?? "")
            .split(/[;|]/)
            .map((t) => t.trim())
            .filter(Boolean);
        } else {
          obj[h] = cols[idx] ?? "";
        }
      });
      return obj;
    });
    try {
      const r = await api.importLeads(rows);
      notify(`Imported ${r.imported} contact(s)`, {
        description: r.skipped > 0 ? `${r.skipped} duplicate or invalid skipped` : undefined,
        kind: "success",
      });
      setImportOpen(false);
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleEnrollSelected() {
    if (!targetCampaignId || !selected.length) return;
    try {
      const r = await api.enrollLeads(targetCampaignId, selected);
      notify(`Enrolled ${r.added} contact(s)`, { kind: "success" });
      setEnrollOpen(false);
      setSelected([]);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function removeLead(id: string) {
    try {
      await api.deleteLead(id);
      setSelected((prev) => prev.filter((x) => x !== id));
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="Contacts & Leads"
        description="Filter by tags, run MX email verification, and batch-generate personalized {{ai_line}} icebreakers."
        actions={
          <>
            <button
              type="button"
              disabled={verifying}
              onClick={handleBulkVerify}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>{verifying ? "Verifying..." : `Verify emails (${selected.length || "up to 25"})`}</span>
            </button>
            <button
              type="button"
              disabled={generatingAi}
              onClick={handleGenerateAiLines}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-signal" />
              <span>{generatingAi ? "Generating..." : `Generate AI Lines (${selected.length || "batch"})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add contact</span>
            </button>
          </>
        }
      />

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, company..."
              className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-xs focus:outline-none"
          >
            <option value="all">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                Tag: {t}
              </option>
            ))}
          </select>

          <select
            value={checkFilter}
            onChange={(e) => setCheckFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-xs focus:outline-none"
          >
            <option value="all">All verification states</option>
            <option value="valid">Valid</option>
            <option value="risky">Risky</option>
            <option value="invalid">Invalid</option>
            <option value="unchecked">Unchecked</option>
          </select>
        </div>

        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setEnrollOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Enroll {selected.length} selected in campaign</span>
          </button>
        )}
      </div>

      {/* Contacts Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.length === filtered.length}
                  onChange={toggleAll}
                  aria-label="Select all contacts"
                />
              </th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Company &amp; Role</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Email Check</th>
              <th className="px-4 py-3 font-medium">AI Opening Line</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-xs text-muted-foreground">
                  Loading contacts...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-xs text-muted-foreground">
                  No contacts match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((lead) => {
                const isChecked = selected.includes(lead.id);
                return (
                  <tr key={lead.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setSelected((prev) =>
                            isChecked ? prev.filter((x) => x !== lead.id) : [...prev, lead.id],
                          )
                        }
                        aria-label={`Select ${lead.email}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {lead.first_name} {lead.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium text-foreground">{lead.company || "—"}</div>
                      <div className="text-muted-foreground">{lead.designation || lead.industry || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {lead.tags.length ? lead.tags.join(" · ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusTag value={lead.email_check} />
                      {lead.email_check_reason && (
                        <div className="mt-1 text-[11px] text-muted-foreground max-w-[180px] truncate">
                          {lead.email_check_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground max-w-xs">
                      {lead.ai_line ? (
                        <span className="line-clamp-2 leading-relaxed">{lead.ai_line}</span>
                      ) : (
                        <span className="text-muted-foreground">Not generated</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusTag value={lead.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeLead(lead.id)}
                        className="rounded border border-border bg-background p-1.5 text-muted-foreground hover:text-destructive"
                        aria-label="Delete contact"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Lead Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Add Contact</h3>
              <button type="button" onClick={() => setAddOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateLead} className="space-y-3">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email *"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newFirst}
                  onChange={(e) => setNewFirst(e.target.value)}
                  placeholder="First name"
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                />
                <input
                  type="text"
                  value={newLast}
                  onChange={(e) => setNewLast(e.target.value)}
                  placeholder="Last name"
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                />
              </div>
              <input
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Company"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="Role / Designation"
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                />
                <input
                  type="text"
                  value={newIndustry}
                  onChange={(e) => setNewIndustry(e.target.value)}
                  placeholder="Industry"
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                />
              </div>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Tags (comma separated, e.g. saas, series-a)"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-signal px-4 py-1.5 text-xs font-medium text-signal-foreground"
                >
                  Save contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Import Contacts via CSV</h3>
              <button type="button" onClick={() => setImportOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleImportCsv} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Upload a <code>.csv</code> file or paste rows with headers (<code>email,first_name,last_name,company,designation,industry,tags</code>).
                </p>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose .csv file</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setCsvText(String(reader.result || ""));
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>
              </div>
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-signal px-4 py-1.5 text-xs font-medium text-signal-foreground"
                >
                  Import rows
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll in Campaign Modal */}
      {enrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Enroll {selected.length} Contact(s)</h3>
              <button type="button" onClick={() => setEnrollOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <select
              value={targetCampaignId}
              onChange={(e) => setTargetCampaignId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnrollOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEnrollSelected}
                className="rounded-md bg-signal px-4 py-1.5 text-xs font-medium text-signal-foreground"
              >
                Enroll
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
