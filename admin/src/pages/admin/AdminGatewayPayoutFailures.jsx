import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import { toast } from "sonner";
import {
  ArrowLeft, ShieldAlert, CircleAlert, Banknote, CheckCircle2, RefreshCw, User as UserIcon, Wallet,
} from "lucide-react";

const GATEWAY_LABELS = {
  paystack: "Paystack",
  nomba: "Nomba",
  juntpay: "JuntPay",
  duplo: "Duplo",
  kora: "Kora",
};

export default function AdminGatewayPayoutFailures() {
  const [items, setItems] = useState(() => readCache("/admin/alerts") ?? []);
  const [loading, setLoading] = useState(() => readCache("/admin/alerts") === undefined);
  const [resolving, setResolving] = useState("");

  const load = () =>
    api.get("/admin/alerts").then(({ data }) => {
      setItems(data || []);
      writeCache("/admin/alerts", data || []);
      setLoading(false);
    });

  useEffect(() => { load(); }, []);

  const resolveOne = async (a) => {
    setResolving(a.id);
    try {
      await api.post(`/admin/alerts/${a.id}/resolve`);
      toast.success("Resolved");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setResolving(""); }
  };

  const resolveAll = async () => {
    if (!window.confirm("Resolve all outstanding payout failures?")) return;
    setResolving("all");
    try {
      for (const a of items) await api.post(`/admin/alerts/${a.id}/resolve`);
      toast.success(`Resolved ${items.length} alerts`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setResolving(""); }
  };

  const isInsufficient = (a) => /insufficient/i.test(a.message || "");

  return (
    <AdminLayout title="">
      <Link to="/pentest/fuser" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]" data-testid="back-to-dashboard">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8 mt-2"
        style={{ background: "linear-gradient(120deg,#3F0825 0%,#7A0A45 38%,#C81A6E 72%,#E5097F 100%)" }}
        data-testid="gpf-hero"
      >
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">Payout exceptions · action required</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Gateway payout failures</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">
                <span className="font-bold tabular-nums">{items.length}</span> unresolved failure{items.length === 1 ? "" : "s"} · withdrawals that the gateway could not pay out
              </div>
            </div>
          </div>

          {items.length > 0 && (
            <button
              onClick={resolveAll}
              disabled={resolving === "all"}
              data-testid="gpf-resolve-all"
              className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-[color:var(--brand)] font-bold text-sm shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> Resolve all
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="mt-5 space-y-3" data-testid="gpf-list">
        {loading && <div className="card-soft p-12 text-center text-[color:var(--text-tertiary)]">Loading…</div>}

        {!loading && items.length === 0 && (
          <div className="card-soft p-12 text-center" data-testid="gpf-empty">
            <CircleAlert className="w-12 h-12 mx-auto opacity-30 text-[color:var(--success)]" />
            <div className="font-semibold text-[color:var(--text-primary)] mt-3">No outstanding payout failures</div>
            <div className="text-xs text-[color:var(--text-tertiary)] mt-1">Every attempted payout has been paid, resolved, or refunded.</div>
          </div>
        )}

        {!loading && items.map((a) => {
          const insufficient = isInsufficient(a);
          return (
            <div key={a.id} className="card-soft p-0 overflow-hidden relative" data-testid={`gpf-row-${a.id}`}>
              <div className={`absolute inset-y-0 left-0 w-1.5 ${insufficient ? "bg-[color:var(--warning)]" : "bg-[color:var(--error)]"}`} />
              <div className="pl-5 pr-4 py-4 flex items-start gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${insufficient ? "bg-[color:var(--gold-soft)] text-[color:var(--warning)]" : "bg-[color:var(--error-soft)] text-[color:var(--error)]"}`}>
                  {insufficient ? <Wallet className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[color:var(--text-primary)]">
                      {insufficient ? "Insufficient gateway balance" : "Gateway payout failed"}
                    </span>
                    {a.gateway && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                        {GATEWAY_LABELS[a.gateway] || a.gateway}
                      </span>
                    )}
                    {a.withdrawal_status && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[color:var(--gold-soft)] text-[color:var(--warning)]">
                        {a.withdrawal_status}
                      </span>
                    )}
                  </div>

                  <p className="text-[12px] text-[color:var(--text-secondary)] mt-0.5 leading-snug break-words" data-testid={`gpf-msg-${a.id}`}>
                    {a.message}
                  </p>

                  <div className="flex items-center gap-x-3 gap-y-0.5 mt-1.5 flex-wrap text-[11px] text-[color:var(--text-tertiary)]">
                    {a.withdrawal_reference && (
                      <span className="font-mono">ref {a.withdrawal_reference}</span>
                    )}
                    {a.withdrawal_amount != null && (
                      <span className="font-semibold text-[color:var(--text-primary)] tabular-nums">{formatNaira(a.withdrawal_amount)}</span>
                    )}
                    {a.user_name && (
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="w-3 h-3" /> {a.user_name}
                      </span>
                    )}
                    {a.user_phone && <span className="font-mono">{a.user_phone}</span>}
                    <span>{relativeTime(a.created_at)}</span>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  <div className="text-[10px] text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(a.created_at)}</div>
                  <div className="flex items-center gap-1.5">
                    {a.withdrawal_id && (
                      <Link
                        to="/pentest/fuser/withdrawals"
                        data-testid={`gpf-open-withdrawal-${a.id}`}
                        title="Open withdrawals"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] hover:opacity-90"
                      >
                        <RefreshCw className="w-3 h-3" /> View
                      </Link>
                    )}
                    <button
                      onClick={() => resolveOne(a)}
                      disabled={resolving === a.id || resolving === "all"}
                      data-testid={`gpf-resolve-${a.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--success-soft)] text-[color:var(--success)] hover:opacity-90 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3 h-3" /> {resolving === a.id ? "…" : "Resolve"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
