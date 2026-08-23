import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowDownToLine, ShieldCheck, Loader2, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function Deposit() {
  const { refresh } = useAuth();
  const { settings, loaded: settingsLoaded } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [amount, setAmount] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [chosenGateway, setChosenGateway] = useState("");
  const [highlightRef, setHighlightRef] = useState(null);
  const [rechecking, setRechecking] = useState({}); // { [reference]: true }
  const cardRefs = useRef({});

  const load = async () => {
    const { data: h } = await api.get("/deposits");
    setHistory(h);
  };

  useEffect(() => { load(); }, []);

  // After history loads, if we arrived with state.highlightRef, scroll to that card and pulse it briefly
  useEffect(() => {
    const target = location.state?.highlightRef;
    if (!target || history.length === 0) return;
    setHighlightRef(target);
    setTimeout(() => {
      const el = cardRefs.current[target];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const t = setTimeout(() => setHighlightRef(null), 3500);
    return () => clearTimeout(t);
  }, [history, location.state]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const callback_url = `${window.location.origin}/payment/callback`;
      const body = { amount: Number(amount), callback_url };
      if (settings.multi_gateway_enabled && settings.let_users_choose_gateway && chosenGateway) {
        body.gateway = chosenGateway;
      }
      const { data } = await api.post("/deposit/initialize", body);
      if (data.type === "bank_transfer") {
        // Marasoft dynamic account — navigate to dedicated transfer page
        navigate(`/deposit/transfer/${data.reference}`);
        return;
      }
      if (data.mode === "live" && data.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }
      // Mock: verify immediately
      const { data: v } = await api.get(`/deposit/verify/${data.reference}`);
      if (v.status === "success") {
        toast.success(`Deposit of ${formatNaira(amount)} successful`);
        await refresh();
        await load();
      } else {
        toast.error("Deposit failed");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Deposit error");
    } finally { setBusy(false); }
  };

  // Quickly resume a still-pending bank transfer
  const pendingBankTransfer = history.find((d) => d.status === "pending" && d.method === "marasoft" && d.account_number);

  // Re-verify a single deposit (used by the Recheck button on failed/pending rows)
  const recheck = async (reference) => {
    setRechecking((m) => ({ ...m, [reference]: true }));
    try {
      const { data } = await api.get(`/deposit/verify/${reference}`);
      if (data.status === "success") {
        toast.success("Deposit confirmed and credited!");
        await refresh();
        await load();
      } else if (data.status === "pending") {
        toast.info("Still waiting on the bank — try again in a moment.");
      } else {
        toast.error("This transaction is still marked failed by Marasoft. If you actually paid, contact support to credit it manually.");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Recheck failed");
    } finally {
      setRechecking((m) => ({ ...m, [reference]: false }));
    }
  };

  return (
    <UserLayout>
      <div className="text-label">Funds</div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">Deposit</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Top up your wallet.{settingsLoaded ? <> Minimum: <span className="font-semibold">{formatNaira(settings.min_deposit)}</span></> : null}</p>

      {pendingBankTransfer && (
        <button onClick={() => navigate(`/deposit/transfer/${pendingBankTransfer.reference}`)}
          data-testid="deposit-resume-pending"
          className="mt-4 w-full text-left card-soft p-4 border-l-4 border-[color:var(--warning)] hover:bg-[color:var(--surface-alt)] transition-colors">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--warning)]">Pending transfer</div>
          <div className="mt-1 text-sm text-[color:var(--text-primary)]">
            You have a pending bank transfer for <span className="font-bold">{formatNaira(pendingBankTransfer.amount)}</span>. Tap to view bank details and complete the payment.
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <form onSubmit={submit} className="card-soft p-6 lg:col-span-2" data-testid="deposit-form">
          {settingsLoaded && (
            <div className="flex items-center gap-2 pill pill-neutral w-fit">
              <ShieldCheck className="w-3.5 h-3.5" /> {settings.payment_mode === "live" ? "Secure checkout" : "Test / Mock mode"}
            </div>
          )}
          <label className="block mt-5 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Amount (₦)</label>
          <input
            type="number" min={settings.min_deposit} value={amount} onChange={(e)=>setAmount(e.target.value)} required
            placeholder={settingsLoaded ? `Min ₦${Number(settings.min_deposit || 0).toLocaleString()}` : ""}
            data-testid="deposit-amount-input"
            className="w-full mt-2 px-3 py-3 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]"
          />
          {settingsLoaded && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {(settings.quick_deposit_amounts && settings.quick_deposit_amounts.length > 0
              ? settings.quick_deposit_amounts
              : [3000, 5000, 10000, 20000, 50000]
            ).map(v => (
              <button type="button" key={v} onClick={() => setAmount(String(v))}
                data-testid={`quick-amount-${v}`}
                className="px-3 py-1.5 rounded-full text-sm border border-[color:var(--border-default)] hover:bg-[color:var(--surface-alt)]">
                {formatNaira(v, { compact: true })}
              </button>
            ))}
          </div>
          )}

          {settingsLoaded && settings.multi_gateway_enabled && settings.let_users_choose_gateway && (
            <div className="mt-5" data-testid="deposit-gateway-picker">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] mb-2">Payment method</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "paystack", label: "Card", sub: "Paystack", enabled: settings.gateway_paystack_enabled !== false },
                  { v: "nomba",    label: "Wallet", sub: "Nomba", enabled: settings.gateway_nomba_enabled !== false },
                  { v: "marasoft", label: "Transfer", sub: "Marasoft", enabled: settings.gateway_marasoft_enabled !== false },
                  { v: "budpay",   label: "Transfer", sub: "BudPay", enabled: !!settings.gateway_budpay_enabled },
                  { v: "qorepay",  label: "Transfer", sub: "QorePay", enabled: !!settings.gateway_qorepay_enabled },
                ].filter((g) => g.enabled).map((g) => {
                  const sel = chosenGateway === g.v || (!chosenGateway && settings.deposit_gateway === g.v);
                  return (
                    <button type="button" key={g.v} onClick={() => setChosenGateway(g.v)}
                      data-testid={`pick-gateway-${g.v}`}
                      className={`p-3 rounded-xl border-2 text-left transition-colors ${sel ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[color:var(--border-default)] hover:border-[color:var(--brand)]/40"}`}>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{g.label}</div>
                      <div className={`font-display font-bold text-sm mt-0.5 ${sel ? "text-[color:var(--brand)]" : "text-[color:var(--text-primary)]"}`}>{g.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {settings.transfer_description_template && (
            <div className="mt-4 rounded-md bg-[color:var(--surface-alt)] p-2.5 text-[11px] text-[color:var(--text-secondary)]">
              <span className="font-bold text-[color:var(--text-primary)]">Transfer narration:</span> use <span className="font-mono">"{settings.transfer_description_template}"</span> when funding by bank transfer.
            </div>
          )}
          <button type="submit" disabled={busy}
            data-testid="deposit-submit-btn"
            className="mt-6 w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] py-3.5 rounded-full font-semibold disabled:opacity-60">
            <ArrowDownToLine className="w-4 h-4" /> {busy ? "Processing…" : "Proceed to pay"}
          </button>
          {settingsLoaded && settings.payment_mode !== "live" && (
            <p className="mt-3 text-xs text-[color:var(--text-tertiary)]">Mock mode: deposits are credited instantly for testing.</p>
          )}
        </form>

        <div className="card-soft p-6">
          <div className="text-label">How it works</div>
          <ol className="mt-3 text-sm text-[color:var(--text-secondary)] space-y-3">
            <li>1. Enter the amount you want to deposit.</li>
            <li>2. You'll get a unique bank account to transfer to on the next page.</li>
            <li>3. Your wallet is credited automatically once payment is confirmed.</li>
          </ol>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold text-[color:var(--text-primary)]">Recent deposits</h2>
          {history.length > 0 && (
            <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">{history.length} total</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="deposit-history-list">
          {history.map((d) => {
            const tone = d.status === "success" ? "success" : d.status === "failed" ? "error" : "warn";
            const isHighlighted = highlightRef === d.reference;
            const isPending = d.status === "pending";
            const isFailed = d.status === "failed";
            const isMarasoft = d.method === "marasoft";
            const isBusy = !!rechecking[d.reference];
            const cfg = {
              success: { Icon: CheckCircle2, ring: "bg-[color:var(--success-soft)] text-[color:var(--success)]", pill: "pill-success" },
              error: { Icon: XCircle, ring: "bg-[color:var(--error-soft)] text-[color:var(--error)]", pill: "pill-error" },
              warn: { Icon: Clock, ring: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]", pill: "pill-warn" },
            }[tone];
            const StatusIcon = cfg.Icon;
            return (
              <div
                key={d.id}
                ref={(el) => { if (el) cardRefs.current[d.reference] = el; }}
                className={`card-soft p-4 relative overflow-hidden transition-all ${isHighlighted ? "ring-2 ring-[color:var(--accent-main)] shadow-xl shadow-[color:var(--accent-main)]/20 scale-[1.02]" : ""}`}
                data-testid={`dep-${d.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${cfg.ring}`}>
                      {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <StatusIcon className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-xl text-[color:var(--text-primary)] leading-tight">{formatNaira(d.amount)}</div>
                      <div className="text-[11px] text-[color:var(--text-tertiary)] capitalize mt-0.5">{d.method || "deposit"} · {formatDate(d.created_at)}</div>
                    </div>
                  </div>
                  {isPending ? (
                    <span className="pill pill-warn inline-flex items-center gap-1.5 shrink-0" data-testid={`dep-pill-checking-${d.id}`}>
                      <Loader2 className="w-3 h-3 animate-spin" /> checking…
                    </span>
                  ) : (
                    <span className={`pill ${cfg.pill} shrink-0 capitalize`}>{d.status}</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 bg-[color:var(--surface-alt)] rounded-lg px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] shrink-0">Ref</span>
                  <span className="font-mono text-[11px] text-[color:var(--text-secondary)] truncate" title={d.reference}>{d.reference}</span>
                </div>
                {(isFailed || isPending) && isMarasoft && (
                  <button
                    onClick={() => recheck(d.reference)}
                    disabled={isBusy}
                    data-testid={`dep-recheck-${d.id}`}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[color:var(--border-default)] hover:bg-[color:var(--surface-alt)] hover:border-[color:var(--brand)] hover:text-[color:var(--brand)] transition-colors disabled:opacity-60">
                    <RefreshCw className={`w-3 h-3 ${isBusy ? "animate-spin" : ""}`} />
                    {isBusy ? "Rechecking…" : isFailed ? "Recheck — I actually paid" : "Recheck status"}
                  </button>
                )}
              </div>
            );
          })}
          {history.length === 0 && (
            <div className="col-span-full card-soft p-8 text-center text-[color:var(--text-tertiary)]">No deposits yet. Your top-ups will appear here.</div>
          )}
        </div>
      </div>
    </UserLayout>
  );
}
