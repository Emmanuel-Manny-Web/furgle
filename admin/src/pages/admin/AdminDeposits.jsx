import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowDownToLine, Search, Eye, BadgeCheck, Copy, CheckCircle2, Wallet, RefreshCw, X, ExternalLink, User as UserIcon, Activity, TrendingUp, Code2, Clock } from "lucide-react";
import Pagination from "@/components/admin/Pagination";
import LastPolledBadge from "@/components/admin/LastPolledBadge";

function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function StatCard({ tone, label, value, sub, testid }) {
  const tones = {
    neutral: "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]",
    success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    warn: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
    error: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
  };
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}>
        {label}
      </div>
      <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
    </div>
  );
}

function CopyChip({ value, testid }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-[color:var(--text-tertiary)]">—</span>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1300); } catch {}
  };
  return (
    <button onClick={copy} data-testid={testid}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-[color:var(--text-primary)] hover:text-[color:var(--brand)] transition-colors group max-w-[180px]">
      <span className="truncate">{value}</span>
      {copied ? <CheckCircle2 className="w-3 h-3 text-[color:var(--success)] shrink-0" /> : <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100 shrink-0" />}
    </button>
  );
}

const STATUS_PILL = {
  success: { label: "funded", cls: "bg-[color:var(--success-soft)] text-[color:var(--success)]" },
  pending: { label: "pending", cls: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]" },
  failed: { label: "unsuccessful", cls: "bg-[color:var(--error-soft)] text-[color:var(--error)]" },
};

