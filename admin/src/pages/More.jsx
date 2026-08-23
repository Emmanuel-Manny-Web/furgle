import React from "react";
import { Link, useNavigate } from "react-router-dom";
import UserLayout from "@/components/UserLayout";
import { moreItems } from "@/components/UserLayout";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { formatNaira } from "@/lib/format";
import { LogOut, ChevronRight, Send, MessageCircle } from "lucide-react";

export default function More() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const socialItems = [
    { key: "telegram_url",         label: "Telegram",         href: settings.telegram_url,         color: "#229ED9", icon: Send },
    { key: "telegram_channel_url", label: "Telegram channel", href: settings.telegram_channel_url, color: "#229ED9", icon: Send },
    { key: "telegram_group_url",   label: "Telegram group",   href: settings.telegram_group_url,   color: "#229ED9", icon: Send },
    { key: "whatsapp_channel_url", label: "WhatsApp channel", href: settings.whatsapp_channel_url, color: "#25D366", icon: MessageCircle },
    { key: "whatsapp_group_url",   label: "WhatsApp group",   href: settings.whatsapp_group_url,   color: "#25D366", icon: MessageCircle },
  ].filter((s) => s.href);

  return (
    <UserLayout>
      <div className="animate-fade-up" data-testid="more-page">
        {/* Header */}
        <div className="font-body text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--text-tertiary)]">Menu</div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold mt-1 text-[color:var(--text-primary)]">{user?.name || "Account"}</h1>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-alt)] border border-[color:var(--border-default)] px-3 py-1.5">
          <span className="font-body text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-tertiary)]">Balance</span>
          <span className="font-mono font-semibold text-sm text-[color:var(--text-primary)]" data-testid="more-balance">{formatNaira(user?.wallet_balance)}</span>
        </div>

        {/* Quick links */}
        <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mt-7 mb-3">Quick links</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {moreItems.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              data-testid={`more-${it.label.toLowerCase()}`}
              className="card-soft p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform"
            >
              <div className="w-11 h-11 rounded-2xl bg-[color:var(--brand-soft)] text-[color:var(--brand)] flex items-center justify-center shrink-0">
                <it.icon className="w-5 h-5" />
              </div>
              <span className="font-display font-semibold text-[color:var(--text-primary)] flex-1">{it.label}</span>
              <ChevronRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
            </Link>
          ))}
        </div>

        {/* Community */}
        {socialItems.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-3" data-testid="more-socials">Join our community</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {socialItems.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.key}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`more-social-${s.key}`}
                    className="card-soft p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform"
                  >
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: s.color }}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-sm text-[color:var(--text-primary)] flex-1">{s.label}</span>
                    <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Open</span>
                  </a>
                );
              })}
            </div>
          </>
        )}

        {/* Sign out */}
        <button
          onClick={() => { logout(); navigate("/login"); }}
          data-testid="more-logout"
          className="mt-8 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[color:var(--error-soft)] text-[color:var(--error)] font-semibold hover:opacity-90 transition-opacity"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </UserLayout>
  );
}
