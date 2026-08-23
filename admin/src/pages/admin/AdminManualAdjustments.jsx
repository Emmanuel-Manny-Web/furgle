import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import { Link } from "react-router-dom";
import Pagination from "@/components/admin/Pagination";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  SlidersHorizontal, Search, TrendingUp, TrendingDown, Coins, Eye,
  ArrowUpRight, ArrowDownRight, User as UserIcon, Undo2, AlertTriangle,
} from "lucide-react";

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
 * Stat card — arc-glow treatment consistent with the rest of the admin
 * --------------------------------------------------------------------------*/
const STAT_TONES = {
  brand:   { pill: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",       glow: "from-[#E5097F]/20" },
  accent:  { pill: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]", glow: "from-[#5B5BD6]/20" },
  success: { pill: "bg-[color:var(--success-soft)] text-[color:var(--success)]",   glow: "from-[#10B981]/20" },
  warn:    { pill: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",      glow: "from-[#F59E0B]/20" },
  error:   { pill: "bg-[color:var(--error-soft)] text-[color:var(--error)]",       glow: "from-[#EF4444]/20" },
};
function StatCard({ tone, icon: Icon, label, value, sub, testid }) {
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

/* ============================================================================
 * MAIN PAGE
 * ==========================================================================*/
export default function AdminManualAdjustments() {
  const [items, setItems] = useState(() => readCache("/admin/manual-adjustments") ?? []);
  const [loading, setLoading] = useState(() => readCache("/admin/manual-adjustments") === undefined);
  const [filter, setFilter] = useState("All"); // All | credit | debit | bonus | refund
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    api.get("/admin/manual-adjustments").then(({ data }) => {
      setItems(data || []);
      writeCache("/admin/manual-adjustments", data || []);
      setLoading(false);
    });
  }, []);

  const reload = () => api.get("/admin/manual-adjustments").then(({ data }) => {
    setItems(data || []);
    writeCache("/admin/manual-adjustments", data || []);
  });

  const [reverseTx, setReverseTx] = useState(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseBusy, setReverseBusy] = useState(false);
  const confirmReverse = async () => {
    if (!reverseTx || reverseReason.trim().length < 3) {
      toast.error("Please give a brief reason");
      return;
    }
    setReverseBusy(true);
    try {
      const { data } = await api.post(`/admin/transactions/${reverseTx.id}/reverse`, { reason: reverseReason.trim() });
      toast.success(`Reversed · new balance ${formatNaira(data.new_balance)}`);
      setReverseTx(null);
      setReverseReason("");
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reversal failed");
    } finally {
      setReverseBusy(false);
    }
  };

  useEffect(() => { setPage(1); }, [filter, q, pageSize]);

  // KPIs — all-time totals (not page-restricted)
  const kpis = useMemo(() => {
    let credits = 0, debits = 0, cCount = 0, dCount = 0;
    for (const t of items) {
      if (t.amount >= 0) { credits += t.amount; cCount += 1; }
      else { debits += t.amount; dCount += 1; }
    }
    return { credits, debits, cCount, dCount, net: credits + debits };
  }, [items]);

  // Filter + search
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((t) => {
      if (filter === "credit" && t.amount < 0) return false;
      if (filter === "debit" && t.amount >= 0) return false;
      if (filter === "bonus" && t.type !== "bonus") return false;
      if (filter === "refund" && t.type !== "refund") return false;
      if (!qq) return true;
      return (
        (t.user_name || "").toLowerCase().includes(qq) ||
        (t.user_phone || "").includes(qq) ||
        (t.description || "").toLowerCase().includes(qq) ||
        (t.id || "").toLowerCase().includes(qq)
      );
    });
  }, [items, filter, q]);

  const effSize = pageSize === "all" ? Math.max(1, filtered.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * effSize, safePage * effSize),
    [filtered, safePage, effSize],
  );

  const QUICK_SIZES = [5, 20, 50, 100, "all"];

  return (
    <AdminLayout title="">
      {/* ===== HERO ===== */}
      <div
        className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8"
        style={{ background: "linear-gradient(120deg,#3F0825 0%,#7A0A45 38%,#C81A6E 72%,#E5097F 100%)" }}
        data-testid="adj-hero"
      >
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-48 h-48 rounded-full bg-[#FF5BAA]/30 blur-3xl" />
        {/* Decorative scales / sliders glyph */}
        <svg className="absolute inset-y-0 right-0 h-full opacity-[0.10]" viewBox="0 0 200 200" preserveAspectRatio="none">
          <g stroke="white" strokeWidth="1.2" fill="none">
            <line x1="10"  y1="40"  x2="190" y2="40"  />
            <line x1="10"  y1="100" x2="190" y2="100" />
            <line x1="10"  y1="160" x2="190" y2="160" />
            <circle cx="60"  cy="40"  r="5" fill="white" />
            <circle cx="120" cy="100" r="5" fill="white" />
            <circle cx="80"  cy="160" r="5" fill="white" />
          </g>
        </svg>

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">Audit trail · wallet edits</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Manual Adjustments</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">
                <span className="font-bold tabular-nums">{items.length}</span> total adjustments · {" "}
                <span className="font-bold tabular-nums">{kpis.cCount}</span> credits · {" "}
                <span className="font-bold tabular-nums">{kpis.dCount}</span> debits
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard tone="success" icon={TrendingUp}   label="Total credited"  value={formatNaira(kpis.credits)} sub={`${kpis.cCount} credit${kpis.cCount === 1 ? "" : "s"} all-time`} testid="kpi-credits" />
        <StatCard tone="error"   icon={TrendingDown} label="Total debited"   value={formatNaira(Math.abs(kpis.debits))} sub={`${kpis.dCount} debit${kpis.dCount === 1 ? "" : "s"} all-time`} testid="kpi-debits" />
        <StatCard tone={kpis.net >= 0 ? "accent" : "warn"} icon={Coins} label="Net adjustment" value={`${kpis.net < 0 ? "-" : ""}${formatNaira(Math.abs(kpis.net))}`} sub={kpis.net >= 0 ? "Net positive added to platform" : "Net debit applied"} testid="kpi-net" />
        <StatCard tone="brand"   icon={Eye}          label="Records on view" value={filtered.length} sub="Filter / search to narrow" testid="kpi-records" />
      </div>

      {/* ===== Toolbar ===== */}
      <div className="card-soft p-3 mt-5 flex items-center gap-3 flex-wrap" data-testid="adj-toolbar">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="adj-filter"
          className="input-base !py-2 !w-[220px] text-sm font-semibold"
        >
          <option value="All">All adjustments</option>
          <option value="credit">Credits only (admin added)</option>
          <option value="debit">Debits only (admin removed)</option>
          <option value="bonus">Bonus only</option>
          <option value="refund">Refunds only</option>
        </select>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, note, or transaction ID…"
            data-testid="adj-search"
            className="w-full pl-10 input-base"
          />
        </div>
      </div>

      {/* Quick row sizes — matches AdminWithdrawals exactly */}
      <div className="card-soft p-3 mt-3 flex items-center gap-3 flex-wrap" data-testid="adj-quickrows">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)]">Rows per page</span>
        {QUICK_SIZES.map((n) => {
          const active = pageSize === n;
          return (
            <button
              key={String(n)}
              onClick={() => { setPageSize(n); }}
              data-testid={`quick-size-${n}`}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${active
                ? "bg-[color:var(--brand)] text-white"
                : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70"}`}
            >
              {n === "all" ? "All" : n}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-[color:var(--text-tertiary)]">
          Showing <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{pageItems.length}</span> of <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{filtered.length}</span>
        </span>
      </div>

      {/* ===== Card list ===== */}
      <div className="mt-3 space-y-2" data-testid="adj-list">
        {loading && (
          <div className="card-soft p-12 text-center text-[color:var(--text-tertiary)]">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="card-soft p-12 text-center">
            <SlidersHorizontal className="w-12 h-12 mx-auto opacity-30 text-[color:var(--text-tertiary)]" />
            <div className="font-semibold text-[color:var(--text-primary)] mt-3">
              {q || filter !== "All" ? "No adjustments match this filter." : "No manual adjustments yet"}
            </div>
            <div className="text-xs text-[color:var(--text-tertiary)] mt-1">
              Adjust user balances from the <Link to="/pentest/fuser/users" className="text-[color:var(--brand)] font-bold hover:underline">Users page</Link>.
            </div>
          </div>
        )}
        {!loading && pageItems.map((t) => {
          const positive = t.amount >= 0;
          const before = (Number(t.balance_after) || 0) - Number(t.amount || 0);
          const after = Number(t.balance_after) || 0;
          return (
            <div
              key={t.id}
              className="card-soft p-0 overflow-hidden relative"
              data-testid={`adj-row-${t.id}`}
            >
              {/* Side accent strip — green for credit, red for debit */}
              <div className={`absolute inset-y-0 left-0 w-1.5 ${positive ? "bg-[color:var(--success)]" : "bg-[color:var(--error)]"}`} />
              <div className="pl-5 pr-4 py-4 flex items-center gap-3">
                {/* Arrow well */}
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${positive ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--error-soft)] text-[color:var(--error)]"}`}>
                  {positive ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                </div>
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: avatarColor(t.user_id) }}>
                  {(t.user_name || "?").trim()[0]?.toUpperCase()}
                </div>
                {/* Identity + note — username font matches AdminUsers (semibold, base sans) */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/pentest/fuser/users/${t.user_id}`} className="font-semibold text-sm text-[color:var(--text-primary)] hover:text-[color:var(--brand)] truncate" data-testid={`adj-user-${t.id}`}>
                      {t.user_name || "—"}
                    </Link>
                    <span className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{t.user_phone}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${positive ? "bg-[color:var(--success-soft)] text-[color:var(--success)] border-[color:var(--success)]/20" : "bg-[color:var(--error-soft)] text-[color:var(--error)] border-[color:var(--error)]/20"}`}>
                      {t.type === "refund" ? "refund" : positive ? "credit" : "debit"}
                    </span>
                  </div>
                  <p className="text-[12px] text-[color:var(--text-secondary)] mt-0.5 line-clamp-2 leading-snug">
                    <span className="italic">{t.description || "Admin adjustment"}</span>
                  </p>
                  <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1 font-mono flex flex-wrap items-center gap-x-1.5">
                    <span>{formatNaira(before)}</span>
                    <ArrowUpRight className="w-3 h-3 inline -translate-y-0.5" />
                    <span className="font-bold text-[color:var(--text-primary)]">{formatNaira(after)}</span>
                    {(t?.meta?.reason) && (
                      <span className="ml-1.5 text-[color:var(--text-tertiary)]"> · {t.meta.reason}</span>
                    )}
                  </div>
                </div>
                {/* Amount + date — smaller (matches AdminUsers balance scale) */}
                <div className="text-right shrink-0">
                  <div className={`font-display font-bold text-base tabular-nums leading-tight ${positive ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`} data-testid={`adj-amount-${t.id}`}>
                    {positive ? "+" : ""}{formatNaira(t.amount)}
                  </div>
                  <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5 whitespace-nowrap">{formatDate(t.created_at)}</div>
                  <div className="text-[10px] text-[color:var(--text-tertiary)]">{relativeTime(t.created_at)}</div>
                </div>
                {/* Open profile */}
                <Link
                  to={`/pentest/fuser/users/${t.user_id}`}
                  data-testid={`adj-open-${t.id}`}
                  className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] hover:opacity-90"
                  title="Open user profile"
                >
                  <UserIcon className="w-4 h-4" />
                </Link>
                {/* Reverse */}
                {(t?.meta?.reversed || t?.meta?.reverses) ? (
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] cursor-not-allowed"
                    title={t?.meta?.reversed ? "This adjustment has already been reversed" : "This row is a reversal — can't reverse a reversal"}
                    data-testid={`adj-reverse-disabled-${t.id}`}
                  >
                    <Undo2 className="w-4 h-4" />
                  </span>
                ) : (
                  <button
                    onClick={() => { setReverseTx(t); setReverseReason(""); }}
                    data-testid={`adj-reverse-${t.id}`}
                    title="Reverse this adjustment"
                    className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-[color:var(--error-soft)] text-[color:var(--error)] hover:opacity-90"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination — same component used by Withdrawals */}
      {!loading && filtered.length > 0 && pageSize !== "all" && (
        <div className="card-soft mt-3 overflow-hidden">
          <Pagination
            page={safePage}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={effSize}
            testidPrefix="adj-page"
          />
        </div>
      )}
      {/* Reverse confirmation modal */}
      <Dialog open={!!reverseTx} onOpenChange={(o) => !reverseBusy && !o && setReverseTx(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0" data-testid="reverse-modal">
          <div className="relative bg-gradient-to-br from-[#7F1D1D] via-[#B91C1C] to-[#EF4444] text-white p-6">
            <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                <Undo2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">Inverse transaction</div>
                <div className="font-display font-extrabold text-2xl mt-1">Reverse adjustment</div>
                <div className="text-white/85 text-xs mt-1.5">A new transaction will be written that undoes this one and the original will be flagged as reversed.</div>
              </div>
            </div>
          </div>
          {reverseTx && (
            <div className="p-5 bg-[color:var(--surface)] space-y-4">
              <div className="card-soft p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Reversing</div>
                <div className="font-display font-extrabold text-2xl mt-1 tabular-nums leading-none">
                  <span className={reverseTx.amount >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}>
                    {reverseTx.amount >= 0 ? "+" : ""}{formatNaira(reverseTx.amount)}
                  </span>
                  <span className="text-[color:var(--text-tertiary)] text-base font-normal mx-2">→</span>
                  <span className={reverseTx.amount >= 0 ? "text-[color:var(--error)]" : "text-[color:var(--success)]"}>
                    {reverseTx.amount >= 0 ? "" : "+"}{formatNaira(-reverseTx.amount)}
                  </span>
                </div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{reverseTx.user_name} · <span className="italic">"{reverseTx.description}"</span></div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Reason (required)</label>
                <textarea
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. incorrect amount, duplicate adjustment, user-side complaint…"
                  rows={2}
                  maxLength={500}
                  data-testid="reverse-reason"
                  className="w-full input-base resize-none text-sm"
                />
              </div>
              <div className="rounded-lg bg-[color:var(--error-soft)] text-[color:var(--error)] p-2.5 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>The user's wallet will be updated immediately. This action is logged.</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setReverseTx(null)}
                  disabled={reverseBusy}
                  className="px-3 py-2 rounded-md text-xs font-semibold bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReverse}
                  disabled={reverseBusy || reverseReason.trim().length < 3}
                  data-testid="reverse-confirm"
                  className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-[color:var(--error)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Undo2 className="w-3.5 h-3.5" /> {reverseBusy ? "Reversing…" : "Reverse"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
