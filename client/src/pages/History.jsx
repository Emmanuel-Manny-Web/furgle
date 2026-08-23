import React, { useEffect, useState, useCallback } from "react";
import { api, money, timeAgo } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon } from "../components/ui";
import { useCachedData } from "../useCache";

const TYPE_META = {
  deposit: { icon: "ArrowDown", cls: "brand", sign: "+" },
  invest: { icon: "Invest", cls: "accent", sign: "-" },
  profit: { icon: "Spark", cls: "success", sign: "+" },
  deposit_bonus: { icon: "Gift", cls: "gold", sign: "+" },
  withdrawal: { icon: "ArrowUp", cls: "gold", sign: "-" },
  bonus: { icon: "Gift", cls: "brand", sign: "+" },
  daily_claim: { icon: "Gift", cls: "accent", sign: "+" },
  coupon: { icon: "Gift", cls: "gold", sign: "+" },
  referral: { icon: "Team", cls: "brand", sign: "+" },
  refund: { icon: "ArrowDown", cls: "success", sign: "+" },
  adjustment_credit: { icon: "Spark", cls: "success", sign: "+" },
  adjustment_debit: { icon: "Spark", cls: "danger", sign: "-" },
};

const STATUS_PILL = {
  pending: { cls: "warn", label: "Pending" },
  processing: { cls: "accent", label: "Processing" },
  failed: { cls: "danger", label: "Failed" },
  rejected: { cls: "danger", label: "Rejected" },
};

async function fetchHistory() {
  const [txs, deps, wds] = await Promise.all([
    api("/transactions"),
    api("/deposits"),
    api("/withdrawals"),
  ]);

  const combined = [];
  for (const t of txs || []) combined.push({ src: "tx", ...t });

  for (const d of deps || []) {
    if (d.status !== "success") {
      combined.push({
        src: "deposit", id: d.id, type: "deposit", amount: d.amount,
        description: "Deposit", status: d.status, created_at: d.created_at,
      });
    }
  }

  for (const w of wds || []) {
    if (!["success", "paid"].includes(w.status)) {
      combined.push({
        src: "withdrawal", id: w.id, type: "withdrawal", amount: -w.amount,
        description: "Withdrawal", status: w.status, created_at: w.created_at,
      });
    }
  }

  combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return combined;
}

export default function History() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [polling, setPolling] = useState(false);
  const { data: items, loading, reload } = useCachedData("history", fetchHistory);
  const list = items || [];

  const poll = useCallback(async (silent) => {
    setPolling(true);
    try {
      await api("/transactions/poll", { method: "POST" });
      await refresh();
      await reload();
      if (!silent) toast("Checked for updates", "success");
    } catch (e) {
      if (!silent) toast(e.message, "error");
    } finally {
      setPolling(false);
    }
  }, [reload, refresh, toast]);

  useEffect(() => {
    poll(true);
    const t = setInterval(() => poll(true), 15000);
    return () => clearInterval(t);
  }, [poll]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-sub">All your wallet activity</p>
        </div>
        <button className="btn soft sm" onClick={() => poll(false)} disabled={polling}>
          {polling ? "Checking…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="center-screen"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="empty">No transactions yet.</div>
      ) : (
        <div className="list">
          {list.map((t) => {
            const m = TYPE_META[t.type] || { icon: "Spark", cls: "neutral", sign: "" };
            const C = Icon[m.icon] || Icon.Spark;
            const pos = Number(t.amount) >= 0;
            const pill = t.status && STATUS_PILL[t.status];
            const isPending = t.src !== "tx" && !!pill;
            return (
              <div key={t.id} className="row">
                <div className={`ic ${isPending ? "neutral" : m.cls}`}><C /></div>
                <div className="body">
                  <div className="t">{t.description}</div>
                  <div className="s">{timeAgo(t.created_at)}{t.status ? ` · ${t.status}` : ""}</div>
                </div>
                <div className="end">
                  <div className="a" style={{ color: isPending ? "var(--text-2)" : pos ? "var(--success)" : "var(--text)" }}>
                    {pos ? "+" : ""}{money(t.amount)}
                  </div>
                  {pill && <span className={`pill ${pill.cls}`} style={{ marginTop: 4 }}>{pill.label}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
