import React, { useEffect, useMemo, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import {
  History, Search, X, ShieldCheck, KeyRound, Coins,
  ArrowUpFromLine, ArrowDownToLine, Settings as SettingsIcon,
  Ban, UserCheck, Eye, Copy, Filter, RotateCcw,
  Calendar, ChevronDown, FileDown, Activity,
} from "lucide-react";
import Pagination from "@/components/admin/Pagination";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/* Action → icon + tone mapping.                                              */
/* The keys are the canonical `action` strings emitted by the backend log.    */
/* When a row uses an unmapped action we fall back to a neutral pill so new   */
/* actions still render without code changes.                                 */
/* -------------------------------------------------------------------------- */
const ACTION_META = {
  "pin.cleared":               { icon: KeyRound,        label: "PIN cleared",      tone: "warn" },
  "user.balance_adjusted":     { icon: Coins,           label: "Balance adjusted", tone: "brand" },
  "user.blocked":              { icon: Ban,             label: "User blocked",     tone: "error" },
  "user.unblocked":            { icon: UserCheck,       label: "User unblocked",   tone: "success" },
  "withdrawal.approved":       { icon: ArrowUpFromLine, label: "Withdrawal OK'd",  tone: "success" },
  "withdrawal.rejected":       { icon: ArrowUpFromLine, label: "Withdrawal denied",tone: "error" },
  "withdrawal.paid_paystack":  { icon: ArrowUpFromLine, label: "Payout · gateway", tone: "accent" },
  "withdrawal.paid_nomba":     { icon: ArrowUpFromLine, label: "Payout · gateway", tone: "accent" },
  "deposit.approved":          { icon: ArrowDownToLine, label: "Deposit credited", tone: "success" },
  "settings.updated":          { icon: SettingsIcon,    label: "Settings updated", tone: "muted" },
};

const TONE_CLASS = {
  brand:   "text-[color:var(--brand)] bg-[color:var(--brand-soft)]",
  accent:  "text-[color:var(--accent-main)] bg-[color:var(--surface-alt)]",
  success: "text-[color:var(--success)] bg-[color:var(--success-soft)]",
  error:   "text-[color:var(--error)] bg-[color:var(--error-soft)]",
  warn:    "text-[color:var(--warning)] bg-[color:var(--gold-soft)]",
  muted:   "text-[color:var(--text-secondary)] bg-[color:var(--surface-alt)]",
};

function metaFor(action) {
  return ACTION_META[action] || { icon: ShieldCheck, label: action, tone: "muted" };
}

function ActionBadge({ action }) {
  const m = metaFor(action);
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold ${TONE_CLASS[m.tone]}`}>
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-[140px]">{m.label}</span>
    </span>
  );
}

function StatCard({ icon: Icon, label, value, tone = "brand", testid }) {
  return (
    <div className="card-soft p-4 flex items-center gap-3" data-testid={testid}>
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${TONE_CLASS[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-label">{label}</div>
        <div className="font-display text-xl font-extrabold text-[color:var(--text-primary)] truncate">{value}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row detail drawer — opens on click, shows full payload as a JSON block.    */
/* -------------------------------------------------------------------------- */
function DetailDrawer({ entry, onClose }) {
  if (!entry) return null;
  const m = metaFor(entry.action);
  const Icon = m.icon;
  const meta = entry.meta || entry.payload || {};
  const json = (() => {
    try { return JSON.stringify(meta, null, 2); } catch { return String(meta); }
  })();

  const copy = (txt) => {
    navigator.clipboard?.writeText(txt);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="activity-drawer">
      <button onClick={onClose} aria-label="Close" className="flex-1 bg-black/50" />
      <div className="w-full max-w-md bg-[color:var(--surface)] h-full overflow-y-auto p-5 shadow-2xl border-l border-[color:var(--border-default)] animate-slide-in-right">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${TONE_CLASS[m.tone]}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-bold text-lg text-[color:var(--text-primary)]">{m.label}</div>
              <div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{entry.action}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[color:var(--surface-alt)]" data-testid="activity-drawer-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <Row label="When"        value={formatDate(entry.created_at)} />
          <Row label="Admin"       value={`${entry.admin_name || "—"} · ${entry.admin_phone || "—"}`} />
          {entry.target_type && (
            <Row label="Target"    value={`${entry.target_type} · ${entry.target_id || "—"}`} copyValue={entry.target_id} onCopy={copy} />
          )}
          <Row label="Description" value={entry.description || "—"} />
          {entry.ip && <Row label="IP" value={entry.ip} />}
          {entry.user_agent && <Row label="User-agent" value={entry.user_agent} small />}
        </dl>

        {meta && Object.keys(meta).length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-label">Payload</div>
              <button onClick={() => copy(json)} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]" data-testid="activity-drawer-copy-payload">
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-[color:var(--surface-alt)] border border-[color:var(--border-default)] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-72">{json}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, small, copyValue, onCopy }) {
  return (
    <div className="grid grid-cols-3 gap-2 items-start">
      <dt className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{label}</dt>
      <dd className="col-span-2 flex items-start gap-2 min-w-0">
        <span className={`break-all ${small ? "text-[11px] font-mono text-[color:var(--text-secondary)]" : "text-[color:var(--text-primary)]"}`}>{value}</span>
        {copyValue && (
          <button onClick={() => onCopy(copyValue)} className="text-[color:var(--text-tertiary)] hover:text-[color:var(--brand)] shrink-0">
            <Copy className="w-3 h-3" />
          </button>
        )}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Date-range presets                                                          */
/* -------------------------------------------------------------------------- */
const RANGE_PRESETS = [
  { v: "all",    label: "All time" },
  { v: "24h",    label: "Last 24h" },
  { v: "7d",     label: "7 days" },
  { v: "30d",    label: "30 days" },
];

function rangeStartIso(v) {
  const now = new Date();
  if (v === "24h") return new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  if (v === "7d")  return new Date(now.getTime() - 7 * 86400 * 1000).toISOString();
  if (v === "30d") return new Date(now.getTime() - 30 * 86400 * 1000).toISOString();
  return null;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */
export default function AdminActivityLog() {
  const [items, setItems] = useState(() => readCache("/admin/activity")?.items ?? []);
  const [actions, setActions] = useState(() => readCache("/admin/activity")?.actions ?? []);
  const [filter, setFilter] = useState({ action: "", q: "", range: "all" });
  const [loading, setLoading] = useState(() => readCache("/admin/activity") === undefined);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter.action) params.set("action", filter.action);
      const { data } = await api.get(`/admin/activity${params.toString() ? `?${params}` : ""}`);
      setItems(data.items || []);
      setActions(data.actions || []);
      writeCache("/admin/activity", { items: data.items || [], actions: data.actions || [] });
    } finally { setLoading(false); }
  }, [filter.action]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter.action, filter.q, filter.range]);

  // Range-filter applied client-side (server returns last N — adequate for audit log).
  const ranged = useMemo(() => {
    const cutoff = rangeStartIso(filter.range);
    if (!cutoff) return items;
    return items.filter((it) => it.created_at && it.created_at >= cutoff);
  }, [items, filter.range]);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    if (!q) return ranged;
    return ranged.filter((it) =>
      (it.admin_phone || "").toLowerCase().includes(q)
      || (it.admin_name || "").toLowerCase().includes(q)
      || (it.target_id || "").toLowerCase().includes(q)
      || (it.description || "").toLowerCase().includes(q)
      || (it.action || "").toLowerCase().includes(q)
    );
  }, [ranged, filter.q]);

  const safePage = Math.min(Math.max(1, page), Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  /* ---- Aggregate stats over the currently-filtered set --------------- */
  const stats = useMemo(() => {
    const last24 = ranged.filter((it) => it.created_at && it.created_at >= rangeStartIso("24h")).length;
    const adminSet = new Set(ranged.map((it) => it.admin_phone).filter(Boolean));
    const dangerActions = ranged.filter((it) => /blocked|cleared|rejected|deleted/.test(it.action || "")).length;
    return {
      total: ranged.length,
      last24,
      uniqueAdmins: adminSet.size,
      danger: dangerActions,
    };
  }, [ranged]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export with the current filter.");
      return;
    }
    const rows = [
      ["when", "admin_name", "admin_phone", "action", "target_type", "target_id", "description"],
      ...filtered.map((it) => [
        it.created_at || "",
        it.admin_name || "",
        it.admin_phone || "",
        it.action || "",
        it.target_type || "",
        it.target_id || "",
        (it.description || "").replace(/"/g, '""'),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} rows`);
  };

  const resetFilters = () => setFilter({ action: "", q: "", range: "all" });
  const hasFilter = filter.q || filter.action || filter.range !== "all";

  return (
    <AdminLayout title="Activity Log">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--accent-main)] text-white p-5 mb-5" data-testid="activity-hero">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 60%, white 1px, transparent 1px)", backgroundSize: "32px 32px, 22px 22px" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] opacity-80">Audit trail</div>
              <div className="font-display text-2xl font-extrabold leading-tight">Admin activity log</div>
              <div className="text-xs opacity-90 mt-1">Tamper-resistant record of every sensitive admin action.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold transition-colors" data-testid="activity-refresh">
              <RotateCcw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[color:var(--brand)] hover:bg-white/90 text-xs font-bold transition-colors" data-testid="activity-export-csv">
              <FileDown className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={History}    label="In current range" value={stats.total.toLocaleString()}        tone="brand"   testid="stat-total" />
        <StatCard icon={Activity}   label="Last 24h"          value={stats.last24.toLocaleString()}       tone="accent"  testid="stat-24h" />
        <StatCard icon={ShieldCheck}label="Unique admins"     value={stats.uniqueAdmins.toLocaleString()} tone="success" testid="stat-admins" />
        <StatCard icon={Ban}        label="Sensitive actions" value={stats.danger.toLocaleString()}       tone="error"   testid="stat-danger" />
      </div>

      {/* Filter toolbar */}
      <div className="card-soft p-4 mb-5" data-testid="activity-toolbar">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
            <input
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              placeholder="Search admin, target ID, description…"
              data-testid="activity-search-input"
              className="w-full pl-10 pr-10 input-base"
            />
            {filter.q && (
              <button onClick={() => setFilter({ ...filter, q: "" })} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-[color:var(--surface-alt)]" data-testid="activity-search-clear">
                <X className="w-4 h-4 text-[color:var(--text-tertiary)]" />
              </button>
            )}
          </div>

          <div className="md:col-span-3 relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)] pointer-events-none" />
            <select
              value={filter.action}
              onChange={(e) => setFilter({ ...filter, action: e.target.value })}
              data-testid="activity-action-filter"
              className="w-full pl-10 pr-8 input-base appearance-none"
            >
              <option value="">{`All actions (${actions.length})`}</option>
              {actions.map((a) => (
                <option key={a} value={a}>{metaFor(a).label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)] pointer-events-none" />
          </div>

          <div className="md:col-span-3 relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)] pointer-events-none" />
            <select
              value={filter.range}
              onChange={(e) => setFilter({ ...filter, range: e.target.value })}
              data-testid="activity-range-filter"
              className="w-full pl-10 pr-8 input-base appearance-none"
            >
              {RANGE_PRESETS.map((r) => (
                <option key={r.v} value={r.v}>{r.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)] pointer-events-none" />
          </div>
        </div>

        {hasFilter && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-[color:var(--text-tertiary)]">
              Showing <span className="font-bold text-[color:var(--text-primary)]">{filtered.length}</span> of {items.length} entries
            </div>
            <button onClick={resetFilters} className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--brand)] hover:underline" data-testid="activity-reset-filters">
              <RotateCcw className="w-3 h-3" /> Clear filters
            </button>
          </div>
        )}
      </div>

      {/* DESKTOP TABLE */}
      <div className="card-soft overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="activity-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold">When</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold">Admin</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold">Action</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold">Description</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((it) => (
                <tr
                  key={it.id}
                  onClick={() => setDetail(it)}
                  className="border-t border-[color:var(--border-default)] hover:bg-[color:var(--surface-alt)] cursor-pointer transition-colors"
                  data-testid={`activity-row-${it.id}`}
                >
                  <td className="px-4 py-3 text-[color:var(--text-secondary)] whitespace-nowrap text-xs">{formatDate(it.created_at)}</td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="font-semibold text-[color:var(--text-primary)] text-xs truncate">{it.admin_name || "—"}</div>
                    <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate">{it.admin_phone}</div>
                  </td>
                  <td className="px-4 py-3"><ActionBadge action={it.action} /></td>
                  <td className="px-4 py-3 max-w-[420px]">
                    <div className="text-[color:var(--text-primary)] text-xs truncate">{it.description || "—"}</div>
                    {it.target_id && (
                      <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] mt-0.5 truncate">{it.target_type}: {it.target_id}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-[color:var(--brand)]">
                      <Eye className="w-3 h-3" /> View
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {hasFilter ? "No activity matches the current filter." : "No admin activity recorded yet."}
                </td></tr>
              )}
              {loading && (
                <tr><td colSpan={5} className="p-12 text-center text-[color:var(--text-tertiary)]">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <Pagination
            page={page}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            testidPrefix="activity-page"
          />
        )}
      </div>

      {/* MOBILE LIST */}
      <div className="md:hidden space-y-2.5">
        {pageItems.map((it) => {
          const m = metaFor(it.action);
          const Icon = m.icon;
          return (
            <button
              key={it.id}
              onClick={() => setDetail(it)}
              className="w-full text-left card-soft p-3 flex items-start gap-3"
              data-testid={`activity-card-${it.id}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE_CLASS[m.tone]}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display font-bold text-sm text-[color:var(--text-primary)] truncate">{m.label}</div>
                  <div className="text-[10px] text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(it.created_at)}</div>
                </div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5 line-clamp-2">{it.description || "—"}</div>
                <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] mt-1 truncate">by {it.admin_phone || "—"}</div>
              </div>
            </button>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="card-soft p-10 text-center text-[color:var(--text-tertiary)] text-sm">
            {hasFilter ? "No activity matches the current filter." : "No admin activity recorded yet."}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="card-soft">
            <Pagination
              page={page}
              setPage={setPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              testidPrefix="activity-page-m"
            />
          </div>
        )}
      </div>

      <DetailDrawer entry={detail} onClose={() => setDetail(null)} />
    </AdminLayout>
  );
}
