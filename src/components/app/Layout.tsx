import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Send,
  Workflow,
  Inbox,
  Users,
  FileText,
  Sparkles,
  Mail,
  Settings,
  ShieldCheck,
  LogOut,
} from "lucide-react";

/**
 * Exact sidebar ordering requested:
 * 1. Dashboard (/dashboard)
 * 2. Campaigns (/campaigns)
 * 3. Automations (/automations)
 * 4. Unified Inbox (/inbox)
 * 5. Contacts & Leads (/leads)
 * 6. Templates (/templates)
 * 7. AI Copilot (/copilot)
 * 8. Email Accounts (/accounts)
 * 9. Settings (/settings)
 */
const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Send },
  { to: "/automations", label: "Automations", icon: Workflow },
  { to: "/inbox", label: "Unified Inbox", icon: Inbox },
  { to: "/leads", label: "Contacts & Leads", icon: Users },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/copilot", label: "AI Copilot", icon: Sparkles },
  { to: "/accounts", label: "Email Accounts", icon: Mail },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppLayout({
  userEmail,
  onLogout,
}: {
  userEmail?: string;
  onLogout?: () => void;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 z-20 flex flex-col bg-sidebar text-sidebar-foreground md:h-screen border-r border-sidebar-border">
        <div className="flex items-center justify-between px-5 py-5 border-b border-sidebar-border">
          <NavLink to="/dashboard" className="flex items-baseline gap-2 whitespace-nowrap shrink-0">
            <span className="font-display text-lg font-semibold tracking-tight text-sidebar-accent-foreground">
              DECILE
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
              Outreach
            </span>
          </NavLink>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:overflow-y-auto md:py-4">
          {NAV_ITEMS.map((item) => {
            const active =
              location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                  }`}
                />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto hidden border-t border-sidebar-border px-5 py-4 space-y-3 md:block">
          {userEmail && (
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-sidebar-border/70">
              <span className="truncate text-xs text-sidebar-foreground/85" title={userEmail}>
                {userEmail}
              </span>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0"
                  title="Sign out"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Sign out</span>
                </button>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 text-xs text-sidebar-foreground/75">
              <ShieldCheck className="h-3.5 w-3.5 text-sidebar-primary shrink-0" />
              <span>Pixel &amp; Click Tracking Off</span>
            </div>
            <p className="mt-1 text-[11px] text-sidebar-foreground/50 leading-relaxed">
              Strict primary-inbox deliverability mode active.
            </p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-5 py-7 md:px-10 md:py-9">
        <div className="mx-auto max-w-[1200px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
