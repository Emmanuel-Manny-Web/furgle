import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, Briefcase, Users,
  ArrowDownToLine, ArrowUpFromLine,
  Ticket, History as HistoryIcon, UserCircle,
  LogOut, MoreHorizontal, Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { formatNaira } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";
import InAppAnnouncementPopup from "@/components/InAppAnnouncementPopup";

const primaryItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/invest", icon: TrendingUp, label: "Invest" },
  { to: "/my-packages", icon: Briefcase, label: "Packages" },
  { to: "/team", icon: Users, label: "Team" },
];

export const moreItems = [
  { to: "/deposit", icon: ArrowDownToLine, label: "Deposit" },
  { to: "/withdraw", icon: ArrowUpFromLine, label: "Withdraw" },
  { to: "/coupons", icon: Ticket, label: "Coupons" },
  { to: "/history", icon: HistoryIcon, label: "History" },
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

const sidebarItems = [...primaryItems, ...moreItems];

export default function UserLayout({ children }) {
  const { user, logout } = useAuth();
  const { loaded: settingsReady } = useSettings();
  const navigate = useNavigate();

  return (
    <div className="user-theme min-h-screen bg-[color:var(--app-bg)] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-[color:var(--app-bg)] border-r border-[color:var(--border-default)] sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-[color:var(--border-default)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display font-bold text-2xl tracking-tight text-[color:var(--brand)] leading-none">
              Natura<span className="text-[color:var(--accent-main)]">lis</span>
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] font-bold">Wallet balance</div>
            <div className="metric-num text-2xl text-[color:var(--brand)] leading-tight mt-0.5" data-testid="sidebar-balance">{formatNaira(user?.wallet_balance)}</div>
          </div>
          <ThemeToggle />
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {sidebarItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`nav-${it.to.replace("/", "")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-[3px] ${
                  isActive
                    ? "border-[color:var(--accent-main)] bg-[color:var(--surface-alt)] text-[color:var(--brand)]"
                    : "border-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"
                }`
              }
            >
              <it.icon className="w-4 h-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-[color:var(--border-default)]">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[color:var(--error)] hover:bg-[color:var(--error-soft)]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-[color:var(--surface)]/95 backdrop-blur border-b border-[color:var(--border-default)] px-4 h-16 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-display font-bold text-xl text-[color:var(--brand)] leading-none">
            Natura<span className="text-[color:var(--accent-main)]">lis</span>
          </div>
          <div className="flex items-center gap-1 mt-1" data-testid="topbar-balance">
            <Wallet className="w-3 h-3 text-[color:var(--text-tertiary)]" />
            <span className="font-mono text-xs font-medium text-[color:var(--text-secondary)]">{formatNaira(user?.wallet_balance)}</span>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-x-hidden pt-16 lg:pt-0 pb-28 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
          {settingsReady ? children : (
            <div className="flex items-center justify-center py-32" data-testid="settings-loading">
              <div className="w-8 h-8 rounded-full border-2 border-[color:var(--border-default)] border-t-[color:var(--brand)] animate-spin" />
            </div>
          )}
        </div>
      </main>

      {/* MOBILE BOTTOM NAV — floating glass pill with raised active icon */}
      <nav
        className="lg:hidden fixed bottom-4 left-4 right-4 z-40"
        data-testid="mobile-bottom-nav"
        aria-label="Primary"
      >
        <div className="glass-pill rounded-full px-1.5 py-2 flex items-stretch justify-between">
          {primaryItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`bottom-nav-${it.label.toLowerCase()}`}
              className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? "-mt-7 w-12 h-12 rounded-full bg-[color:var(--brand)] text-[color:var(--brand-ink)] shadow-lg shadow-[color:var(--brand)]/30 ring-4 ring-[color:var(--surface)]"
                        : "w-9 h-9 text-[color:var(--text-tertiary)]"
                    }`}
                  >
                    <it.icon className="w-5 h-5" />
                  </span>
                  <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-[color:var(--brand)]" : "text-[color:var(--text-tertiary)]"}`}>{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/more"
            data-testid="bottom-nav-more"
            className="flex-1 flex flex-col items-center justify-end gap-1"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex items-center justify-center transition-all duration-300 ${
                    isActive
                      ? "-mt-7 w-12 h-12 rounded-full bg-[color:var(--brand)] text-[color:var(--brand-ink)] shadow-lg shadow-[color:var(--brand)]/30 ring-4 ring-[color:var(--surface)]"
                      : "w-9 h-9 text-[color:var(--text-tertiary)]"
                  }`}
                >
                  <MoreHorizontal className="w-5 h-5" />
                </span>
                <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-[color:var(--brand)]" : "text-[color:var(--text-tertiary)]"}`}>More</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>

      <InAppAnnouncementPopup />
    </div>
  );
}
