import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon } from "../components/ui";

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function DepositTransfer() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();
  const [dep, setDep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api("/deposits")
      .then((r) => setDep((r || []).find((d) => d.reference === reference) || null))
      .catch(() => {});
  }, [reference]);

  // Tick the countdown clock every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const copyAccount = async () => {
    if (!dep || !dep.account_number) return;
    try {
      await navigator.clipboard.writeText(String(dep.account_number));
      setCopied(true);
      toast("Account number copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Could not copy", "error");
    }
  };

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

  const expiresAt = dep.expires_at ? new Date(dep.expires_at).getTime() : null;
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const expired = expiresAt != null && remainingMs <= 0;

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
              <div className="body">
                <div className="t" style={{ fontFamily: "var(--font-display)", letterSpacing: 1 }}>{dep.account_number}</div>
                <div className="s">Account number</div>
              </div>
              <button className="btn sm soft" onClick={copyAccount} style={{ marginLeft: "auto" }}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {expiresAt != null && (
          <div className="list" style={{ marginTop: 8 }}>
            <div className="row">
              <div className="ic gold"><Icon.Clock /></div>
              <div className="body">
                <div className="t" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", letterSpacing: 1 }}>
                  {expired ? "Expired" : `Expires in ${formatCountdown(remainingMs)}`}
                </div>
                <div className="s">{expired ? "This account has expired — generate a new one" : "Pay before the account expires"}</div>
              </div>
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
