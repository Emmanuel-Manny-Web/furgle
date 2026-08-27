import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, timeAgo } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon, Modal } from "../components/ui";
import { useCachedData } from "../useCache";

export default function Deposit() {
  const { refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(null);
  const [gw, setGw] = useState(null);

  const { data: settings } = useCachedData("/settings/public", () => api("/settings/public", { auth: false }));
  const { data: deposits, reload: reloadDeposits } = useCachedData("/deposits", () => api("/deposits"));
  const depositList = deposits || [];
  const availableGateways = settings?.deposit_gateways || [];

  useEffect(() => {
    if (availableGateways.length) {
      setGw((prev) => (prev && availableGateways.includes(prev) ? prev : availableGateways[0]));
    }
  }, [availableGateways]);

  const poll = useCallback(async () => {
    try {
      await api("/transactions/poll", { method: "POST" });
      await refresh();
      reloadDeposits();
    } catch {
      /* ignore */
    }
  }, [refresh, reloadDeposits]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [poll]);

  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast("Enter a valid amount", "error");
    const minDep = Number(settings?.min_deposit ?? 0);
    if (minDep > 0 && amt < minDep) return toast(`Minimum deposit is ${money(minDep)}`, "error");
    setBusy(true);
    try {
      const callback = `${window.location.origin}/payment/callback`;
      const r = await api("/deposit/initialize", {
        method: "POST",
        body: { amount: amt, callback_url: callback, gateway: gw || undefined }
      });
      if (r.type === "qr" && r.qr_code) {
        setQr(r.qr_code);
      } else if (r.mode === "live" && r.authorization_url) {
        window.location.href = r.authorization_url;
      } else if (r.type === "bank_transfer") {
        navigate(`/deposit/transfer/${r.reference}`);
      } else {
        // mock / test mode — verify immediately
        const v = await api(`/deposit/verify/${r.reference}`);
        if (v.status === "success") {
          toast(`Deposit of ${money(amt)} successful!`, "success");
          await refresh();
          reloadDeposits();
          setAmount("");
        } else {
          toast("Deposit failed", "error");
        }
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const recheck = async (ref) => {
    try {
      const v = await api(`/deposit/verify/${ref}`);
      if (v.status === "success") {
        toast("Deposit confirmed!", "success");
        await refresh();
        reloadDeposits();
      } else if (v.status === "pending") {
        toast("Still waiting on the bank…");
      } else {
        toast("Transaction not confirmed", "error");
      }
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const quick = (settings?.quick_deposit_amounts || [3000, 5000, 10000, 25000, 50000, 100000]);

  return (
    <>
      <h1 className="page-title">Deposit</h1>
      <p className="page-sub">Top up your wallet to start investing</p>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>Amount (₦)</label>
          <input className="input" type="number" placeholder={`Min ${money(settings?.min_deposit || 3000)}`}
            value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {quick.map((q) => (
            <button key={q} type="button" className="btn soft sm" onClick={() => setAmount(String(q))}>{money(q, { compact: true })}</button>
          ))}
        </div>
        {settings?.multi_gateway_enabled && availableGateways.length > 1 && (
          <div className="field">
            <label>Payment method</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))", gap: 8 }}>
              {availableGateways.map((g, i) => {
                const active = gw === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGw(g)}
                    style={{
                      position: "relative",
                      padding: "14px 12px",
                      borderRadius: 14,
                      border: active ? "2px solid var(--brand)" : "1.5px solid var(--border)",
                      background: active ? "var(--brand-soft)" : "var(--surface)",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "border-color .15s ease, background .15s ease, transform .12s ease, box-shadow .15s ease",
                      transform: active ? "translateY(-1px)" : "none",
                      boxShadow: active ? "0 6px 16px -8px rgba(15,122,77,.4)" : "none",
                    }}
                  >
                    {active && (
                      <span style={{
                        position: "absolute", top: 6, right: 6, width: 18, height: 18,
                        borderRadius: "50%", background: "var(--brand)", color: "var(--brand-ink)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, lineHeight: 1,
                      }}>✓</span>
                    )}
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700, color: active ? "var(--brand)" : "var(--text-3)" }}>
                      Gateway {i + 1}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button className="btn primary block lg" disabled={busy}>{busy ? "Processing…" : "Proceed to pay"}</button>
      </form>

      <div className="section-head" style={{ marginTop: 8 }}>
        <h3>Recent deposits</h3>
      </div>
      {depositList.length === 0 ? (
        <div className="empty">No deposits yet.</div>
      ) : (
        <div className="list">
          {depositList.map((d) => (
            <div key={d.id} className="row">
              <div className={`ic ${d.status === "success" ? "brand" : d.status === "failed" ? "danger" : "gold"}`}>
                <Icon.ArrowDown />
              </div>
              <div className="body">
                <div className="t">{money(d.amount)}</div>
                <div className="s">{timeAgo(d.created_at)}</div>
              </div>
              <div className="end">
                <span className={`pill ${d.status === "success" ? "success" : d.status === "failed" ? "danger" : "warn"}`}>{d.status}</span>
                {d.status !== "success" && (
                  <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => recheck(d.reference)}>Recheck</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!qr} onClose={() => setQr(null)} title="Scan to pay">
        <div style={{ textAlign: "center", padding: 16 }}>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qr || "")}`} alt="QR code" style={{ borderRadius: 12 }} />
          <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 12, wordBreak: "break-all" }}>{qr}</p>
          <p className="page-sub" style={{ marginTop: 8 }}>Scan with your banking app to complete payment.</p>
        </div>
      </Modal>
    </>
  );
}
