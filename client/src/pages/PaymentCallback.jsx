import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Icon } from "../components/ui";

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [state, setState] = useState("loading");

  useEffect(() => {
    const ref = params.get("reference") || params.get("trxref");
    if (!ref) {
      setState("failed");
      return;
    }
    (async () => {
      try {
        let status = "pending";
        // The gateway webhook is async, so poll briefly for the credit to land.
        for (let i = 0; i < 8; i++) {
          const r = await api(`/deposit/verify/${ref}`);
          status = r.status;
          if (status === "success" || status === "failed") break;
          await new Promise((res) => setTimeout(res, 1500));
        }
        if (status === "success") {
          await refresh();
          setState("success");
          setTimeout(() => navigate("/deposit", { replace: true }), 1600);
        } else if (status === "pending") {
          setState("pending");
        } else {
          setState("failed");
        }
      } catch {
        setState("failed");
      }
    })();
  }, [params, navigate, refresh]);

  return (
    <div className="auth">
      <div className="box" style={{ textAlign: "center" }}>
        <div className="card" style={{ padding: 36 }}>
          {state === "loading" && (
            <>
              <div className="spinner" />
              <p style={{ marginTop: 16, color: "var(--text-2)" }}>Verifying payment…</p>
            </>
          )}
          {state === "success" && (
            <>
              <div className="ic brand" style={{ width: 56, height: 56, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}><Icon.Check /></div>
              <h2 style={{ marginTop: 16 }}>Payment confirmed</h2>
              <p className="page-sub" style={{ marginTop: 6 }}>Your wallet has been credited.</p>
            </>
          )}
          {state === "pending" && (
            <>
              <div className="ic gold" style={{ width: 56, height: 56, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}><Icon.Clock /></div>
              <h2 style={{ marginTop: 16 }}>Still processing</h2>
              <p className="page-sub" style={{ marginTop: 6 }}>We'll credit your wallet once the bank confirms.</p>
              <button className="btn primary block" style={{ marginTop: 20 }} onClick={() => navigate("/deposit")}>Back to deposits</button>
            </>
          )}
          {state === "failed" && (
            <>
              <div className="ic danger" style={{ width: 56, height: 56, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}><Icon.History /></div>
              <h2 style={{ marginTop: 16 }}>Payment not found</h2>
              <p className="page-sub" style={{ marginTop: 6 }}>We couldn't verify this payment.</p>
              <button className="btn primary block" style={{ marginTop: 20 }} onClick={() => navigate("/deposit")}>Back to deposits</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
