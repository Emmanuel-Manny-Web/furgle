import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowLeft, TrendingUp, TrendingDown, Gift, Ticket, Share2, Coins, ArrowDownToLine, ArrowUpFromLine, Calendar } from "lucide-react";
import { readCache, writeCache } from "@/hooks/useCachedData";

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

function _isoStartOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString(); }
function _isoEndOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x.toISOString(); }

function computeRange(presetId, customFrom, customTo) {
  if (presetId === "all") return { from: null, to: null };
  const now = new Date();
  if (presetId === "today") return { from: _isoStartOfDay(now), to: _isoEndOfDay(now) };
  if (presetId === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: _isoStartOfDay(y), to: _isoEndOfDay(y) };
  }
  if (presetId === "7d") {
    const f = new Date(now); f.setDate(f.getDate() - 6); // include today → 7 days total
    return { from: _isoStartOfDay(f), to: _isoEndOfDay(now) };
  }
  if (presetId === "30d") {
    const f = new Date(now); f.setDate(f.getDate() - 29);
    return { from: _isoStartOfDay(f), to: _isoEndOfDay(now) };
  }
  if (presetId === "custom") {
    return {
      from: customFrom ? _isoStartOfDay(new Date(customFrom)) : null,
      to: customTo ? _isoEndOfDay(new Date(customTo)) : null,
    };
  }
  return { from: null, to: null };
}