export default function AdminDeposits() {
  const [items, setItems] = useState(() => readCache("/admin/deposits") ?? []);
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState(null);
  const [creditAmt, setCreditAmt] = useState({ open: false, deposit: null });
  const [polling, setPolling] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const QUICK_SIZES = [5, 20, 50, 100, "all"];

  const load = () => api.get("/admin/deposits").then(({ data }) => { setItems(data); writeCache("/admin/deposits", data); });
  useEffect(() => { load(); }, []);

  const refreshOne = async (d) => {
    setRefreshingId(d.id);
    try {
      const { data } = await api.post(`/admin/deposits/${d.id}/refresh-status`);
      const act = data?._refresh || "no_op";
      if (act === "credited") toast.success("Confirmed and credited");
      else if (act === "marked_failed") toast.warning("Gateway reports FAILED");
      else if (act === "still_pending") toast.info("Still pending at gateway");
      else if (act === "no_provider") toast.info("No supported provider — manual credit only");
      else if (act === "already_final") toast.info("Already finalised");
      else toast.info(`Refresh: ${act}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Refresh failed"); }
    finally { setRefreshingId(null); }
  };

  const pollAll = async (gateway = null) => {
    setPolling(true);
    try {
      const url = gateway ? `/admin/deposits/poll-pending?gateway=${gateway}` : "/admin/deposits/poll-pending";
      const { data } = await api.post(url);
      const scope = gateway ? gateway.charAt(0).toUpperCase() + gateway.slice(1) : "All";
      const scanned = data.scanned ?? data.refreshed;
      toast.success(`${scope}: rechecked ${scanned} · credited ${data.credited} · pending ${data.still_pending} · failed ${data.marked_failed}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Recheck failed"); }
    finally { setPolling(false); }
  };

  const [backfilling, setBackfilling] = useState(false);
  const backfillGatewayIds = async () => {
    setBackfilling(true);
    try {
      const { data } = await api.post("/admin/deposits/bulk-backfill-gateway-ids");
      toast.success(
        `Backfilled ${data.updated} of ${data.scanned} historical deposits` +
        (data.not_found ? ` · ${data.not_found} not found at gateway` : "") +
        (data.errors ? ` · ${data.errors} errors` : ""),
        { duration: 7000 },
      );
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Backfill failed"); }
    finally { setBackfilling(false); }
  };

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "All") r = r.filter((d) => d.status === filter.toLowerCase());
    const qq = q.trim().toLowerCase();
    if (qq) r = r.filter((d) =>
      (d.user_name || "").toLowerCase().includes(qq)
      || (d.user_phone || "").toLowerCase().includes(qq)
      || (d.reference || "").toLowerCase().includes(qq)
      || (d.method || "").toLowerCase().includes(qq)
    );
    return r;
  }, [items, filter, q]);

  // Reset to page 1 whenever filter/search/page-size changes
  useEffect(() => { setPage(1); }, [filter, q, pageSize]);

  const effSize = pageSize === "all" ? Math.max(1, filtered.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * effSize, safePage * effSize),
    [filtered, safePage, effSize],
  );

  const stats = useMemo(() => ({
    total: items.length,
    funded: filtered.filter((d) => d.status === "success").length,
    pending: filtered.filter((d) => d.status === "pending").length,
    failed: filtered.filter((d) => d.status === "failed").length,
  }), [items, filtered]);

  const credit = async (d) => {
    try {
      await api.post(`/admin/deposits/${d.id}/approve`);
      toast.success(`Credited ₦${Number(d.amount).toLocaleString()} to ${d.user_name}`);
      setCreditAmt({ open: false, deposit: null });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <AdminLayout title="">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#065F46] via-[#047857] to-[#10B981] text-white p-6 md:p-8" data-testid="deposits-hero">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <ArrowDownToLine className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-extrabold text-3xl md:text-4xl leading-tight" data-testid="deposits-title">Deposits</h1>
            <div className="text-white/80 text-xs md:text-sm mt-1" data-testid="deposits-subtitle">
              {stats.total} total · trace every funding attempt · match with gateway IDs
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard tone="success" label="All deposits" value={stats.total} testid="stat-all" />
        <StatCard tone="success" label="This page · Funded" value={stats.funded} sub="Funded on this page" testid="stat-funded" />
        <StatCard tone="warn" label="This page · Pending" value={stats.pending} testid="stat-pending" />
        <StatCard tone="error" label="This page · Failed" value={stats.failed} testid="stat-failed" />
      </div>

      {/* Search + filter */}
      <div className="card-soft p-3 md:p-4 mt-5 flex items-center gap-3 flex-wrap" data-testid="deposits-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          data-testid="deposits-filter"
          className="shrink-0 input-base text-sm font-semibold">
          <option>All</option>
          <option value="success">Funded</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, username, account, or reference…"
            data-testid="deposits-search"
            className="w-full pl-10 input-base"
          />
        </div>
        <button onClick={() => pollAll(null)} disabled={polling}
          data-testid="deposits-poll-all"
          title="Re-verify every pending and failed deposit with its payment gateway. Credits any that the gateway now confirms."
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${polling ? "animate-spin" : ""}`} /> {polling ? "Rechecking…" : "Bulk recheck"}
        </button>
        <select
          onChange={(e) => { const g = e.target.value; if (g) { pollAll(g); e.target.value = ""; } }}
          disabled={polling}
          defaultValue=""
          data-testid="deposits-poll-per-gateway"
          title="Re-verify only the deposits routed through one provider."
          className="shrink-0 input-base !py-2 !w-[170px] text-sm font-semibold"
        >
          <option value="" disabled>Recheck by gateway…</option>
          <option value="paystack">Paystack only</option>
          <option value="nomba">Nomba only</option>
          <option value="marasoft">Marasoft only</option>
          <option value="budpay">BudPay only</option>
          <option value="qorepay">QorePay only</option>
          <option value="kora">Kora only</option>
        </select>
        <button onClick={backfillGatewayIds} disabled={backfilling}
          data-testid="deposits-backfill-gateway-ids"
          title="Scan every funded deposit that is missing its gateway-side ID and refetch it from Marasoft/Paystack. Does not change status or credit anything."
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--accent-main)] text-white hover:bg-[color:var(--accent-hover)] disabled:opacity-50">
          <Wallet className={`w-4 h-4 ${backfilling ? "animate-pulse" : ""}`} /> {backfilling ? "Backfilling…" : "Backfill gateway IDs"}
        </button>
      </div>

      {/* Rows-per-page picker (matches Manual Adjustments) */}
      <div className="card-soft p-3 mt-3 flex items-center gap-3 flex-wrap" data-testid="deposits-quickrows">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)]">Rows per page</span>
        {QUICK_SIZES.map((n) => {
          const active = pageSize === n;
          return (
            <button
              key={String(n)}
              onClick={() => setPageSize(n)}
              data-testid={`deposits-quick-size-${n}`}
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

      {/* Table */}
      <div className="card-soft mt-5" data-testid="deposits-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="text-left p-4">User</th>
                <th className="text-left p-4">Amount</th>
                <th className="text-left p-4">Gateway</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4 hidden xl:table-cell">Gateway ref</th>
                <th className="text-left p-4 hidden md:table-cell">Date</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {q || filter !== "All" ? "No deposits match this filter." : "No deposits yet."}
                </td></tr>
              )}
              {pageItems.map((d) => {
                const pill = STATUS_PILL[d.status] || STATUS_PILL.pending;
                // Gateway-side ID only (NOT our internal merchant ref `dep_xxx`).
                // Marasoft: `gateway_id` (transaction_id / payment_ref).
                // Paystack: `gateway_id` (numeric id). Legacy fallback: `nomba_order_ref`.
                const gwRef = d.gateway_id || d.meta?.gateway_ref || d.nomba_order_ref;
                const subLabel = d.status === "success"
                  ? <span className="text-[color:var(--success)] font-semibold">Paid in full</span>
                  : d.status === "failed"
                    ? <span className="text-[color:var(--error)] font-semibold">Failed</span>
                    : "Pending settle";
                return (
                  <tr key={d.id} className="border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors" data-testid={`deposit-row-${d.id}`}>
                    <td className="p-4">
                      <Link to={`/pentest/fuser/users/${d.user_id}`} className="flex items-center gap-2.5 group min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(d.user_id) }}>
                          {(d.user_name || "?").trim()[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[color:var(--accent-main)] group-hover:underline truncate max-w-[140px]">{d.user_name || "—"}</div>
                          <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate">{d.user_phone}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="p-4">
                      <div className="font-display font-bold tabular-nums leading-tight">{formatNaira(d.amount)}</div>
                      <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">
                        {subLabel}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]">{d.method}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${pill.cls}`}>{pill.label}</span>
                        {d.status === "pending" && (
                          <LastPolledBadge iso={d.last_polled_at} testid={`last-polled-${d.id}`} />
                        )}
                      </div>
                    </td>
                    <td className="p-4 hidden xl:table-cell max-w-[160px]">
                      {gwRef ? (
                        <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate" title={gwRef}>{gwRef}</div>
                      ) : d.status === "success" ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] border border-[color:var(--border-default)]"
                          title={`Gateway-side ID not captured yet. Click “Recheck pending” or open the deposit and use Refresh to fetch it from ${d.method}.`}
                          data-testid={`deposit-gw-ref-missing-${d.id}`}
                        >
                          awaiting
                        </span>
                      ) : (
                        <span className="text-[10px] text-[color:var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-[color:var(--text-tertiary)] whitespace-nowrap hidden md:table-cell">{formatDate(d.created_at)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <button onClick={() => setViewing(d)} data-testid={`view-deposit-${d.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--accent-main)]/30 text-[color:var(--accent-main)] hover:bg-[color:var(--accent-soft)]">
                          <Eye className="w-3 h-3" /> View
                        </button>
                        {d.status !== "success" && (
                          <button onClick={() => setCreditAmt({ open: true, deposit: d })}
                            data-testid={`credit-deposit-${d.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[color:var(--success)] text-white hover:opacity-90">
                            <BadgeCheck className="w-3 h-3" /> Credit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && pageSize !== "all" && (
          <Pagination
            page={safePage}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={effSize}
            testidPrefix="deposits-page"
          />
        )}
      </div>

      {/* View modal — redesigned to match BLMSCapital reference */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-0 bg-[color:var(--surface)]" data-testid="deposit-view-modal">
          {viewing && (() => {
            const pill = STATUS_PILL[viewing.status] || STATUS_PILL.pending;
            const isFunded = viewing.status === "success";
            const gradient = isFunded
              ? "from-[#065F46] via-[#047857] to-[#10B981]"
              : viewing.status === "failed"
                ? "from-[#7F1D1D] via-[#991B1B] to-[#DC2626]"
                : "from-[#92400E] via-[#B45309] to-[#F59E0B]";
            const ourRef = viewing.reference || "—";
            const gatewayId = viewing.gateway_id || viewing.meta?.gateway_ref || viewing.nomba_order_ref || "—";
            const gatewayIdLabel = viewing.method === "paystack"
              ? "Paystack ID (gateway-side)"
              : viewing.method === "marasoft"
                ? "Marasoft ID (gateway-side)"
                : "Gateway ID (gateway-side)";
            const narration = viewing.narration || `Furgle ${ourRef}`;
            const rawJson = JSON.stringify(
              {
                reference: ourRef,
                gateway_id: gatewayId,
                status: viewing.status,
                method: viewing.method,
                amount: viewing.amount,
                account_number: viewing.account_number,
                bank_name: viewing.bank_name,
                account_name: viewing.account_name,
                admin_note: viewing.admin_note,
                created_at: viewing.created_at,
                updated_at: viewing.updated_at,
                ...(viewing.meta || {}),
              },
              null,
              2,
            );
            return (
              <>
                {/* Hero header */}
                <div className={`relative bg-gradient-to-br ${gradient} text-white p-6`}>
                  <button
                    onClick={() => setViewing(null)}
                    data-testid="deposit-view-close"
                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <Link
                    to={`/pentest/fuser/users/${viewing.user_id}`}
                    data-testid="deposit-view-profile"
                    className="absolute top-4 right-16 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-xs font-semibold"
                  >
                    <UserIcon className="w-3.5 h-3.5" /> Profile
                  </Link>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                      <ArrowDownToLine className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/70">Deposit</div>
                      <div className="font-display font-extrabold text-3xl md:text-4xl mt-1 tabular-nums truncate">{formatNaira(viewing.amount)}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className="px-3 py-1 rounded-full bg-white/25 backdrop-blur text-[10px] font-bold uppercase tracking-wider">
                          {isFunded ? "Completed" : pill.label}
                        </span>
                        <span className="px-3 py-1 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider">
                          {viewing.method || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
                  {/* Customer */}
                  <section>
                    <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] flex items-center gap-1.5 mb-2">
                      <UserIcon className="w-3 h-3" /> Customer
                    </div>
                    <Link
                      to={`/pentest/fuser/users/${viewing.user_id}`}
                      data-testid="deposit-view-customer-link"
                      className="flex items-center gap-3 p-3 rounded-2xl bg-[color:var(--surface-alt)] hover:bg-[color:var(--brand-soft)] transition-colors"
                    >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shrink-0" style={{ backgroundColor: avatarColor(viewing.user_id) }}>
                        {(viewing.user_name || "?").trim()[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold text-base text-[color:var(--text-primary)] truncate">{viewing.user_name || "—"}</div>
                        <div className="font-mono text-xs text-[color:var(--text-tertiary)] truncate">{viewing.user_phone || "—"}</div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--brand)] shrink-0">
                        View <ExternalLink className="w-3 h-3" />
                      </span>
                    </Link>
                  </section>

                  {/* Gateway & identifiers */}
                  <section>
                    <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="w-3 h-3" /> Gateway & identifiers
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <ModalField label={gatewayIdLabel} value={gatewayId} sub={gatewayId === "—" ? "Click Refresh below to fetch from gateway" : null} testid="modal-gateway-id" />
                      <ModalField label="Our reference (sent to gateway)" value={ourRef} testid="modal-our-ref" />
                      <ModalField label="User narration" value={narration} testid="modal-narration" />
                      <ModalField
                        label="Virtual account"
                        value={viewing.account_number || "—"}
                        sub={viewing.bank_name || (viewing.account_number ? null : "Not generated")}
                        testid="modal-virtual-acct"
                      />
                    </div>
                  </section>

                  {/* Amounts */}
                  <section>
                    <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] flex items-center gap-1.5 mb-2">
                      <TrendingUp className="w-3 h-3" /> Amounts
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-4 rounded-2xl bg-[color:var(--surface-alt)]">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Amount initiated</div>
                        <div className="font-display font-extrabold text-xl tabular-nums mt-1 text-[color:var(--text-primary)] truncate">{formatNaira(viewing.amount)}</div>
                      </div>
                      <div className={`p-4 rounded-2xl ${isFunded ? "bg-[color:var(--success-soft)] ring-1 ring-[color:var(--success)]/30" : "bg-[color:var(--surface-alt)]"}`}>
                        <div className={`text-[10px] uppercase tracking-wider font-bold ${isFunded ? "text-[color:var(--success)]" : "text-[color:var(--text-tertiary)]"}`}>Paid amount</div>
                        <div className={`font-display font-extrabold text-xl tabular-nums mt-1 truncate ${isFunded ? "text-[color:var(--success)]" : "text-[color:var(--text-tertiary)]"}`}>
                          {isFunded ? formatNaira(viewing.amount) : "—"}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Timeline */}
                  <section>
                    <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] flex items-center gap-1.5 mb-2">
                      <Clock className="w-3 h-3" /> Timeline
                    </div>
                    <ul className="space-y-2.5">
                      <TimelineRow
                        color="var(--accent-main)"
                        label="Initiated"
                        time={formatDate(viewing.created_at)}
                      />
                      {viewing.updated_at && viewing.updated_at !== viewing.created_at && (
                        <TimelineRow
                          color="var(--accent-main)"
                          label="Status updated"
                          time={formatDate(viewing.updated_at)}
                        />
                      )}
                      {isFunded && (
                        <TimelineRow
                          color="var(--success)"
                          label="Funded"
                          time={formatDate(viewing.updated_at || viewing.created_at)}
                        />
                      )}
                      {viewing.status === "failed" && (
                        <TimelineRow
                          color="var(--error)"
                          label="Marked failed"
                          time={formatDate(viewing.updated_at || viewing.created_at)}
                        />
                      )}
                    </ul>
                    {viewing.admin_note && (
                      <p className="mt-3 text-[11px] text-[color:var(--text-tertiary)] italic break-words">Note: {viewing.admin_note}</p>
                    )}
                  </section>

                  {/* Raw gateway response */}
                  <section>
                    <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] flex items-center gap-1.5 mb-2">
                      <Code2 className="w-3 h-3" /> Raw gateway response
                    </div>
                    <pre className="rounded-2xl bg-[#0F172A] text-[#86EFAC] p-4 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all" data-testid="modal-raw-json">
{rawJson}
                    </pre>
                  </section>
                </div>

                {/* Footer actions */}
                <div className="border-t border-[color:var(--border-default)] p-4 flex items-center justify-end gap-2 bg-[color:var(--surface-alt)]/40">
                  {viewing.status === "pending" && (viewing.method === "marasoft" || viewing.method === "paystack") && (
                    <button
                      onClick={() => { refreshOne(viewing); }}
                      disabled={refreshingId === viewing.id}
                      data-testid="modal-refresh-btn"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[color:var(--brand-soft)] text-[color:var(--brand)] hover:bg-[color:var(--brand)] hover:text-white transition-colors disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === viewing.id ? "animate-spin" : ""}`} /> Refresh status
                    </button>
                  )}
                  {!isFunded && (
                    <button
                      onClick={() => { setCreditAmt({ open: true, deposit: viewing }); setViewing(null); }}
                      data-testid="modal-credit-btn"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[color:var(--success)] text-white hover:opacity-90"
                    >
                      <BadgeCheck className="w-3.5 h-3.5" /> Credit deposit
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Credit confirm */}
      <Dialog open={creditAmt.open} onOpenChange={(o) => !o && setCreditAmt({ open: false, deposit: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit deposit?</DialogTitle>
          </DialogHeader>
          {creditAmt.deposit && (
            <div className="space-y-2 text-sm">
              <p>This will mark the deposit as <span className="font-bold text-[color:var(--success)]">funded</span> and credit <span className="font-display font-bold tabular-nums">{formatNaira(creditAmt.deposit.amount)}</span> to <span className="font-bold">{creditAmt.deposit.user_name}</span>'s wallet.</p>
              <p className="text-[11px] text-[color:var(--text-tertiary)]">This action is audited and irreversible.</p>
            </div>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setCreditAmt({ open: false, deposit: null })} className="px-4 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">Cancel</button>
            <button onClick={() => credit(creditAmt.deposit)} data-testid="credit-confirm-btn"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--success)] text-white">Yes, credit</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function ModalField({ label, value, sub, testid }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value || value === "—") return;
    try { await navigator.clipboard.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1300); } catch {}
  };
  return (
    <button
      type="button"
      onClick={copy}
      data-testid={testid}
      className="text-left p-3 rounded-2xl bg-[color:var(--surface-alt)] hover:bg-[color:var(--brand-soft)] transition-colors group w-full overflow-hidden"
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{label}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="font-mono text-xs text-[color:var(--text-primary)] truncate">{value || "—"}</div>
        {value && value !== "—" && (
          copied
            ? <CheckCircle2 className="w-3.5 h-3.5 text-[color:var(--success)] shrink-0" />
            : <Copy className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] group-hover:text-[color:var(--brand)] shrink-0" />
        )}
      </div>
      {sub && <div className="mt-1 text-[10px] text-[color:var(--text-tertiary)] truncate">{sub}</div>}
    </button>
  );
}

function TimelineRow({ color, label, time }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="font-semibold text-[color:var(--text-primary)] flex-1 truncate">{label}</span>
      <span className="text-[11px] text-[color:var(--text-tertiary)] shrink-0">{time}</span>
    </li>
  );
}
