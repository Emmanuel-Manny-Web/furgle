import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { readCache, writeCache } from "@/hooks/useCachedData";
import {
  Ticket, Plus, Trash2, Pencil, Copy as CopyIcon, Wand2, Search, X, CheckCircle2,
  Sparkles, Power, CalendarClock, Coins, Users as UsersIcon,
} from "lucide-react";

const blank = {
  code: "",
  amount: 500,
  max_uses: 1,
  is_active: true,
  expires_at: "",
  note: "",
};

/* ----------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------*/
function genCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous
  let s = "NJ"; // brand prefix
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function copy(text) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

function isExpired(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

/* ----------------------------------------------------------------------------
 * Stat card — same arc-glow treatment as the rest of the admin
 * --------------------------------------------------------------------------*/
const STAT_TONES = {
  brand:   { pill: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",       glow: "from-[#E5097F]/20" },
  accent:  { pill: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]", glow: "from-[#5B5BD6]/20" },
  success: { pill: "bg-[color:var(--success-soft)] text-[color:var(--success)]",   glow: "from-[#10B981]/20" },
  warn:    { pill: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",      glow: "from-[#F59E0B]/20" },
};

function StatCard({ tone = "brand", icon: Icon, label, value, sub, testid }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className="card-soft p-5 relative overflow-hidden group" data-testid={testid}>
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl group-hover:scale-110 transition-transform duration-500`} />
      <div className="relative">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${t.pill}`}>
          <Icon className="w-3 h-3" /> {label}
        </div>
        <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums leading-none">{value}</div>
        {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-2">{sub}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * TICKET — the centrepiece. Coupons render as paper tickets with notches.
 * --------------------------------------------------------------------------*/
function CouponTicket({ c, onEdit, onDelete, onToggle }) {
  const expired = isExpired(c.expires_at);
  const fullyUsed = c.max_uses > 0 && c.used_count >= c.max_uses;
  const inactive = !c.is_active || expired || fullyUsed;
  const usage = c.max_uses > 0 ? Math.min(100, (c.used_count / c.max_uses) * 100) : 0;
  const headerGrad = inactive
    ? "from-[#3a3a47] via-[#52525e] to-[#6b6b78]"
    : "from-[#9F0F50] via-[#C81A6E] to-[#E5097F]";

  return (
    <div
      className={`relative isolate ${inactive ? "opacity-80" : ""}`}
      data-testid={`coupon-card-${c.id}`}
    >
      {/* Decorative side notches via two pseudo divs */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 w-3 h-6 rounded-r-full bg-[color:var(--bg-primary)] z-10" aria-hidden="true" />
      <div className="absolute top-1/2 -translate-y-1/2 right-0 w-3 h-6 rounded-l-full bg-[color:var(--bg-primary)] z-10" aria-hidden="true" />

      <div className="card-soft p-0 overflow-hidden relative">
        {/* Top strip */}
        <div className={`bg-gradient-to-br ${headerGrad} text-white p-4 pl-5 pr-4 flex items-start justify-between gap-3`}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/80 flex items-center gap-1.5">
              <Ticket className="w-3 h-3" /> Promo code
            </div>
            <div className="flex items-center gap-2 mt-1.5 min-w-0">
              <span className="font-mono font-extrabold text-2xl tracking-wider truncate" data-testid={`coupon-code-${c.id}`}>{c.code}</span>
              <button
                onClick={() => copy(c.code)}
                title="Copy code"
                data-testid={`coupon-copy-${c.id}`}
                className="w-7 h-7 rounded-md bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center shrink-0"
              >
                <CopyIcon className="w-3 h-3" />
              </button>
            </div>
          </div>
          {/* Status pip */}
          <div className="shrink-0 text-right">
            {inactive ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/30 text-white/90">
                {expired ? "expired" : fullyUsed ? "redeemed" : "off"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A7F3D0] animate-pulse" /> live
              </span>
            )}
          </div>
        </div>

        {/* Perforated divider */}
        <div className="relative h-3 flex items-center justify-between px-1 bg-[color:var(--surface)]">
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 border-t border-dashed border-[color:var(--border-default)]" />
        </div>

        {/* Body */}
        <div className="p-4 pl-5 pr-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Worth</div>
              <div className="font-display font-extrabold text-3xl mt-0.5 text-[color:var(--brand)] tabular-nums">{formatNaira(c.amount)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Redemptions</div>
              <div className="font-display font-extrabold text-xl mt-0.5 tabular-nums text-[color:var(--text-primary)]">
                {c.used_count}<span className="text-sm font-normal text-[color:var(--text-tertiary)]">/{c.max_uses || "∞"}</span>
              </div>
            </div>
          </div>

          {c.max_uses > 0 && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-[color:var(--surface-alt)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] transition-all duration-500"
                  style={{ width: `${usage}%` }}
                />
              </div>
            </div>
          )}

          {(c.note || c.expires_at) && (
            <div className="mt-3 pt-3 border-t border-[color:var(--border-default)] space-y-1">
              {c.note && (
                <div className="text-[11px] text-[color:var(--text-secondary)] flex items-start gap-1.5">
                  <Sparkles className="w-3 h-3 mt-0.5 text-[color:var(--accent-main)] shrink-0" />
                  <span className="line-clamp-2 italic">"{c.note}"</span>
                </div>
              )}
              {c.expires_at && (
                <div className={`text-[11px] flex items-center gap-1.5 ${expired ? "text-[color:var(--error)]" : "text-[color:var(--text-tertiary)]"}`}>
                  <CalendarClock className="w-3 h-3" />
                  {expired
                    ? <span>Expired {relativeTime(c.expires_at)}</span>
                    : <span>Expires {relativeTime(c.expires_at)} · {formatDate(c.expires_at)}</span>}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center gap-1.5">
            <button
              onClick={() => onToggle(c)}
              data-testid={`coupon-toggle-${c.id}`}
              title={c.is_active ? "Deactivate" : "Activate"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                c.is_active
                  ? "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--error-soft)] hover:text-[color:var(--error)]"
                  : "bg-[color:var(--success-soft)] text-[color:var(--success)] hover:opacity-90"
              }`}
            >
              <Power className="w-3 h-3" /> {c.is_active ? "Off" : "On"}
            </button>
            <button
              onClick={() => onEdit(c)}
              data-testid={`coupon-edit-${c.id}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] hover:opacity-90"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={() => onDelete(c)}
              data-testid={`coupon-delete-${c.id}`}
              className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--error-soft)] text-[color:var(--error)] hover:opacity-90"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * MAIN PAGE
 * ==========================================================================*/
export default function AdminCoupons() {
  const [items, setItems] = useState(() => readCache("/admin/coupons") ?? []);
  const [loading, setLoading] = useState(() => readCache("/admin/coupons") === undefined);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("All"); // All | active | inactive | expired
  const [q, setQ] = useState("");

  const load = () =>
    api.get("/admin/coupons").then(({ data }) => {
      setItems(data || []);
      writeCache("/admin/coupons", data || []);
      setLoading(false);
    });
  useEffect(() => { load(); }, []);

  // KPIs
  const kpis = useMemo(() => {
    let total = 0, active = 0, redemptions = 0, credited = 0;
    for (const c of items) {
      total += 1;
      if (c.is_active && !isExpired(c.expires_at) && (c.max_uses === 0 || c.used_count < c.max_uses)) active += 1;
      redemptions += Number(c.used_count || 0);
      credited += Number(c.total_credited || c.amount * c.used_count || 0);
    }
    return { total, active, redemptions, credited };
  }, [items]);

  // Filter + search
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((c) => {
      if (filter === "active") {
        if (!c.is_active || isExpired(c.expires_at) || (c.max_uses > 0 && c.used_count >= c.max_uses)) return false;
      } else if (filter === "inactive") {
        const isInactive = !c.is_active && !isExpired(c.expires_at);
        if (!isInactive) return false;
      } else if (filter === "expired") {
        if (!isExpired(c.expires_at) && !(c.max_uses > 0 && c.used_count >= c.max_uses)) return false;
      }
      if (!qq) return true;
      return (
        (c.code || "").toLowerCase().includes(qq) ||
        (c.note || "").toLowerCase().includes(qq)
      );
    });
  }, [items, q, filter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(blank);
    setOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      amount: c.amount,
      max_uses: c.max_uses,
      is_active: c.is_active,
      expires_at: c.expires_at
        ? new Date(new Date(c.expires_at).getTime() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : "",
      note: c.note || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.code || form.code.length < 3) {
      toast.error("Code must be at least 3 characters");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        amount: Number(form.amount),
        max_uses: Number(form.max_uses) || 0,
        is_active: !!form.is_active,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        note: form.note?.trim() || null,
      };
      if (editingId) {
        await api.put(`/admin/coupons/${editingId}`, payload);
        toast.success("Coupon updated");
      } else {
        await api.post("/admin/coupons", payload);
        toast.success("Coupon created");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (c) => {
    try {
      await api.put(`/admin/coupons/${c.id}`, {
        code: c.code,
        amount: c.amount,
        max_uses: c.max_uses,
        is_active: !c.is_active,
        expires_at: c.expires_at || null,
        note: c.note || null,
      });
      toast.success(c.is_active ? "Coupon disabled" : "Coupon enabled");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.code}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/coupons/${c.id}`);
      toast.success("Coupon deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <AdminLayout title="">
      {/* ===== HERO ===== */}
      <div
        className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8"
        style={{ background: "linear-gradient(120deg,#3F0825 0%,#7A0A45 38%,#C81A6E 72%,#E5097F 100%)" }}
        data-testid="coupons-hero"
      >
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-48 h-48 rounded-full bg-[#FF5BAA]/30 blur-3xl" />

        {/* Floating ticket decorations */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.10]" preserveAspectRatio="none" viewBox="0 0 600 200">
          <g stroke="white" strokeWidth="0.8" fill="none">
            <path d="M460 30 l40 0 a4 4 0 010 8 l-40 0 a4 4 0 010 -8 z" />
            <path d="M500 60 l40 0 a4 4 0 010 8 l-40 0 a4 4 0 010 -8 z" />
            <path d="M440 90 l40 0 a4 4 0 010 8 l-40 0 a4 4 0 010 -8 z" />
            <path d="M520 130 l40 0 a4 4 0 010 8 l-40 0 a4 4 0 010 -8 z" />
            <path d="M460 165 l40 0 a4 4 0 010 8 l-40 0 a4 4 0 010 -8 z" />
          </g>
        </svg>

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Ticket className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">Promo codes · wallet credit</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Coupons</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">
                <span className="font-bold tabular-nums">{kpis.total}</span> code{kpis.total === 1 ? "" : "s"} · {" "}
                <span className="font-bold tabular-nums">{kpis.active}</span> live · {" "}
                <span className="font-bold tabular-nums">{formatNaira(kpis.credited)}</span> credited to users
              </div>
            </div>
          </div>

          <button
            onClick={openCreate}
            data-testid="new-coupon-btn"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-[color:var(--brand)] font-bold text-sm shadow-lg hover:scale-105 transition-transform"
          >
            <Plus className="w-4 h-4" /> New coupon
          </button>
        </div>
      </div>

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard tone="brand"   icon={Ticket}    label="Total codes"  value={kpis.total} sub="All coupons ever created" testid="kpi-total" />
        <StatCard tone="success" icon={CheckCircle2} label="Live now"  value={kpis.active} sub="Active & redeemable" testid="kpi-active" />
        <StatCard tone="accent"  icon={UsersIcon} label="Redemptions"  value={kpis.redemptions} sub="Across every coupon" testid="kpi-redemptions" />
        <StatCard tone="warn"    icon={Coins}     label="Credit given" value={formatNaira(kpis.credited)} sub="All-time wallet bonuses" testid="kpi-credit" />
      </div>

      {/* ===== Toolbar ===== */}
      <div className="card-soft p-3 mt-5 flex items-center gap-3 flex-wrap" data-testid="coupons-toolbar">
        <div className="inline-flex p-1 rounded-lg bg-[color:var(--surface-alt)]">
          {["All", "active", "inactive", "expired"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              data-testid={`filter-${f}`}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                filter === f
                  ? "bg-[color:var(--brand)] text-white shadow"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by code or note…"
            data-testid="coupons-search"
            className="w-full pl-10 input-base"
          />
        </div>
      </div>

      {/* ===== Coupon grid ===== */}
      <div className="mt-5">
        {loading ? (
          <div className="card-soft p-12 text-center text-[color:var(--text-tertiary)]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="card-soft p-12 text-center text-[color:var(--text-tertiary)]">
            {q || filter !== "All" ? "No coupons match this filter." : (
              <div>
                <Ticket className="w-12 h-12 mx-auto opacity-40 mb-3" />
                <div className="font-semibold text-[color:var(--text-primary)]">No coupons yet</div>
                <div className="text-xs mt-1">Click <span className="font-bold">+ New coupon</span> to mint your first promo code.</div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="coupons-grid">
            {filtered.map((c) => (
              <CouponTicket key={c.id} c={c} onEdit={openEdit} onDelete={remove} onToggle={toggle} />
            ))}
          </div>
        )}
      </div>

      {/* ===== Create / Edit modal ===== */}
      <Dialog open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0" data-testid="coupon-modal">
          {/* Modal hero */}
          <div className="relative bg-gradient-to-br from-[#9F0F50] via-[#C81A6E] to-[#E5097F] text-white p-6">
            <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
            <button
              onClick={() => setOpen(false)}
              data-testid="coupon-modal-close"
              className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="relative flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">{editingId ? "Edit" : "Mint"} promo</div>
                <div className="font-display font-extrabold text-2xl mt-1">{editingId ? "Edit coupon" : "New coupon"}</div>
                <div className="text-white/85 text-xs mt-1">Users redeem this code from their profile for instant wallet credit.</div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="p-5 bg-[color:var(--surface)] space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Code */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Code</label>
              <div className="flex items-center gap-2">
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="NJXXXXXX"
                  maxLength={20}
                  data-testid="coupon-code-input"
                  className="flex-1 input-base font-mono uppercase tracking-wider"
                />
                <button
                  onClick={() => setForm({ ...form, code: genCode() })}
                  data-testid="coupon-generate-btn"
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white hover:opacity-90"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Generate
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Amount (₦)</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                data-testid="coupon-amount-input"
                className="w-full input-base font-display text-xl"
                min={1}
              />
            </div>

            {/* Max uses + expires */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Max uses (0 = ∞)</label>
                <input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  data-testid="coupon-max-input"
                  className="w-full input-base"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Expires (optional)</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  data-testid="coupon-expires-input"
                  className="w-full input-base"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Internal note (optional)</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="e.g. Valentine's promo · social media drop"
                maxLength={200}
                data-testid="coupon-note-input"
                className="w-full input-base"
              />
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                data-testid="coupon-active-toggle"
                className="w-4 h-4 accent-[color:var(--brand)]"
              />
              <span className="text-sm text-[color:var(--text-primary)] font-semibold">Active</span>
              <span className="text-[11px] text-[color:var(--text-tertiary)] ml-auto">Users can redeem this immediately</span>
            </label>
          </div>

          {/* Sticky footer */}
          <div className="p-4 bg-[color:var(--surface-alt)] flex items-center gap-2 border-t border-[color:var(--border-default)]">
            <button
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="px-3 py-2 rounded-md text-xs font-semibold bg-[color:var(--surface)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface)]/70 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={submitting}
              data-testid="coupon-save-btn"
              className="ml-auto inline-flex items-center gap-1.5 px-5 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {submitting ? "Saving…" : (editingId ? "Save changes" : "Mint coupon")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
