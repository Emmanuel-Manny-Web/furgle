import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { readCache, writeCache } from "@/hooks/useCachedData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Users as UsersIcon, Search, Download, Plus, Minus, KeyRound, Lock, LogIn, Ban,
  UserCheck, UserPlus, Wifi, BadgeCheck,
} from "lucide-react";
import Pagination from "@/components/admin/Pagination";

function Stat({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card-soft p-5" data-testid={`stat-${label.toLowerCase().replace(/\s+/g,'-')}`}>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${color}`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
    </div>
  );
}

function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function ActionPill({ icon: Icon, label, onClick, tone, testid }) {
  const tones = {
    add: "bg-[color:var(--success-soft)] text-[color:var(--success)] border-[color:var(--success)]/30",
    deduct: "bg-[color:var(--gold-soft)] text-[color:var(--warning)] border-[color:var(--warning)]/30",
    pwd: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] border-[color:var(--accent-main)]/30",
    pin: "bg-[color:var(--brand-soft)] text-[color:var(--brand)] border-[color:var(--brand)]/30",
    login: "bg-[color:var(--surface-alt)] text-[color:var(--accent-main)] border-[color:var(--accent-main)]/20",
    ban: "bg-[color:var(--error-soft)] text-[color:var(--error)] border-[color:var(--error)]/30",
  };
  return (
    <button onClick={onClick}
      data-testid={testid}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold border ${tones[tone]} hover:opacity-80 transition-opacity whitespace-nowrap`}>
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}

export default function AdminUsers() {
  const [data, setData] = useState(() => readCache("/admin/users?page=1&page_size=20") ?? { items: [], total: 0, page: 1, page_size: 20, stats: {} });
  const [loading, setLoading] = useState(() => readCache("/admin/users?page=1&page_size=20") === undefined);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | blocked | verified | new_today | online
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const QUICK_SIZES = [5, 20, 50, 100, "all"];
  const [adjustModal, setAdjustModal] = useState(null); // { user, kind: 'add'|'deduct' }
  const [adjust, setAdjust] = useState({ amount: "", note: "" });
  const [pwdModal, setPwdModal] = useState(null);
  const [pwd, setPwd] = useState({ new_password: "" });

  const load = useCallback(() => {
    const effSize = pageSize === "all" ? 10000 : pageSize;
    const params = new URLSearchParams({ page: String(page), page_size: String(effSize) });
    if (q) params.set("q", q);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    const url = `/admin/users?${params}`;
    api.get(url)
      .then(({ data }) => { setData(data); writeCache(url, data); })
      .finally(() => setLoading(false));
  }, [page, q, pageSize, statusFilter]);
  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when controls change
  useEffect(() => { setPage(1); }, [pageSize, statusFilter]);
  // Debounced search — reload once the query settles (intentionally keyed on [q] only).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { if (page !== 1) setPage(1); else load(); }, 350); return () => clearTimeout(t); }, [q]);

  const onAdjust = async (e) => {
    e.preventDefault();
    if (!adjustModal) return;
    const sign = adjustModal.kind === "add" ? 1 : -1;
    try {
      await api.post(`/admin/users/${adjustModal.user.id}/adjust`, { amount: sign * Number(adjust.amount), note: adjust.note || (adjustModal.kind === "add" ? "Admin credit" : "Admin debit") });
      toast.success(`Wallet ${adjustModal.kind === "add" ? "credited" : "debited"}`);
      setAdjustModal(null); setAdjust({ amount: "", note: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const onPwd = async (e) => {
    e.preventDefault();
    if (!pwdModal) return;
    try {
      await api.post(`/admin/users/${pwdModal.id}/reset-password`, pwd);
      toast.success("Password reset");
      setPwdModal(null); setPwd({ new_password: "" });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const clearPin = async (u) => {
    if (!window.confirm(`Clear withdrawal PIN for ${u.name} (${u.phone})?\n\nThey will be unable to withdraw until they set a new PIN.`)) return;
    try {
      await api.post(`/admin/users/${u.id}/clear-pin`);
      toast.success("PIN cleared");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const loginAs = async (u) => {
    try {
      const { data } = await api.post(`/admin/users/${u.id}/login-as`);
      // open user app in a new tab using their token
      const url = `${window.location.origin}/login?_token=${encodeURIComponent(data.token)}`;
      window.open(url, "_blank", "noopener");
      toast.info(`Login token issued for ${u.name}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const toggleBan = async (u) => {
    if (!window.confirm(`${u.is_blocked ? "Unblock" : "Block"} ${u.name}?`)) return;
    try {
      await api.post(`/admin/users/${u.id}/${u.is_blocked ? "unblock" : "block"}`);
      toast.success(u.is_blocked ? "Unblocked" : "Blocked");
      load();
    } catch (e) { toast.error("Failed"); }
  };

  const onExport = async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const resp = await api.get(`/admin/users/export${params.toString() ? `?${params}` : ""}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([resp.data], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = `users-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch { toast.error("Export failed"); }
  };

  return (
    <AdminLayout title="">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[color:var(--brand)] via-[color:var(--brand-hover)] to-[color:var(--accent-main)] text-white p-6 md:p-8" data-testid="users-hero">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <UsersIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-extrabold text-2xl md:text-3xl leading-tight">Users</div>
            <div className="text-white/80 text-xs md:text-sm mt-1">
              {data.stats?.total_users || 0} total accounts · manage balances, PINs, sessions
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <Stat icon={UsersIcon} label="Total users" value={data.stats?.total_users ?? 0} color="bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]" />
        <Stat icon={Wifi} label="Online now" value={data.stats?.online_now ?? 0} sub="Active in last 5 min" color="bg-[color:var(--success-soft)] text-[color:var(--success)]" />
        <Stat icon={BadgeCheck} label="Verified" value={data.stats?.verified ?? 0} sub="First deposit made" color="bg-[color:var(--brand-soft)] text-[color:var(--brand)]" />
        <Stat icon={UserPlus} label="New today" value={data.stats?.new_today ?? 0} sub="Signed up today" color="bg-[color:var(--gold-soft)] text-[color:var(--warning)]" />
      </div>

      {/* Status filter + Search + export */}
      <div className="card-soft p-3 md:p-4 mt-5 flex items-center gap-3 flex-wrap" data-testid="users-toolbar">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="users-status-filter"
          className="input-base !py-2 !w-[160px] text-sm font-semibold capitalize"
        >
          {[
            { v: "all",        label: `All (${data.stats?.total_users ?? 0})` },
            { v: "active",     label: `Active (${Math.max(0, (data.stats?.total_users ?? 0) - (data.stats?.blocked ?? 0))})` },
            { v: "blocked",    label: `Blocked (${data.stats?.blocked ?? 0})` },
            { v: "verified",   label: `Verified (${data.stats?.verified ?? 0})` },
            { v: "new_today",  label: `New today (${data.stats?.new_today ?? 0})` },
            { v: "online",     label: `Online (${data.stats?.online_now ?? 0})` },
          ].map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </select>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone or email…"
            data-testid="users-search"
            className="w-full pl-10 input-base"
          />
        </div>
        <button onClick={onExport} data-testid="users-export-btn"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--accent-main)] hover:bg-[color:var(--accent-hover)] text-white">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Rows-per-page picker (matches Manual Adjustments) */}
      <div className="card-soft p-3 mt-3 flex items-center gap-3 flex-wrap" data-testid="users-quickrows">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)]">Rows per page</span>
        {QUICK_SIZES.map((n) => {
          const active = pageSize === n;
          return (
            <button
              key={String(n)}
              onClick={() => setPageSize(n)}
              data-testid={`users-quick-size-${n}`}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${active
                ? "bg-[color:var(--brand)] text-white"
                : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70"}`}
            >
              {n === "all" ? "All" : n}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-[color:var(--text-tertiary)]">
          Showing <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{data.items.length}</span> of <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{data.total || 0}</span>
        </span>
      </div>

      {/* Table */}
      <div className="card-soft overflow-hidden mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]" data-testid="users-table">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="text-left p-4">User</th>
                <th className="text-left p-4">Phone</th>
                <th className="text-left p-4">Balance</th>
                <th className="text-left p-4">Joined</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && data.items.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-[color:var(--text-tertiary)]">Loading…</td></tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-[color:var(--text-tertiary)]">No users match this search.</td></tr>
              )}
              {data.items.map((u) => (
                <tr key={u.id} className="border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors" data-testid={`user-row-${u.id}`}>
                  <td className="p-4">
                    <Link to={`/pentest/fuser/users/${u.id}`} className="flex items-center gap-3 group">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0" style={{ backgroundColor: avatarColor(u.id) }}>
                        {(u.name || u.phone || "?").trim()[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-[color:var(--text-primary)] group-hover:text-[color:var(--brand)] transition-colors truncate" data-testid={`user-name-${u.id}`}>{u.name || "—"}</div>
                        <div className="text-[10px] text-[color:var(--text-tertiary)] font-mono">@{(u.referral_code || "—").toLowerCase()}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="p-4 font-mono text-xs text-[color:var(--text-secondary)] whitespace-nowrap">{u.phone}</td>
                  <td className="p-4 font-display font-bold tabular-nums text-[color:var(--text-primary)]">{formatNaira(u.wallet_balance)}</td>
                  <td className="p-4 text-xs text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {!u.is_admin && (
                        <>
                          <ActionPill icon={Plus} label="Add" tone="add" testid={`add-${u.id}`} onClick={() => { setAdjustModal({ user: u, kind: "add" }); setAdjust({ amount: "", note: "" }); }} />
                          <ActionPill icon={Minus} label="Deduct" tone="deduct" testid={`deduct-${u.id}`} onClick={() => { setAdjustModal({ user: u, kind: "deduct" }); setAdjust({ amount: "", note: "" }); }} />
                          <ActionPill icon={KeyRound} label="Pwd" tone="pwd" testid={`pwd-${u.id}`} onClick={() => { setPwdModal(u); setPwd({ new_password: "" }); }} />
                          {u.has_withdrawal_pin && (
                            <ActionPill icon={Lock} label="PIN" tone="pin" testid={`clear-pin-${u.id}`} onClick={() => clearPin(u)} />
                          )}
                          <ActionPill icon={LogIn} label="Login" tone="login" testid={`login-as-${u.id}`} onClick={() => loginAs(u)} />
                          <ActionPill icon={Ban} label={u.is_blocked ? "Unban" : "Ban"} tone="ban" testid={`ban-${u.id}`} onClick={() => toggleBan(u)} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination — shared component (matches Admin Deposits / Withdrawals) */}
        {data.total > 0 && pageSize !== "all" && (
          <Pagination
            page={page}
            setPage={setPage}
            totalItems={data.total || 0}
            pageSize={pageSize}
            testidPrefix="users-page"
          />
        )}
      </div>

      {/* Adjust modal */}
      <Dialog open={!!adjustModal} onOpenChange={(o) => !o && setAdjustModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adjustModal?.kind === "add" ? "Credit wallet" : "Debit wallet"} — {adjustModal?.user.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onAdjust} className="space-y-3">
            <div>
              <label className="text-xs text-[color:var(--text-secondary)]">Amount (₦)</label>
              <input type="number" min="1" step="0.01" required value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })}
                data-testid="adjust-amount" className="w-full mt-1 input-base" />
            </div>
            <div>
              <label className="text-xs text-[color:var(--text-secondary)]">Note (optional)</label>
              <input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
                data-testid="adjust-note" className="w-full mt-1 input-base" placeholder="Reason for the adjustment" />
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setAdjustModal(null)} className="px-4 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">Cancel</button>
              <button type="submit" data-testid="adjust-submit"
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${adjustModal?.kind === "add" ? "bg-[color:var(--success)]" : "bg-[color:var(--warning)]"}`}>
                {adjustModal?.kind === "add" ? "Credit wallet" : "Debit wallet"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Password reset modal */}
      <Dialog open={!!pwdModal} onOpenChange={(o) => !o && setPwdModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password — {pwdModal?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onPwd} className="space-y-3">
            <p className="text-xs text-[color:var(--text-secondary)]">Pick a temporary password for the user. They can change it on their Profile.</p>
            <div>
              <label className="text-xs text-[color:var(--text-secondary)]">New password</label>
              <input type="text" required minLength={6} value={pwd.new_password} onChange={(e) => setPwd({ new_password: e.target.value })}
                data-testid="pwd-new" className="w-full mt-1 input-base font-mono" />
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setPwdModal(null)} className="px-4 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">Cancel</button>
              <button type="submit" data-testid="pwd-submit"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--accent-main)] text-white">Reset password</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
