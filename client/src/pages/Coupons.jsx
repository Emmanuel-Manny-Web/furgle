import React, { useState } from "react";
import { api, money } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon } from "../components/ui";

export default function Coupons() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return toast("Enter a coupon code", "error");
    setBusy(true);
    try {
      const r = await api("/coupons/redeem", { method: "POST", body: { code: code.trim() } });
      toast(`${money(r.amount)} credited!`, "success");
      await refresh();
      setCode("");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Promo codes</h1>
      <p className="page-sub">Redeem a coupon to get instant cash</p>

      <div className="card">
        <form onSubmit={submit}>
          <div className="field">
            <label>Coupon code</label>
            <input className="input" placeholder="e.g. NJW8VZQY" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ textTransform: "uppercase", fontFamily: "var(--font-display)", letterSpacing: 2 }} />
          </div>
          <button className="btn accent block lg" disabled={busy}>{busy ? "Redeeming…" : "Redeem code"}</button>
        </form>
      </div>

      <div className="card tint" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div className="ic gold" style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon.Gift /></div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          Enter a valid coupon code to add its value to your wallet instantly.
        </div>
      </div>
    </>
  );
}
