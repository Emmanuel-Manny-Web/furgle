import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import {
  Users, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Clock, DollarSign,
  CircleCheck, CircleAlert, ShieldAlert, ScanSearch, Banknote, ChevronRight,
  CalendarRange, ArrowUpRight, X, Search, Radio, RefreshCw, Activity, CheckCircle2, XCircle, MinusCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCachedData } from "@/hooks/useCachedData";

function FixieUsageCard() {
  const [d, setD] = useState(null);     // { count, limit, synced_at }
  const [busy, setBusy] = useState("");  // "sync" | "reset" | "limit" | ""
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/fixie/usage")
      .then(({ data }) => { if (!cancelled) setD(data); })
      .catch(() => { if (!cancelled) setD({ count: 0, limit: 25000, synced_at: "" }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (!d) {
    return (
      <div className="card-soft p-6 mt-5 animate-pulse" data-testid="fixie-usage-loading">
        <div className="h-4 w-48 bg-[color:var(--surface-alt)] rounded" />
        <div className="h-8 w-32 bg-[color:var(--surface-alt)] rounded mt-4" />
        <div className="h-2 w-full bg-[color:var(--surface-alt)] rounded-full mt-4" />
      </div>
    );
  }

  const limit = Math.max(1, Number(d.limit) || 25000);
  const count = Math.max(0, Number(d.count) || 0);
  const pct = Math.min(100, (count / limit) * 100);
  const left = Math.max(0, limit - count);

  // Health: green < 70%, amber 70-90%, red > 90%
  let health, healthClass, barClass;
  if (pct >= 90) {
    health = "CRITICAL";
    healthClass = "bg-[color:var(--error-soft)] text-[color:var(--error)]";
    barClass = "bg-[color:var(--error)]";
  } else if (pct >= 70) {
    health = "WARNING";
    healthClass = "bg-[color:var(--gold-soft)] text-[color:var(--warning)]";
    barClass = "bg-[color:var(--warning)]";
  } else {
    health = "HEALTHY";
    healthClass = "bg-[color:var(--success-soft)] text-[color:var(--success)]";
    barClass = "bg-[color:var(--success)]";
  }

  const onSync = async () => {
    const raw = window.prompt(
      `Paste the live request count from your Fixie dashboard.\n\nCurrent: ${count.toLocaleString()}\nLimit: ${limit.toLocaleString()}`,
      String(count),
    );
    if (raw === null) return;
    const n = Number(String(raw).replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) { toast.error("Enter a valid number"); return; }
    setBusy("sync");
    try {
      await api.post("/admin/fixie/sync", { count: Math.floor(n) });
      toast.success(`Synced to ${Math.floor(n).toLocaleString()}`);
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally { setBusy(""); }
  };

  const onReset = async () => {
    if (!window.confirm("Reset the Fixie usage counter to 0?\n\nUse this at the start of a new billing cycle.")) return;
    setBusy("reset");
    try {
      await api.post("/admin/fixie/reset");
      toast.success("Counter reset to 0");
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reset failed");
    } finally { setBusy(""); }
  };

  const onChangeLimit = async () => {
    const raw = window.prompt(
      `Update the Fixie monthly request limit. The % bar will track the new cap.\n\nCurrent: ${limit.toLocaleString()} / month`,
      String(limit),
    );
    if (raw === null) return;
    const n = Number(String(raw).replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) { toast.error("Enter a positive number"); return; }
    setBusy("limit");
    try {
      await api.post("/admin/fixie/limit", { limit: Math.floor(n) });
      toast.success(`Limit set to ${Math.floor(n).toLocaleString()}/month`);
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update limit");
    } finally { setBusy(""); }
  };

  return (
    <div className="card-soft p-6 mt-5" data-testid="fixie-usage-card">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[color:var(--brand-soft)] text-[color:var(--brand)] shrink-0">
          <Radio className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-display font-bold text-base text-[color:var(--text-primary)]">
              Fixie proxy usage · JuntPay + Nekpay
            </div>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${healthClass}`}
              data-testid="fixie-health-badge"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" /> {health}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-3 flex-wrap">
            <div className="font-display font-extrabold text-3xl text-[color:var(--text-primary)] tabular-nums leading-none" data-testid="fixie-count">
              {count.toLocaleString()}
            </div>
            <div className="text-xs text-[color:var(--text-secondary)]">
              / <span className="font-semibold text-[color:var(--text-primary)] tabular-nums">{limit.toLocaleString()}</span> requests
              <span className="mx-1.5 text-[color:var(--text-tertiary)]">·</span>
              <span className="font-semibold text-[color:var(--text-primary)] tabular-nums">{left.toLocaleString()}</span> left
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 rounded-full bg-[color:var(--surface-alt)] overflow-hidden" data-testid="fixie-progress">
          <div className={`h-full ${barClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[11px] text-[color:var(--text-tertiary)] mt-2 tabular-nums" data-testid="fixie-pct">
          {pct.toFixed(2)}% used
        </div>
      </div>

      {/* Sync row */}
      <div className="mt-5 pt-5 border-t border-[color:var(--border-default)] flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="text-xs text-[color:var(--text-secondary)]">
            Synced <span className="font-semibold text-[color:var(--text-primary)]">{d.synced_at ? relativeTime(d.synced_at) : "never"}</span>
          </div>
          <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1 max-w-xl">
            Counts every outbound request routed through the Fixie proxy (JuntPay + Nekpay). Other gateways use the LumenHub proxy. Use Sync to reconcile with your Fixie dashboard.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onSync}
            disabled={!!busy}
            data-testid="fixie-sync-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy === "sync" ? "animate-spin" : ""}`} />
            Sync with Fixie
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={!!busy}
            data-testid="fixie-reset-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-[color:var(--border-default)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-alt)] text-[color:var(--text-primary)] disabled:opacity-50 transition-colors"
          >
            Reset to 0
          </button>
        </div>
      </div>

      {/* Limit row */}
      <div className="mt-4 pt-4 border-t border-[color:var(--border-default)] flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="text-xs text-[color:var(--text-secondary)]">
            Plan limit: <span className="font-semibold text-[color:var(--text-primary)] tabular-nums">{limit.toLocaleString()}</span> requests / month
          </div>
          <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1 max-w-xl">
            Upgraded your Fixie plan? Update the limit here so the % bar tracks the new cap.
          </div>
        </div>
        <button
          type="button"
          onClick={onChangeLimit}
          disabled={!!busy}
          data-testid="fixie-change-limit-btn"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-[color:var(--border-default)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-alt)] text-[color:var(--text-primary)] disabled:opacity-50 transition-colors"
        >
          Change limit
        </button>
      </div>
    </div>
  );
}

const GATEWAY_META = [
  { key: "paystack", label: "Paystack", sub: "Card · transfer · checkout" },
  { key: "nomba",    label: "Nomba",    sub: "Virtual account · bank pay-in" },
  { key: "marasoft", label: "Marasoft", sub: "Dynamic bank accounts" },
  { key: "qorepay",  label: "QorePay",  sub: "Card · checkout" },
  { key: "budpay",   label: "BudPay",   sub: "Bank transfer" },
  { key: "juntpay",  label: "JuntPay",  sub: "Bank transfer · NGN" },
  { key: "duplo",    label: "Duplo",    sub: "Checkout · NGN" },
  { key: "kora",     label: "Kora",     sub: "Bank transfer · NGN" },
];

function GatewayHealthCard() {
  // Map keyed by gateway → last test result; null = never tested
  const [results, setResults] = useState({});
  const [testing, setTesting] = useState(""); // gateway currently being tested, or "all"

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/gateways/test")
      .then(({ data }) => { if (!cancelled) setResults(data || {}); })
      .catch(() => { if (!cancelled) setResults({}); });
    return () => { cancelled = true; };
  }, []);

  const runOne = async (gw) => {
    setTesting(gw);
    try {
      const { data } = await api.post(`/admin/gateways/test/${gw}`);
      setResults((prev) => ({ ...prev, [gw]: data }));
      if (data.ok) toast.success(`${gw}: ${data.message}`, { duration: 4000 });
      else toast.error(`${gw}: ${data.message}`, { duration: 6000 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to test ${gw}`);
    } finally {
      setTesting("");
    }
  };

  const runAll = async () => {
    setTesting("all");
    // Sequential — most gateways share the Fixie proxy, so parallel runs would
    // skew latency numbers and risk rate-limits.
    for (const g of GATEWAY_META) {
      try {
        const { data } = await api.post(`/admin/gateways/test/${g.key}`);
        setResults((prev) => ({ ...prev, [g.key]: data }));
      } catch (e) {
        setResults((prev) => ({ ...prev, [g.key]: { ok: false, message: "Request error", tested_at: new Date().toISOString() } }));
      }
    }
    setTesting("");
    toast.success("All gateways tested");
  };

  return (
    <div className="card-soft p-6 mt-5" data-testid="gateway-health-card">
      <div className="flex items-start gap-3 flex-wrap mb-4">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[color:var(--brand-soft)] text-[color:var(--brand)] shrink-0">
          <Activity className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-base text-[color:var(--text-primary)]">
            Gateway connection health
          </div>
          <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5 max-w-xl">
            Ping each payment gateway with a lightweight, non-destructive call to confirm live credentials and network path are working.
          </div>
        </div>
        <button
          type="button"
          onClick={runAll}
          disabled={!!testing}
          data-testid="test-all-gateways-btn"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${testing === "all" ? "animate-spin" : ""}`} />
          Test all
        </button>
      </div>

      <div className="space-y-2">
        {GATEWAY_META.map((g) => {
          const r = results[g.key];
          const isTesting = testing === g.key || testing === "all";
          let icon, pillCls, pillText;
          if (isTesting) {
            icon = <RefreshCw className="w-4 h-4 animate-spin text-[color:var(--text-secondary)]" />;
            pillCls = "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]";
            pillText = "Testing…";
          } else if (!r) {
            icon = <MinusCircle className="w-4 h-4 text-[color:var(--text-tertiary)]" />;
            pillCls = "bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)]";
            pillText = "Untested";
          } else if (r.ok) {
            icon = <CheckCircle2 className="w-4 h-4 text-[color:var(--success)]" />;
            pillCls = "bg-[color:var(--success-soft)] text-[color:var(--success)]";
            pillText = "Healthy";
          } else {
            icon = <XCircle className="w-4 h-4 text-[color:var(--error)]" />;
            pillCls = "bg-[color:var(--error-soft)] text-[color:var(--error)]";
            pillText = "Failed";
          }

          return (
            <div
              key={g.key}
              className="flex items-start gap-3 p-3 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-alt)]"
              data-testid={`gateway-row-${g.key}`}
            >
              <div className="mt-0.5 shrink-0">{icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[color:var(--text-primary)]">{g.label}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${pillCls}`} data-testid={`gateway-pill-${g.key}`}>
                    {pillText}
                  </span>
                  {r?.latency_ms != null && (
                    <span className="text-[10px] text-[color:var(--text-tertiary)] tabular-nums">
                      {r.latency_ms} ms
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5 break-words" data-testid={`gateway-msg-${g.key}`}>
                  {r?.message || g.sub}
                </div>
                {r?.tested_at && (
                  <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">
                    Last tested {relativeTime(r.tested_at)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => runOne(g.key)}
                disabled={!!testing}
                data-testid={`test-${g.key}-btn`}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--border-default)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-alt)] text-[color:var(--text-primary)] disabled:opacity-50 transition-colors"
              >
                Test
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}



function StatCard({ icon: Icon, label, value, sub, tone = "brand", testid }) {
  const tones = {
    brand: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    accent: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    gold: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
    error: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
    neutral: "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]",
  };
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-4">{label}</div>
      <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
    </div>
  );
}

function InflowChip({ label, value, active, onClick }) {
  return (
    <button onClick={onClick} data-testid={`range-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
        active
          ? "bg-[color:var(--accent-main)] text-white border-[color:var(--accent-main)]"
          : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] border-transparent hover:bg-[color:var(--surface)]"
      }`}>
      {label}
    </button>
  );
}

const RANGES = [
  { id: "today", label: "Today", days: 0 },
  { id: "yesterday", label: "Yesterday", days: -1 },
  { id: "7d", label: "Last 7 days", days: 6 },
  { id: "30d", label: "Last 30 days", days: 29 },
  { id: "month", label: "This month", days: "month" },
  { id: "lastmonth", label: "Last month", days: "lastmonth" },
];

function computeRange(id) {
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  if (id === "today") return { frm: ymd(today), to: ymd(today) };
  if (id === "yesterday") {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    return { frm: ymd(y), to: ymd(y) };
  }
  if (id === "7d") {
    const f = new Date(today); f.setDate(today.getDate() - 6);
    return { frm: ymd(f), to: ymd(today) };
  }
  if (id === "30d") {
    const f = new Date(today); f.setDate(today.getDate() - 29);
    return { frm: ymd(f), to: ymd(today) };
  }
  if (id === "month") {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { frm: ymd(f), to: ymd(today) };
  }
  if (id === "lastmonth") {
    const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const l = new Date(today.getFullYear(), today.getMonth(), 0);
    return { frm: ymd(f), to: ymd(l) };
  }
  return { frm: ymd(today), to: ymd(today) };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: s } = useCachedData("/admin/stats/extended", async () => (await api.get("/admin/stats/extended")).data);
  const [range, setRange] = useState("7d");
  const [inflow, setInflow] = useState(null);
  const [customFrm, setCustomFrm] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [drillDate, setDrillDate] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillQ, setDrillQ] = useState("");

  const loadInflow = useCallback(async (frm, to) => {
    const { data } = await api.get("/admin/stats/inflow", { params: { frm, to } });
    setInflow(data);
    setCustomFrm(frm);
    setCustomTo(to);
  }, []);

  useEffect(() => {
    const { frm, to } = computeRange(range);
    loadInflow(frm, to);
  }, [range, loadInflow]);

  const applyCustom = () => {
    if (customFrm && customTo) loadInflow(customFrm, customTo);
  };

  const openDrill = async (date) => {
    setDrillDate(date);
    setDrillData(null);
    setDrillQ("");
    setDrillLoading(true);
    try {
      const { data } = await api.get("/admin/deposits/by-day", { params: { date } });
      setDrillData(data);
    } finally {
      setDrillLoading(false);
    }
  };

  const drillFiltered = (() => {
    if (!drillData) return [];
    const q = drillQ.trim().toLowerCase();
    if (!q) return drillData.deposits;
    return drillData.deposits.filter((d) =>
      (d.user_phone || "").toLowerCase().includes(q) ||
      (d.user_name || "").toLowerCase().includes(q) ||
      (d.reference || "").toLowerCase().includes(q)
    );
  })();

  const maxSeries = inflow ? Math.max(1, ...inflow.series.map((p) => p.total)) : 1;

  return (
    <AdminLayout title="">
      <div className="mb-1 text-label">Platform overview</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)]" data-testid="admin-dashboard-title">Dashboard</h1>

      {/* Hero: Platform profit + Next 24h payout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Link to="/pentest/fuser/profit-breakdown" className="rounded-3xl p-6 md:p-8 text-white relative overflow-hidden bg-gradient-to-br from-[color:var(--accent-main)] via-[#E11D74] to-[color:var(--brand)] shadow-xl shadow-[color:var(--accent-main)]/30 hover:shadow-2xl hover:scale-[1.01] transition-all" data-testid="platform-profit-card">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/85">Platform profit</div>
              <div className="font-display font-extrabold text-4xl md:text-5xl mt-2 leading-none" data-testid="platform-profit-value">
                {formatNaira(s?.platform_profit ?? 0)}
              </div>
              <div className="text-white/80 text-xs mt-2">Tap to see the full P&amp;L breakdown</div>
            </div>
            <ArrowUpRight className="w-7 h-7 text-white/80" />
          </div>
        </Link>

        <Link to="/pentest/fuser/payout-projection" className="card-soft p-6 md:p-8 relative hover:scale-[1.01] hover:shadow-lg transition-all block" data-testid="next-payout-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-label">Next 24h payout</div>
              <div className="font-display font-extrabold text-4xl md:text-5xl mt-2 leading-none text-[color:var(--text-primary)]" data-testid="next-payout-value">
                {formatNaira(s?.next_24h_payout ?? 0)}
              </div>
              <div className="text-xs text-[color:var(--text-tertiary)] mt-2">Tap to see which investments drive this</div>
            </div>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </Link>
      </div>

      {/* Fixie proxy usage — manually-synced counter for the Nomba payout proxy */}
      <FixieUsageCard />

      {/* Gateway health — on-demand ping for each payment provider */}
      <GatewayHealthCard />

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard testid="stat-total-users" icon={Users} label="Total users" value={s?.users ?? 0} sub={`${s?.online ?? 0} online`} tone="success" />
        <StatCard testid="stat-total-deposits" icon={DollarSign} label="Total deposits" value={formatNaira(s?.total_deposits ?? 0)} tone="accent" />
        <StatCard testid="stat-active-investments" icon={TrendingUp} label="Active investments" value={s?.active_investments ?? 0} tone="brand" />
        <StatCard testid="stat-pending-withdrawals" icon={Clock} label="Pending withdrawals" value={s?.pending_withdrawals ?? 0} tone="gold" />
      </div>

      {/* Today (Lagos) */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">Today (Lagos)</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3">
        <StatCard testid="today-deposits" icon={ArrowDownToLine} label="Deposits today" value={formatNaira(s?.today?.deposits ?? 0)} sub={`${s?.today?.deposits_count ?? 0} successful`} tone="success" />
        <StatCard testid="today-paid" icon={ArrowUpFromLine} label="Paid out today" value={formatNaira(s?.today?.paid_out ?? 0)} sub={`${s?.today?.paid_out_count ?? 0} payouts`} tone="error" />
        <StatCard testid="today-net" icon={DollarSign} label="Net inflow today" value={formatNaira(s?.today?.net_inflow ?? 0)} sub={(s?.today?.net_inflow ?? 0) >= 0 ? "Inflow positive" : "Withdrawals exceed deposits"} tone="accent" />
        <StatCard testid="today-pending" icon={Clock} label="Pending right now" value={s?.today?.pending_now ?? 0} sub="Awaiting admin action" tone="gold" />
      </div>

      {/* Inflow by date */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">Inflow by date</div>
      <div className="card-soft p-5">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {RANGES.map((r) => (
            <InflowChip key={r.id} label={r.label} active={range === r.id} onClick={() => setRange(r.id)} />
          ))}
        </div>

        <div className="mt-4 flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">From</div>
            <input type="date" value={customFrm} onChange={(e) => setCustomFrm(e.target.value)}
              data-testid="inflow-from" className="input-base px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">To</div>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              data-testid="inflow-to" className="input-base px-3 py-2 text-sm" />
          </div>
          <button onClick={applyCustom} data-testid="inflow-apply"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[color:var(--text-primary)] text-[color:var(--surface)] hover:opacity-90 inline-flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5" /> Apply
          </button>
        </div>

        {inflow && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3 mt-5">
              <div className="rounded-2xl p-4 bg-[color:var(--success-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--success)]">Total inflow</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-total">{formatNaira(inflow.total)}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">{inflow.from} → {inflow.to}</div>
              </div>
              <div className="rounded-2xl p-4 bg-[color:var(--accent-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--accent-main)]">Deposits</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-count">{inflow.count}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">completed</div>
              </div>
              <div className="rounded-2xl p-4 bg-[color:var(--brand-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--brand)]">Average deposit</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-avg">{formatNaira(inflow.avg)}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">per deposit</div>
              </div>
              <div className="rounded-2xl p-4 bg-[color:var(--gold-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--warning)]">Peak day</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-peak">{formatNaira(inflow.peak?.total ?? 0)}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">{inflow.peak?.date || "—"}</div>
              </div>
            </div>

            {/* Mini bar chart — every bar is clickable */}
            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2 flex items-center justify-between">
                <span>{inflow.from} → {inflow.to}</span>
                <span>Tap a bar to view that day's deposits</span>
              </div>
              <div className="bg-[color:var(--surface-alt)] rounded-xl p-3 overflow-x-auto">
                <div className="flex items-end gap-1 h-36 min-w-full" style={{ minWidth: `${Math.max(inflow.series.length * 40, 100)}px` }}>
                  {inflow.series.length === 0 ? (
                    <div className="w-full text-center text-xs text-[color:var(--text-tertiary)] self-center">No deposits in this range.</div>
                  ) : (
                    inflow.series.map((p) => {
                      const empty = p.total <= 0;
                      const pct = empty ? 0 : (p.total / maxSeries) * 100;
                      return (
                        <button
                          key={p.date}
                          type="button"
                          onClick={() => openDrill(p.date)}
                          data-testid={`bar-${p.date}`}
                          aria-label={`Open deposits for ${p.date}`}
                          title={`${p.date}: ${formatNaira(p.total)} — click to view deposits`}
                          className="flex-1 min-w-[32px] flex flex-col items-center justify-end h-full group cursor-pointer p-0 bg-transparent border-0 hover:bg-[color:var(--surface)]/30 rounded-md transition-colors"
                        >
                          <div
                            className={`w-full max-w-[28px] rounded-t-md transition-all ${
                              empty
                                ? "bg-[color:var(--border-default)] group-hover:bg-[color:var(--text-tertiary)]"
                                : "bg-gradient-to-t from-[color:var(--brand)] to-[color:var(--accent-main)] group-hover:from-[color:var(--brand-hover)] group-hover:to-[color:var(--accent-hover)] group-hover:scale-y-105"
                            }`}
                            style={{ height: `${pct}%`, minHeight: "6px" }}
                          />
                          <div className="text-[10px] text-[color:var(--text-secondary)] group-hover:text-[color:var(--text-primary)] mt-1 truncate w-full text-center font-medium">{p.date.slice(5)}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Gateway breakdown */}
            <div className="mt-5 flex flex-wrap gap-2" data-testid="gateway-breakdown">
              {inflow.gateways.map((g) => (
                <div key={g.name} className="inline-flex items-center gap-2 bg-[color:var(--text-primary)] text-[color:var(--surface)] rounded-full px-3 py-1.5 text-xs">
                  <span className="font-bold uppercase tracking-wider">{g.name}</span>
                  <span>{formatNaira(g.total)}</span>
                  <span className="opacity-60">· {g.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* All time */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">All time</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3">
        <StatCard testid="all-paid" icon={ArrowUpFromLine} label="Total paid out" value={formatNaira(s?.all_time?.total_paid_out ?? 0)} sub={`${s?.all_time?.paid_withdrawals_count ?? 0} settled withdrawals`} tone="brand" />
        <StatCard testid="all-fees" icon={DollarSign} label="Total fees charged" value={formatNaira(s?.all_time?.total_fees ?? 0)} sub="On settled withdrawals" tone="success" />
        <StatCard testid="all-await" icon={ScanSearch} label="Awaiting verification" value={s?.all_time?.awaiting_verification ?? 0} tone="error" />
        <StatCard testid="all-invest" icon={TrendingUp} label="Total investments" value={s?.all_time?.total_investments ?? 0} tone="accent" />
      </div>

      {/* System health */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">System health</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card-soft p-5 flex items-center gap-4" data-testid="fraud-attempts">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[color:var(--error-soft)] text-[color:var(--error)] shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">Fraud attempts</div>
            <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{s?.system_health?.fraud_attempts ?? 0}</div>
          </div>
          {(s?.system_health?.fraud_attempts ?? 0) === 0
            ? <CircleCheck className="w-5 h-5 text-[color:var(--success)]" />
            : <CircleAlert className="w-5 h-5 text-[color:var(--error)]" />}
        </div>
        <div className="card-soft p-5 flex items-center gap-4" data-testid="amount-mismatches">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[color:var(--gold-soft)] text-[color:var(--warning)] shrink-0">
            <CircleAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">Amount mismatches</div>
            <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{s?.system_health?.amount_mismatches ?? 0}</div>
          </div>
          {(s?.system_health?.amount_mismatches ?? 0) === 0
            ? <CircleCheck className="w-5 h-5 text-[color:var(--success)]" />
            : <CircleAlert className="w-5 h-5 text-[color:var(--error)]" />}
        </div>
        <Link to="/pentest/fuser/gateway-payout-failures" className="card-soft p-5 flex items-center gap-4 hover:bg-[color:var(--surface-alt)] transition-colors" data-testid="gateway-payout-failures">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[color:var(--brand-soft)] text-[color:var(--brand)] shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">Gateway payout failures</div>
            <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{s?.system_health?.gateway_payout_failures ?? 0}</div>
          </div>
          {(s?.system_health?.gateway_payout_failures ?? 0) === 0
            ? <CircleCheck className="w-5 h-5 text-[color:var(--success)]" />
            : <ChevronRight className="w-5 h-5 text-[color:var(--error)]" />}
        </Link>
      </div>

      {/* Quick actions */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">Quick actions</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3">
        {[
          { to: "/pentest/fuser/users", icon: Users, label: "Manage Users", tone: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]" },
          { to: "/pentest/fuser/products", icon: TrendingUp, label: "Products", tone: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]" },
          { to: "/pentest/fuser/deposits", icon: ArrowDownToLine, label: "Deposits", tone: "bg-[color:var(--success-soft)] text-[color:var(--success)]" },
          { to: "/pentest/fuser/withdrawals", icon: Banknote, label: "Withdrawals", tone: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]" },
        ].map((q) => (
          <Link key={q.to} to={q.to} data-testid={`quick-${q.to.split("/").pop()}`}
            className="card-soft p-4 flex items-center justify-between gap-3 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${q.tone}`}>
                <q.icon className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-[color:var(--text-primary)] truncate">{q.label}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-[color:var(--text-tertiary)] shrink-0" />
          </Link>
        ))}
      </div>

      {/* Day drill-down */}
      <Dialog open={!!drillDate} onOpenChange={(o) => { if (!o) { setDrillDate(null); setDrillData(null); setDrillQ(""); } }}>
        <DialogContent data-testid="drill-dialog" className="max-w-2xl w-[calc(100vw-2rem)] rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-[color:var(--border-default)]">
            <DialogTitle className="font-display text-xl text-[color:var(--text-primary)]">
              Deposits on {drillDate}
            </DialogTitle>
            {drillData && (
              <div className="text-sm text-[color:var(--text-secondary)] mt-1">
                <span className="font-bold text-[color:var(--text-primary)]">{formatNaira(drillData.total)}</span> across <span className="font-bold text-[color:var(--text-primary)]">{drillData.count}</span> deposit{drillData.count === 1 ? "" : "s"}
              </div>
            )}
            {drillData && drillData.deposits.length > 0 && (
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
                <input
                  value={drillQ}
                  onChange={(e) => setDrillQ(e.target.value)}
                  placeholder="Search by phone, name or reference…"
                  data-testid="drill-search"
                  className="w-full pl-10 pr-3 py-2.5 input-base text-sm"
                />
              </div>
            )}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {drillLoading && <div className="p-8 text-center text-sm text-[color:var(--text-secondary)]">Loading…</div>}
            {!drillLoading && drillData && drillData.deposits.length === 0 && (
              <div className="p-10 text-center text-sm text-[color:var(--text-tertiary)]">No deposits on this day.</div>
            )}
            {!drillLoading && drillData && drillData.deposits.length > 0 && drillFiltered.length === 0 && (
              <div className="p-10 text-center text-sm text-[color:var(--text-tertiary)]">No deposits match "<span className="font-mono">{drillQ}</span>".</div>
            )}
            {!drillLoading && drillFiltered.length > 0 && (
              <div className="divide-y divide-[color:var(--border-light)]" data-testid="drill-list">
                {drillFiltered.map((d) => (
                  <div key={d.id} className="p-4 flex items-center justify-between gap-3" data-testid={`drill-row-${d.id}`}>
                    <div className="min-w-0">
                      <div className="font-semibold text-[color:var(--text-primary)] truncate">{d.user_name}</div>
                      <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{d.user_phone}</div>
                      <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] mt-1 truncate">{d.reference}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-extrabold text-base text-[color:var(--text-primary)]">{formatNaira(d.amount)}</div>
                      <div className="inline-flex items-center gap-1 mt-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{d.method || "paystack"}</span>
                      </div>
                      <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">{formatDate(d.updated_at || d.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
