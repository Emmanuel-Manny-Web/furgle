import React, { useEffect, useMemo, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import {
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, Sparkles, Gift, Ticket, Users, RefreshCcw,
  ArrowDownLeft, ArrowUpRight, Receipt,
} from "lucide-react";

const types = [
  { v: "", label: "All" },
  { v: "deposit", label: "Deposits" },
  { v: "withdrawal", label: "Withdrawals" },
  { v: "profit", label: "Profits" },
];

const meta = {
  deposit:    { icon: ArrowDownToLine, color: "var(--success)",     soft: "var(--success-soft)" },
  withdrawal: { icon: ArrowUpFromLine, color: "var(--error)",       soft: "var(--error-soft)" },
  invest:     { icon: TrendingUp,      color: "var(--brand)",       soft: "var(--brand-soft)" },
  profit:     { icon: Sparkles,        color: "var(--accent-main)", soft: "var(--accent-soft)" },
  referral:   { icon: Users,           color: "var(--brand)",       soft: "var(--brand-soft)" },
  bonus:      { icon: Gift,            color: "var(--gold)",        soft: "var(--gold-soft)" },
  coupon:     { icon: Ticket,          color: "var(--accent-main)", soft: "var(--accent-soft)" },
  refund:     { icon: RefreshCcw,      color: "var(--text-tertiary)", soft: "var(--surface-alt)" },
};

export default function History() {
  const [filter, setFilter] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/transactions", { params: filter ? { ttype: filter } : {} })
      .then(({ data }) => setItems(data))
      .finally(() => setLoading(false));
  }, [filter]);

  const { moneyIn, moneyOut } = useMemo(() => {
    let i = 0, o = 0;
    for (const t of items) { if (t.amount >= 0) i += t.amount; else o += Math.abs(t.amount); }
    return { moneyIn: i, moneyOut: o };
  }, [items]);

  // Group transactions by calendar day, preserving the API's newest-first order
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of items) {
      const k = formatDate(t.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <UserLayout>
      <div className="overflow-x-hidden" data-testid="history-root">
        <div className="text-label">Wallet log</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1 text-[color:var(--text-primary)]">Transaction History</h1>
        <p className="text-sm text-[color:var(--text-secondary)] mt-1">Every credit and debit on your wallet, grouped by day.</p>

        {/* Money in / out summary */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="card-soft p-4" data-testid="money-in">
            <div className="w-9 h-9 rounded-xl bg-[color:var(--success-soft)] text-[color:var(--success)] flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <div className="font-display font-bold text-xl sm:text-2xl text-[color:var(--text-primary)] leading-none mt-3 break-all">{formatNaira(moneyIn)}</div>
            <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">Money in {filter ? `· ${filter}` : ""}</div>
          </div>
          <div className="card-soft p-4" data-testid="money-out">
            <div className="w-9 h-9 rounded-xl bg-[color:var(--error-soft)] text-[color:var(--error)] flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div className="font-display font-bold text-xl sm:text-2xl text-[color:var(--text-primary)] leading-none mt-3 break-all">{formatNaira(moneyOut)}</div>
            <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">Money out {filter ? `· ${filter}` : ""}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-5 pb-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="history-filters">
          {types.map(t => (
            <button key={t.v} onClick={() => setFilter(t.v)} data-testid={`filter-${t.v || "all"}`}
              className={`shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                filter === t.v
                  ? "bg-[color:var(--brand)] text-[color:var(--brand-ink)]"
                  : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-2)]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="mt-6 space-y-6" data-testid="history-feed">
          {loading ? (
            [0, 1, 2].map((g) => (
              <div key={g}>
                <div className="h-3 w-24 rounded bg-[color:var(--surface-2)] animate-pulse mb-2.5" />
                <div className="card-soft divide-y divide-[color:var(--border-light)]">
                  {[0, 1, 2].map((r) => (
                    <div key={r} className="flex items-center gap-3 p-3.5">
                      <div className="w-10 h-10 rounded-xl bg-[color:var(--surface-2)] animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/3 rounded bg-[color:var(--surface-2)] animate-pulse" />
                        <div className="h-2.5 w-1/2 rounded bg-[color:var(--surface-2)] animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : items.length === 0 ? (
            <div className="card-soft p-10 text-center" data-testid="history-empty">
              <div className="w-12 h-12 rounded-2xl bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] flex items-center justify-center mx-auto">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="text-sm text-[color:var(--text-secondary)] mt-3">No {filter || ""} transactions yet.</div>
            </div>
          ) : (
            groups.map(([date, txs]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="text-[11px] uppercase tracking-[0.15em] font-bold text-[color:var(--text-tertiary)]">{date}</span>
                  <span className="flex-1 h-px bg-[color:var(--border-light)]" />
                  <span className="text-[11px] text-[color:var(--text-tertiary)]">{txs.length} {txs.length === 1 ? "entry" : "entries"}</span>
                </div>
                <div className="card-soft overflow-hidden divide-y divide-[color:var(--border-light)]">
                  {txs.map((t) => {
                    const m = meta[t.type] || meta.refund;
                    const Icon = m.icon;
                    const credit = t.amount >= 0;
                    return (
                      <div key={t.id} data-testid={`tx-${t.id}`} className="flex items-center gap-3 p-3.5 hover:bg-[color:var(--surface-alt)] transition-colors">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: m.soft, color: m.color }}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm capitalize text-[color:var(--text-primary)] truncate">{t.type}</div>
                          <div className="text-xs text-[color:var(--text-secondary)] truncate">{t.description || relativeTime(t.created_at)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-bold text-sm ${credit ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>
                            {credit ? "+" : ""}{formatNaira(t.amount)}
                          </div>
                          <div className="text-[10px] text-[color:var(--text-tertiary)] font-mono mt-0.5">Bal {formatNaira(t.balance_after, { compact: true })}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </UserLayout>
  );
}
