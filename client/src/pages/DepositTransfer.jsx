import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon } from "../components/ui";

export default function DepositTransfer() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();
  const [dep, setDep] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/deposits")
      .then((r) => setDep((r || []).find((d) => d.reference === reference) || null))
      .catch(() => {});
  }, [reference]);

  const verify = async () => {
    setBusy(true);
    try {
      await api("/transactions/poll", { method: "POST" });
      const v = await api(`/deposit/verify/${reference}`);
      if (v.status === "success") {
        toast("Payment confirmed!", "success");
        await refresh();
      } else {
        toast("Still processing — we'll keep checking in the background.");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
      navigate("/history");
    }
  };

  if (!dep) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <>
      <button className="btn ghost sm" onClick={() => navigate("/deposit")} style={{ alignSelf: "flex-start" }}>
        <Icon.Back /> Back
      </button>
      <h1 className="page-title">Complete transfer</h1>
      <p className="page-sub">Send the exact amount from your bank app</p>

      <div className="card">
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <div className="page-sub" style={{ fontSize: 11 }}>Send exactly</div>
          <div className="hero" style={{ padding: "16px 20px", borderRadius: 16, marginTop: 8 }}>
            <div className="balance" style={{ fontSize: 32 }}>{money(dep.amount)}</div>
          </div>
        </div>

        {dep.account_number && (
          <div className="list" style={{ marginTop: 8 }}>
            <div className="row">
              <div className="ic brand"><Icon.Bank /></div>
              <div className="body"><div className="t">{dep.bank_name}</div><div className="s">Bank</div></div>
            </div>
            <div className="row">
              <div className="ic brand"><Icon.Copy /></div>
              <div className="body"><div className="t" style={{ fontFamily: "var(--font-display)", letterSpacing: 1 }}>{dep.account_number}</div><div className="s">Account number</div></div>
            </div>
          </div>
        )}

        <button className="btn primary block lg" style={{ marginTop: 16 }} disabled={busy} onClick={verify}>
          {busy ? "Checking…" : "I have paid — check status"}
        </button>
      </div>
    </>
  );
}
