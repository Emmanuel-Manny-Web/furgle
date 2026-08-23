import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDate, relativeTime } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import {
  Megaphone, Plus, Pencil, Trash2, X, CheckCircle2, Info, AlertTriangle,
  ShieldAlert, ArrowRight, ExternalLink, Eye, EyeOff, Clock, Calendar,
  Sparkles, Layers,
} from "lucide-react";

/* ----------------------------------------------------------------------------
 * Style palette — each announcement style maps to its own colour scheme
 * --------------------------------------------------------------------------*/
const STYLE_TOKENS = {
  info: {
    label: "Info",
    icon: Info,
    pill: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] border-[color:var(--accent-main)]/30",
    iconWell: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    headerGrad: "from-[#1E3A8A] via-[#3730A3] to-[#5B5BD6]",
  },
  success: {
    label: "Success",
    icon: CheckCircle2,
    pill: "bg-[color:var(--success-soft)] text-[color:var(--success)] border-[color:var(--success)]/30",
    iconWell: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    headerGrad: "from-[#064E3B] via-[#0F766E] to-[#10B981]",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    pill: "bg-[color:var(--gold-soft)] text-[color:var(--warning)] border-[color:var(--warning)]/30",
    iconWell: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
    headerGrad: "from-[#7c4807] via-[#a36a08] to-[#F59E0B]",
  },
  critical: {
    label: "Critical",
    icon: ShieldAlert,
    pill: "bg-[color:var(--error-soft)] text-[color:var(--error)] border-[color:var(--error)]/30",
    iconWell: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
    headerGrad: "from-[#7F1D1D] via-[#B91C1C] to-[#EF4444]",
  },
};

const blank = {
  title: "",
  message: "",
  style: "info",
  cta_type: "none",
  cta_label: "",
  cta_url: "",
  starts_at: "",
  ends_at: "",
  hide_from_newcomers_hours: 0,
  reshow_interval_minutes: 0,
  reshow_unit: "min",
  priority: 0,
  is_active: true,
};

function toLocalInput(iso) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

/* ----------------------------------------------------------------------------
 * LIVE PREVIEW — distinctive vs reference (which has no preview at all)
 * Shows the user-facing popup as the admin types.
 * --------------------------------------------------------------------------*/
