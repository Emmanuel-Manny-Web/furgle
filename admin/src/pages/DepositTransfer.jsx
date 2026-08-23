import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import { ArrowLeft, Building2, CheckCircle2, Clock, Copy, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

const WINDOW_MINUTES = 60; // Marasoft dynamic accounts: 60-min payment window

function CopyTile({ label, value, big, testid }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try { await navigator.clipboard.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <button onClick={copy} data-testid={testid}
      className="w-full text-left p-4 rounded-xl bg-[color:var(--surface-alt)] hover:bg-[color:var(--brand-soft)] transition-colors group">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">{label}</div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <div className={`font-mono ${big ? "font-display font-extrabold text-2xl tabular-nums" : "font-semibold text-sm"} text-[color:var(--text-primary)] truncate`}>{value || "—"}</div>
        {copied ? <CheckCircle2 className="w-4 h-4 text-[color:var(--success)] shrink-0" /> : <Copy className="w-4 h-4 text-[color:var(--text-tertiary)] group-hover:text-[color:var(--brand)] shrink-0" />}
      </div>
    </button>
  );
}

function pad(n) { return String(n).padStart(2, "0"); }

export default function DepositTransfer() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [deposit, setDeposit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef(null);

  // Load deposit on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/deposits/${reference}`);
        if (alive) setDeposit(data);
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Deposit not found");
        navigate("/deposit", { replace: true });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reference, navigate]);

  // Tick clock every second for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expiresAt = useMemo(() => {
    if (!deposit?.created_at) return null;
    const created = new Date(deposit.created_at).getTime();
    return created + WINDOW_MINUTES * 60 * 1000;
  }, [deposit]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const expired = !!expiresAt && remainingMs <= 0;
  const totalMs = WINDOW_MINUTES * 60 * 1000;
  const percent = expiresAt ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);

  const isPending = deposit?.status === "pending" || deposit?.status === "processing";
  const isSuccess = deposit?.status === "success";
  const isFailed = deposit?.status === "failed";

  const verify = async (silent = false) => {
    if (!deposit) return;
    if (!silent) setVerifying(true);
    try {
      const { data } = await api.get(`/deposit/verify/${reference}`);
      if (data.status === "success") {
        if (!silent) toast.success(`Deposit of ${formatNaira(deposit.amount)} credited!`);
        await refresh();
        setDeposit((d) => ({ ...d, status: "success" }));
        if (!silent) {
          // User-initiated success → go straight to deposits list highlighted
          navigate("/deposit", { state: { highlightRef: reference } });
        } else {
          // Silent poll success → show overlay briefly then redirect
          setTimeout(() => navigate("/deposit", { state: { highlightRef: reference } }), 1500);
        }
      } else if (data.status === "failed") {
        if (!silent) {
          toast.info("Payment not confirmed yet. We'll keep watching.");
          navigate("/deposit", { state: { highlightRef: reference } });
        }
        setDeposit((d) => ({ ...d, status: "failed" }));
      } else {
        // pending
        if (!silent) {
          toast.info("Payment not confirmed yet — we'll keep checking in the background.");
          navigate("/deposit", { state: { highlightRef: reference } });
        }
      }
    } catch (e) {
      if (!silent) toast.error(e?.response?.data?.detail || "Verification failed");
    } finally {
      if (!silent) setVerifying(false);
    }
  };

  // Background auto-poll every 12s while pending and not expired
  useEffect(() => {
    if (!isPending || expired) return;
    pollRef.current = setInterval(() => verify(true), 12000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, expired, reference]);

  if (loading) {
    return (
      <UserLayout>
        <div className="text-[color:var(--text-secondary)] text-sm">Loading transfer details…</div>
      </UserLayout>
    );
  }

  if (!deposit) return null;

  return (
    <UserLayout>
      <button onClick={() => navigate("/deposit")} data-testid="transfer-back-btn"
        className="inline-flex items-center gap-1.5 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to deposits
      </button>

      <div className="text-label mt-3">Funds · Bank transfer</div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">Complete your transfer</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">
        Send the exact amount below from your bank app. Your wallet credits automatically — no need to upload anything.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="card-soft p-6 lg:col-span-2 relative overflow-hidden" data-testid="deposit-bank-instructions">
          {isSuccess && (
            <div className="absolute inset-0 bg-[color:var(--success-soft,rgba(34,197,94,0.08))] backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
              <div className="text-center" data-testid="transfer-success-state">
                <CheckCircle2 className="w-14 h-14 text-[color:var(--success)] mx-auto" />
                <div className="mt-3 font-display font-extrabold text-xl">Payment received!</div>
                <div className="text-sm text-[color:var(--text-secondary)] mt-1">{formatNaira(deposit.amount)} credited to your wallet.</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--accent-main)] text-white flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-label">Send exactly</div>
              <div className="font-display font-extrabold text-2xl text-[color:var(--text-primary)] leading-tight">{formatNaira(deposit.amount)}</div>
            </div>
          </div>

          {/* Countdown */}
          <div className={`mt-5 rounded-xl p-4 border ${expired ? "border-[color:var(--error)] bg-[color:var(--error-soft,rgba(239,68,68,0.08))]" : "border-[color:var(--border-default)] bg-[color:var(--surface-alt)]"}`} data-testid="transfer-countdown">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {expired ? (
                  <XCircle className="w-4 h-4 text-[color:var(--error)]" />
                ) : (
                  <Clock className="w-4 h-4 text-[color:var(--brand)]" />
                )}
                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
                  {expired ? "Window expired" : "Account expires in"}
                </span>
              </div>
              <span className={`font-display font-extrabold tabular-nums text-2xl ${expired ? "text-[color:var(--error)]" : "text-[color:var(--text-primary)]"}`} data-testid="transfer-countdown-clock">
                {expired ? "00:00" : `${pad(mins)}:${pad(secs)}`}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-[color:var(--surface)] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${expired ? "bg-[color:var(--error)]" : "bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent-main)]"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[color:var(--text-tertiary)]">
              {expired
                ? "This virtual account is no longer valid. Start a new deposit to get a fresh account."
                : "Transfer before the timer ends — Marasoft will close the virtual account after expiry."}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <CopyTile label="Bank" value={deposit.bank_name} testid="dep-bank" />
            <CopyTile label="Account name" value={deposit.account_name} testid="dep-acct-name" />
            <CopyTile label="Account number" value={deposit.account_number} big testid="dep-acct-no" />
            <CopyTile label="Amount" value={formatNaira(deposit.amount)} big testid="dep-amount" />
          </div>

          <div className="mt-5 p-4 rounded-xl bg-[color:var(--gold-soft)] text-[color:var(--warning)] text-xs">
            <div className="font-bold mb-1">Important</div>
            <ul className="space-y-1 list-disc pl-4">
              <li>Send the <span className="font-bold">exact</span> amount shown above.</li>
              <li>This virtual account is unique to this deposit — do not reuse it later.</li>
              <li>Your wallet credits automatically. We re-check every few seconds.</li>
            </ul>
          </div>

          {!expired ? (
            <button onClick={() => verify(false)} disabled={verifying || !isPending}
              data-testid="deposit-verify-btn"
              className="mt-5 w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] py-3.5 rounded-full font-semibold disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${verifying ? "animate-spin" : ""}`} /> {verifying ? "Checking…" : "I have paid — check status"}
            </button>
          ) : (
            <button onClick={() => navigate("/deposit")}
              data-testid="transfer-start-new-btn"
              className="mt-5 w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] py-3.5 rounded-full font-semibold">
              Start a new deposit
            </button>
          )}

          {isFailed && !expired && (
            <p className="mt-3 text-xs text-[color:var(--error)] text-center">Marasoft reported this transaction failed. Please start a new deposit.</p>
          )}
        </div>

        <div className="card-soft p-6">
          <div className="text-label">How it works</div>
          <ol className="mt-3 text-sm text-[color:var(--text-secondary)] space-y-3">
            <li>1. Open your banking app or USSD.</li>
            <li>2. Send the exact amount to the account number above.</li>
            <li>3. Wait a moment — your wallet credits automatically.</li>
          </ol>
          <div className="mt-4 p-3 rounded-lg bg-[color:var(--brand-soft)] text-[11px] text-[color:var(--text-secondary)]">
            <span className="font-bold text-[color:var(--brand)]">Tip:</span> Most banks settle in under 60 seconds. If your wallet hasn't updated after 5 minutes, tap "I have paid — check status".
          </div>
        </div>
      </div>
    </UserLayout>
  );
}
