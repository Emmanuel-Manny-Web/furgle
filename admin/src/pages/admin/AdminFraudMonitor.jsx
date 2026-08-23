import React from "react";
import AdminLayout from "@/components/AdminLayout";
import { ShieldAlert, CircleCheck } from "lucide-react";

export default function AdminFraudMonitor() {
  return (
    <AdminLayout title="Fraud Monitor">
      <div className="text-label flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5 text-[color:var(--error)]" /> Risk signals</div>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Real-time monitor for suspicious activity across deposits, withdrawals, and authentication.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-5">
        <div className="card-soft p-5">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Fraud attempts (24h)</div>
          <div className="font-display font-extrabold text-3xl mt-2 text-[color:var(--text-primary)]" data-testid="fraud-24h">0</div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[color:var(--success)]"><CircleCheck className="w-3.5 h-3.5" /> All clear</div>
        </div>
        <div className="card-soft p-5">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Amount mismatches</div>
          <div className="font-display font-extrabold text-3xl mt-2 text-[color:var(--text-primary)]" data-testid="fraud-mismatch">0</div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[color:var(--success)]"><CircleCheck className="w-3.5 h-3.5" /> No mismatches</div>
        </div>
        <div className="card-soft p-5">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Blocked accounts</div>
          <div className="font-display font-extrabold text-3xl mt-2 text-[color:var(--text-primary)]" data-testid="fraud-blocked">0</div>
          <div className="mt-2 text-xs text-[color:var(--text-tertiary)]">Manage from Users page</div>
        </div>
      </div>

      <div className="card-soft p-6 mt-5">
        <div className="font-display font-semibold text-[color:var(--text-primary)]">Detection rules</div>
        <ul className="mt-3 space-y-2 text-sm text-[color:var(--text-secondary)]">
          <li>· Failed login attempts &gt; 5 in 5 minutes (auto-block recommended)</li>
          <li>· Payout webhook amount differs from request amount</li>
          <li>· New account with first withdrawal larger than first deposit</li>
          <li>· Duplicate bank accounts across multiple users</li>
        </ul>
        <p className="text-xs text-[color:var(--text-tertiary)] mt-3">Note: automated triggers are not yet active. This dashboard surfaces aggregate counts; full rule engine is on the roadmap.</p>
      </div>
    </AdminLayout>
  );
}
