import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import Pagination from "@/components/admin/Pagination";
import {
  Sparkles, Search, TrendingUp, Wallet, Banknote, Target, Timer,
  ArrowDownRight, ArrowUpRight, Activity, X, ChevronRight, Layers, CalendarRange,
  CheckCircle2, AlertCircle, ExternalLink, User as UserIcon, Ban, ShieldAlert,
  Pause, Play, CheckSquare, Square,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { toast } from "sonner";

/* ----------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------*/
function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function nextPayoutMs(lastPayoutIso) {
  if (!lastPayoutIso) return null;
  const last = new Date(lastPayoutIso).getTime();
  if (!Number.isFinite(last)) return null;
  return last + 24 * 3600 * 1000 - Date.now();
}

function fmtCountdown(ms) {
  if (ms == null) return "—";
  if (ms <= 0) return "Due now";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function endDate(startedAt, durationDays) {
  if (!startedAt) return null;
  const d = new Date(startedAt);
  d.setUTCDate(d.getUTCDate() + Number(durationDays || 0));
  return d.toISOString();
}

function shortDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

/* ----------------------------------------------------------------------------
 * Live ticking hook — re-renders once per second.
 * --------------------------------------------------------------------------*/
function useTick(intervalMs = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

/* ----------------------------------------------------------------------------
 * Radial countdown ring — SVG-based, 24h cycle. Brand-coloured.
 * --------------------------------------------------------------------------*/
function CountdownRing({ lastPayoutIso, size = 52, stroke = 4 }) {
  const ms = nextPayoutMs(lastPayoutIso);
  const total = 24 * 3600 * 1000;
  const ratio = ms == null ? 0 : Math.max(0, Math.min(1, ms / total));
  const due = ms != null && ms <= 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - ratio);
  const label = ms == null ? "—" : due ? "DUE" : fmtCountdown(ms);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-[color:var(--surface-alt)]"
        />
        {/* Active arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={dash}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.4,0,.2,1)" }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E5097F" />
            <stop offset="100%" stopColor="#FF5BAA" />
          </linearGradient>
        </defs>
      </svg>
      <div className={`absolute inset-0 flex flex-col items-center justify-center font-mono ${due ? "text-[color:var(--error)] animate-pulse" : "text-[color:var(--text-primary)]"}`}>
        <span className="text-[9px] font-bold leading-none tracking-tight">{label}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Stat card — distinctive “arc” treatment, no purple gradient
 * --------------------------------------------------------------------------*/
const STAT_TONES = {
  brand:   { pill: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",       glow: "from-[#E5097F]/20" },
  accent:  { pill: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]", glow: "from-[#5B5BD6]/20" },
  success: { pill: "bg-[color:var(--success-soft)] text-[color:var(--success)]",   glow: "from-[#10B981]/20" },
  warn:    { pill: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",      glow: "from-[#F59E0B]/20" },
};

function StatCard({ tone = "brand", icon: Icon, label, value, sub, trend, testid }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className="card-soft p-5 relative overflow-hidden group" data-testid={testid}>
      {/* Decorative glow blob — varies per tone, NOT the generic purple */}
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl group-hover:scale-110 transition-transform duration-500`} />
      <div className="relative">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${t.pill}`}>
          <Icon className="w-3 h-3" /> {label}
        </div>
        <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums leading-none">{value}</div>
        <div className="flex items-center gap-2 mt-2">
          {sub && <span className="text-[11px] text-[color:var(--text-tertiary)]">{sub}</span>}
          {trend != null && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${trend >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>
              {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Status pill
 * --------------------------------------------------------------------------*/
const STATUS_PILLS = {
  active:    { cls: "bg-[color:var(--success-soft)] text-[color:var(--success)] border-[color:var(--success)]/20",  dot: "bg-[color:var(--success)]" },
  completed: { cls: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] border-[color:var(--accent-main)]/20", dot: "bg-[color:var(--accent-main)]" },
  cancelled: { cls: "bg-[color:var(--error-soft)] text-[color:var(--error)] border-[color:var(--error)]/20", dot: "bg-[color:var(--error)]" },
  paused:    { cls: "bg-[color:var(--gold-soft)] text-[color:var(--warning)] border-[color:var(--warning)]/20", dot: "bg-[color:var(--warning)]" },
};

function StatusPill({ status }) {
  const s = STATUS_PILLS[status] || STATUS_PILLS.completed;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "active" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Inline progress bar — days paid / duration
 * --------------------------------------------------------------------------*/
function PayoutProgress({ paid, total }) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="h-1.5 rounded-full bg-[color:var(--surface-alt)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] font-mono text-[color:var(--text-tertiary)]">
        <span className="text-[color:var(--text-primary)] font-bold">{paid}</span>
        <span className="text-[color:var(--text-tertiary)]"> / {total} days</span>
        <span className="ml-1.5 text-[color:var(--text-tertiary)]">· {pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Plan badge — name + daily%
 * --------------------------------------------------------------------------*/
function PlanBadge({ name, dailyPct }) {
  return (
    <div className="inline-flex flex-col">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] w-fit">
        <Layers className="w-3 h-3" /> {name}
      </span>
      <span className="mt-1 font-mono text-[10px] text-[color:var(--text-tertiary)]">{dailyPct}% / day</span>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Detail modal
 * --------------------------------------------------------------------------*/
function InvestmentDetailModal({ inv, onClose, onCancelled, onChanged }) {
  useTick(1000);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refundCapital, setRefundCapital] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [autoResumeAt, setAutoResumeAt] = useState(""); // datetime-local string
  const [editingAutoResume, setEditingAutoResume] = useState(false);
  useEffect(() => {
    setConfirmOpen(false);
    setReason("");
    setRefundCapital(false);
    setAutoResumeAt("");
    setEditingAutoResume(false);
  }, [inv?.id]);

  if (!inv) return null;
  const ms = nextPayoutMs(inv.last_payout_at);
  const due = ms != null && ms <= 0;
  const expected = (Number(inv.duration_days) || 0) * (Number(inv.daily_profit_amount) || 0);
  const finishIso = endDate(inv.started_at, inv.duration_days);
  const headerTone = inv.status === "active"
    ? "from-[#9F0F50] via-[#C81A6E] to-[#E5097F]"
    : inv.status === "completed"
      ? "from-[#1E3A8A] via-[#3730A3] to-[#5B5BD6]"
      : "from-[#7c4807] via-[#a36a08] to-[#F59E0B]";

  const submitCancel = async () => {
    const r = reason.trim();
    if (r.length < 3) {
      toast.error("Please give a brief reason (3+ characters)");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/admin/investments/${inv.id}/cancel`, {
        reason: r,
        refund_capital: refundCapital,
      });
      toast.success(
        refundCapital
          ? `Cancelled · refunded ${formatNaira(data.refund_amount)} to wallet`
          : "Investment cancelled",
      );
      onCancelled?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Cancellation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePause = async () => {
    setPauseBusy(true);
    try {
      const isActive = inv.status === "active";
      const path = isActive ? "pause" : "resume";
      const body = isActive
        ? {
            reason: "Paused from admin panel",
            auto_resume_at: autoResumeAt ? new Date(autoResumeAt).toISOString() : null,
          }
        : { note: "Resumed from admin panel" };
      await api.post(`/admin/investments/${inv.id}/${path}`, body);
      toast.success(isActive
        ? `Investment paused${body.auto_resume_at ? " · scheduled to auto-resume" : " · daily drops stopped"}`
        : "Investment resumed · drops scheduled from now");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    } finally {
      setPauseBusy(false);
    }
  };

  const saveAutoResume = async () => {
    setPauseBusy(true);
    try {
      const iso = autoResumeAt ? new Date(autoResumeAt).toISOString() : null;
      await api.patch(`/admin/investments/${inv.id}/auto-resume`, { auto_resume_at: iso });
      toast.success(iso ? "Auto-resume scheduled" : "Auto-resume cleared");
      setEditingAutoResume(false);
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update");
    } finally {
      setPauseBusy(false);
    }
  };

  return (
    <Dialog open={!!inv} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0" data-testid="investment-detail-modal">
        {/* Header */}
        <div className={`relative bg-gradient-to-br ${headerTone} text-white p-6`}>
          <div className="absolute -top-12 -right-8 w-44 h-44 rounded-full bg-white/10 blur-3xl" />
          <button
            onClick={onClose}
            data-testid="investment-detail-close"
            className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div className="min-w-0 mt-1">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">Investment</div>
              <div className="font-display font-extrabold text-3xl mt-1 leading-none truncate">{formatNaira(inv.amount)}</div>
              <div className="text-white/85 text-xs mt-2">
                {inv.product_name} · <span className="font-bold">{inv.daily_profit_percent}%</span> daily · {inv.duration_days} days
              </div>
              <div className="mt-3"><StatusPill status={inv.status} /></div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5 bg-[color:var(--surface)]">
          {/* Customer */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-2 flex items-center gap-1.5">
              <UserIcon className="w-3 h-3" /> Customer
            </div>
            <Link
              to={`/pentest/fuser/users/${inv.user_id}`}
              data-testid="investment-detail-customer"
              className="flex items-center gap-3 p-3 rounded-2xl bg-[color:var(--surface-alt)] hover:bg-[color:var(--brand-soft)] transition-colors group"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(inv.user_id) }}>
                {(inv.user_name || "?").trim()[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[color:var(--text-primary)] truncate">{inv.user_name || "—"}</div>
                <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{inv.user_phone}</div>
              </div>
              <span className="text-[color:var(--brand)] text-xs font-bold inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Profile <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
          </section>

          {/* Money */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-2 flex items-center gap-1.5">
              <Banknote className="w-3 h-3" /> Money
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Invested" value={formatNaira(inv.amount)} tone="brand" />
              <Tile label="Earned so far" value={formatNaira(inv.total_profit_paid)} tone="success" />
              <Tile label="Daily drop" value={formatNaira(inv.daily_profit_amount)} tone="accent" />
              <Tile label="Expected total" value={formatNaira(expected)} tone="warn" />
            </div>
          </section>

          {/* Progress */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-2 flex items-center gap-1.5">
              <Target className="w-3 h-3" /> Progress
            </div>
            <div className="card-soft p-4">
              <PayoutProgress paid={inv.days_paid} total={inv.duration_days} />
              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Started</div>
                  <div className="font-display font-bold text-sm mt-1 text-[color:var(--text-primary)]">{shortDate(inv.started_at)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Ends</div>
                  <div className="font-display font-bold text-sm mt-1 text-[color:var(--text-primary)]">{shortDate(finishIso)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Next drop</div>
                  <div className={`font-display font-bold text-sm mt-1 font-mono ${due ? "text-[color:var(--error)]" : "text-[color:var(--brand)]"}`}>
                    {fmtCountdown(ms)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-2 flex items-center gap-1.5">
              <CalendarRange className="w-3 h-3" /> Timeline
            </div>
            <ul className="card-soft p-4 space-y-3 text-sm">
              <TLRow color="var(--brand)" label="Investment created" time={formatDate(inv.started_at)} />
              {inv.last_payout_at && inv.last_payout_at !== inv.started_at && (
                <TLRow color="var(--success)" label={`Last payout · ${relativeTime(inv.last_payout_at)}`} time={formatDate(inv.last_payout_at)} />
              )}
              {inv.completed_at && (
                <TLRow color="var(--accent-main)" label="Completed" time={formatDate(inv.completed_at)} />
              )}
            </ul>
          </section>

          {/* IDs */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Identifiers
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <KV label="Investment ID" value={inv.id} />
              <KV label="Product ID" value={inv.product_id} />
            </div>
          </section>

          {/* Pause / Resume control — shown for both active and paused investments */}
          {(inv.status === "active" || inv.status === "paused") && (
            <section data-testid="pause-resume-section">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                {inv.status === "active" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                Payout control
              </div>
              <div className="card-soft p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[color:var(--text-primary)]">
                      {inv.status === "active" ? "Pause daily drops" : "Resume daily drops"}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">
                      {inv.status === "active"
                        ? "Halts every future drop until you resume. Nothing is refunded or lost."
                        : `Paused ${inv.paused_at ? relativeTime(inv.paused_at) : ""}. Resuming restarts the 24h cycle from now.`}
                    </div>
                  </div>
                  <button
                    onClick={togglePause}
                    disabled={pauseBusy}
                    data-testid={inv.status === "active" ? "pause-investment" : "resume-investment"}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
                      inv.status === "active"
                        ? "border border-[color:var(--warning)]/40 text-[color:var(--warning)] hover:bg-[color:var(--gold-soft)]"
                        : "bg-[color:var(--success)] text-white hover:opacity-90"
                    }`}
                  >
                    {inv.status === "active"
                      ? (<><Pause className="w-3.5 h-3.5" /> {pauseBusy ? "Pausing…" : "Pause"}</>)
                      : (<><Play className="w-3.5 h-3.5" /> {pauseBusy ? "Resuming…" : "Resume"}</>)}
                  </button>
                </div>

                {/* Auto-resume — when pausing, an optional schedule */}
                {inv.status === "active" && (
                  <div className="rounded-lg bg-[color:var(--surface-alt)] p-3 border border-[color:var(--gold-soft)]" data-testid="auto-resume-picker-pause">
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--warning)] mb-1.5">
                      Optional · auto-resume at
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="datetime-local"
                        value={autoResumeAt}
                        onChange={(e) => setAutoResumeAt(e.target.value)}
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        data-testid="auto-resume-input-pause"
                        className="input-base text-sm flex-1 min-w-[180px]"
                      />
                      {autoResumeAt && (
                        <button
                          onClick={() => setAutoResumeAt("")}
                          data-testid="auto-resume-clear-pause"
                          className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)] hover:text-[color:var(--error)]"
                        >
                          clear
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1.5">
                      Leave blank for an open-ended pause. With a date set, the system flips this investment back to active automatically.
                    </div>
                  </div>
                )}

                {/* Auto-resume — when already paused, show / edit / clear the schedule */}
                {inv.status === "paused" && (
                  <div className="rounded-lg bg-[color:var(--surface-alt)] p-3" data-testid="auto-resume-paused-card">
                    {inv.auto_resume_at && !editingAutoResume ? (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Auto-resume scheduled</div>
                          <div className="text-sm font-bold text-[color:var(--brand)] mt-0.5 truncate" data-testid="auto-resume-scheduled-at">
                            {formatDate(inv.auto_resume_at)}
                          </div>
                          <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">
                            Will flip back to active {relativeTime(inv.auto_resume_at)} from now.
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setAutoResumeAt(
                                new Date(new Date(inv.auto_resume_at).getTime() - new Date().getTimezoneOffset() * 60000)
                                  .toISOString()
                                  .slice(0, 16),
                              );
                              setEditingAutoResume(true);
                            }}
                            data-testid="auto-resume-edit"
                            className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent-main)] hover:underline"
                          >
                            edit
                          </button>
                          <button
                            onClick={() => { setAutoResumeAt(""); saveAutoResume(); }}
                            disabled={pauseBusy}
                            data-testid="auto-resume-cancel"
                            className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--error)] hover:underline disabled:opacity-50"
                          >
                            cancel auto-resume
                          </button>
                        </div>
                      </div>
                    ) : editingAutoResume ? (
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--accent-main)] mb-1.5">
                          Set auto-resume at
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="datetime-local"
                            value={autoResumeAt}
                            onChange={(e) => setAutoResumeAt(e.target.value)}
                            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                            data-testid="auto-resume-input-edit"
                            className="input-base text-sm flex-1 min-w-[180px]"
                          />
                          <button
                            onClick={saveAutoResume}
                            disabled={pauseBusy || !autoResumeAt}
                            data-testid="auto-resume-save"
                            className="px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-[color:var(--brand)] text-white disabled:opacity-50"
                          >
                            {pauseBusy ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => { setEditingAutoResume(false); setAutoResumeAt(""); }}
                            disabled={pauseBusy}
                            className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                          >
                            cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingAutoResume(true)}
                        data-testid="auto-resume-schedule"
                        className="text-xs font-semibold text-[color:var(--accent-main)] hover:underline"
                      >
                        + Schedule auto-resume…
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Danger zone — Cancel investment */}
          {inv.status === "active" && (
            <section data-testid="cancel-investment-section">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--error)] mb-2 flex items-center gap-1.5">
                <ShieldAlert className="w-3 h-3" /> Danger zone
              </div>
              {!confirmOpen ? (
                <div className="card-soft p-4 border border-[color:var(--error)]/20 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[color:var(--text-primary)]">Cancel this investment</div>
                    <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">
                      Stops daily drops immediately. Already-paid profits stay with the user.
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmOpen(true)}
                    data-testid="cancel-investment-open"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider border border-[color:var(--error)]/40 text-[color:var(--error)] hover:bg-[color:var(--error-soft)] transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" /> Cancel investment
                  </button>
                </div>
              ) : (
                <div className="card-soft p-4 border border-[color:var(--error)]/30 space-y-3">
                  <div className="text-sm font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[color:var(--error)]" />
                    Confirm cancellation
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1">Reason (required)</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. duplicate plan, user requested cancellation, fraud check…"
                      data-testid="cancel-investment-reason"
                      rows={2}
                      className="input-base w-full text-sm resize-none"
                      maxLength={500}
                    />
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={refundCapital}
                      onChange={(e) => setRefundCapital(e.target.checked)}
                      data-testid="cancel-investment-refund-toggle"
                      className="w-4 h-4 accent-[color:var(--brand)]"
                    />
                    <span className="text-xs text-[color:var(--text-primary)]">
                      Also refund <span className="font-bold tabular-nums">{formatNaira(inv.amount)}</span> capital to the user's wallet
                    </span>
                  </label>
                  <div className="rounded-lg bg-[color:var(--surface-alt)] p-2.5 text-[11px] text-[color:var(--text-tertiary)] leading-snug">
                    {refundCapital
                      ? `The user will receive ₦${Number(inv.amount).toLocaleString()} back instantly. This will appear in their transactions as a refund.`
                      : "No refund will be issued. The user keeps any daily profits already paid, but their capital is not returned."}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setConfirmOpen(false)}
                      disabled={submitting}
                      data-testid="cancel-investment-back"
                      className="px-3 py-2 rounded-md text-xs font-semibold bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70 disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitCancel}
                      disabled={submitting || reason.trim().length < 3}
                      data-testid="cancel-investment-confirm"
                      className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-[color:var(--error)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Ban className="w-3.5 h-3.5" /> {submitting ? "Cancelling…" : refundCapital ? "Cancel & refund" : "Cancel investment"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value, tone }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className="card-soft p-3">
      <div className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${t.pill}`}>{label}</div>
      <div className="font-display font-extrabold text-lg mt-1.5 text-[color:var(--text-primary)] tabular-nums truncate">{value}</div>
    </div>
  );
}

function TLRow({ color, label, time }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="font-semibold text-[color:var(--text-primary)] flex-1 truncate">{label}</span>
      <span className="text-[11px] text-[color:var(--text-tertiary)] shrink-0">{time}</span>
    </li>
  );
}

function KV({ label, value }) {
  return (
    <div className="card-soft p-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{label}</div>
      <div className="font-mono text-xs mt-1 text-[color:var(--text-primary)] truncate">{value || "—"}</div>
    </div>
  );
}

/* ============================================================================
 * MAIN PAGE
 * ==========================================================================*/
export default function AdminInvestments() {
  const [items, setItems] = useState(() => readCache("/admin/investments") ?? []);
  const [loading, setLoading] = useState(() => readCache("/admin/investments") === undefined);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [planFilter, setPlanFilter] = useState("All");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  useTick(1000); // for live countdowns

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/investments")
      .then(({ data }) => { if (!cancelled) { setItems(data || []); writeCache("/admin/investments", data || []); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const reload = () => {
    api.get("/admin/investments").then(({ data }) => { setItems(data || []); writeCache("/admin/investments", data || []); });
  };

  // Plan list for filter
  const plans = useMemo(() => {
    const set = new Set(items.map((i) => i.product_name).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [items]);

  // KPIs (all-time, NOT page-restricted — distinct from reference design)
  const kpis = useMemo(() => {
    let total = 0, active = 0, invested = 0, earned = 0, expected = 0, completed = 0;
    let dueNow = 0;
    for (const i of items) {
      total += 1;
      invested += Number(i.amount || 0);
      earned += Number(i.total_profit_paid || 0);
      expected += Number(i.duration_days || 0) * Number(i.daily_profit_amount || 0);
      if (i.status === "active") active += 1;
      if (i.status === "completed") completed += 1;
      const ms = nextPayoutMs(i.last_payout_at);
      if (i.status === "active" && ms != null && ms <= 0) dueNow += 1;
    }
    return { total, active, invested, earned, expected, completed, dueNow };
  }, [items]);

  // Filter + search
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "All" && i.status !== statusFilter) return false;
      if (planFilter !== "All" && i.product_name !== planFilter) return false;
      if (!qq) return true;
      return (
        (i.user_name || "").toLowerCase().includes(qq) ||
        (i.user_phone || "").includes(qq) ||
        (i.product_name || "").toLowerCase().includes(qq) ||
        (i.id || "").toLowerCase().includes(qq)
      );
    });
  }, [items, q, statusFilter, planFilter]);

  const safeSize = pageSize === "all" ? Math.max(filtered.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / safeSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * safeSize, safePage * safeSize),
    [filtered, safePage, safeSize],
  );

  // Selection helpers — only `active` / `paused` rows are bulk-actionable.
  const selectableIds = useMemo(
    () => pageItems.filter((i) => i.status === "active" || i.status === "paused").map((i) => i.id),
    [pageItems],
  );
  const allOnPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // Categorise selection by status so bulk action button enablement is clear.
  const selectionBreakdown = useMemo(() => {
    let act = 0, pau = 0;
    for (const i of items) {
      if (!selected.has(i.id)) continue;
      if (i.status === "active") act += 1;
      else if (i.status === "paused") pau += 1;
    }
    return { active: act, paused: pau, total: act + pau };
  }, [items, selected]);

  const [bulkAutoResumeAt, setBulkAutoResumeAt] = useState("");
  const runBulk = async (kind) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const body = {
        investment_ids: ids,
        reason: kind === "pause" ? "Bulk pause from admin panel" : "Bulk resume from admin panel",
      };
      if (kind === "pause" && bulkAutoResumeAt) {
        body.auto_resume_at = new Date(bulkAutoResumeAt).toISOString();
      }
      const { data } = await api.post(`/admin/investments/bulk-${kind}`, body);
      const c = data.counts || {};
      const done = c[kind === "pause" ? "paused" : "resumed"] || 0;
      const skipped = (c.not_active || 0) + (c.not_paused || 0) + (c.not_found || 0);
      toast.success(
        `${kind === "pause" ? "Paused" : "Resumed"} ${done} investment${done === 1 ? "" : "s"}` +
        (data.auto_resume_at ? " · auto-resume scheduled" : "") +
        (skipped ? ` · ${skipped} skipped` : ""),
      );
      clearSelection();
      setBulkAutoResumeAt("");
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const QUICK_SIZES = [5, 20, 50, 100, "all"];

  return (
    <AdminLayout title="">
      {/* ===== HERO ===== */}
      <div
        className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8"
        style={{
          background:
            "linear-gradient(120deg,#3F0825 0%,#7A0A45 38%,#C81A6E 72%,#E5097F 100%)",
        }}
        data-testid="investments-hero"
      >
        {/* Decorative shapes */}
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-48 h-48 rounded-full bg-[#FF5BAA]/30 blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" preserveAspectRatio="none" viewBox="0 0 600 200">
          <path d="M0,160 C90,90 220,40 320,80 C420,120 520,180 600,140 L600,200 L0,200 Z" fill="white" />
        </svg>

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">Capital · plans · payouts</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Investments</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">
                <span className="font-bold tabular-nums">{kpis.total}</span> investment{kpis.total === 1 ? "" : "s"} · {" "}
                <span className="font-bold tabular-nums">{kpis.active}</span> active · {" "}
                <span className="font-bold tabular-nums text-white">{formatNaira(kpis.invested)}</span> capital working
              </div>
            </div>
          </div>

          {/* Embedded "Due now" pulse — unique vs reference */}
          <div className="shrink-0 inline-flex items-center gap-3 bg-white/10 backdrop-blur rounded-2xl px-4 py-3 border border-white/15" data-testid="hero-due-now">
            <div className="relative">
              <Timer className={`w-5 h-5 ${kpis.dueNow > 0 ? "text-[#FFE066]" : "text-white/70"}`} />
              {kpis.dueNow > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FFE066] animate-ping" />}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-white/70">Drops due now</div>
              <div className="font-display font-extrabold text-xl leading-none mt-0.5 tabular-nums">{kpis.dueNow}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== KPI cards ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard tone="brand"   icon={Wallet}      label="Capital invested" value={formatNaira(kpis.invested)} sub="All-time inflow" testid="kpi-invested" />
        <StatCard tone="success" icon={TrendingUp}  label="Profit paid"      value={formatNaira(kpis.earned)} sub={`${kpis.expected > 0 ? ((kpis.earned / kpis.expected) * 100).toFixed(1) : "0.0"}% of projected`} testid="kpi-earned" />
        <StatCard tone="warn"    icon={Target}      label="Projected return" value={formatNaira(kpis.expected)} sub="If every plan completes" testid="kpi-expected" />
        <StatCard tone="accent"  icon={Activity}    label="Active plans"     value={kpis.active} sub={`${kpis.completed} completed · ${kpis.total} total`} testid="kpi-active" />
      </div>

      {/* ===== Toolbar: filter + plan + search ===== */}
      <div className="card-soft p-3 mt-5 flex items-center gap-3 flex-wrap" data-testid="investments-toolbar">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          data-testid="investments-status-filter"
          className="input-base !py-2 !w-[140px] text-sm font-semibold"
        >
          {["All", "active", "completed", "cancelled"].map((s) => (
            <option key={s} value={s}>{s === "All" ? "All status" : s}</option>
          ))}
        </select>
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          data-testid="investments-plan-filter"
          className="input-base !py-2 !w-[180px] text-sm font-semibold"
        >
          {plans.map((p) => (
            <option key={p} value={p}>{p === "All" ? "All plans" : p}</option>
          ))}
        </select>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search by name, phone, plan or investment ID…"
            data-testid="investments-search-input"
            className="w-full pl-10 input-base"
          />
        </div>
      </div>

      {/* ===== Quick page size ===== */}
      <div className="card-soft p-3 mt-3 flex items-center gap-3 flex-wrap" data-testid="investments-quickrows">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)]">Rows per page</span>
        {QUICK_SIZES.map((n) => {
          const active = pageSize === n;
          return (
            <button
              key={String(n)}
              onClick={() => { setPageSize(n); setPage(1); }}
              data-testid={`quick-size-${n}`}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${active
                ? "bg-[color:var(--brand)] text-white"
                : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70"}`}
            >
              {n === "all" ? "All" : n}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-[color:var(--text-tertiary)]">
          Showing <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{pageItems.length}</span> of <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{filtered.length}</span>
        </span>
      </div>

      {/* ===== Bulk action bar (sticky when selection is active) ===== */}
      {selected.size > 0 && (
        <div
          className="sticky top-3 z-30 mt-3 card-soft p-3 border border-[color:var(--brand)]/30 shadow-lg flex items-center gap-3 flex-wrap bg-[color:var(--surface)]"
          data-testid="investments-bulk-bar"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[color:var(--brand-soft)] text-[color:var(--brand)] text-xs font-bold">
            <CheckSquare className="w-3.5 h-3.5" />
            {selectionBreakdown.total} selected
            <span className="font-normal text-[color:var(--text-tertiary)] ml-1">
              ({selectionBreakdown.active} active · {selectionBreakdown.paused} paused)
            </span>
          </div>
          <button
            onClick={() => runBulk("pause")}
            disabled={bulkBusy || selectionBreakdown.active === 0}
            data-testid="bulk-pause"
            title={selectionBreakdown.active === 0 ? "No active investments in selection" : `Pause ${selectionBreakdown.active} active investment(s)`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider border border-[color:var(--warning)]/40 text-[color:var(--warning)] hover:bg-[color:var(--gold-soft)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
            {bulkBusy ? "Working…" : `Pause ${selectionBreakdown.active}`}
          </button>
          {selectionBreakdown.active > 0 && (
            <div className="inline-flex items-center gap-1.5" title="Optional: schedule when paused investments will auto-resume">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">auto-resume</span>
              <input
                type="datetime-local"
                value={bulkAutoResumeAt}
                onChange={(e) => setBulkAutoResumeAt(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                data-testid="bulk-auto-resume-input"
                className="input-base !py-1 text-xs w-[180px]"
              />
              {bulkAutoResumeAt && (
                <button
                  onClick={() => setBulkAutoResumeAt("")}
                  data-testid="bulk-auto-resume-clear"
                  className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)] hover:text-[color:var(--error)]"
                >
                  clear
                </button>
              )}
            </div>
          )}
          <button
            onClick={() => runBulk("resume")}
            disabled={bulkBusy || selectionBreakdown.paused === 0}
            data-testid="bulk-resume"
            title={selectionBreakdown.paused === 0 ? "No paused investments in selection" : `Resume ${selectionBreakdown.paused} paused investment(s)`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider bg-[color:var(--success)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {bulkBusy ? "Working…" : `Resume ${selectionBreakdown.paused}`}
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            data-testid="bulk-clear"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* ===== Table ===== */}
      <div className="card-soft mt-3 overflow-hidden" data-testid="investments-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="p-4 w-10">
                  <button
                    type="button"
                    onClick={togglePage}
                    disabled={selectableIds.length === 0}
                    data-testid="select-all-on-page"
                    title={allOnPageSelected ? "Deselect all on page" : "Select all active/paused on page"}
                    className="inline-flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--brand)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {allOnPageSelected ? <CheckSquare className="w-4 h-4 text-[color:var(--brand)]" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left p-4">User</th>
                <th className="text-left p-4 hidden md:table-cell">Plan</th>
                <th className="text-right p-4">Invested</th>
                <th className="text-right p-4 hidden lg:table-cell">Earned · Expected</th>
                <th className="text-left p-4 hidden xl:table-cell">Window</th>
                <th className="text-center p-4">Next drop</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="p-12 text-center text-[color:var(--text-tertiary)]">Loading…</td></tr>
              )}
              {!loading && pageItems.length === 0 && (
                <tr><td colSpan={9} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {q || statusFilter !== "All" || planFilter !== "All"
                    ? "No investments match this filter."
                    : "No investments yet."}
                </td></tr>
              )}
              {!loading && pageItems.map((i) => {
                const expected = (Number(i.duration_days) || 0) * (Number(i.daily_profit_amount) || 0);
                const finishIso = endDate(i.started_at, i.duration_days);
                const ms = nextPayoutMs(i.last_payout_at);
                const due = i.status === "active" && ms != null && ms <= 0;
                return (
                  <tr
                    key={i.id}
                    className={`border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors ${due ? "bg-[color:var(--brand-soft)]/30" : ""} ${selected.has(i.id) ? "bg-[color:var(--brand-soft)]/40" : ""}`}
                    data-testid={`investment-row-${i.id}`}
                  >
                    {/* Select */}
                    <td className="p-4 w-10">
                      {(i.status === "active" || i.status === "paused") ? (
                        <button
                          type="button"
                          onClick={() => toggleOne(i.id)}
                          data-testid={`select-investment-${i.id}`}
                          className="inline-flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--brand)]"
                        >
                          {selected.has(i.id) ? <CheckSquare className="w-4 h-4 text-[color:var(--brand)]" /> : <Square className="w-4 h-4" />}
                        </button>
                      ) : (
                        <span className="inline-block w-4 h-4 opacity-20"><Square className="w-4 h-4" /></span>
                      )}
                    </td>
                    {/* User */}
                    <td className="p-4 max-w-[220px]">
                      <Link to={`/pentest/fuser/users/${i.user_id}`} className="flex items-center gap-2.5 group min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(i.user_id) }}>
                          {(i.user_name || "?").trim()[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[color:var(--accent-main)] group-hover:underline truncate">{i.user_name || "—"}</div>
                          <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate">{i.user_phone}</div>
                        </div>
                      </Link>
                    </td>
                    {/* Plan */}
                    <td className="p-4 hidden md:table-cell">
                      <PlanBadge name={i.product_name} dailyPct={i.daily_profit_percent} />
                    </td>
                    {/* Invested */}
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="font-display font-bold tabular-nums leading-tight">{formatNaira(i.amount)}</div>
                      <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">{i.duration_days} days</div>
                    </td>
                    {/* Earned · Expected */}
                    <td className="p-4 hidden lg:table-cell">
                      <div className="flex flex-col items-end">
                        <div className="font-display font-bold tabular-nums text-[color:var(--success)] leading-tight">{formatNaira(i.total_profit_paid)}</div>
                        <div className="text-[10px] text-[color:var(--text-tertiary)]">of {formatNaira(expected, { compact: true })}</div>
                        <div className="w-32 mt-1.5">
                          <PayoutProgress paid={i.days_paid} total={i.duration_days} />
                        </div>
                      </div>
                    </td>
                    {/* Window */}
                    <td className="p-4 hidden xl:table-cell whitespace-nowrap">
                      <div className="flex items-center gap-2 text-[11px] text-[color:var(--text-tertiary)]">
                        <span className="font-bold text-[color:var(--text-primary)]">{shortDate(i.started_at)}</span>
                        <ChevronRight className="w-3 h-3" />
                        <span className="font-bold text-[color:var(--text-primary)]">{shortDate(finishIso)}</span>
                      </div>
                    </td>
                    {/* Next drop ring */}
                    <td className="p-4">
                      <div className="flex justify-center">
                        {i.status === "active" ? (
                          <CountdownRing lastPayoutIso={i.last_payout_at} />
                        ) : (
                          <span className="text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider">—</span>
                        )}
                      </div>
                    </td>
                    {/* Status */}
                    <td className="p-4">
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill status={i.status} />
                        {i.status === "paused" && i.paused_at && (
                          <div
                            className="text-[10px] text-[color:var(--text-tertiary)] leading-tight"
                            data-testid={`paused-hint-${i.id}`}
                            title={i.auto_resume_at ? `Auto-resume scheduled for ${i.auto_resume_at}` : "No auto-resume scheduled"}
                          >
                            <span className="font-mono">paused {relativeTime(i.paused_at)}</span>
                            {i.auto_resume_at ? (
                              <span className="text-[color:var(--brand)] font-bold"> · auto-resume {relativeTime(i.auto_resume_at)}</span>
                            ) : (
                              <span className="text-[color:var(--text-tertiary)]"> · no schedule</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Action */}
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setViewing(i)}
                        data-testid={`view-investment-${i.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--brand)]/30 text-[color:var(--brand)] hover:bg-[color:var(--brand)] hover:text-white transition-colors"
                      >
                        {due ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && pageSize !== "all" && (
          <Pagination
            page={safePage}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={pageSize}
            testidPrefix="investments-page"
          />
        )}
      </div>

      <InvestmentDetailModal inv={viewing} onClose={() => setViewing(null)} onCancelled={reload} onChanged={reload} />
    </AdminLayout>
  );
}
