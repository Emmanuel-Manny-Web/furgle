import React, { useEffect, useMemo, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { Copy, Share2, Users, UserPlus, Coins, Search, Network } from "lucide-react";
import { toast } from "sonner";

function KpiTile({ icon: Icon, label, value, tone, testid }) {
  const tones = {
    brand: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    accent: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    gold: "bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
    success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  };
  return (
    <div className="card-soft p-4" data-testid={testid}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-display font-bold text-xl sm:text-2xl text-[color:var(--text-primary)] leading-none mt-3">{value}</div>
      <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">{label}</div>
    </div>
  );
}

function MemberRow({ m }) {
  const initial = (m.name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-[color:var(--border-light)] hover:bg-[color:var(--surface-alt)] transition-colors" data-testid={`team-member-row-${m.id}`}>
      <div className="w-9 h-9 rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)] flex items-center justify-center font-display font-bold shrink-0">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[color:var(--text-primary)] truncate">{m.name}</span>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${m.gen === 1 ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--brand-soft)] text-[color:var(--brand)]"}`}>
            G{m.gen}
          </span>
        </div>
        <div className="font-mono text-xs text-[color:var(--text-tertiary)] truncate">{m.phone}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold text-sm text-[color:var(--accent-main)]">{formatNaira(m.total_invested || 0)}</div>
        <div className="text-[11px] text-[color:var(--text-tertiary)]">{formatDate(m.joined_at)}</div>
      </div>
    </div>
  );
}

export default function Referrals() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [genFilter, setGenFilter] = useState("all"); // all | 1 | 2

  useEffect(() => {
    api.get("/referrals")
      .then(({ data }) => setInfo(data))
      .catch(() => toast.error("Could not load your team."))
      .finally(() => setLoading(false));
  }, []);

  const link = info ? `${window.location.origin}/register?ref=${info.referral_code}` : "";
  const copy = (text, msg) => { navigator.clipboard.writeText(text); toast.success(msg); };

  const members = useMemo(() => {
    if (!info) return [];
    const g1 = (info.gen1?.users || []).map((u) => ({ ...u, gen: 1 }));
    const g2 = (info.gen2?.users || []).map((u) => ({ ...u, gen: 2 }));
    return [...g1, ...g2];
  }, [info]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members
      .filter((m) => genFilter === "all" || m.gen === Number(genFilter))
      .filter((m) => !needle || (m.name || "").toLowerCase().includes(needle) || (m.phone || "").includes(needle))
      .sort((a, b) => (b.total_invested || 0) - (a.total_invested || 0));
  }, [members, q, genFilter]);

  const gen1Count = info?.gen1?.count || 0;
  const gen2Count = info?.gen2?.count || 0;

  return (
    <UserLayout>
      <div className="text-label">Earn together</div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">My Team</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Invite friends and earn across 2 generations of their daily profits.</p>

      {/* Share banner */}
      <div className="card-soft p-5 mt-6 hero-gradient text-white relative overflow-hidden" data-testid="referral-banner">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/85">Your referral code</div>
            <div className="metric-num text-3xl md:text-4xl font-display tracking-widest text-white mt-1.5" data-testid="referral-code">{info?.referral_code || "—"}</div>
          </div>
          <div className="flex gap-2 sm:flex-col sm:w-48">
            <button onClick={() => copy(info?.referral_code, "Code copied")} data-testid="copy-code-btn"
              className="flex-1 flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur border border-white/30 text-white rounded-full px-4 py-2.5 text-sm font-semibold">
              <Copy className="w-4 h-4" /> Copy code
            </button>
            <button onClick={() => copy(link, "Invite link copied")} data-testid="copy-link-btn"
              className="flex-1 flex items-center justify-center gap-2 bg-white text-[color:var(--brand)] hover:bg-white/90 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg shadow-black/10">
              <Share2 className="w-4 h-4" /> Invite link
            </button>
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <KpiTile icon={Network} label="Total team" value={gen1Count + gen2Count} tone="brand" testid="team-kpi-total" />
        <KpiTile icon={Users} label={`Gen 1 · ${info?.gen1?.percent ?? 10}%`} value={gen1Count} tone="success" testid="team-kpi-gen1" />
        <KpiTile icon={UserPlus} label={`Gen 2 · ${info?.gen2?.percent ?? 5}%`} value={gen2Count} tone="accent" testid="team-kpi-gen2" />
        <KpiTile icon={Coins} label="Team earnings" value={formatNaira(info?.total_referral_earnings || 0, { compact: true })} tone="gold" testid="team-kpi-earnings" />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members by name or phone"
            data-testid="team-search"
            className="w-full input-base pl-9"
          />
        </div>
        <div className="flex gap-2">
          {[
            { v: "all", label: "All" },
            { v: "1", label: "Gen 1" },
            { v: "2", label: "Gen 2" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setGenFilter(f.v)}
              data-testid={`team-filter-${f.v}`}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                genFilter === f.v
                  ? "bg-[color:var(--brand)] text-[color:var(--brand-ink)]"
                  : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-2)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Member table */}
      <div className="card-soft mt-4 overflow-hidden" data-testid="team-table">
        <div className="flex items-center justify-between px-4 py-3 bg-[color:var(--surface-alt)]">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-[color:var(--text-tertiary)]">Member</div>
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-[color:var(--text-tertiary)]">Invested · Joined</div>
        </div>

        {loading ? (
          <div data-testid="team-loading">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-t border-[color:var(--border-light)]">
                <div className="w-9 h-9 rounded-full bg-[color:var(--surface-2)] animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-[color:var(--surface-2)] animate-pulse" />
                  <div className="h-2.5 w-1/4 rounded bg-[color:var(--surface-2)] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center" data-testid="team-empty">
            <div className="w-12 h-12 rounded-2xl bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-sm text-[color:var(--text-secondary)] mt-3">
              {members.length === 0 ? "No referrals yet. Share your code to start building your team." : "No members match your search."}
            </div>
          </div>
        ) : (
          filtered.map((m) => <MemberRow key={`${m.gen}-${m.id}`} m={m} />)
        )}
      </div>
    </UserLayout>
  );
}
