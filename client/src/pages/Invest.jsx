import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon, Modal } from "../components/ui";
import { useCachedData } from "../useCache";

export default function Invest() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: products, loading } = useCachedData("/products", () => api("/products", { auth: false }));
  const productList = products || [];

  const open = (p) => {
    setSelected(p);
    setAmount(String(p.price || ""));
  };

  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(selected?.price);
    if (!amt || amt <= 0) return toast("Invalid plan price", "error");
    if (amt > (user?.wallet_balance || 0)) return toast("Insufficient balance", "error");
    setBusy(true);
    try {
      await api("/invest", { method: "POST", body: { product_id: selected.id } });
      toast("Investment started!", "success");
      await refresh();
      setSelected(null);
      navigate("/my-packages");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <>
      <h1 className="page-title">Invest</h1>
      <p className="page-sub">Pick a plan and grow your money daily</p>

      {productList.length === 0 && <div className="empty">No investment plans available yet.</div>}

      <div className="list">
        {productList.map((p) => {
          const roi = (p.daily_profit_percent * p.duration_days).toFixed(0);
          return (
            <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              {p.image_url && (
                <img src={p.image_url} alt={p.name} style={{ width: "100%", height: 120, objectFit: "cover" }} />
              )}
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: 18 }}>{p.name}</h3>
                  <span className="pill accent">{roi}% ROI</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>{p.daily_profit_percent}% daily · {p.duration_days} days</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                  <div>
                    <div className="page-sub" style={{ fontSize: 11 }}>From</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--brand)" }}>{money(p.price)}</div>
                  </div>
                  <button className="btn primary sm" onClick={() => open(p)}>Invest</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <form onSubmit={submit}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <span className="page-sub">Wallet balance</span>
              <span style={{ fontWeight: 700 }}>{money(user?.wallet_balance)}</span>
            </div>
            <div className="field">
              <label>Amount (₦)</label>
              <input
                className="input"
                type="number"
                value={amount}
                readOnly
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>
              {selected.daily_profit_percent}% daily profit · {money((Number(amount) || 0) * selected.daily_profit_percent / 100)}/day · for {selected.duration_days} days
            </div>
            <button className="btn primary block lg" disabled={busy}>
              {busy ? "Investing…" : `Invest ${money(Number(amount) || 0)}`}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
