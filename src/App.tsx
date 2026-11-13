import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api } from "./lib/api";
import { ToastProvider } from "./components/ui/ToastProvider";
import { AppLayout } from "./components/app/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
import { AutomationsPage } from "./pages/AutomationsPage";
import { InboxPage } from "./pages/InboxPage";
import { LeadsPage } from "./pages/LeadsPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { CopilotPage } from "./pages/CopilotPage";
import { AccountsPage } from "./pages/AccountsPage";
import { SettingsPage } from "./pages/SettingsPage";

function WorkspaceLoginGate({
  configured,
  onSuccess,
}: {
  configured: boolean;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = configured
        ? await api.loginWorkspace({ email, password })
        : await api.setupWorkspaceAuth({ email, password });
      onSuccess(res.email);
    } catch (err) {
      setError((err as Error).message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
              DECILE
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Outreach
            </span>
          </div>
          <h1 className="font-display text-xl font-semibold text-foreground pt-2">
            {configured ? "Sign in to workspace" : "Create workspace login"}
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {configured
              ? "Enter your workspace email and password to access campaigns, mailboxes, and Unified Inbox."
              : "Set an email and password once to protect this workspace before publishing."}
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-danger-soft px-3.5 py-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Workspace email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={configured ? "Enter workspace password" : "Minimum 4 characters"}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-signal px-4 py-2.5 text-sm font-medium text-signal-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            <span>
              {busy
                ? "Please wait..."
                : configured
                  ? "Enter workspace"
                  : "Set password & enter"}
            </span>
          </button>
        </form>

        <div className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" />
          <span>Primary-inbox delivery · Encrypted mailbox credentials</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  async function checkSession() {
    try {
      const res = await api.getAuthSession();
      setConfigured(res.configured);
      setAuthenticated(res.authenticated);
      setUserEmail(res.email);
    } catch {
      setAuthenticated(false);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    checkSession();
    const onExpired = () => {
      setAuthenticated(false);
      setUserEmail("");
    };
    window.addEventListener("decile-auth-expired", onExpired);
    return () => window.removeEventListener("decile-auth-expired", onExpired);
  }, []);

  async function handleLogout() {
    await api.logoutWorkspace();
    setAuthenticated(false);
    setUserEmail("");
    setConfigured(true);
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <ToastProvider>
        <WorkspaceLoginGate
          configured={configured}
          onSuccess={(email) => {
            setConfigured(true);
            setAuthenticated(true);
            setUserEmail(email);
          }}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout userEmail={userEmail} onLogout={handleLogout} />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/automations" element={<AutomationsPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/copilot" element={<CopilotPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