function LivePreview({ form }) {
  const tok = STYLE_TOKENS[form.style] || STYLE_TOKENS.info;
  const Icon = tok.icon;
  return (
    <div className="sticky top-3" data-testid="ann-preview">
      <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-2 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" /> Live preview
      </div>
      <div className="rounded-2xl bg-[color:var(--bg-primary)] p-6 shadow-xl border border-[color:var(--border-default)]">
        {/* Mock phone frame */}
        <div className="rounded-3xl bg-[color:var(--surface)] p-5 shadow-inner border border-[color:var(--border-default)] max-w-sm mx-auto">
          {/* Popup card */}
          <div className="rounded-2xl overflow-hidden">
            <div className={`bg-gradient-to-br ${tok.headerGrad} text-white p-5 relative`}>
              <div className="absolute -top-8 -right-6 w-28 h-28 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">{tok.label}</div>
                  <div className="font-display font-extrabold text-lg leading-tight mt-0.5 truncate">
                    {form.title || "Your title here"}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-[color:var(--surface)]">
              <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {form.message || "Your announcement message will appear here. Keep it short and clear so users dismiss it with intent."}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button className="px-3 py-2 rounded-lg text-xs font-semibold bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
                  Dismiss
                </button>
                {form.cta_type !== "none" && form.cta_label && (
                  <button className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white ${form.style === "info" ? "bg-[color:var(--accent-main)]" : form.style === "success" ? "bg-[color:var(--success)]" : form.style === "warning" ? "bg-[color:var(--warning)]" : "bg-[color:var(--error)]"}`}>
                    {form.cta_label}
                    {form.cta_type === "external" ? <ExternalLink className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Row card — distinctive vs reference (which uses a flat row)
 * --------------------------------------------------------------------------*/
function AnnouncementCard({ a, onEdit, onToggle, onDelete }) {
  const tok = STYLE_TOKENS[a.style] || STYLE_TOKENS.info;
  const Icon = tok.icon;
  const isLive = a.is_active && (!a.ends_at || new Date(a.ends_at) > new Date());
  return (
    <div
      className="card-soft p-0 overflow-hidden relative group transition-shadow hover:shadow-lg"
      data-testid={`ann-card-${a.id}`}
    >
      {/* Side accent strip — coloured by style */}
      <div className={`absolute inset-y-0 left-0 w-1.5 ${a.style === "info" ? "bg-[color:var(--accent-main)]" : a.style === "success" ? "bg-[color:var(--success)]" : a.style === "warning" ? "bg-[color:var(--warning)]" : "bg-[color:var(--error)]"}`} />
      <div className="pl-5 pr-4 py-4 flex items-start gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tok.iconWell}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[color:var(--text-primary)] truncate" data-testid={`ann-title-${a.id}`}>{a.title}</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${tok.pill}`}>
              {tok.label}
            </span>
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[color:var(--success-soft)] text-[color:var(--success)] border border-[color:var(--success)]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)] animate-pulse" /> live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] border border-[color:var(--border-default)]">
                off
              </span>
            )}
            {a.priority > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[color:var(--brand-soft)] text-[color:var(--brand)] border border-[color:var(--brand)]/20">
                <Layers className="w-2.5 h-2.5" /> p{a.priority}
              </span>
            )}
          </div>
          <p className="text-[13px] text-[color:var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">{a.message}</p>
          <div className="flex items-center gap-3 flex-wrap mt-2 text-[10px] text-[color:var(--text-tertiary)]">
            {a.cta_type !== "none" && a.cta_label && (
              <span className="inline-flex items-center gap-1 font-mono">
                <ArrowRight className="w-3 h-3" /> {a.cta_label}
              </span>
            )}
            {(a.starts_at || a.ends_at) && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {a.starts_at ? formatDate(a.starts_at).replace(/, \d{2}:\d{2}/, "") : "—"}
                {" → "}
                {a.ends_at ? formatDate(a.ends_at).replace(/, \d{2}:\d{2}/, "") : "open"}
              </span>
            )}
            {a.hide_from_newcomers_hours > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> hides {a.hide_from_newcomers_hours}h newcomers
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono">
              created {relativeTime(a.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(a)}
            data-testid={`ann-toggle-${a.id}`}
            title={a.is_active ? "Disable" : "Enable"}
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${a.is_active ? "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--error-soft)] hover:text-[color:var(--error)]" : "bg-[color:var(--success-soft)] text-[color:var(--success)] hover:opacity-90"}`}
          >
            {a.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onEdit(a)}
            data-testid={`ann-edit-${a.id}`}
            title="Edit"
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] hover:opacity-90"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(a)}
            data-testid={`ann-delete-${a.id}`}
            title="Delete"
            className="w-9 h-9 rounded-md flex items-center justify-center bg-[color:var(--error-soft)] text-[color:var(--error)] hover:opacity-90"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * MAIN PAGE
 * ==========================================================================*/
export default function AdminAnnouncements() {
  const [items, setItems] = useState(() => readCache("/admin/announcements") ?? []);
  const [loading, setLoading] = useState(() => readCache("/admin/announcements") === undefined);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    api.get("/admin/announcements").then(({ data }) => {
      setItems(data || []);
      writeCache("/admin/announcements", data || []);
      setLoading(false);
    });

  useEffect(() => { load(); }, []);

  const kpis = useMemo(() => {
    let total = 0, live = 0, scheduled = 0;
    for (const a of items) {
      total += 1;
      const now = new Date();
      const start = a.starts_at ? new Date(a.starts_at) : null;
      const end = a.ends_at ? new Date(a.ends_at) : null;
      if (a.is_active && (!start || start <= now) && (!end || end > now)) live += 1;
      else if (a.is_active && start && start > now) scheduled += 1;
    }
    return { total, live, scheduled };
  }, [items]);

  const openCreate = () => {
    setEditingId(null);
    setForm(blank);
    setOpen(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    // Detect best unit for reshow_interval
    const m = Number(a.reshow_interval_minutes || 0);
    let unit = "min", val = m;
    if (m >= 1440 && m % 1440 === 0) { unit = "day"; val = m / 1440; }
    else if (m >= 60 && m % 60 === 0) { unit = "hr"; val = m / 60; }
    setForm({
      title: a.title,
      message: a.message,
      style: a.style,
      cta_type: a.cta_type,
      cta_label: a.cta_label || "",
      cta_url: a.cta_url || "",
      starts_at: toLocalInput(a.starts_at),
      ends_at: toLocalInput(a.ends_at),
      hide_from_newcomers_hours: a.hide_from_newcomers_hours || 0,
      reshow_interval_minutes: val,
      reshow_unit: unit,
      priority: a.priority || 0,
      is_active: a.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    const t = form.title.trim();
    const m = form.message.trim();
    if (t.length < 1) { toast.error("Title is required"); return; }
    if (m.length < 1) { toast.error("Message is required"); return; }
    if (form.cta_type !== "none" && (!form.cta_label || !form.cta_url)) {
      toast.error("Call-to-action needs both a label and a URL");
      return;
    }
    setSubmitting(true);
    try {
      // Convert reshow unit -> minutes
      const reshow = Number(form.reshow_interval_minutes || 0) *
        (form.reshow_unit === "day" ? 1440 : form.reshow_unit === "hr" ? 60 : 1);
      const payload = {
        title: t,
        message: m,
        style: form.style,
        cta_type: form.cta_type,
        cta_label: form.cta_label?.trim() || null,
        cta_url: form.cta_url?.trim() || null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        hide_from_newcomers_hours: Number(form.hide_from_newcomers_hours) || 0,
        reshow_interval_minutes: reshow,
        priority: Number(form.priority) || 0,
        is_active: !!form.is_active,
      };
      if (editingId) {
        await api.put(`/admin/announcements/${editingId}`, payload);
        toast.success("Announcement updated");
      } else {
        await api.post("/admin/announcements", payload);
        toast.success("Announcement created");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (a) => {
    try {
      await api.put(`/admin/announcements/${a.id}`, {
        title: a.title,
        message: a.message,
        style: a.style,
        cta_type: a.cta_type || "none",
        cta_label: a.cta_label || null,
        cta_url: a.cta_url || null,
        starts_at: a.starts_at || null,
        ends_at: a.ends_at || null,
        hide_from_newcomers_hours: a.hide_from_newcomers_hours || 0,
        reshow_interval_minutes: a.reshow_interval_minutes || 0,
        priority: a.priority || 0,
        is_active: !a.is_active,
      });
      toast.success(a.is_active ? "Disabled" : "Enabled");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.title}"? Users won't see it again.`)) return;
    try {
      await api.delete(`/admin/announcements/${a.id}`);
      toast.success("Deleted");
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
        data-testid="ann-hero"
      >
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-48 h-48 rounded-full bg-[#FF5BAA]/30 blur-3xl" />
        {/* Sound-wave bars decoration */}
        <svg className="absolute inset-y-0 right-0 h-full opacity-[0.12]" viewBox="0 0 200 200" preserveAspectRatio="none">
          {[10,30,50,70,90,110,130,150,170].map((x, i) => (
            <rect key={i} x={x} y={100 - (10 + (i % 3) * 20 + (i % 2) * 10)} width="6" height={(10 + (i % 3) * 20 + (i % 2) * 10) * 2} fill="white" rx="3" />
          ))}
        </svg>

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Megaphone className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">In-app pop-ups · scheduled · targeted</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Announcements</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">
                <span className="font-bold tabular-nums">{kpis.total}</span> total · {" "}
                <span className="font-bold tabular-nums">{kpis.live}</span> live · {" "}
                <span className="font-bold tabular-nums">{kpis.scheduled}</span> scheduled
              </div>
            </div>
          </div>

          <button
            onClick={openCreate}
            data-testid="new-announcement-btn"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-[color:var(--brand)] font-bold text-sm shadow-lg hover:scale-105 transition-transform"
          >
            <Plus className="w-4 h-4" /> New announcement
          </button>
        </div>
      </div>

      {/* ===== List ===== */}
      <div className="mt-5">
        {loading ? (
          <div className="card-soft p-12 text-center text-[color:var(--text-tertiary)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="card-soft p-12 text-center" data-testid="ann-empty">
            <Megaphone className="w-12 h-12 mx-auto opacity-30 text-[color:var(--text-tertiary)]" />
            <div className="font-semibold text-[color:var(--text-primary)] mt-3">No announcements yet</div>
            <div className="text-xs text-[color:var(--text-tertiary)] mt-1">Click <span className="font-bold">+ New announcement</span> to push your first in-app pop-up.</div>
          </div>
        ) : (
          <div className="space-y-3" data-testid="ann-list">
            {items.map((a) => (
              <AnnouncementCard key={a.id} a={a} onEdit={openEdit} onToggle={toggle} onDelete={remove} />
            ))}
          </div>
        )}
      </div>

      {/* ===== Create / Edit Dialog ===== */}
      <Dialog open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
        <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0" data-testid="ann-modal">
          {/* Modal hero */}
          <div className="relative bg-gradient-to-br from-[#9F0F50] via-[#C81A6E] to-[#E5097F] text-white p-6">
            <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
            <button
              onClick={() => setOpen(false)}
              data-testid="ann-modal-close"
              className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="relative flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">{editingId ? "Edit" : "New"} pop-up</div>
                <div className="font-display font-extrabold text-2xl mt-1">{editingId ? "Edit announcement" : "Push announcement"}</div>
                <div className="text-white/85 text-xs mt-1">In-app pop-ups every user sees once, then can dismiss. Re-show schedule is honoured per user.</div>
              </div>
            </div>
          </div>

          {/* Body: split form + preview */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 max-h-[70vh] overflow-y-auto bg-[color:var(--surface)]">
            {/* Form */}
            <div className="lg:col-span-3 p-5 space-y-4 border-r border-[color:var(--border-default)]">
              {/* Title */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. New payout gateway live"
                  maxLength={120}
                  data-testid="ann-title-input"
                  className="w-full input-base"
                />
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Message</label>
                  <span className="text-[10px] font-mono text-[color:var(--text-tertiary)]">{form.message.length}/2000</span>
                </div>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="What do you want users to know? Keep it crisp."
                  rows={4}
                  maxLength={2000}
                  data-testid="ann-message-input"
                  className="w-full input-base resize-none"
                />
              </div>

              {/* Style — coloured tab pills */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Style</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(STYLE_TOKENS).map(([k, tok]) => {
                    const Icon = tok.icon;
                    const active = form.style === k;
                    return (
                      <button
                        type="button"
                        key={k}
                        onClick={() => setForm({ ...form, style: k })}
                        data-testid={`ann-style-${k}`}
                        className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${active ? tok.pill + " shadow ring-1 ring-current" : "bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] border-transparent hover:text-[color:var(--text-primary)]"}`}
                      >
                        <Icon className="w-3 h-3" /> {tok.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CTA */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Call to action</label>
                <select
                  value={form.cta_type}
                  onChange={(e) => setForm({ ...form, cta_type: e.target.value })}
                  data-testid="ann-cta-type"
                  className="w-full input-base text-sm font-semibold"
                >
                  <option value="none">No button (info-only popup)</option>
                  <option value="internal">Internal page (e.g. /withdraw)</option>
                  <option value="external">External URL (https://…)</option>
                </select>
                {form.cta_type !== "none" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <input
                      value={form.cta_label}
                      onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
                      placeholder="Button label"
                      maxLength={40}
                      data-testid="ann-cta-label"
                      className="input-base text-sm"
                    />
                    <input
                      value={form.cta_url}
                      onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                      placeholder={form.cta_type === "internal" ? "/withdraw" : "https://example.com"}
                      maxLength={400}
                      data-testid="ann-cta-url"
                      className="input-base text-sm font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Starts (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                    data-testid="ann-starts"
                    className="w-full input-base text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Ends (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                    data-testid="ann-ends"
                    className="w-full input-base text-sm"
                  />
                </div>
              </div>

              {/* Smart timing */}
              <div className="card-soft p-3 border border-[color:var(--accent-main)]/15 bg-[color:var(--accent-soft)]/30">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--accent-main)] mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Smart timing
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Hide from newcomers (hours)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.hide_from_newcomers_hours}
                      onChange={(e) => setForm({ ...form, hide_from_newcomers_hours: e.target.value })}
                      data-testid="ann-newcomer-hours"
                      className="w-full input-base text-sm"
                    />
                    <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1">Users younger than this won't see it. <span className="font-bold">0</span> = show to everyone.</div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Re-show interval</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={form.reshow_interval_minutes}
                        onChange={(e) => setForm({ ...form, reshow_interval_minutes: e.target.value })}
                        data-testid="ann-reshow-value"
                        className="flex-1 input-base text-sm"
                      />
                      <div className="inline-flex p-0.5 rounded-md bg-[color:var(--surface-alt)] text-[10px] font-bold uppercase tracking-wider">
                        {["min", "hr", "day"].map((u) => (
                          <button
                            type="button"
                            key={u}
                            onClick={() => setForm({ ...form, reshow_unit: u })}
                            data-testid={`ann-reshow-unit-${u}`}
                            className={`px-2 py-1 rounded transition-colors ${form.reshow_unit === u ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--text-secondary)]"}`}
                          >
                            {u === "min" ? "Min" : u === "hr" ? "Hrs" : "Days"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1">After a user dismisses, re-show after this long. <span className="font-bold">0</span> = show once, never again.</div>
                  </div>
                </div>
              </div>

              {/* Priority + active */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Priority (higher = shown first)</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    data-testid="ann-priority"
                    className="w-full input-base text-sm"
                  />
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none card-soft p-2.5 h-fit">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    data-testid="ann-active-toggle"
                    className="w-4 h-4 accent-[color:var(--brand)]"
                  />
                  <span className="text-sm font-semibold text-[color:var(--text-primary)]">Active (visible to users)</span>
                </label>
              </div>
            </div>

            {/* Preview */}
            <div className="lg:col-span-2 p-5 bg-[color:var(--surface-alt)]/40">
              <LivePreview form={form} />
            </div>
          </div>

          {/* Sticky footer */}
          <div className="p-4 bg-[color:var(--surface-alt)] flex items-center gap-2 border-t border-[color:var(--border-default)]">
            <button
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--surface)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface)]/70 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={submitting}
              data-testid="ann-save"
              className="ml-auto inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> {submitting ? "Saving…" : editingId ? "Save changes" : "Create"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
