import React, { useEffect } from "react";
import { api, money, timeAgo, formatDateTime, addHours } from "../api";
import { useAuth } from "../auth";
import { Icon } from "../components/ui";
import { useCachedData } from "../useCache";

export default function MyPackages() {
  const { refresh } = useAuth();
  const { data: list, loading } = useCachedData("/investments", () => api("/investments"));
  const items = list || [];

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalInvested = items.reduce((a, i) => a + Number(i.amount || 0), 0);
  const totalProfit = items.reduce((a, i) => a + Number(i.total_profit_paid || 0), 0);

  return (
    <>
      <h1 className="page-title">My packages</h1>
      <p className="page-sub">Track your active investments</p>

      <div className="stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="stat">
          <div className="ic brand"><Icon.Invest /></div>
          <div className="v">{money(totalInvested)}</div>
          <div className="l">Invested</div>
        </div>
        <div className="stat">
          <div className="ic gold"><Icon.Spark /></div>
          <div className="v">{money(totalProfit)}</div>
          <div className="l">Profit paid</div>
        </div>
      </div>

      {loading ? (
        <div className="center-screen"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty">No investments yet. Start one to grow your money.</div>
      ) : (
        <div className="list">
          {items.map((i) => {
            const pct = Math.min(100, (i.days_paid / i.duration_days) * 100);
            return (
              <div key={i.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: 16 }}>{i.product_name}</h3>
                  <span className={`pill ${i.status === "active" ? "success" : "neutral"}`}>{i.status}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13 }}>
                  <span className="page-sub">Invested</span>
                  <span style={{ fontWeight: 700 }}>{money(i.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                  <span className="page-sub">Profit so far</span>
                  <span style={{ fontWeight: 700, color: "var(--success)" }}>+{money(i.total_profit_paid)}</span>
                </div>
                <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 99, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--brand),var(--accent))" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                  <span>{i.days_paid}/{i.duration_days} days</span>
                  <span>{timeAgo(i.started_at)}</span>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Invested on</span>
                    <span style={{ fontWeight: 600 }}>{formatDateTime(i.started_at)}</span>
                  </div>
                  {i.status === "active" ? (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-3)" }}>Next profit</span>
                      <span style={{ fontWeight: 600, color: "var(--brand)" }}>{formatDateTime(addHours(i.last_payout_at || i.started_at, 24))}</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-3)" }}>Completed</span>
                      <span style={{ fontWeight: 600 }}>{formatDateTime(i.completed_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
