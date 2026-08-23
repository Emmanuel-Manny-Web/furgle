import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { FileBarChart2, Download } from "lucide-react";
import { readCache, writeCache } from "@/hooks/useCachedData";

function Row({ label, value, tone = "" }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[color:var(--border-light)] last:border-0">
      <span className="text-sm text-[color:var(--text-secondary)]">{label}</span>
      <span className={`font-display font-bold text-base ${tone}`}>{value}</span>
    </div>
  );
}

export default function AdminFinancialReport() {
  const [s, setS] = useState(() => readCache("/admin/stats/extended") ?? null);

  useEffect(() => {
    api.get("/admin/stats/extended").then(({ data }) => { setS(data); writeCache("/admin/stats/extended", data); });
  }, []);

  const exportCsv = () => {
    if (!s) return;
    const rows = [
      ["Metric", "Value (NGN)"],
      ["Platform profit", s.platform_profit],
      ["Total deposits", s.total_deposits],
      ["Total paid out (withdrawals)", s.all_time.total_paid_out],
      ["Total bonuses + coupons", s.all_time.total_bonuses],
      ["Total referral commissions", s.all_time.total_referral_paid],
      ["Total profit credited", s.all_time.total_profit_paid],
      ["Active investments", s.active_investments],
      ["Total invested (capital)", s.all_time.total_invested_amount],
      ["Pending withdrawals", s.pending_withdrawals],
      ["Awaiting verification (pending deposits)", s.all_time.awaiting_verification],
      ["Users", s.users],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financial-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!s) return <AdminLayout title="Financial Report"><div className="text-[color:var(--text-secondary)]">Loading…</div></AdminLayout>;

  return (
    <AdminLayout title="Financial Report">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-label flex items-center gap-2"><FileBarChart2 className="w-3.5 h-3.5 text-[color:var(--brand)]" /> All-time consolidated report</div>
          <p className="text-sm text-[color:var(--text-secondary)] mt-1">Single source of truth for accounting & reconciliation.</p>
        </div>
        <button onClick={exportCsv} data-testid="export-csv"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] inline-flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        <div className="card-soft p-5">
          <div className="text-label">Cashflow</div>
          <Row label="Total deposits" value={formatNaira(s.total_deposits)} tone="text-[color:var(--success)]" />
          <Row label="Total withdrawals paid out" value={`−${formatNaira(s.all_time.total_paid_out)}`} tone="text-[color:var(--error)]" />
          <Row label="Welcome / coupon bonuses" value={`−${formatNaira(s.all_time.total_bonuses)}`} tone="text-[color:var(--error)]" />
          <Row label="Referral commissions paid" value={`−${formatNaira(s.all_time.total_referral_paid)}`} tone="text-[color:var(--error)]" />
          <Row label="Daily profit credited" value={`−${formatNaira(s.all_time.total_profit_paid)}`} tone="text-[color:var(--error)]" />
          <div className="mt-3 rounded-xl bg-gradient-to-br from-[color:var(--accent-main)] to-[color:var(--brand)] text-white p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold opacity-85">Net platform profit</div>
            <div className="font-display font-extrabold text-3xl mt-1" data-testid="report-profit">{formatNaira(s.platform_profit)}</div>
          </div>
        </div>

        <div className="card-soft p-5">
          <div className="text-label">Activity</div>
          <Row label="Total users" value={s.users} />
          <Row label="Active investments" value={s.active_investments} />
          <Row label="Total invested (capital)" value={formatNaira(s.all_time.total_invested_amount)} />
          <Row label="Pending withdrawals" value={s.pending_withdrawals} />
          <Row label="Awaiting verification (deposits)" value={s.all_time.awaiting_verification} />
          <Row label="Next 24h payout projection" value={formatNaira(s.next_24h_payout)} />
        </div>
      </div>
    </AdminLayout>
  );
}
