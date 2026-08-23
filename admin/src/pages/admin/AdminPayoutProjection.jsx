import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowLeft, Clock, Package, TrendingUp } from "lucide-react";
import { readCache, writeCache } from "@/hooks/useCachedData";

export default function AdminPayoutProjection() {
  const [data, setData] = useState(() => readCache("/admin/stats/payout-projection") ?? null);

  useEffect(() => {
    api.get("/admin/stats/payout-projection").then(({ data }) => { setData(data); writeCache("/admin/stats/payout-projection", data); }).catch(() => {});
  }, []);

  return (
    <AdminLayout title="">
      <Link to="/pentest/fuser" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]" data-testid="back-to-dashboard">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>
      <div className="mt-2 text-label">Next 24h payout</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)]" data-testid="payout-projection-title">Projected payout</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Sum of every active investment's daily profit. This is what users will be credited in the next 24 hours.</p>

      {!data && <div className="card-soft p-6 mt-6 text-center text-[color:var(--text-tertiary)]">Loading…</div>}

      {data && (
        <>
          <div className="rounded-3xl p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[color:var(--brand)] via-[color:var(--brand-hover)] to-[color:var(--accent-main)] text-white shadow-xl mt-6" data-testid="projected-total-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/85">Total projected payout</div>
                <div className="font-display font-extrabold text-4xl md:text-5xl mt-2 leading-none" data-testid="projected-total-value">{formatNaira(data.total)}</div>
                <div className="text-white/80 text-xs mt-3">From {data.active_count.toLocaleString()} active investment{data.active_count === 1 ? "" : "s"}</div>
              </div>
              <Clock className="w-9 h-9 text-white/85" />
            </div>
          </div>

          {/* By product */}
          <div className="card-soft p-5 mt-5" data-testid="by-product-card">
            <div className="text-label flex items-center gap-2"><Package className="w-3.5 h-3.5" /> By product</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-[color:var(--text-secondary)]">
                  <tr className="border-b border-[color:var(--border-default)]">
                    <th className="text-left p-2 text-xs uppercase tracking-wider">Product</th>
                    <th className="text-right p-2 text-xs uppercase tracking-wider">Active</th>
                    <th className="text-right p-2 text-xs uppercase tracking-wider">Total invested</th>
                    <th className="text-right p-2 text-xs uppercase tracking-wider">24h payout</th>
                    <th className="text-right p-2 text-xs uppercase tracking-wider">Yield</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_product.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-[color:var(--text-tertiary)]">No active investments.</td></tr>
                  )}
                  {data.by_product.map((p) => (
                    <tr key={p.product_name} className="border-b border-[color:var(--border-default)] last:border-0" data-testid={`product-row-${p.product_name}`}>
                      <td className="p-2 font-semibold text-[color:var(--text-primary)]">{p.product_name}</td>
                      <td className="p-2 text-right tabular-nums">{p.count.toLocaleString()}</td>
                      <td className="p-2 text-right tabular-nums text-[color:var(--text-secondary)]">{formatNaira(p.invested)}</td>
                      <td className="p-2 text-right tabular-nums font-bold text-[color:var(--brand)]">{formatNaira(p.total)}</td>
                      <td className="p-2 text-right tabular-nums text-xs text-[color:var(--text-tertiary)]">
                        {p.invested > 0 ? `${((p.total / p.invested) * 100).toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top contributors */}
          <div className="card-soft p-5 mt-5" data-testid="top-contributors-card">
            <div className="text-label flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Top 15 contributors to the next payout</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-[color:var(--text-secondary)]">
                  <tr className="border-b border-[color:var(--border-default)]">
                    <th className="text-left p-2 text-xs uppercase tracking-wider">User</th>
                    <th className="text-left p-2 text-xs uppercase tracking-wider">Product</th>
                    <th className="text-right p-2 text-xs uppercase tracking-wider">Invested</th>
                    <th className="text-right p-2 text-xs uppercase tracking-wider">Daily payout</th>
                    <th className="text-left p-2 text-xs uppercase tracking-wider">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_contributors.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-[color:var(--text-tertiary)]">No active investments.</td></tr>
                  )}
                  {data.top_contributors.map((inv) => (
                    <tr key={inv.id} className="border-b border-[color:var(--border-default)] last:border-0">
                      <td className="p-2">
                        <div className="font-semibold text-[color:var(--text-primary)] text-xs">{inv.user_name}</div>
                        <div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{inv.user_phone}</div>
                      </td>
                      <td className="p-2 text-xs text-[color:var(--text-secondary)]">{inv.product_name}</td>
                      <td className="p-2 text-right tabular-nums text-xs">{formatNaira(inv.amount)}</td>
                      <td className="p-2 text-right tabular-nums font-bold text-[color:var(--brand)]">{formatNaira(inv.daily_profit_amount)}</td>
                      <td className="p-2 text-xs text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(inv.start_date || inv.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
