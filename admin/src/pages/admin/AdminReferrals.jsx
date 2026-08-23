import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import Pagination from "@/components/admin/Pagination";
import { Link } from "react-router-dom";
import { readCache, writeCache } from "@/hooks/useCachedData";
import {
  Share2, Search, Users, Trophy, Coins, Clock, ArrowUpRight, Crown, TrendingUp, Wand2, AlertCircle,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";

/* ----------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------*/
function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

/* ----------------------------------------------------------------------------
 * Level badge — gradient pill with crown for L1, simple for L2
 * --------------------------------------------------------------------------*/
function LevelBadge({ level }) {
  if (level === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider text-white bg-gradient-to-r from-[#E5097F] to-[#FF5BAA] shadow-sm">
        <Crown className="w-3 h-3" /> L1
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]">
      L{level}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Stat card — distinctive arc-glow treatment matching the rest of the admin
 * --------------------------------------------------------------------------*/
const STAT_TONES = {
  brand:   { pill: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",       glow: "from-[#E5097F]/20" },
  accent:  { pill: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]", glow: "from-[#5B5BD6]/20" },
  success: { pill: "bg-[color:var(--success-soft)] text-[color:var(--success)]",   glow: "from-[#10B981]/20" },
  warn:    { pill: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",      glow: "from-[#F59E0B]/20" },
};

function StatCard({ tone = "brand", icon: Icon, label, value, sub, testid }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className="card-soft p-5 relative overflow-hidden group" data-testid={testid}>
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl group-hover:scale-110 transition-transform duration-500`} />
      <div className="relative">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${t.pill}`}>
          <Icon className="w-3 h-3" /> {label}
        </div>
        <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums leading-none">{value}</div>
        {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-2">{sub}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Top earners side panel — leaderboard-style, distinctive vs reference design
 * --------------------------------------------------------------------------*/
function TopEarners({ rows }) {
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3, 6);
  if (rows.length === 0) {
    return (
      <div className="card-soft p-5 h-full">
        <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] flex items-center gap-1.5">
          <Trophy className="w-3 h-3" /> Top earners
        </div>
        <div className="text-xs text-[color:var(--text-tertiary)] mt-3">No referral bonuses paid yet.</div>
      </div>
    );
  }
  const medalTones = ["text-[#FFB300]", "text-[#C0C0C0]", "text-[#CD7F32]"];
  return (
    <div className="card-soft p-5 h-full relative overflow-hidden" data-testid="top-earners-card">
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br from-[#FFB300]/20 to-transparent blur-2xl" />
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] flex items-center gap-1.5">
          <Trophy className="w-3 h-3" /> Top earners
        </div>
        <ul className="mt-3 space-y-2">
          {podium.map((u, i) => (
            <li key={u.id} className="flex items-center gap-3 group">
              <Crown className={`w-4 h-4 ${medalTones[i]}`} />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: avatarColor(u.id) }}>
                {(u.name || "?").trim()[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <Link to={`/pentest/fuser/users/${u.id}`} className="font-semibold text-sm text-[color:var(--text-primary)] hover:text-[color:var(--brand)] truncate block">
                  {u.name || "—"}
                </Link>
                <div className="text-[10px] text-[color:var(--text-tertiary)] font-mono">{u.count} referral{u.count === 1 ? "" : "s"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display font-bold text-sm tabular-nums text-[color:var(--brand)]">{formatNaira(u.total)}</div>
              </div>
            </li>
          ))}
          {rest.length > 0 && <li className="border-t border-[color:var(--border-default)] my-1" />}
          {rest.map((u, idx) => (
            <li key={u.id} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-center text-[10px] font-bold text-[color:var(--text-tertiary)]">{idx + 4}</span>
              <Link to={`/pentest/fuser/users/${u.id}`} className="flex-1 truncate font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]">
                {u.name || "—"}
              </Link>
              <span className="font-mono tabular-nums text-[color:var(--text-tertiary)]">{formatNaira(u.total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ============================================================================
 * MAIN PAGE
 * ==========================================================================*/
export default function AdminReferrals() {
  const [items, setItems] = useState(() => readCache("/admin/referrals") ?? []);
  const [loading, setLoading] = useState(() => readCache("/admin/referrals") === undefined);
  const [level, setLevel] = useState(0); // 0 = all
  const [statusFilter, setStatusFilter] = useState("All");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [payOpen, setPayOpen] = useState(false);
  const [payPreview, setPayPreview] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const PAGE_SIZE = 20;

  const reload = () => api.get("/admin/referrals").then(({ data }) => { setItems(data || []); writeCache("/admin/referrals", data || []); });

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/referrals")
      .then(({ data }) => { if (!cancelled) { setItems(data || []); writeCache("/admin/referrals", data || []); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setPage(1); }, [level, statusFilter, q]);

  const openPayMissing = async () => {
    setPayOpen(true);
    setPayPreview(null);
    setPayBusy(true);
    try {
      const { data } = await api.post("/admin/referrals/pay-missing-bonuses", { dry_run: true });
      setPayPreview(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Preview failed");
      setPayOpen(false);
    } finally {
      setPayBusy(false);
    }
  };

  const confirmPayMissing = async () => {
    setPayBusy(true);
    try {
      const { data } = await api.post("/admin/referrals/pay-missing-bonuses", { dry_run: false });
      if (data.credited_transactions > 0) {
        toast.success(`Paid ${formatNaira(data.total_amount)} across ${data.credited_transactions} record(s) to ${data.credited_users} user(s)`);
      } else {
        toast.info("No missing bonuses to pay — everything is up to date");
      }
      setPayOpen(false);
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    } finally {
      setPayBusy(false);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    let total = 0, earned = 0, pending = 0, bonusPaid = 0, invested = 0;
    for (const r of items) {
      total += 1;
      bonusPaid += Number(r.bonus_paid || 0);
      invested += Number(r.referred_invested || 0);
      if (r.status === "earned") earned += 1;
      else pending += 1;
    }
    return { total, earned, pending, bonusPaid, invested };
  }, [items]);

  // Leaderboard — group by referrer
  const topEarners = useMemo(() => {
    const map = new Map();
    for (const r of items) {
      if (!map.has(r.referrer_id)) {
        map.set(r.referrer_id, {
          id: r.referrer_id,
          name: r.referrer_name,
          phone: r.referrer_phone,
          total: 0,
          count: 0,
        });
      }
      const entry = map.get(r.referrer_id);
      entry.total += Number(r.bonus_paid || 0);
      entry.count += 1;
    }
    return Array.from(map.values())
      .filter((u) => u.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [items]);

  // Filter + search
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((r) => {
      if (level !== 0 && r.generation !== level) return false;
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (!qq) return true;
      return (
        (r.referrer_name || "").toLowerCase().includes(qq) ||
        (r.referred_name || "").toLowerCase().includes(qq) ||
        (r.referrer_phone || "").includes(qq) ||
        (r.referred_phone || "").includes(qq)
      );
    });
  }, [items, level, statusFilter, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  // Conversion rate
  const conversion = kpis.total > 0 ? (kpis.earned / kpis.total) * 100 : 0;

  return (
    <AdminLayout title="">
      {/* ===== HERO ===== */}
      <div
        className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8"
        style={{ background: "linear-gradient(120deg,#3F0825 0%,#7A0A45 38%,#C81A6E 72%,#E5097F 100%)" }}
        data-testid="referrals-hero"
      >
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-48 h-48 rounded-full bg-[#FF5BAA]/30 blur-3xl" />
        {/* Network-like connecting nodes background */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.12]" preserveAspectRatio="none" viewBox="0 0 600 200">
          <g stroke="white" strokeWidth="0.6" fill="none">
            <path d="M50,40 L160,90 L260,60 L380,120 L480,80 L560,140" />
            <path d="M30,160 L140,140 L240,170 L340,110 L460,150 L580,90" />
          </g>
          <g fill="white">
            {[[50,40],[160,90],[260,60],[380,120],[480,80],[560,140],[30,160],[140,140],[240,170],[340,110],[460,150],[580,90]].map(([x,y],i)=>(
              <circle key={i} cx={x} cy={y} r="2.5" />
            ))}
          </g>
        </svg>

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Share2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">Network · commissions · growth</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Referrals</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">
                <span className="font-bold tabular-nums">{kpis.total}</span> total referral{kpis.total === 1 ? "" : "s"} · {" "}
                <span className="font-bold tabular-nums">{kpis.earned}</span> converted · {" "}
                <span className="font-bold tabular-nums text-white">{formatNaira(kpis.bonusPaid)}</span> paid in bonuses
              </div>
            </div>
          </div>

          {/* Conversion ring inside the hero — unique signature */}
          <div className="shrink-0 inline-flex items-center gap-3 bg-white/10 backdrop-blur rounded-2xl px-4 py-3 border border-white/15">
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" stroke="white" strokeOpacity="0.2" strokeWidth="5" fill="none" />
                <circle
                  cx="28" cy="28" r="24"
                  stroke="white" strokeWidth="5" fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - conversion / 100)}
                  style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.4,0,.2,1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-display font-extrabold text-xs">{conversion.toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-white/70">Conversion</div>
              <div className="text-[11px] text-white/85 leading-tight mt-0.5">Referred users<br/>who invested</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== KPI cards + Top Earners panel ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-5">
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <StatCard tone="brand"   icon={Users}      label="Total referrals" value={kpis.total} sub={`${kpis.earned} earned · ${kpis.pending} pending`} testid="kpi-total" />
          <StatCard tone="success" icon={Coins}      label="Bonus paid"      value={formatNaira(kpis.bonusPaid)} sub="All-time commissions" testid="kpi-bonus" />
          <StatCard tone="accent"  icon={TrendingUp} label="Referred capital" value={formatNaira(kpis.invested)} sub="Invested by referred users" testid="kpi-invested" />
          <StatCard tone="warn"    icon={Clock}      label="Pending"         value={kpis.pending} sub="Not yet invested" testid="kpi-pending" />
        </div>
        <TopEarners rows={topEarners} />
      </div>

      {/* ===== Filter toolbar ===== */}
      <div className="card-soft p-3 mt-5 flex items-center gap-3 flex-wrap" data-testid="referrals-toolbar">
        <div className="inline-flex p-1 rounded-lg bg-[color:var(--surface-alt)]" role="tablist">
          {[
            { v: 0, label: "All levels" },
            { v: 1, label: "L1 · direct" },
            { v: 2, label: "L2" },
          ].map((tab) => (
            <button
              key={tab.v}
              onClick={() => setLevel(tab.v)}
              data-testid={`level-tab-${tab.v}`}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                level === tab.v
                  ? "bg-[color:var(--brand)] text-white shadow"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="status-filter"
          className="input-base !py-2 !w-[140px] text-sm font-semibold"
        >
          <option value="All">All status</option>
          <option value="earned">Earned</option>
          <option value="pending">Pending</option>
        </select>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or phone…"
            data-testid="referrals-search"
            className="w-full pl-10 input-base"
          />
        </div>
        <button
          onClick={openPayMissing}
          data-testid="pay-missing-bonuses-btn"
          title="Scan referrals where the referred user invested but the commission was never recorded, and credit the delta retroactively."
          className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white hover:opacity-90 transition-opacity"
        >
          <Wand2 className="w-4 h-4" /> Pay missing bonuses
        </button>
      </div>

      {/* ===== Table ===== */}
      <div className="card-soft mt-3 overflow-hidden" data-testid="referrals-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="text-left p-4 w-16">Level</th>
                <th className="text-left p-4">Referrer</th>
                <th className="text-center p-4 w-8"></th>
                <th className="text-left p-4">Referred user</th>
                <th className="text-right p-4">Bonus</th>
                <th className="text-right p-4 hidden lg:table-cell">Invested</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4 hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="p-12 text-center text-[color:var(--text-tertiary)]">Loading…</td></tr>
              )}
              {!loading && pageItems.length === 0 && (
                <tr><td colSpan={8} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {q || level !== 0 || statusFilter !== "All" ? "No referrals match this filter." : "No referrals yet."}
                </td></tr>
              )}
              {!loading && pageItems.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors"
                  data-testid={`referral-row-${r.id}`}
                >
                  {/* Level */}
                  <td className="p-4"><LevelBadge level={r.generation} /></td>
                  {/* Referrer */}
                  <td className="p-4 max-w-[200px]">
                    <Link to={`/pentest/fuser/users/${r.referrer_id}`} className="flex items-center gap-2.5 group min-w-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: avatarColor(r.referrer_id) }}>
                        {(r.referrer_name || "?").trim()[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-[color:var(--text-primary)] group-hover:text-[color:var(--brand)] truncate">{r.referrer_name || "—"}</div>
                        <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate">{r.referrer_phone}</div>
                      </div>
                    </Link>
                  </td>
                  {/* Arrow */}
                  <td className="p-1 text-center text-[color:var(--text-tertiary)]">
                    <ArrowUpRight className="w-4 h-4 inline" />
                  </td>
                  {/* Referred */}
                  <td className="p-4 max-w-[200px]">
                    <Link to={`/pentest/fuser/users/${r.referred_id}`} className="flex items-center gap-2.5 group min-w-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: avatarColor(r.referred_id) }}>
                        {(r.referred_name || "?").trim()[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-[color:var(--accent-main)] group-hover:underline truncate">{r.referred_name || "—"}</div>
                        <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate">{r.referred_phone}</div>
                      </div>
                    </Link>
                  </td>
                  {/* Bonus */}
                  <td className="p-4 text-right whitespace-nowrap">
                    {r.bonus_paid > 0 ? (
                      <div className="font-display font-bold text-[color:var(--success)] tabular-nums">{formatNaira(r.bonus_paid)}</div>
                    ) : (
                      <span className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider">none yet</span>
                    )}
                  </td>
                  {/* Invested */}
                  <td className="p-4 text-right whitespace-nowrap hidden lg:table-cell">
                    {r.referred_invested > 0 ? (
                      <div>
                        <div className="font-display font-bold tabular-nums leading-tight">{formatNaira(r.referred_invested)}</div>
                        <div className="text-[10px] text-[color:var(--text-tertiary)]">{r.referred_investment_count} plan{r.referred_investment_count === 1 ? "" : "s"}</div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider">—</span>
                    )}
                  </td>
                  {/* Status */}
                  <td className="p-4">
                    {r.status === "earned" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--success-soft)] text-[color:var(--success)] border border-[color:var(--success)]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]" /> earned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--gold-soft)] text-[color:var(--warning)] border border-[color:var(--warning)]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--warning)] animate-pulse" /> pending
                      </span>
                    )}
                  </td>
                  {/* Date */}
                  <td className="p-4 text-right text-xs text-[color:var(--text-tertiary)] whitespace-nowrap hidden md:table-cell">
                    <div className="font-semibold text-[color:var(--text-primary)]">{formatDate(r.created_at)}</div>
                    <div className="text-[10px]">{relativeTime(r.created_at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <Pagination
            page={safePage}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            testidPrefix="referrals-page"
          />
        )}
      </div>
      {/* Pay-missing-bonuses confirm modal */}
      <Dialog open={payOpen} onOpenChange={(o) => !o && setPayOpen(false)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0" data-testid="pay-missing-modal">
          <div className="relative bg-gradient-to-br from-[#9F0F50] via-[#C81A6E] to-[#E5097F] text-white p-6">
            <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                <Wand2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">Safety net</div>
                <div className="font-display font-extrabold text-2xl mt-1">Pay missing bonuses</div>
                <div className="text-white/85 text-xs mt-1.5 leading-snug">
                  Scans every referral where the referred user invested but the commission was never recorded, then credits the delta to the referrer.
                </div>
              </div>
            </div>
          </div>
          <div className="p-5 bg-[color:var(--surface)]">
            {payBusy && !payPreview ? (
              <div className="text-center text-sm text-[color:var(--text-tertiary)] py-6">Scanning…</div>
            ) : payPreview ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="card-soft p-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Records to credit</div>
                    <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--brand)] tabular-nums" data-testid="preview-records">{payPreview.credited_transactions}</div>
                  </div>
                  <div className="card-soft p-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Users impacted</div>
                    <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--accent-main)] tabular-nums" data-testid="preview-users">{payPreview.credited_users}</div>
                  </div>
                  <div className="card-soft p-3 col-span-2">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Total amount</div>
                    <div className="font-display font-extrabold text-3xl mt-1 text-[color:var(--success)] tabular-nums" data-testid="preview-amount">{formatNaira(payPreview.total_amount)}</div>
                    <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1">{payPreview.scanned_referrals} referrals scanned · idempotent (re-running won't double-pay)</div>
                  </div>
                </div>
                {payPreview.credited_transactions === 0 ? (
                  <div className="mt-4 p-3 rounded-lg bg-[color:var(--success-soft)] text-[color:var(--success)] text-xs font-semibold flex items-center gap-2">
                    <Trophy className="w-4 h-4" /> All bonuses are already up to date — nothing to pay.
                  </div>
                ) : (
                  <div className="mt-4 p-3 rounded-lg bg-[color:var(--gold-soft)] text-[color:var(--warning)] text-[11px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>This will instantly credit user wallets and record <span className="font-bold">referral</span> transactions flagged <span className="font-mono">backfill: true</span>. The action is logged in Activity Log.</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-5">
                  <button
                    onClick={() => setPayOpen(false)}
                    disabled={payBusy}
                    className="px-3 py-2 rounded-md text-xs font-semibold bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmPayMissing}
                    disabled={payBusy || payPreview.credited_transactions === 0}
                    data-testid="pay-missing-confirm"
                    className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> {payBusy ? "Crediting…" : `Pay ${formatNaira(payPreview.total_amount)}`}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
