import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowUpFromLine, KeyRound, Landmark, TrendingUp, CheckCircle2, Lock, ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const { settings, loaded: settingsLoaded } = useSettings();
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [history, setHistory] = useState([]);
  const [investmentsCount, setInvestmentsCount] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: h }, { data: inv }] = await Promise.all([
      api.get("/withdrawals"),
      api.get("/investments"),
    ]);
    setHistory(h);
    setInvestmentsCount(Array.isArray(inv) ? inv.filter(i => i.status === "active").length : 0);
  };
  useEffect(() => { load(); }, []);

  const hasPin = !!user?.has_withdrawal_pin;
  // Treat the PIN as required only AFTER /settings/public has returned an
  // explicit `true`. While `settings` is still its empty initial value the
  // requirement evaluates to `false`, which keeps the banner hidden during
  // the load and stops the half-second flash on every page refresh.
  const pinRequired = settings.require_withdrawal_pin === true;
  const submit = async (e) => {
    e.preventDefault();
    const requirePin = pinRequired;
    if (requirePin && !/^\d{4}$/.test(pin)) { toast.error("Enter your 4-digit PIN"); return; }
    const amt = Number(amount);
    if (settings.max_withdrawal && amt > settings.max_withdrawal) {
      toast.error(`Max withdrawal is ₦${Number(settings.max_withdrawal).toLocaleString()}`);
      return;
    }
    setBusy(true);
    try {
      const body = { amount: amt, method: "manual" };
      if (requirePin) body.pin = pin;
      await api.post("/withdrawal/request", body);
      toast.success("Withdrawal request submitted");
      setAmount("");
      setPin("");
      await refresh();
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Withdrawal failed");
    } finally { setBusy(false); }
  };

  const bankReady = user?.bank_name && user?.account_number && user?.account_name && user?.bank_code;

  // Compute window state from settings (Lagos time = UTC + 1)
  const windowState = (() => {
    if (settings.withdrawals_open === false) return { open: false, reason: "Withdrawals are temporarily closed." };
    const start = settings.withdrawal_start_time || "00:00";
    const end = settings.withdrawal_end_time || "23:59";
    if (start === "00:00" && end === "23:59") return { open: true, start, end };
    const now = new Date();
    const lagos = new Date(now.getTime() + (now.getTimezoneOffset() + 60) * 60000);
    const cur = lagos.getHours() * 60 + lagos.getMinutes();
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    const inWindow = startM <= endM ? (cur >= startM && cur <= endM) : (cur >= startM || cur <= endM);
    return inWindow ? { open: true, start, end } : { open: false, reason: `Withdrawals open between ${start} and ${end} (Lagos).`, start, end };
  })();

  return (
    <UserLayout>
      <div className="text-label">Funds</div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1 text-[color:var(--text-primary)]">Withdraw</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">
        {settingsLoaded ? (
          <>
            Limits: <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(settings.min_withdrawal)}</span>
            {settings.max_withdrawal ? <> – <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(settings.max_withdrawal)}</span></> : null}
            {settings.auto_payout_max_amount > 0 && (
              <> · auto-payout up to <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(settings.auto_payout_max_amount)}</span> (larger requests need admin approval)</>
            )}
          </>
        ) : <>&nbsp;</>}
      </p>

      {/* Unlock-withdrawals checklist — replaces the old separate warning cards */}
      {(() => {
        // Wait until BOTH settings and the investments count are known before
        // evaluating requirements. Rendering earlier makes the card appear with
        // "invest" unmet and then vanish once data loads — the one-second flash.
        if (!settingsLoaded || investmentsCount === null) return null;
        const investPending = investmentsCount === 0;
        const investLoading = false;
        const investDone = investmentsCount > 0;
        const steps = [
          {
            key: "bank", done: !!bankReady, pending: !bankReady, loading: false, icon: Landmark,
            title: "Add your bank account",
            desc: bankReady ? `${user?.bank_name} · ${user?.account_number}` : "Withdrawals are paid to your saved bank account.",
            to: "/profile", label: "Add bank", testid: "add-bank-btn", wrap: "bank-missing-warn",
          },
          ...(pinRequired ? [{
            key: "pin", done: !!hasPin, pending: !hasPin, loading: false, icon: KeyRound,
            title: "Set a 4-digit withdrawal PIN",
            desc: hasPin ? "Your withdrawal PIN is set." : "A 4-digit PIN authorises each withdrawal.",
            to: "/profile", label: "Set PIN", testid: "set-pin-link", wrap: "no-pin-banner",
          }] : []),
          {
            key: "invest", done: investDone, pending: investPending, loading: investLoading, icon: TrendingUp,
            title: "Purchase an active investment",
            desc: investDone ? "You have a running plan." : "Withdrawals unlock once you have at least one active plan.",
            to: "/invest", label: "Invest", testid: "go-invest-link", wrap: "no-investment-banner",
          },
        ];
        const total = steps.length;
        const completed = steps.filter((s) => s.done).length;
        const allStepsDone = steps.every((s) => s.done);
        if (allStepsDone && windowState.open) return null;
        const pct = total ? (completed / total) * 100 : 0;
        return (
          <div className="mt-5 card-soft p-5" data-testid="withdraw-requirements">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-lg text-[color:var(--text-primary)] leading-tight">Unlock withdrawals</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">{completed} of {total} steps done — complete these to enable cash-outs.</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-[color:var(--surface-alt)] overflow-hidden">
              <div className="h-full bg-[color:var(--brand)] transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>

            <div className="mt-4 space-y-2.5">
              {steps.map((s) => (
                <div
                  key={s.key}
                  data-testid={s.pending ? s.wrap : undefined}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                    s.done ? "border-[color:var(--border-light)] bg-[color:var(--surface-alt)]" : "border-[color:var(--border-default)]"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    s.done ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                    : s.loading ? "bg-[color:var(--surface-2)] text-[color:var(--text-tertiary)]"
                    : "bg-[color:var(--gold-soft)] text-[color:var(--warning)]"
                  }`}>
                    {s.done ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[color:var(--text-primary)] truncate">{s.title}</div>
                    <div className="text-xs text-[color:var(--text-secondary)] truncate">{s.desc}</div>
                  </div>
                  {s.done ? (
                    <span className="pill pill-success shrink-0">Done</span>
                  ) : s.loading ? (
                    <span className="text-xs text-[color:var(--text-tertiary)] shrink-0">…</span>
                  ) : (
                    <Link to={s.to} data-testid={s.testid}
                      className="shrink-0 inline-flex items-center gap-1 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] text-xs font-semibold px-3.5 py-2 rounded-full transition-colors">
                      {s.label} <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>

            {bankReady && !windowState.open && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[color:var(--gold-soft)] p-3 text-xs" data-testid="withdrawals-closed-banner">
                <Clock className="w-4 h-4 shrink-0 mt-0.5 text-[color:var(--warning)]" />
                <span className="text-[color:var(--text-secondary)]">
                  <span className="font-semibold text-[color:var(--text-primary)]">Withdrawals closed.</span> {windowState.reason}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      <form onSubmit={submit} className="card-soft p-6 mt-6" data-testid="withdraw-form">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Amount (₦)</label>
        <input
          type="number"
          min={settings.min_withdrawal}
          max={Math.min(user?.wallet_balance ?? Infinity, settings.max_withdrawal || Infinity)}
          value={amount} onChange={(e)=>setAmount(e.target.value)} required
          placeholder={settingsLoaded ? `Min ₦${Number(settings.min_withdrawal || 0).toLocaleString()}` : ""}
          data-testid="withdraw-amount-input"
          className="w-full mt-2 px-3 py-3 input-base"
        />

        {/* Live fee preview — only renders when admin has set a non-zero fee% and the
            user typed a valid amount. Mirrors the math in routes_user.py: wallet is
            debited the FULL gross amount; the bank receives `amount × (1 - fee%)`. */}
        {(() => {
          const feePct = Number(settings.withdrawal_fee_percent) || 0;
          const amt = Number(amount);
          if (!settingsLoaded || feePct <= 0 || !Number.isFinite(amt) || amt <= 0) return null;
          const fee = Math.round(amt * feePct) / 100;
          const net = Math.round((amt - fee) * 100) / 100;
          return (
            <div
              className="mt-3 rounded-md bg-[color:var(--surface-alt)] p-3 text-xs border border-[color:var(--border-light)]"
              data-testid="withdraw-fee-preview"
            >
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--text-secondary)]">Withdrawal fee ({feePct}%)</span>
                <span className="font-semibold text-[color:var(--text-primary)] tabular-nums" data-testid="withdraw-fee-amount">
                  − {formatNaira(fee)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[color:var(--border-light)]">
                <span className="font-semibold text-[color:var(--text-primary)]">You'll receive</span>
                <span className="font-display font-bold text-base text-[color:var(--success)] tabular-nums" data-testid="withdraw-net-amount">
                  {formatNaira(net)}
                </span>
              </div>
            </div>
          );
        })()}

        {pinRequired && (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] mt-4 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> Withdrawal PIN
            </label>
            <input
              type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              disabled={!hasPin}
              required
              placeholder={hasPin ? "••••" : "Set PIN on Profile first"}
              data-testid="withdraw-pin-input"
              className="w-full mt-2 px-3 py-3 input-base font-mono tracking-[0.5em] text-center"
            />
          </>
        )}

        {settings.auto_payout_max_amount > 0 && Number(amount) > settings.auto_payout_max_amount && (
          <div className="mt-3 rounded-md bg-[color:var(--gold-soft)] text-[color:var(--warning)] p-2.5 text-[11px]" data-testid="manual-approval-hint">
            Amounts above {formatNaira(settings.auto_payout_max_amount)} need admin approval and may take a little longer.
          </div>
        )}

        <button type="submit" disabled={busy || !bankReady || !windowState.open || investmentsCount === 0 || (pinRequired && (!hasPin || pin.length !== 4))}
          data-testid="withdraw-submit-btn"
          title={
            !bankReady ? "Add complete bank details first"
            : (pinRequired && !hasPin) ? "Set your 4-digit withdrawal PIN first"
            : !windowState.open ? (windowState.reason || "Withdrawals closed")
            : (pinRequired && pin.length !== 4) ? "Enter your 4-digit PIN"
            : ""
          }
          className="mt-5 w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
          <ArrowUpFromLine className="w-4 h-4" /> {busy ? "Processing…" : !bankReady ? "Add complete bank details first" : "Submit request"}
        </button>
      </form>

      <div className="mt-8">
        <h2 className="font-display text-xl font-semibold mb-3 text-[color:var(--text-primary)]">Recent withdrawals</h2>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2" data-testid="withdraw-history-mobile">
          {history.map((w) => (
            <div key={w.id} className="card-soft p-3 flex items-center justify-between" data-testid={`w-${w.id}`}>
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--text-primary)]">{formatNaira(w.amount)}</div>
                {Number(w.fee_amount) > 0 && (
                  <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5" data-testid={`w-fee-net-${w.id}`}>
                    Fee {formatNaira(w.fee_amount)} · Net <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(w.net_amount ?? (w.amount - w.fee_amount))}</span>
                  </div>
                )}
                <div className="text-xs text-[color:var(--text-secondary)] truncate">{w.bank_name} · {w.account_number}</div>
                <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1">{formatDate(w.created_at)}</div>
              </div>
              <span className={`pill ${
                w.status === "paid" || w.status === "approved"
                  ? "pill-success"
                  : w.status === "rejected"
                  ? "pill-error"
                  : "pill-warn"
              }`}>{w.status}</span>
            </div>
          ))}
          {history.length === 0 && (
            <div className="card-soft p-6 text-center text-[color:var(--text-tertiary)]">No withdrawals yet.</div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block card-soft overflow-hidden">
          <table className="w-full text-sm" data-testid="withdraw-history-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Fee · Net</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Bank</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((w) => (
                <tr key={w.id} className="border-t border-[color:var(--border-default)]">
                  <td className="p-3 font-semibold text-[color:var(--text-primary)]">{formatNaira(w.amount)}</td>
                  <td className="p-3 text-xs text-[color:var(--text-secondary)] whitespace-nowrap" data-testid={`w-row-fee-${w.id}`}>
                    {Number(w.fee_amount) > 0 ? (
                      <>
                        <span className="text-[color:var(--text-tertiary)]">−{formatNaira(w.fee_amount)}</span>
                        <span className="mx-1.5 text-[color:var(--text-tertiary)]">·</span>
                        <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(w.net_amount ?? (w.amount - w.fee_amount))}</span>
                      </>
                    ) : (
                      <span className="text-[color:var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="p-3 text-[color:var(--text-secondary)]">{w.bank_name} · {w.account_number}</td>
                  <td className="p-3">
                    <span className={`pill ${w.status === "paid" || w.status === "approved" ? "pill-success" : w.status === "rejected" ? "pill-error" : "pill-warn"}`}>{w.status}</span>
                  </td>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap">{formatDate(w.created_at)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-[color:var(--text-tertiary)]">No withdrawals yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </UserLayout>
  );
}
