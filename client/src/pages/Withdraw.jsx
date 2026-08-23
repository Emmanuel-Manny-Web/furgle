import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, money, timeAgo } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon, Modal } from "../components/ui";
import { useCachedData } from "../useCache";

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: settings, loading: settingsLoading } = useCachedData("/settings/public", () => api("/settings/public", { auth: false }));
  const { data: pinStatus, loading: pinLoading } = useCachedData("/profile/withdrawal-pin/status", () => api("/profile/withdrawal-pin/status"));
  const { data: list, reload: reloadWithdrawals } = useCachedData("/withdrawals", () => api("/withdrawals"));
  const withdrawals = list || [];

  const poll = useCallback(async () => {
    try {
      await api("/transactions/poll", { method: "POST" });
      await refresh();
      reloadWithdrawals();
    } catch {
      /* ignore */
    }
  }, [refresh, reloadWithdrawals]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [poll]);

  const hasBank = user?.bank_name && user?.account_number;
  const feePct = Number(settings?.withdrawal_fee_percent ?? 0);
  const minWd = Number(settings?.min_withdrawal ?? 0);
  const maxWd = Number(settings?.max_withdrawal ?? 0);
  const amt = Number(amount) || 0;
  const fee = (amt * feePct) / 100;
  const net = amt - fee;

  const submit = async (e) => {
    e.preventDefault();
    if (!amt || amt <= 0) return toast("Enter a valid amount", "error");
    if (minWd && amt < minWd) return toast(`Minimum withdrawal is ${money(minWd)}`, "error");
    if (maxWd && amt > maxWd) return toast(`Max withdrawal is ${money(maxWd)}`, "error");
    if (settings?.withdrawals_open === false) return toast("Withdrawals are temporarily closed", "error");
    if (amt > (user?.wallet_balance || 0)) return toast("Insufficient balance", "error");
    if (settings?.require_withdrawal_pin && !pinStatus?.has_pin) return toast("Set your withdrawal PIN in your profile first", "error");
    if (settings?.require_withdrawal_pin && !pin) return toast("Enter your withdrawal PIN", "error");
    setBusy(true);
    try {
      await api("/withdrawal/request", { method: "POST", body: { amount: amt, pin } });
      toast("Withdrawal requested", "success");
      await refresh();
      reloadWithdrawals();
      setAmount("");
      setPin("");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (settingsLoading || pinLoading) {
    return <div className="center-screen"><div className="spinner" /></div>;
  }

  return (
    <>
      <h1 className="page-title">Withdraw</h1>
      <p className="page-sub">Send earnings to your bank account</p>

      {!hasBank ? (
        <div className="card" style={{ textAlign: "center" }}>
          <div className="ic gold" style={{ width: 48, height: 48, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><Icon.Bank /></div>
          <h3 style={{ fontSize: 17 }}>Add a bank account</h3>
          <p className="page-sub" style={{ margin: "8px 0 16px" }}>You need a linked bank account before you can withdraw.</p>
          <Link to="/profile" className="btn primary block">Go to profile</Link>
        </div>
      ) : (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div className="page-sub" style={{ fontSize: 11 }}>Paying to</div>
                <div style={{ fontWeight: 700, marginTop: 2 }}>{user.bank_name} · {user.account_number}</div>
              </div>
              <Link to="/profile" className="btn ghost sm">Change</Link>
            </div>

            <form onSubmit={submit}>
              <div className="field">
                <label>Amount (₦)</label>
                <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span className="page-sub">Fee ({feePct}%)</span>
                <span>-{money(fee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 14 }}>
                <span className="page-sub">You receive</span>
                <span style={{ fontWeight: 800 }}>{money(net)}</span>
              </div>

              {settings.require_withdrawal_pin &&
                (pinStatus.has_pin ? (
                  <div className="field">
                    <label>Withdrawal PIN</label>
                    <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                      value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                  </div>
                ) : (
                  <div className="card tint" style={{ marginBottom: 14, fontSize: 13 }}>
                    A withdrawal PIN is required before you can withdraw.{" "}
                    <Link to="/profile" style={{ color: "var(--brand)", fontWeight: 700 }}>Set it in your profile</Link>.
                  </div>
                ))}

              <button className="btn accent block lg" disabled={busy}>{busy ? "Processing…" : "Request withdrawal"}</button>
            </form>
          </div>

          {withdrawals.length > 0 && (
            <>
              <div className="section-head" style={{ marginTop: 8 }}><h3>Recent withdrawals</h3></div>
              <div className="list">
                {withdrawals.slice(0, 5).map((w) => (
                  <div key={w.id} className="row">
                    <div className={`ic ${w.status === "success" || w.status === "paid" ? "brand" : w.status === "rejected" ? "danger" : "gold"}`}>
                      <Icon.ArrowUp />
                    </div>
                    <div className="body">
                      <div className="t">{money(w.amount)}</div>
                      <div className="s">{timeAgo(w.created_at)}</div>
                    </div>
                    <div className="end">
                      <span className={`pill ${w.status === "success" || w.status === "paid" ? "success" : w.status === "rejected" ? "danger" : "warn"}`}>{w.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
