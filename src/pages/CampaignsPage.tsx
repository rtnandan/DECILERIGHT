import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pause, Play, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { Campaign, Lead, SendingAccount } from "../lib/types";
import { PageHeader, StatusTag, formatShortDate } from "../components/app/SharedUi";
import { useToast } from "../components/ui/ToastProvider";

type CampaignRow = Campaign & {
  enrolled_count: number;
  active_count: number;
  replied_count: number;
  completed_count: number;
};

export function CampaignsPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [accounts, setAccounts] = useState<SendingAccount[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "paused" | "draft">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Creation wizard state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Quick question about {{company}}");
  const [body, setBody] = useState(
    "Hi {{first_name|there}},\n\n{{ai_line|Loved seeing what your team has been shipping this quarter.}}\n\nWorth a brief chat next week?",
  );
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [enrollTag, setEnrollTag] = useState<string>("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [c, a, l] = await Promise.all([api.listCampaigns(), api.listAccounts(), api.listLeads()]);
      setCampaigns(c);
      setAccounts(a);
      setLeads(l);
      if (selectedAccounts.length === 0 && a.length > 0) {
        setSelectedAccounts(a.filter((x) => x.status === "active").map((x) => x.id));
      }
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

  const filtered = campaigns.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (query.trim() && !c.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  async function toggleStatus(c: CampaignRow) {
    const next = c.status === "running" ? "paused" : "running";
    try {
      await api.updateCampaign(c.id, { status: next });
      notify(`Campaign "${c.name}" is now ${next}`, { kind: "success" });
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function removeCampaign(c: CampaignRow) {
    try {
      await api.deleteCampaign(c.id);
      notify(`Deleted "${c.name}"`, { kind: "info" });
      await load();
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const leadIds = enrollTag
        ? leads.filter((l) => l.tags.includes(enrollTag) && l.email_check !== "invalid").map((l) => l.id)
        : [];
      const created = await api.createCampaign({
        name: name.trim(),
        subject,
        body,
        account_ids: selectedAccounts,
        daily_limit: dailyLimit,
        lead_ids: leadIds,
      });
      notify("Campaign created", { kind: "success" });
      setWizardOpen(false);
      setName("");
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      notify((err as Error).message, { kind: "error" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sequences"
        title="Campaigns"
        description="Multi-step cold outreach sequences with automatic reply, bounce, and opt-out stopping."
        actions={
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New campaign</span>
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md bg-muted p-1">
          {(["all", "running", "paused", "draft"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                statusFilter === tab
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns..."
            className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-5 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Steps</th>
              <th className="px-4 py-3 font-medium text-right">Enrolled</th>
              <th className="px-4 py-3 font-medium text-right">Replied</th>
              <th className="px-4 py-3 font-medium text-right">Daily Cap</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-xs text-muted-foreground">
                  Loading campaigns...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-xs text-muted-foreground">
                  No campaigns match the current filter.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/campaigns/${c.id}`}
                      className="font-medium text-foreground hover:text-signal transition-colors"
                    >
                      {c.name}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate max-w-md">
                      {c.subject}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusTag value={c.status} />
                  </td>
                  <td className="tabular px-4 py-3.5 text-right text-xs text-foreground">
                    {c.follow_ups.length + 1}
                  </td>
                  <td className="tabular px-4 py-3.5 text-right text-xs text-foreground">
                    {c.enrolled_count}
                  </td>
                  <td className="tabular px-4 py-3.5 text-right text-xs text-success">
                    {c.replied_count}
                  </td>
                  <td className="tabular px-4 py-3.5 text-right text-xs text-muted-foreground">
                    {c.sent_today}/{c.daily_limit}
                  </td>
                  <td className="tabular px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {formatShortDate(c.updated_at)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleStatus(c)}
                        className="rounded border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        title={c.status === "running" ? "Pause" : "Launch"}
                      >
                        {c.status === "running" ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCampaign(c)}
                        className="rounded border border-border bg-background p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete campaign"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Creation Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">Create Campaign</h2>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Campaign name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Series A CTOs — Product Editorial"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Daily send cap</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value) || 50)}
                    className="tabular h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Auto-enroll leads by tag (optional)
                  </label>
                  <select
                    value={enrollTag}
                    onChange={(e) => setEnrollTag(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">None (enroll later)</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        Tag: {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Sending mailboxes
                </label>
                <div className="flex flex-wrap gap-2">
                  {accounts.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No mailboxes connected yet —{" "}
                      <Link to="/accounts" className="text-signal font-medium hover:underline">
                        connect one in Email Accounts
                      </Link>{" "}
                      before launching.
                    </span>
                  ) : (
                    accounts.map((acc) => {
                      const checked = selectedAccounts.includes(acc.id);
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() =>
                            setSelectedAccounts((prev) =>
                              checked ? prev.filter((id) => id !== acc.id) : [...prev, acc.id],
                            )
                          }
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            checked
                              ? "border-signal bg-signal-soft text-signal"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {acc.email}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Initial subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Initial body</label>
                <textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  className="rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-signal px-4 py-2 text-xs font-medium text-signal-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create & open editor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
