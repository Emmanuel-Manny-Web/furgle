import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowUpFromLine, Banknote, Send, Smartphone, Search, ChevronDown, Check, Loader2,
  BadgeCheck, AlertTriangle, RefreshCw, Wallet, Copy, X, ExternalLink,
  User as UserIcon, Hourglass, CalendarDays, CheckCircle2, ClipboardCheck, Undo2,
} from "lucide-react";
import Pagination from "@/components/admin/Pagination";
import LastPolledBadge from "@/components/admin/LastPolledBadge";
import { Link } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------*/

function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function startOfLagosDayISO() {
  // Lagos = UTC+1, no DST.
  const now = new Date();
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000);
  const lagosMidnight = new Date(Date.UTC(
    lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate(), 0, 0, 0
  ));
  // back to UTC by subtracting 1 hour
  return new Date(lagosMidnight.getTime() - 60 * 60 * 1000).toISOString();
}

function CopyButton({ text, testid }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }
        catch { /* ignore */ }
      }}
      className="ml-2 p-1 rounded-md text-[color:var(--text-tertiary)] hover:bg-[color:var(--surface-alt)] hover:text-[color:var(--accent-main)]"
      title="Copy"
    >
      {done ? <CheckCircle2 className="w-3.5 h-3.5 text-[color:var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Stat cards & gateway cards
 * -------------------------------------------------------------------------*/

const STAT_TONES = {
  warn:    "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
  success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  brand:   "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
  accent:  "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
};

function StatCard({ tone = "brand", icon: Icon, label, value, sub, testid }) {
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${STAT_TONES[tone]}`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums leading-none">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-2">{sub}</div>}
    </div>
  );
}

function GatewayStatusCard({ name, last, pendingCount, doneCount, tone, balance, balanceLive, balanceError, onRefreshBalance, refreshing }) {
  const tones = {
    nomba: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    paystack: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
  };
  return (
    <div className="card-soft p-4 flex items-center gap-4" data-testid={`gateway-card-${name.toLowerCase()}`}>
      <div className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${tones[name.toLowerCase()] || tones.nomba} shrink-0`}>
        {name}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Last successful payout</span>
          {doneCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[color:var(--success)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]" /> ACTIVE
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
          <span className="font-display font-bold text-base text-[color:var(--text-primary)]">{last ? relativeTime(last) : "—"}</span>
          <span className="text-[11px] text-[color:var(--text-tertiary)]">· {pendingCount} pending · {doneCount} done</span>
        </div>
        {balance !== undefined && (
          <div className="mt-1.5 text-xs flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] shrink-0" />
            <span className="text-[color:var(--text-tertiary)] font-medium">Float:</span>
            <span className="font-mono font-bold tabular-nums text-[color:var(--text-primary)]">
              {refreshing ? "…"
                : balanceLive === false ? "Live off"
                : balance == null ? (balanceError ? "Unavailable" : "—")
                : formatNaira(balance)}
            </span>
          </div>
        )}
      </div>
      {onRefreshBalance && (
        <button
          onClick={onRefreshBalance}
          disabled={refreshing}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[color:var(--surface-alt)] hover:bg-[color:var(--brand-soft)] hover:text-[color:var(--brand)] text-[color:var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh balance"
          data-testid="refresh-float-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Checking…" : "Refresh"}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Status pill (display labels in the redesigned table)
 * -------------------------------------------------------------------------*/

function StatusPill({ w }) {
  if (w.insufficient_float && w.status === "pending") {
    return <span className="pill pill-error" data-testid={`status-${w.id}`}>insufficient float</span>;
  }
  // Map "paid" -> "disbursed" visually to match the new design language.
  if (w.status === "paid") return <span className="pill pill-success" data-testid={`status-${w.id}`}>disbursed</span>;
  if (w.status === "rejected") return <span className="pill pill-error" data-testid={`status-${w.id}`}>rejected</span>;
  if (w.status === "processing") return <span className="pill pill-warn" data-testid={`status-${w.id}`}>processing</span>;
  if (w.status === "on_hold") return <span className="pill pill-error" data-testid={`status-${w.id}`}>on hold</span>;
  return <span className="pill pill-warn" data-testid={`status-${w.id}`}>pending</span>;
}

/* ===========================================================================
 * MAIN PAGE
 * =========================================================================*/

export default function AdminWithdrawals() {
  const [items, setItems] = useState(() => readCache("/admin/withdrawals") ?? []);
  const [nombaFloat, setNombaFloat] = useState(null);
  const [floatRefreshing, setFloatRefreshing] = useState(false);
  const [paystackFloat, setPaystackFloat] = useState(null);
  const [paystackRefreshing, setPaystackRefreshing] = useState(false);
  const [juntpayFloat, setJuntpayFloat] = useState(null);
  const [duploFloat, setDuploFloat] = useState(null);
  const [koraFloat, setKoraFloat] = useState(null);
  const [juntpayRefreshing, setJuntpayRefreshing] = useState(false);
  const [duploRefreshing, setDuploRefreshing] = useState(false);
  const [koraRefreshing, setKoraRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  // Toolkit modal (per-row drill-in).
  const [toolkit, setToolkit] = useState(null); // withdrawal record

  // Pay dialog state (kept the same).
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // List filter / search / page-size.
  const [filter, setFilter] = useState("All"); // All | pending | processing | paid | rejected
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = () => api.get("/admin/withdrawals").then(({ data }) => {
    // Backend stores the completed status as "success"; the UI vocabulary is
    // "paid". Normalize so paid rows render correctly (not as "pending").
    const rows = (data || []).map((w) => ({ ...w, status: w.status === "success" ? "paid" : w.status }));
    setItems(rows);
    writeCache("/admin/withdrawals", rows);
  });
  const loadFloat = async ({ silent = false } = {}) => {
    setFloatRefreshing(true);
    try {
      const { data } = await api.get("/admin/nomba/balance");
      setNombaFloat(data);
      if (!silent) {
        if (data?.live === false) {
          toast.info("Nomba live mode is OFF — settings need a live API key");
        } else if (data?.error) {
          toast.error(`Nomba balance unavailable: ${data.error}`);
        } else if (data?.balance != null) {
          toast.success(`Nomba float: ${formatNaira(data.balance)}`);
        } else {
          toast.info("Nomba balance returned no data");
        }
      }
    } catch (e) {
      setNombaFloat(null);
      if (!silent) toast.error(e?.response?.data?.detail || "Could not fetch Nomba balance");
    } finally {
      setFloatRefreshing(false);
    }
  };
  const loadPaystackFloat = async ({ silent = false } = {}) => {
    setPaystackRefreshing(true);
    try {
      const { data } = await api.get("/admin/paystack/balance");
      setPaystackFloat(data);
      if (!silent) {
        if (data?.live === false) {
          toast.info("Paystack live mode is OFF — settings need a live secret key");
        } else if (data?.error) {
          toast.error(`Paystack balance unavailable: ${data.error}`);
        } else if (data?.balance != null) {
          toast.success(`Paystack float: ${formatNaira(data.balance)}`);
        } else {
          toast.info("Paystack balance returned no data");
        }
      }
    } catch (e) {
      setPaystackFloat(null);
      if (!silent) toast.error(e?.response?.data?.detail || "Could not fetch Paystack balance");
    } finally {
      setPaystackRefreshing(false);
    }
  };
  const loadJuntpayFloat = async ({ silent = false } = {}) => {
    setJuntpayRefreshing(true);
    try {
      const { data } = await api.get("/admin/juntpay/balance");
      setJuntpayFloat(data);
      if (!silent) {
        if (data?.error) toast.error(`JuntPay balance unavailable: ${data.error}`);
        else if (data?.balance != null) toast.success(`JuntPay float: ${formatNaira(data.balance)}`);
        else toast.info("JuntPay balance returned no data");
      }
    } catch (e) {
      setJuntpayFloat(null);
      if (!silent) toast.error(e?.response?.data?.detail || "Could not fetch JuntPay balance");
    } finally { setJuntpayRefreshing(false); }
  };
  const loadDuploFloat = async ({ silent = false } = {}) => {
    setDuploRefreshing(true);
    try {
      const { data } = await api.get("/admin/duplo/balance");
      setDuploFloat(data);
      if (!silent) {
        if (data?.error) toast.error(`Duplo balance unavailable: ${data.error}`);
        else if (data?.balance != null) toast.success(`Duplo float: ${formatNaira(data.balance)}`);
        else toast.info("Duplo balance returned no data");
      }
    } catch (e) {
      setDuploFloat(null);
      if (!silent) toast.error(e?.response?.data?.detail || "Could not fetch Duplo balance");
    } finally { setDuploRefreshing(false); }
  };
  const loadKoraFloat = async ({ silent = false } = {}) => {
    setKoraRefreshing(true);
    try {
      const { data } = await api.get("/admin/kora/balance");
      setKoraFloat(data);
      if (!silent) {
        if (data?.error) toast.error(`Kora balance unavailable: ${data.error}`);
        else if (data?.balance != null) toast.success(`Kora float: ${formatNaira(data.balance)}`);
        else toast.info("Kora balance returned no data");
      }
    } catch (e) {
      setKoraFloat(null);
      if (!silent) toast.error(e?.response?.data?.detail || "Could not fetch Kora balance");
    } finally { setKoraRefreshing(false); }
  };
  useEffect(() => { load(); loadFloat({ silent: true }); loadPaystackFloat({ silent: true }); loadJuntpayFloat({ silent: true }); loadDuploFloat({ silent: true }); loadKoraFloat({ silent: true }); }, []);

  /* ----- derived stats ----- */
  const stats = useMemo(() => {
    const lagosStart = startOfLagosDayISO();
    let pendingCount = 0, paidToday = 0, paidAll = 0, feesAll = 0;
    let nombaLast = null, paystackLast = null;
    let nombaPending = 0, nombaDone = 0, paystackPending = 0, paystackDone = 0;
    for (const w of items) {
      if (w.status === "pending" || w.status === "processing") pendingCount += 1;
      if (w.status === "paid") {
        paidAll += Number(w.amount || 0);
        feesAll += Number(w.fee_amount || 0);
        if ((w.updated_at || w.created_at) >= lagosStart) paidToday += Number(w.amount || 0);
        if (w.nomba_transfer_ref) {
          nombaDone += 1;
          if (!nombaLast || (w.updated_at || w.created_at) > nombaLast) nombaLast = w.updated_at || w.created_at;
        } else if (w.paystack_transfer_ref) {
          paystackDone += 1;
          if (!paystackLast || (w.updated_at || w.created_at) > paystackLast) paystackLast = w.updated_at || w.created_at;
        }
      }
      if ((w.status === "pending" || w.status === "processing")) {
        if (w.nomba_transfer_ref) nombaPending += 1;
        else if (w.paystack_transfer_ref) paystackPending += 1;
      }
    }
    return {
      pendingCount, paidToday, paidAll, feesAll, total: items.length,
      nombaLast, paystackLast,
      nombaPending, nombaDone,
      paystackPending, paystackDone,
    };
  }, [items]);

  /* ----- filtered + paged ----- */
  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "All") r = r.filter((w) => w.status === filter);
    const qq = q.trim().toLowerCase();
    if (qq) r = r.filter((w) =>
      (w.user_name || "").toLowerCase().includes(qq)
      || (w.user_phone || "").toLowerCase().includes(qq)
      || (w.account_number || "").toLowerCase().includes(qq)
      || (w.bank_name || "").toLowerCase().includes(qq)
      || (w.nomba_transfer_ref || "").toLowerCase().includes(qq)
      || (w.paystack_transfer_ref || "").toLowerCase().includes(qq)
    );
    return r;
  }, [items, filter, q]);

  useEffect(() => { setPage(1); }, [filter, q, pageSize]);
  const effPageSize = pageSize === "all" ? Math.max(1, filtered.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effPageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * effPageSize, safePage * effPageSize),
    [filtered, safePage, effPageSize],
  );

  /* ----- actions ----- */
  const refreshOne = async (w) => {
    setRefreshingId(w.id);
    try {
      const { data } = await api.post(`/admin/withdrawals/${w.id}/refresh-status`);
      const action = data?._refresh || "no_op";
      if (action === "marked_paid") toast.success("Confirmed PAID by provider");
      else if (action === "marked_rejected_refunded") toast.warning("Provider reports FAILED — user refunded");
      else if (action === "still_pending") toast.info("Still pending at provider");
      else if (action === "no_provider_ref") toast.info("No provider reference — nothing to poll");
      else if (action === "already_final") toast.info("Already finalised");
      else toast.info(`Refresh: ${action}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Refresh failed");
    } finally { setRefreshingId(null); }
  };

  const pollAll = async () => {
    setPolling(true);
    try {
      const { data } = await api.post("/admin/withdrawals/poll-pending");
      toast.success(`Polled ${data.refreshed} · paid ${data.marked_paid} · rejected ${data.marked_rejected}`);
      load();
      loadFloat({ silent: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Poll failed");
    } finally { setPolling(false); }
  };

  const openPay = (w) => {
    setToolkit(null);
    setTarget(w);
    setReason(`Withdrawal payout to ${w.account_name}`);
  };

  const payVia = async (gw) => {
    setBusy(true);
    try {
      const names = { nomba: "Nomba", paystack: "Paystack", juntpay: "JuntPay", duplo: "Duplo", kora: "Kora", nekpay: "Nekpay" };
      await api.post(`/admin/withdrawals/${target.id}/pay-${gw}`, { reason });
      toast.success(`Paid via ${names[gw] || gw}`);
      setTarget(null);
      setReason("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Payment failed");
    } finally { setBusy(false); }
  };

  const act = async (w, action) => {
    const note = window.prompt(action === "approve" ? "Optional note (e.g. transfer ref)" : "Reason for rejecting?", "");
    if (action === "reject" && note === null) return;
    try {
      await api.post(`/admin/withdrawals/${w.id}/${action}`, { note });
      toast.success(action === "approve" ? "Withdrawal marked paid" : "Rejected — user refunded");
      setToolkit(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const [backfillingId, setBackfillingId] = useState(null);
  const backfillNomba = async (w) => {
    setBackfillingId(w.id);
    try {
      const { data } = await api.post(`/admin/withdrawals/${w.id}/backfill-nomba-id`);
      if (data.status === "ok") {
        toast.success(`Found Nomba ID · ${data.refresh_result === "marked_paid" ? "marked PAID" : data.withdrawal_status}`);
        load();
        setToolkit(null);
      } else if (data.status === "skip") {
        toast.info(`Already has Nomba ID: ${data.value}`);
      } else {
        toast.warning(`No match: ${data.reason} (scanned ${data.scanned || 0})`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Backfill failed");
    } finally {
      setBackfillingId(null);
    }
  };

  const resolveFromNomba = async (w) => {
    const txnId = window.prompt(
      "Paste Nomba transactionId (visible in Nomba dashboard):\nExpected format like API-TRANSFER-XXXX-XXXX or AAP-WALLET_T-XXXX-...",
      "",
    );
    if (!txnId) return;
    try {
      const { data } = await api.post(`/admin/withdrawals/${w.id}/resolve-from-nomba`, {
        nomba_transaction_id: txnId.trim(),
      });
      const result = data._refresh || "polled";
      toast.success(`Resolved · ${result === "marked_paid" ? "marked PAID" : data.status}`);
      load();
      setToolkit(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resolve failed");
    }
  };

  const [bulkBackfilling, setBulkBackfilling] = useState(false);

  // Surface count of pending records flagged with insufficient_float so admins can act fast.
  const insufficientFloatRows = useMemo(
    () => items.filter((w) => w.status === "pending" && w.insufficient_float),
    [items],
  );
  const scrollToFirstInsufficient = () => {
    setFilter("pending");
    setTimeout(() => {
      const target = insufficientFloatRows[0];
      if (target) {
        const el = document.querySelector(`[data-testid="withdrawal-row-${target.id}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
  };

  const [bulkRetrying, setBulkRetrying] = useState(false);
  const bulkRetryNomba = async () => {
    if (!window.confirm("Retry every PENDING withdrawal that doesn't have a Nomba transaction id yet?\n\nThis re-submits each one to Nomba using their resolved account name. Float will be debited as each succeeds.")) return;
    setBulkRetrying(true);
    try {
      const { data } = await api.post("/admin/withdrawals/retry-pending-nomba");
      toast.success(
        `Retried ${data.scanned} · paid ${data.paid} · processing ${data.processing} · failed ${data.failed} · skipped ${data.skipped}`,
        { duration: 8000 },
      );
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk retry failed");
    } finally {
      setBulkRetrying(false);
    }
  };

  const bulkBackfillStuck = async () => {
    if (!window.confirm("Scan Nomba's transaction history and link any matching pending withdrawals? This may take a minute.")) return;
    setBulkBackfilling(true);
    try {
      const { data } = await api.post("/admin/withdrawals/backfill-all-stuck");
      toast.success(
        `Scanned ${data.scanned} · matched ${data.matched} · marked PAID ${data.marked_paid} · no match ${data.no_match}`,
        { duration: 8000 },
      );
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk backfill failed");
    } finally {
      setBulkBackfilling(false);
    }
  };

  const QUICK_SIZES = [5, 20, 50, 100, "all"];

  return (
    <AdminLayout title="">
      {/* ====== Hero ====== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#9F0F50] via-[#C81A6E] to-[#E5097F] text-white p-6 md:p-8" data-testid="withdrawals-hero">
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-12 left-1/3 w-40 h-40 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <ArrowUpFromLine className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-extrabold text-2xl md:text-3xl leading-tight">Withdrawals</div>
            <div className="text-white/85 text-xs md:text-sm mt-1">
              {stats.total} total · approve, reject and track payouts via Nomba & Paystack
            </div>
          </div>
        </div>
      </div>

      {/* ====== Stats ====== */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
        <StatCard tone="warn" icon={Hourglass} label="Pending" value={stats.pendingCount} sub="Awaiting approval" testid="stat-pending" />
        <StatCard tone="success" icon={CheckCircle2} label="Paid today" value={formatNaira(stats.paidToday)} sub={`Since 00:00 Lagos`} testid="stat-paid-today" />
        <StatCard tone="accent" icon={Wallet} label="Paid · all time" value={formatNaira(stats.paidAll)} sub="Settled withdrawals" testid="stat-paid-all" />
        <StatCard tone="success" icon={Banknote} label="Fees collected" value={formatNaira(stats.feesAll)} sub="Platform revenue · all time" testid="stat-fees-all" />
        <StatCard tone="brand" icon={ArrowUpFromLine} label="All withdrawals" value={stats.total} sub="All statuses combined" testid="stat-total" />
      </div>

      {/* ====== Filter + search + refresh-all ====== */}
      <div className="card-soft p-3 mt-5 flex items-center gap-3 flex-wrap" data-testid="withdrawals-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="withdrawals-status-filter"
          className="input-base !py-2 !w-[140px] text-sm font-semibold">
          {["All", "pending", "processing", "paid", "rejected"].map((s) => (
            <option key={s} value={s}>{s === "All" ? "All" : s}</option>
          ))}
        </select>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, account, or payout reference…"
            data-testid="withdrawals-search-input"
            className="w-full pl-10 input-base" />
        </div>
        <button onClick={pollAll} disabled={polling}
          data-testid="poll-all-btn"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${polling ? "animate-spin" : ""}`} /> {polling ? "Polling…" : "Refresh all pending"}
        </button>
        <button onClick={bulkBackfillStuck} disabled={bulkBackfilling}
          data-testid="bulk-backfill-btn"
          title="Scan Nomba transaction history and link any pending withdrawals paid off-system"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--accent-main)] text-white hover:bg-[color:var(--accent-hover)] disabled:opacity-50">
          <Wallet className={`w-4 h-4 ${bulkBackfilling ? "animate-pulse" : ""}`} /> {bulkBackfilling ? "Scanning…" : "Backfill from Nomba"}
        </button>
        <button onClick={bulkRetryNomba} disabled={bulkRetrying}
          data-testid="bulk-retry-nomba-btn"
          title="Re-submit every PENDING withdrawal that never got a Nomba transaction id (e.g. rejected by old name-check)"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--success)] text-white hover:opacity-90 disabled:opacity-50">
          <ArrowUpFromLine className={`w-4 h-4 ${bulkRetrying ? "animate-bounce" : ""}`} /> {bulkRetrying ? "Retrying…" : "Retry all pending"}
        </button>
      </div>

      {/* ====== Gateway status ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <GatewayStatusCard
          name="NOMBA"
          last={stats.nombaLast}
          pendingCount={stats.nombaPending}
          doneCount={stats.nombaDone}
          balance={nombaFloat?.balance}
          balanceLive={nombaFloat?.live}
          balanceError={nombaFloat?.error}
          onRefreshBalance={() => loadFloat()}
          refreshing={floatRefreshing}
        />
        <GatewayStatusCard
          name="PAYSTACK"
          last={stats.paystackLast}
          pendingCount={stats.paystackPending}
          doneCount={stats.paystackDone}
          balance={paystackFloat?.balance}
          balanceLive={paystackFloat?.live}
          balanceError={paystackFloat?.error}
          onRefreshBalance={() => loadPaystackFloat()}
          refreshing={paystackRefreshing}
        />
        <GatewayStatusCard
          name="JUNTPAY"
          balance={juntpayFloat?.balance}
          balanceError={juntpayFloat?.error}
          onRefreshBalance={() => loadJuntpayFloat()}
          refreshing={juntpayRefreshing}
        />
        <GatewayStatusCard
          name="DUPLO"
          balance={duploFloat?.balance}
          balanceError={duploFloat?.error}
          onRefreshBalance={() => loadDuploFloat()}
          refreshing={duploRefreshing}
        />
        <GatewayStatusCard
          name="KORA"
          balance={koraFloat?.balance}
          balanceError={koraFloat?.error}
          onRefreshBalance={() => loadKoraFloat()}
          refreshing={koraRefreshing}
        />
      </div>

      {/* ====== Insufficient Nomba float banner ====== */}
      {insufficientFloatRows.length > 0 && (
        <button
          type="button"
          onClick={scrollToFirstInsufficient}
          data-testid="insufficient-float-banner"
          className="mt-3 w-full text-left rounded-2xl border border-[color:var(--error)]/30 bg-[color:var(--error-soft)] p-4 flex items-center gap-3 hover:bg-[color:var(--error-soft)]/80 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-[color:var(--error)]/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[color:var(--error)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[color:var(--error)] text-sm">
              Nomba float warning · {insufficientFloatRows.length} pending payout{insufficientFloatRows.length === 1 ? "" : "s"} blocked
            </div>
            <div className="text-[11px] text-[color:var(--text-secondary)] mt-0.5">
              Top up your Nomba wallet, then click <span className="font-bold">Refresh all pending</span> to retry. Click anywhere on this banner to jump to the affected rows.
            </div>
          </div>
          <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold text-[color:var(--error)] underline">View</span>
        </button>
      )}

      {/* ====== Quick page size ====== */}
      <div className="card-soft p-3 mt-3 flex items-center gap-3 flex-wrap" data-testid="withdrawals-quickrows">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)]">Rows per page</span>
        {QUICK_SIZES.map((n) => {
          const active = pageSize === n;
          return (
            <button key={String(n)} onClick={() => setPageSize(n)}
              data-testid={`quick-size-${n}`}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${active
                ? "bg-[color:var(--brand)] text-white"
                : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70"}`}>
              {n === "all" ? "All" : n}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-[color:var(--text-tertiary)]">
          Showing <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{pageItems.length}</span> of <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{filtered.length}</span>
        </span>
      </div>

      {/* ====== Table ====== */}
      <div className="card-soft overflow-hidden mt-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="admin-withdrawals-table">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="text-left p-4">User</th>
                <th className="text-right p-4">Amount</th>
                <th className="text-left p-4 hidden md:table-cell">Bank</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4 hidden xl:table-cell">Gateway ref</th>
                <th className="text-left p-4 hidden lg:table-cell">Date</th>
                <th className="text-right p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {q || filter !== "All" ? "No withdrawals match this filter." : "No withdrawals yet."}
                </td></tr>
              )}
              {pageItems.map((w) => {
                // Gateway-side ID only (NOT our internal merchant ref like ntr_xxx / ptr_xxx).
                // Nomba: `nomba_transaction_id` (AAP-WALLET...). Paystack: `paystack_transfer_code` (TRF_...).
                const ref = w.nomba_transaction_id || w.paystack_transfer_code;
                const gw = (w.nomba_transfer_ref || w.nomba_transaction_id) ? "nomba" : (w.paystack_transfer_ref || w.paystack_transfer_code) ? "paystack" : null;
                const gatewayName = w.gateway || w.method || null;
                return (
                  <tr key={w.id} className="border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors" data-testid={`withdrawal-row-${w.id}`}>
                    <td className="p-4 max-w-[200px]">
                      <Link to={`/pentest/fuser/users/${w.user_id}`} className="flex items-center gap-2.5 group min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(w.user_id) }}>
                          {(w.user_name || "?").trim()[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[color:var(--accent-main)] group-hover:underline truncate">{w.user_name || "—"}</div>
                          <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate">{w.user_phone}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="font-display font-bold tabular-nums leading-tight">{formatNaira(w.amount)}</div>
                      {Number(w.fee_amount) > 0 && (
                        <div className="text-[10px] text-[color:var(--text-tertiary)] tabular-nums mt-0.5" data-testid={`row-fee-net-${w.id}`}>
                          −{formatNaira(w.fee_amount)} · net <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(w.net_amount ?? (w.amount - w.fee_amount))}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 hidden md:table-cell max-w-[200px]">
                      {gatewayName && (
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider mb-1 bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                          {gatewayName}
                        </span>
                      )}
                      <div className="text-[color:var(--text-primary)] truncate font-semibold text-xs">{w.bank_name}</div>
                      <div className="font-mono text-[11px] text-[color:var(--text-primary)] truncate">{w.account_number}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill w={w} />
                        {(w.status === "pending" || w.status === "processing") && (
                          <LastPolledBadge iso={w.last_polled_at} testid={`last-polled-${w.id}`} />
                        )}
                      </div>
                    </td>
                    <td className="p-4 hidden xl:table-cell max-w-[160px]">
                      {ref ? (
                        <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate" title={ref}>{ref}</div>
                      ) : gw ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] border border-[color:var(--border-default)]"
                          title={`Gateway-side ${gw === "paystack" ? "transfer_code" : "transactionId"} not captured yet. Use “Backfill from Nomba” or Toolkit to fetch it.`}
                          data-testid={`gateway-ref-missing-${w.id}`}
                        >
                          awaiting
                        </span>
                      ) : (
                        <span className="text-[10px] text-[color:var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="p-4 hidden lg:table-cell text-[11px] text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(w.created_at)}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setToolkit(w)}
                        data-testid={`toolkit-${w.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[color:var(--brand-soft)] text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]/80 transition-colors"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" /> Toolkit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && pageSize !== "all" && (
          <Pagination
            page={page}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={effPageSize}
            testidPrefix="withdrawals-page"
          />
        )}
      </div>

      {/* ====== TOOLKIT MODAL (drill-in detail) ====== */}
      <ToolkitModal
        w={toolkit}
        onClose={() => setToolkit(null)}
        onRefresh={refreshOne}
        refreshingId={refreshingId}
        onPay={openPay}
        onApprove={(w) => act(w, "approve")}
        onReject={(w) => act(w, "reject")}
        onBackfillNomba={backfillNomba}
        onResolveFromNomba={resolveFromNomba}
        backfillingId={backfillingId}
      />

      {/* ====== PAY DIALOG ====== */}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Pay withdrawal</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-[color:var(--surface-alt)] p-3">
                <div className="text-[color:var(--text-primary)] font-semibold">{target.user_name} · {formatNaira(target.amount)}</div>
                <div className="font-mono text-xs text-[color:var(--text-primary)]">{target.account_number}</div>
                <div className="text-xs text-[color:var(--text-secondary)]">Bank: <span className="font-semibold">{target.bank_name} · {target.account_name}</span></div>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Reason / narration</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                data-testid="payout-reason-input"
                className="w-full input-base" />
            </div>
          )}
          <DialogFooter className="gap-3 flex-wrap">
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => payVia("nomba")} disabled={busy} data-testid="pay-nomba-btn">{busy ? "…" : "Nomba"}</Button>
            <Button onClick={() => payVia("paystack")} disabled={busy} data-testid="pay-paystack-btn">{busy ? "…" : "Paystack"}</Button>
            <Button onClick={() => payVia("juntpay")} disabled={busy} data-testid="pay-juntpay-btn">{busy ? "…" : "JuntPay"}</Button>
            <Button onClick={() => payVia("duplo")} disabled={busy} data-testid="pay-duplo-btn">{busy ? "…" : "Duplo"}</Button>
            <Button onClick={() => payVia("kora")} disabled={busy} data-testid="pay-kora-btn">{busy ? "…" : "Kora"}</Button>
            <Button onClick={() => payVia("nekpay")} disabled={busy} data-testid="pay-nekpay-btn">{busy ? "…" : "Nekpay"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

/* ===========================================================================
 * ToolkitModal — drill-in detail (matches the design reference)
 * =========================================================================*/

function ToolkitModal({ w, onClose, onRefresh, refreshingId, onPay, onApprove, onReject, onBackfillNomba, onResolveFromNomba, backfillingId }) {
  if (!w) return null;
  const isFinal = w.status === "paid" || w.status === "rejected";
  const headerTone = w.status === "paid"
    ? "from-[#0f7a4f] via-[#10996c] to-[#10B981]"
    : w.status === "rejected"
      ? "from-[#7a1f2b] via-[#a31931] to-[#EF4444]"
      : "from-[#7c4807] via-[#a36a08] to-[#F59E0B]";
  const statusBadge = w.status === "paid"
    ? "bg-[#054128]/80 text-[#10B981] border-[#10B981]/30"
    : w.status === "rejected"
      ? "bg-[#3a0c12]/70 text-[#EF4444] border-[#EF4444]/30"
      : "bg-[#3f290a]/70 text-[#F59E0B] border-[#F59E0B]/30";
  const gw = (w.nomba_transfer_ref || w.nomba_transaction_id) ? "nomba" : (w.paystack_transfer_ref || w.paystack_transfer_code) ? "paystack" : null;
  // Gateway-side ID (Nomba transactionId / Paystack transfer_code) — NOT our merchant ref.
  const providerRef = w.nomba_transaction_id || w.paystack_transfer_code;
  // Our app-side merchant reference (what we sent the gateway).
  const merchantRef = w.nomba_transfer_ref || w.paystack_transfer_ref;

  return (
    <Dialog open={!!w} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0" data-testid="withdrawal-toolkit-modal">
        {/* Gradient header */}
        <div className={`relative bg-gradient-to-br ${headerTone} text-white p-6`}>
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <Link to={`/pentest/fuser/users/${w.user_id}`}
              data-testid="toolkit-profile-link"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 backdrop-blur hover:bg-white/25 text-white">
              <UserIcon className="w-3.5 h-3.5" /> Profile
            </Link>
            <button onClick={onClose} data-testid="toolkit-close"
              className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <ArrowUpFromLine className="w-6 h-6" />
            </div>
            <div className="min-w-0 mt-1">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">Withdrawal</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl tabular-nums leading-none mt-1">
                {formatNaira(w.amount)}
              </div>
              {Number(w.fee_amount) > 0 ? (
                <div className="text-white/85 text-xs mt-2 space-y-0.5" data-testid="toolkit-fee-breakdown">
                  <div>Platform fee ({Number(w.fee_percent || 0)}%) <span className="font-bold tabular-nums">− {formatNaira(w.fee_amount)}</span></div>
                  <div>Net to bank <span className="font-bold tabular-nums">{formatNaira(w.net_amount ?? (w.amount - w.fee_amount))}</span></div>
                </div>
              ) : (
                <div className="text-white/85 text-xs mt-2">
                  Net <span className="font-bold tabular-nums">{formatNaira(w.amount)}</span>
                </div>
              )}
              <div className="mt-3">
                <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusBadge}`}>
                  {w.status === "paid" ? "completed" : w.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5 bg-[color:var(--surface)]">
          {/* Customer */}
          <Section icon={UserIcon} label="Customer">
            <Link to={`/pentest/fuser/users/${w.user_id}`}
              data-testid="toolkit-customer-link"
              className="card-soft p-3 flex items-center gap-3 group hover:bg-[color:var(--surface-alt)]/60 transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(w.user_id) }}>
                {(w.user_name || "?").trim()[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[color:var(--text-primary)] truncate">{w.user_name || "—"}</div>
                <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">{w.user_phone}</div>
              </div>
              <span className="text-[color:var(--accent-main)] text-xs font-bold group-hover:underline shrink-0 inline-flex items-center gap-1">
                View <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
          </Section>

          {/* Payout destination */}
          <Section icon={Banknote} label="Payout destination">
            <div className="card-soft p-4">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{w.bank_name || "—"}</div>
              <div className="font-display font-extrabold text-2xl tabular-nums mt-1 text-[color:var(--text-primary)]">{w.account_number}</div>
              <div className="text-xs text-[color:var(--text-primary)] uppercase font-semibold tracking-wider mt-1">{w.account_name}</div>
            </div>
          </Section>

          {/* References */}
          <Section icon={Copy} label="References">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="card-soft p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Our reference</div>
                <div className="flex items-center mt-1 min-w-0">
                  <span className="font-mono text-xs text-[color:var(--text-primary)] truncate" data-testid="toolkit-our-ref">{w.id}</span>
                  <CopyButton text={w.id} testid="toolkit-copy-our-ref" />
                </div>
              </div>
              <div className="card-soft p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">
                  {gw === "paystack" ? "Paystack transfer code" : "Nomba transaction ID"}
                </div>
                <div className="flex items-center mt-1 min-w-0">
                  <span className="font-mono text-xs text-[color:var(--text-primary)] truncate" data-testid="toolkit-provider-ref">{providerRef || "—"}</span>
                  {providerRef && <CopyButton text={providerRef} testid="toolkit-copy-provider-ref" />}
                </div>
                {!providerRef && gw && (
                  <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1">
                    Not captured yet — use {gw === "nomba" ? "the recovery tool below" : "Toolkit"} to backfill.
                  </div>
                )}
              </div>
              {merchantRef && (
                <div className="card-soft p-3 sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">
                    Merchant ref sent to {gw === "paystack" ? "Paystack" : "Nomba"}
                  </div>
                  <div className="flex items-center mt-1 min-w-0">
                    <span className="font-mono text-xs text-[color:var(--text-primary)] truncate" data-testid="toolkit-merchant-ref">{merchantRef}</span>
                    <CopyButton text={merchantRef} testid="toolkit-copy-merchant-ref" />
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section icon={CalendarDays} label="Timeline">
            <div className="card-soft p-4 space-y-3">
              <TimelineRow color="brand" label="Requested" ts={w.created_at} />
              {w.updated_at && w.updated_at !== w.created_at && (
                <TimelineRow color="brand" label="Status updated" ts={w.updated_at} />
              )}
              {w.status === "paid" && <TimelineRow color="success" label="Disbursed" ts={w.updated_at || w.created_at} />}
              {w.status === "rejected" && <TimelineRow color="error" label="Rejected · refunded" ts={w.updated_at || w.created_at} />}
            </div>
            {w.admin_note && (
              <div className="rounded-lg bg-[color:var(--surface-alt)] p-3 text-xs text-[color:var(--text-secondary)] italic mt-2">
                <span className="font-bold not-italic text-[color:var(--text-primary)] mr-1">Note:</span>
                {w.admin_note}
              </div>
            )}
          </Section>

          {/* Resolution tools */}
          {!isFinal && (
            <Section icon={RefreshCw} label="Resolution tools">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(providerRef || merchantRef) && (
                  <ToolButton
                    onClick={() => onRefresh(w)}
                    busy={refreshingId === w.id}
                    icon={RefreshCw}
                    label={`Check ${gw === "paystack" ? "Paystack" : "Nomba"} status`}
                    tone="brand"
                    testid="tool-check-status"
                  />
                )}
                {w.status === "pending" && (
                  <>
                    <ToolButton onClick={() => onPay(w)} icon={Send} label="Pay" tone="brand" testid="tool-pay" />
                  </>
                )}
                {/* Mark disbursed / Refund available for BOTH pending and processing */}
                <ToolButton onClick={() => onApprove(w)} icon={ClipboardCheck} label="Mark disbursed" tone="success" testid="tool-mark-disbursed" />
                <ToolButton onClick={() => onReject(w)} icon={Undo2} label="Refund to wallet" tone="error" testid="tool-refund" />
              </div>
              {w.status === "processing" && (
                <div className="mt-3 rounded-lg bg-[color:var(--gold-soft)]/40 border border-[color:var(--warning)]/30 p-3 text-[11px] text-[color:var(--text-secondary)] flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-[color:var(--warning)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[color:var(--text-primary)]">Stuck in processing?</span> If the provider keeps reporting <span className="font-mono">PENDING</span> but the funds have arrived in the customer's bank, click <span className="font-bold">Mark disbursed</span>. If the funds never arrived and the provider won't return them, click <span className="font-bold">Refund to wallet</span>.
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Nomba ID recovery — for legacy or off-system records without nomba_transaction_id */}
          {!isFinal && !w.nomba_transaction_id && (
            <Section icon={Wallet} label="Nomba ID recovery">
              <div className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-alt)]/40 p-3 mb-3 text-[11px] text-[color:var(--text-secondary)]">
                If this withdrawal was paid via Nomba (either through this app or directly from the Nomba dashboard), scan Nomba's transaction history to link it. Once linked, status will auto-flip to <span className="font-bold">paid</span>.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ToolButton
                  onClick={() => onBackfillNomba?.(w)}
                  busy={backfillingId === w.id}
                  icon={Wallet}
                  label="Auto-backfill from Nomba"
                  tone="brand"
                  testid="tool-backfill-nomba"
                />
                <ToolButton
                  onClick={() => onResolveFromNomba?.(w)}
                  icon={Copy}
                  label="Paste Nomba ID manually"
                  tone="warn"
                  testid="tool-paste-nomba-id"
                />
              </div>
            </Section>
          )}

          {/* Show recovered Nomba ID if present */}
          {w.nomba_transaction_id && (
            <Section icon={BadgeCheck} label="Nomba transactionId (recovered)">
              <div className="card-soft p-3 flex items-center">
                <span className="font-mono text-xs text-[color:var(--text-primary)] truncate" data-testid="toolkit-nomba-txn-id">
                  {w.nomba_transaction_id}
                </span>
                <CopyButton text={w.nomba_transaction_id} testid="copy-nomba-txn-id" />
              </div>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon: Icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-[color:var(--text-tertiary)] mb-2">
        <Icon className="w-3 h-3" /> {label}
      </div>
      {children}
    </div>
  );
}

function TimelineRow({ color, label, ts }) {
  const dot = {
    brand: "bg-[color:var(--brand)]",
    success: "bg-[color:var(--success)]",
    error: "bg-[color:var(--error)]",
  }[color];
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
        <span className="text-xs font-semibold text-[color:var(--text-primary)] truncate">{label}</span>
      </div>
      <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums whitespace-nowrap">{formatDate(ts)}</span>
    </div>
  );
}

function ToolButton({ onClick, busy, icon: Icon, label, tone, testid }) {
  const tones = {
    brand:   "bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white",
    warn:    "bg-[color:var(--warning)] hover:opacity-90 text-white",
    success: "bg-[color:var(--success-soft)] text-[color:var(--success)] hover:bg-[color:var(--success-soft)]/70 border border-[color:var(--success)]/20",
    error:   "bg-[color:var(--error-soft)] text-[color:var(--error)] hover:bg-[color:var(--error-soft)]/70 border border-[color:var(--error)]/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testid}
      className={`px-4 py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      <Icon className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> {label}
    </button>
  );
}