function MoneyRow({ icon: Icon, label, amount, count, tone, sign = "+" }) {
  const tones = {
    in: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    out: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
  };
  return (
    <div className="flex items-center gap-4 py-3 border-b border-[color:var(--border-default)] last:border-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[color:var(--text-primary)] text-sm">{label}</div>
        <div className="text-xs text-[color:var(--text-tertiary)] mt-0.5">{count.toLocaleString()} transactions</div>
      </div>
      <div className={`font-display font-extrabold tabular-nums text-lg ${tone === "in" ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>
        {sign}{formatNaira(Math.abs(amount))}
      </div>
    </div>
  );
}

function RecentList({ title, items, money_key = "amount" }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="card-soft p-5" data-testid={`recent-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-label">{title}</div>
      <div className="mt-3 space-y-2">
        {items.slice(0, 5).map((it) => (
          <div key={it.id} className="flex items-center justify-between text-xs border-b border-[color:var(--border-default)] pb-2 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[color:var(--text-primary)] truncate">{it.user_name || it.account_name || "—"}</div>
              <div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{it.user_phone || ""}</div>
              <div className="text-[10px] text-[color:var(--text-tertiary)] truncate">{it.description || ""}</div>
            </div>
            <div className="text-right ml-2 shrink-0">
              <div className="font-semibold text-[color:var(--text-primary)] tabular-nums">{formatNaira(it[money_key])}</div>
              <div className="text-[10px] text-[color:var(--text-tertiary)]">{formatDate(it.created_at || it.updated_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminProfitBreakdown() {
  const [data, setData] = useState(() => readCache("/admin/stats/profit-breakdown") ?? null);
  const [loading, setLoading] = useState(() => readCache("/admin/stats/profit-breakdown") === undefined);
  const [preset, setPreset] = useState("all");
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);

  const range = useMemo(() => computeRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    const qs = params.toString();
    const url = `/admin/stats/profit-breakdown${qs ? `?${qs}` : ""}`;
    api.get(url)
      .then(({ data }) => { setData(data); writeCache(url, data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const currentPresetLabel = PRESETS.find((p) => p.id === preset)?.label || "All time";

  return (
    <AdminLayout title="">
      <Link to="/pentest/fuser" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]" data-testid="back-to-dashboard">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>
      <div className="mt-2 text-label">P&amp;L breakdown</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)]" data-testid="profit-breakdown-title">Platform profit</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">All-time inflow versus everything paid out of the platform's pocket.</p>

      {/* Time range filter */}
      <div className="card-soft p-4 mt-5" data-testid="range-filter">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-[color:var(--text-secondary)]" />
          <span className="text-label">Range</span>
          <div className="flex flex-wrap gap-2 ml-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                data-testid={`range-${p.id}`}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  preset === p.id
                    ? "bg-[color:var(--brand)] text-white"
                    : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-[color:var(--border-default)]" data-testid="custom-range-controls">
            <label className="text-xs">
              <span className="text-[color:var(--text-secondary)]">From</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || todayStr}
                onChange={(e) => setCustomFrom(e.target.value)}
                data-testid="custom-from"
                className="block mt-1 input-base text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-[color:var(--text-secondary)]">To</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={todayStr}
                onChange={(e) => setCustomTo(e.target.value)}
                data-testid="custom-to"
                className="block mt-1 input-base text-sm"
              />
            </label>
          </div>
        )}
        <div className="text-[11px] text-[color:var(--text-tertiary)] mt-2">
          Currently showing: <span className="font-semibold text-[color:var(--text-primary)]">{currentPresetLabel}</span>
          {range.from && range.to && (
            <span className="ml-2 font-mono">{range.from.slice(0, 10)} → {range.to.slice(0, 10)}</span>
          )}
        </div>
      </div>

      {!data && loading && <div className="card-soft p-6 mt-6 text-center text-[color:var(--text-tertiary)]">Loading…</div>}

      {data && (
        <>
          {/* Net hero */}
          <div className="rounded-3xl p-6 md:p-8 text-white relative overflow-hidden bg-gradient-to-br from-[color:var(--accent-main)] via-[#E11D74] to-[color:var(--brand)] shadow-xl shadow-[color:var(--accent-main)]/30 mt-6" data-testid="net-profit-card">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/85">Net platform profit</div>
            <div className="font-display font-extrabold text-4xl md:text-5xl mt-2 leading-none" data-testid="net-profit-value">{formatNaira(data.net_profit)}</div>
            <div className="text-white/80 text-xs mt-3 font-mono">{data.formula}</div>
          </div>

          {/* Inflow */}
          <div className="card-soft p-5 mt-5">
            <div className="text-label flex items-center gap-2 text-[color:var(--success)]"><TrendingUp className="w-3.5 h-3.5" /> Inflow</div>
            <div className="mt-2 divide-y divide-[color:var(--border-default)]">
              <MoneyRow icon={ArrowDownToLine} label="Successful deposits" amount={data.inflow.total_deposits} count={data.inflow.count} tone="in" sign="+" />
            </div>
          </div>

          {/* Outflow */}
          <div className="card-soft p-5 mt-5">
            <div className="text-label flex items-center gap-2 text-[color:var(--error)]"><TrendingDown className="w-3.5 h-3.5" /> Outflow</div>
            <div className="mt-2 divide-y divide-[color:var(--border-default)]">
              <MoneyRow icon={ArrowUpFromLine} label="Paid withdrawals" amount={data.outflow.paid_withdrawals.total} count={data.outflow.paid_withdrawals.count} tone="out" sign="−" />
              <MoneyRow icon={Gift} label="Welcome bonuses credited" amount={data.outflow.welcome_bonuses.total} count={data.outflow.welcome_bonuses.count} tone="out" sign="−" />
              <MoneyRow icon={Ticket} label="Coupon redemptions" amount={data.outflow.coupon_redemptions.total} count={data.outflow.coupon_redemptions.count} tone="out" sign="−" />
              <MoneyRow icon={Share2} label="Referral commissions paid" amount={data.outflow.referral_commissions.total} count={data.outflow.referral_commissions.count} tone="out" sign="−" />
              <MoneyRow icon={Coins} label="Daily profits credited" amount={data.outflow.daily_profit_credits.total} count={data.outflow.daily_profit_credits.count} tone="out" sign="−" />
            </div>
          </div>

          {/* Recent contributors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <RecentList title="Latest welcome bonuses" items={data.recent?.welcome_bonuses} />
            <RecentList title="Latest coupon redemptions" items={data.recent?.coupons} />
            <RecentList title="Latest referral payouts" items={data.recent?.referrals} />
            <RecentList title="Latest daily profit credits" items={data.recent?.profits} />
          </div>
        </>
      )}
    </AdminLayout>
  );
}
