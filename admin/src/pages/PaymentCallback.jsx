import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function PaymentCallback() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const reference = sp.get("reference") || sp.get("trxref");
    if (!reference) { setStatus("failed"); return; }
    (async () => {
      try {
        const { data } = await api.get(`/deposit/verify/${reference}`);
        if (data.status === "success") {
          setStatus("success");
          await refresh();
          setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
        } else {
          setStatus("failed");
        }
      } catch {
        setStatus("failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--app-bg)] px-4">
      <div className="card-soft p-10 text-center max-w-md w-full" data-testid="payment-callback">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-[color:var(--brand)] mx-auto" />
            <div className="font-display text-xl mt-4">Verifying payment…</div>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-[color:var(--accent-main)] mx-auto" />
            <div className="font-display text-2xl mt-4">Payment confirmed</div>
            <p className="text-sm text-[color:var(--text-secondary)] mt-1">Your wallet has been credited.</p>
          </>
        )}
        {status === "failed" && (
          <>
            <XCircle className="w-12 h-12 text-[color:var(--error)] mx-auto" />
            <div className="font-display text-2xl mt-4">Payment failed</div>
            <button onClick={() => navigate("/deposit")} className="mt-4 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white px-5 py-2.5 rounded-lg font-semibold">
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
