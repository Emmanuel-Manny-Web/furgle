import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import {
  KeyRound, Search, X, ShieldCheck, ShieldX, ShieldAlert,
  Clock, Phone, User, Calendar, Inbox, ChevronRight, ChevronDown,
  Check, RotateCcw, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const STATUS_META = {
  pending:  { label: "Pending",  tone: "warn",    icon: Clock },
  approved: { label: "Approved", tone: "success", icon: ShieldCheck },
  rejected: { label: "Rejected", tone: "error",   icon: ShieldX },
};

const TONE_BG = {
  warn:    "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
  success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  error:   "bg-[color:var(--error-soft)] text-[color:var(--error)]",
  brand:   "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
};

const TONE_PILL = {
  warn:    "pill pill-warn",
  success: "pill pill-success",
  error:   "pill pill-error",
};

const FILTERS = [
  { v: "pending",  label: "Pending",  icon: Clock },
  { v: "approved", label: "Approved", icon: ShieldCheck },
  { v: "rejected", label: "Rejected", icon: ShieldX },
  { v: "all",      label: "All",      icon: Inbox },
];

function StatCard({ icon: Icon, label, value, tone = "brand", testid }) {
  return (
    <div className="card-soft p-4 flex items-center gap-3" data-testid={testid}>
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${TONE_BG[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-label">{label}</div>
        <div className="font-display text-xl font-extrabold text-[color:var(--text-primary)] truncate">{value}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, onClose, mode, request, onConfirm }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (open) setNote(""); }, [open]);
  if (!request) return null;
  const isApprove = mode === "approve";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="reset-confirm-dialog">
        <DialogHeader>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 ${isApprove ? TONE_BG.success : TONE_BG.error}`}>
            {isApprove ? <ShieldCheck className="w-6 h-6" /> : <ShieldX className="w-6 h-6" />}
          </div>
          <DialogTitle className="font-display text-xl font-extrabold">
            {isApprove ? "Approve password reset?" : "Reject password reset?"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="card-soft p-3 bg-[color:var(--surface-alt)]">
            <div className="text-label mb-1">User</div>
            <div className="font-semibold text-[color:var(--text-primary)]">{request.user_name || "—"}</div>
            <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{request.phone}</div>
          </div>
          {request.reason && (
            <div>
              <div className="text-label mb-1">Reason given</div>
              <div className="text-[color:var(--text-primary)] italic">"{request.reason}"</div>
            </div>
          )}
          <div>
            <label className="text-label mb-1 block">{isApprove ? "Internal note (optional)" : "Reason for rejecting (recommended)"}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="reset-confirm-note"
              placeholder={isApprove ? "e.g. Verified via WhatsApp call" : "e.g. Could not verify identity"}
              className="w-full input-base min-h-[80px] resize-none"
            />
          </div>
          {isApprove && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[color:var(--warning)]/10 border border-[color:var(--warning)]/30">
              <AlertTriangle className="w-4 h-4 text-[color:var(--warning)] mt-0.5 shrink-0" />
              <div className="text-xs text-[color:var(--text-primary)]">
                Approving makes the user's new password active immediately. They should be able to log in with the password they set when requesting the reset.
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[color:var(--border-default)] text-sm font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]" data-testid="reset-confirm-cancel">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            data-testid="reset-confirm-submit"
            className={`px-4 py-2 rounded-xl text-sm font-bold text-white shadow ${isApprove ? "bg-[color:var(--success)] hover:opacity-90" : "bg-[color:var(--error)] hover:opacity-90"}`}
          >
            {isApprove ? "Approve reset" : "Reject reset"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ r, onApprove, onReject, expanded, onToggle }) {
  const meta = STATUS_META[r.status] || { label: r.status, tone: "warn", icon: Clock };
  const StatusIcon = meta.icon;
  return (
    <div className="card-soft overflow-hidden" data-testid={`reset-card-${r.id}`}>
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-[color:var(--surface-alt)] transition-colors"
        data-testid={`reset-card-toggle-${r.id}`}
      >
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${TONE_BG[meta.tone]}`}>
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-sm text-[color:var(--text-primary)] truncate">{r.user_name || "—"}</div>
            <span className={TONE_PILL[meta.tone]}><StatusIcon className="w-3 h-3" /> {meta.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-[color:var(--text-tertiary)]">
            <span className="font-mono inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</span>
            <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(r.created_at)}</span>
          </div>
          {r.reason && (
            <div className={`text-xs text-[color:var(--text-secondary)] mt-1.5 italic ${expanded ? "" : "line-clamp-1"}`}>
              "{r.reason}"
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-[color:var(--text-tertiary)] shrink-0 mt-2 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-[color:var(--border-default)] px-4 py-3 bg-[color:var(--surface-alt)]/40 space-y-2">
          {r.reason && (
            <div>
              <div className="text-label mb-0.5">Full reason</div>
              <div className="text-sm text-[color:var(--text-primary)]">{r.reason}</div>
            </div>
          )}
          {r.admin_note && (
            <div>
              <div className="text-label mb-0.5">Admin note</div>
              <div className="text-sm text-[color:var(--text-primary)] italic">"{r.admin_note}"</div>
            </div>
          )}
          {r.acted_at && (
            <div className="text-[11px] text-[color:var(--text-tertiary)] flex items-center gap-1">
              <Clock className="w-3 h-3" /> Acted on {formatDate(r.acted_at)}
              {r.acted_by_phone && <span className="font-mono"> · by {r.acted_by_phone}</span>}
            </div>
          )}

          {r.status === "pending" && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={(e) => { e.stopPropagation(); onApprove(r); }}
                data-testid={`approve-reset-${r.id}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white bg-[color:var(--success)] hover:opacity-90 shadow-sm"
              >
                <Check className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onReject(r); }}
                data-testid={`reject-reset-${r.id}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white bg-[color:var(--error)] hover:opacity-90 shadow-sm"
              >
                <X className="w-4 h-4" /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPasswordResets() {
  const [items, setItems] = useState(() => readCache("/admin/password-resets") ?? []);
  const [loading, setLoading] = useState(() => readCache("/admin/password-resets") === undefined);
  const [filter, setFilter] = useState("pending");
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, mode: "", request: null });

  const load = async () => {
    try {
      const { data } = await api.get("/admin/password-resets");
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);
      writeCache("/admin/password-resets", rows);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    pending:  items.filter((r) => r.status === "pending").length,
    approved: items.filter((r) => r.status === "approved").length,
    rejected: items.filter((r) => r.status === "rejected").length,
    total:    items.length,
  }), [items]);

  const filtered = useMemo(() => {
    let rows = filter === "all" ? items : items.filter((r) => r.status === filter);
    const term = q.trim().toLowerCase();
    if (term) {
      rows = rows.filter((r) =>
        (r.user_name || "").toLowerCase().includes(term)
        || (r.phone || "").toLowerCase().includes(term)
        || (r.reason || "").toLowerCase().includes(term)
      );
    }
    return rows;
  }, [items, filter, q]);

  const openApprove = (r) => setConfirm({ open: true, mode: "approve", request: r });
  const openReject  = (r) => setConfirm({ open: true, mode: "reject",  request: r });

  const submit = async (note) => {
    const { mode, request } = confirm;
    if (!request) return;
    try {
      await api.post(`/admin/password-resets/${request.id}/${mode}`, { note });
      toast.success(mode === "approve" ? "Reset approved — new password is active" : "Request rejected");
      setConfirm({ open: false, mode: "", request: null });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <AdminLayout title="Password Resets">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[color:var(--brand)] via-[color:var(--accent-main)] to-[color:var(--brand-hover)] text-white p-5 mb-5" data-testid="resets-hero">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] opacity-80">Account recovery</div>
              <div className="font-display text-2xl font-extrabold leading-tight">Password reset requests</div>
              <div className="text-xs opacity-90 mt-1">Verify the user, then approve or reject. Approved resets activate immediately.</div>
            </div>
          </div>
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold transition-colors" data-testid="resets-refresh">
            <RotateCcw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Clock}        label="Pending"   value={counts.pending.toLocaleString()}  tone="warn"    testid="stat-pending" />
        <StatCard icon={ShieldCheck}  label="Approved"  value={counts.approved.toLocaleString()} tone="success" testid="stat-approved" />
        <StatCard icon={ShieldX}      label="Rejected"  value={counts.rejected.toLocaleString()} tone="error"   testid="stat-rejected" />
        <StatCard icon={Inbox}        label="Total ever" value={counts.total.toLocaleString()}    tone="brand"   testid="stat-total" />
      </div>

      {/* Filters + search */}
      <div className="card-soft p-4 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.v;
            const count = f.v === "all" ? counts.total : counts[f.v];
            return (
              <button
                key={f.v}
                onClick={() => setFilter(f.v)}
                data-testid={`filter-${f.v}`}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  active
                    ? "bg-[color:var(--brand)] text-white border-[color:var(--brand)] shadow-md shadow-[color:var(--brand)]/30"
                    : "border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:border-[color:var(--brand)]/60 hover:text-[color:var(--brand)] bg-[color:var(--surface)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {f.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/20" : "bg-[color:var(--surface-alt)]"}`}>{count}</span>
              </button>
            );
          })}
          <div className="relative flex-1 min-w-[200px] ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, reason…"
              data-testid="resets-search-input"
              className="w-full pl-10 pr-10 input-base"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-[color:var(--surface-alt)]" data-testid="resets-search-clear">
                <X className="w-4 h-4 text-[color:var(--text-tertiary)]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card-soft p-10 text-center text-[color:var(--text-tertiary)] text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card-soft p-10 text-center" data-testid="resets-empty">
          <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] mb-3">
            <Inbox className="w-5 h-5" />
          </div>
          <div className="font-display font-bold text-base text-[color:var(--text-primary)]">No requests {filter !== "all" ? `in "${filter}"` : "yet"}</div>
          <div className="text-xs text-[color:var(--text-tertiary)] mt-1">
            {q ? "Try clearing the search box or switching tabs." : "When a user requests a reset from the Forgot password page, it shows up here."}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onApprove={openApprove}
              onReject={openReject}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, mode: "", request: null })}
        mode={confirm.mode}
        request={confirm.request}
        onConfirm={submit}
      />
    </AdminLayout>
  );
}
