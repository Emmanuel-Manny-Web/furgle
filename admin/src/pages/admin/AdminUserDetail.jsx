import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { readCache, writeCache } from "@/hooks/useCachedData";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ArrowLeft, Phone, Mail, Sparkles, Copy, CheckCircle2, Ban, Plus, Minus,
  KeyRound, Lock, LogIn, Wallet, ArrowDownToLine, TrendingUp, Layers,
  ArrowUpRight, ArrowUpFromLine, Share2, Gift, FileText, Building2,
  History, ChevronRight, Coins, Settings as SettingsIcon, UserCheck,
} from "lucide-react";

function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function CopyField({ icon: Icon, label, value, testid }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-3 flex items-center gap-3" data-testid={testid}>
      <Icon className="w-4 h-4 text-white/70 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-white/60">{label}</div>
        <div className="text-sm text-white font-semibold truncate">{value || "—"}</div>
      </div>
      {value && (
        <button onClick={copy} className="p-1.5 rounded-md hover:bg-white/15 transition-colors shrink-0" title="Copy">
          {copied ? <CheckCircle2 className="w-4 h-4 text-[color:var(--success)]" /> : <Copy className="w-3.5 h-3.5 text-white/70" />}
        </button>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone, testid }) {
  const tones = {
    pink: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    green: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    purple: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    gold: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
  };
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
    </div>
  );
}

function ActionBlock({ icon: Icon, label, onClick, tone, testid, disabled }) {
  const tones = {
    add: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    deduct: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
    pwd: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    pin: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    phone: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    login: "bg-[color:var(--surface-alt)] text-[color:var(--accent-main)]",
    ban: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      data-testid={testid}
      className={`rounded-2xl p-5 text-center font-semibold flex flex-col items-center gap-2 ${tones[tone]} hover:scale-[1.02] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}>
      <Icon className="w-5 h-5" />
      <span className="text-sm">{label}</span>
    </button>
  );
}

const TABS = [
  { id: "investments", label: "Investments", icon: TrendingUp },
  { id: "deposits", label: "Deposits", icon: ArrowDownToLine },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { id: "referrals", label: "Referrals", icon: Share2 },
  { id: "transactions", label: "Transactions", icon: FileText },
  { id: "bank", label: "Bank", icon: Building2 },
];

export default function AdminUserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(() => readCache(`/admin/users/${id}/details`) ?? null);
  const [tab, setTab] = useState("investments");
  const [tabData, setTabData] = useState({ items: [], loading: false });
  const [modal, setModal] = useState(null); // 'add' | 'deduct' | 'pwd' | 'phone' | 'activity'
  const [adjust, setAdjust] = useState({ amount: "", note: "" });
  const [pwd, setPwd] = useState({ new_password: "" });
  const [phoneForm, setPhoneForm] = useState({ new_phone: "" });
  const [activity, setActivity] = useState({ items: [], loading: false, count: 0 });

  const load = useCallback(() => api.get(`/admin/users/${id}/details`).then(({ data }) => { setData(data); writeCache(`/admin/users/${id}/details`, data); }).catch(() => toast.error("Failed to load user")), [id]);
  const loadActivity = useCallback(() => {
    setActivity((a) => ({ ...a, loading: true }));
    return api.get(`/admin/users/${id}/activity?limit=500`)
      .then(({ data }) => setActivity({ items: data.items || [], count: data.count || 0, loading: false }))
      .catch(() => setActivity({ items: [], count: 0, loading: false }));
  }, [id]);
  const loadTab = useCallback((t) => {
    setTabData({ items: [], loading: true });
    api.get(`/admin/users/${id}/timeline?tab=${t}&limit=100`)
      .then(({ data }) => setTabData({ items: data.items || [], loading: false }))
      .catch(() => setTabData({ items: [], loading: false }));
  }, [id]);
  useEffect(() => { load(); loadActivity(); }, [load, loadActivity]);
  useEffect(() => { loadTab(tab); }, [loadTab, tab]);

  const openActivityModal = () => { setModal("activity"); loadActivity(); };

  const u = data?.user;
  const s = data?.stats || {};

  const submitAdjust = async (e) => {
    e.preventDefault();
    const sign = modal === "add" ? 1 : -1;
    try {
      await api.post(`/admin/users/${id}/adjust`, { amount: sign * Number(adjust.amount), note: adjust.note || (modal === "add" ? "Admin credit" : "Admin debit") });
      toast.success(modal === "add" ? "Wallet credited" : "Wallet debited");
      setModal(null); setAdjust({ amount: "", note: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const submitPwd = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admin/users/${id}/reset-password`, pwd);
      toast.success("Password reset");
      setModal(null); setPwd({ new_password: "" });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const submitPhone = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admin/users/${id}/change-phone`, phoneForm);
      toast.success("Phone updated");
      setModal(null); setPhoneForm({ new_phone: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const resetPin = async () => {
    if (!window.confirm("Clear withdrawal PIN? User will need to set a new one.")) return;
    try { await api.post(`/admin/users/${id}/clear-pin`); toast.success("PIN cleared"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const loginAs = async () => {
    try {
      const { data } = await api.post(`/admin/users/${id}/login-as`);
      const url = `${window.location.origin}/login?_token=${encodeURIComponent(data.token)}`;
      window.open(url, "_blank", "noopener");
      toast.info(`Login token issued for ${u?.name}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const toggleBan = async () => {
    if (!window.confirm(`${u?.is_blocked ? "Unblock" : "Ban"} ${u?.name}?`)) return;
    try { await api.post(`/admin/users/${id}/${u.is_blocked ? "unblock" : "block"}`); toast.success(u.is_blocked ? "Unblocked" : "Banned"); load(); }
    catch { toast.error("Failed"); }
  };

  if (!data) return (
    <AdminLayout title="">
      <Link to="/pentest/fuser/users" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]"><ArrowLeft className="w-4 h-4" /> Back to users</Link>
      <div className="card-soft p-12 mt-6 text-center text-[color:var(--text-tertiary)]">Loading…</div>
    </AdminLayout>
  );

  return (
    <AdminLayout title="">
      <Link to="/pentest/fuser/users" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]" data-testid="back-to-users">
        <ArrowLeft className="w-4 h-4" /> Back to users
      </Link>

      {/* Hero profile */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1E3A8A] via-[#5B5BD6] to-[color:var(--accent-main)] text-white p-6 md:p-8 mt-3" data-testid="user-hero">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-start gap-5">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-white font-bold text-4xl shrink-0 backdrop-blur" style={{ backgroundColor: avatarColor(u.id) }}>
            {(u.name || u.phone || "?").trim()[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display font-extrabold text-2xl md:text-4xl tracking-tight" data-testid="user-name">{u.name || "—"}</h1>
              {u.is_blocked ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[color:var(--error)] text-white text-xs font-bold"><Ban className="w-3 h-3" /> BANNED</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[color:var(--success)] text-white text-xs font-bold"><CheckCircle2 className="w-3 h-3" /> ACTIVE</span>
              )}
            </div>
            <div className="text-white/80 text-xs mt-1">@{(u.referral_code || "—").toLowerCase()} · Role {u.is_admin ? "admin" : "user"}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
              <CopyField icon={Phone} label="Phone" value={u.phone} testid="hero-phone" />
              <CopyField icon={Mail} label="Email" value={u.email} testid="hero-email" />
              <CopyField icon={Sparkles} label="Referral code" value={u.referral_code} testid="hero-referral-code" />
              <CopyField icon={ArrowUpRight} label="Joined" value={formatDate(u.created_at)} testid="hero-joined" />
            </div>
            {data.referrer && (
              <div className="mt-4 inline-flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-1.5 rounded-full text-xs" data-testid="hero-referred-by">
                <span className="text-white/60 uppercase tracking-wider font-bold text-[9px]">Referred by</span>
                <span className="font-semibold text-[color:var(--warning)]">{data.referrer.name} ({data.referrer.referral_code})</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard icon={Wallet} label="Balance" value={formatNaira(s.balance ?? 0)} tone="pink" testid="stat-balance" />
        <StatCard icon={ArrowDownToLine} label="Total deposited" value={formatNaira(s.total_deposited ?? 0)} sub={`${s.deposits_count || 0} deposits`} tone="green" testid="stat-total-deposited" />
        <StatCard icon={TrendingUp} label="Total invested" value={formatNaira(s.total_invested ?? 0)} sub={`${s.total_invested_count || 0} plans`} tone="pink" testid="stat-total-invested" />
        <StatCard icon={Layers} label="Active plans" value={s.active_plans ?? 0} sub={`${s.total_invested_count || 0} total`} tone="purple" testid="stat-active-plans" />
        <StatCard icon={ArrowUpRight} label="Profit earned" value={formatNaira(s.profit_earned ?? 0)} tone="green" testid="stat-profit-earned" />
        <StatCard icon={ArrowUpFromLine} label="Total withdrawn" value={formatNaira(s.total_withdrawn ?? 0)} sub={`${s.withdrawals_count || 0} payouts`} tone="pink" testid="stat-total-withdrawn" />
        <StatCard icon={Share2} label="Referrals" value={s.referrals ?? 0} sub={`${s.referrals_invested || 0} active`} tone="purple" testid="stat-referrals" />
        <StatCard icon={Gift} label="Referral bonus" value={formatNaira(s.referral_bonus ?? 0)} tone="gold" testid="stat-referral-bonus" />
      </div>

      {/* Admin actions */}
      <div className="card-soft p-5 mt-5" data-testid="admin-actions-card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-display font-bold text-[color:var(--text-primary)]">Admin actions</div>
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">All actions are audited</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <ActionBlock icon={Plus} label="Add balance" tone="add" testid="action-add-balance" onClick={() => { setModal("add"); setAdjust({ amount: "", note: "" }); }} />
          <ActionBlock icon={Minus} label="Deduct balance" tone="deduct" testid="action-deduct-balance" onClick={() => { setModal("deduct"); setAdjust({ amount: "", note: "" }); }} />
          <ActionBlock icon={KeyRound} label="Reset password" tone="pwd" testid="action-reset-password" onClick={() => { setModal("pwd"); setPwd({ new_password: "" }); }} />
          <ActionBlock icon={Lock} label="Reset PIN" tone="pin" testid="action-reset-pin" onClick={resetPin} disabled={!u.has_withdrawal_pin} />
          <ActionBlock icon={Phone} label="Change phone" tone="phone" testid="action-change-phone" onClick={() => { setModal("phone"); setPhoneForm({ new_phone: u.phone || "" }); }} />
          <ActionBlock icon={LogIn} label="Login as user" tone="login" testid="action-login-as" onClick={loginAs} />
        </div>
        <div className="mt-3 flex justify-start">
          <ActionBlock icon={Ban} label={u.is_blocked ? "Unban user" : "Ban user"} tone="ban" testid="action-ban" onClick={toggleBan} />
        </div>
      </div>

      {/* Activity Log card */}
      <button onClick={openActivityModal}
        data-testid="activity-log-card"
        className="w-full card-soft p-5 mt-5 flex items-center gap-4 hover:shadow-lg hover:scale-[1.005] transition-all text-left">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--accent-main)] text-white flex items-center justify-center shrink-0">
          <History className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-[color:var(--text-primary)]">Activity log</div>
          <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            {activity.count > 0
              ? `${activity.count} admin action${activity.count === 1 ? "" : "s"} recorded on this account`
              : "No admin actions recorded yet — click to view"}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] hidden md:block">View full audit trail</div>
        <ChevronRight className="w-5 h-5 text-[color:var(--text-tertiary)] shrink-0" />
      </button>

      {/* Tabs */}
      <div className="card-soft mt-5" data-testid="user-tabs">
        <div className="flex flex-wrap gap-1 border-b border-[color:var(--border-default)] p-2">
          {TABS.map((t) => {
            const count = ({
              investments: s.total_invested_count,
              deposits: s.deposits_count,
              withdrawals: s.withdrawals_count,
              referrals: s.referrals,
              transactions: s.transactions_count,
              bank: s.bank_set ? 1 : 0,
            })[t.id] ?? 0;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                data-testid={`tab-${t.id}`}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${active ? "text-[color:var(--accent-main)] border-b-2 border-[color:var(--accent-main)]" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"}`}>
                <t.icon className="w-3.5 h-3.5" /> {t.label}
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${active ? "bg-[color:var(--accent-main)] text-white" : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="p-5 min-h-[200px]">
          {tabData.loading ? (
            <div className="text-center text-[color:var(--text-tertiary)] py-12">Loading…</div>
          ) : tabData.items.length === 0 ? (
            <div className="text-center text-[color:var(--text-tertiary)] py-12">No {tab} yet</div>
          ) : (
            <TabBody tab={tab} items={tabData.items} />
          )}
        </div>
      </div>

      {/* Modals */}
      <Dialog open={modal === "add" || modal === "deduct"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === "add" ? "Credit wallet" : "Debit wallet"} — {u?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAdjust} className="space-y-3">
            <div>
              <label className="text-xs text-[color:var(--text-secondary)]">Amount (₦)</label>
              <input type="number" min="1" step="0.01" required value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })}
                data-testid="adjust-amount" className="w-full mt-1 input-base" />
            </div>
            <div>
              <label className="text-xs text-[color:var(--text-secondary)]">Note (optional)</label>
              <input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
                data-testid="adjust-note" className="w-full mt-1 input-base" placeholder="Reason" />
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">Cancel</button>
              <button type="submit" data-testid="adjust-submit"
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${modal === "add" ? "bg-[color:var(--success)]" : "bg-[color:var(--warning)]"}`}>
                {modal === "add" ? "Credit wallet" : "Debit wallet"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "pwd"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password — {u?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPwd} className="space-y-3">
            <p className="text-xs text-[color:var(--text-secondary)]">Pick a temporary password. User can change it later.</p>
            <input type="text" required minLength={6} value={pwd.new_password} onChange={(e) => setPwd({ new_password: e.target.value })}
              data-testid="pwd-new" className="w-full input-base font-mono" placeholder="Min 6 characters" />
            <DialogFooter>
              <button type="button" onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">Cancel</button>
              <button type="submit" data-testid="pwd-submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--accent-main)] text-white">Reset password</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Activity log modal */}
      <Dialog open={modal === "activity"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Activity log — {u?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6" data-testid="activity-modal-body">
            {activity.loading && (
              <div className="text-center text-[color:var(--text-tertiary)] py-12">Loading…</div>
            )}
            {!activity.loading && activity.items.length === 0 && (
              <div className="text-center text-[color:var(--text-tertiary)] py-12">
                <History className="w-10 h-10 mx-auto opacity-30" />
                <div className="mt-3 text-sm">No admin actions have been recorded on this account yet.</div>
              </div>
            )}
            {!activity.loading && activity.items.length > 0 && (
              <ol className="relative border-l-2 border-[color:var(--border-default)] ml-2 space-y-4 py-2">
                {activity.items.map((it) => {
                  const ICONS = {
                    "pin.cleared": KeyRound,
                    "user.balance_adjusted": Coins,
                    "user.blocked": Ban,
                    "user.unblocked": UserCheck,
                    "user.password_reset": KeyRound,
                    "user.phone_changed": Phone,
                    "user.impersonated": LogIn,
                  };
                  const Icon = ICONS[it.action] || SettingsIcon;
                  const colorMap = {
                    "pin.cleared": "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
                    "user.balance_adjusted": "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
                    "user.blocked": "bg-[color:var(--error-soft)] text-[color:var(--error)]",
                    "user.unblocked": "bg-[color:var(--success-soft)] text-[color:var(--success)]",
                    "user.password_reset": "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
                    "user.phone_changed": "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
                    "user.impersonated": "bg-[color:var(--surface-alt)] text-[color:var(--accent-main)]",
                  };
                  const tone = colorMap[it.action] || "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]";
                  return (
                    <li key={it.id} className="ml-6 relative" data-testid={`activity-item-${it.id}`}>
                      <span className={`absolute -left-9 top-0.5 w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[color:var(--surface)] ${tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="card-soft p-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-[color:var(--text-primary)]">{it.description || it.action}</div>
                            <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] mt-0.5">{it.action}</div>
                          </div>
                          <div className="text-[11px] text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(it.created_at)}</div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-[color:var(--text-secondary)]">
                          <span className="opacity-60">by</span>
                          <span className="font-semibold text-[color:var(--text-primary)]">{it.admin_name || "—"}</span>
                          <span className="font-mono text-[10px] text-[color:var(--text-tertiary)]">· {it.admin_phone}</span>
                        </div>
                        {it.meta && Object.keys(it.meta).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] cursor-pointer hover:text-[color:var(--brand)]">Metadata</summary>
                            <pre className="text-[10px] mt-1.5 bg-[color:var(--surface-alt)] p-2 rounded-md overflow-x-auto font-mono">{JSON.stringify(it.meta, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <DialogFooter className="border-t border-[color:var(--border-default)] pt-3">
            <div className="text-[11px] text-[color:var(--text-tertiary)] flex-1">
              {activity.count > 0 && <>Showing {activity.items.length} of {activity.count} · All actions are immutable</>}
            </div>
            <button type="button" onClick={loadActivity} disabled={activity.loading}
              data-testid="activity-refresh"
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">
              Refresh
            </button>
            <button type="button" onClick={() => setModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--accent-main)] text-white">Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "phone"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change phone — {u?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPhone} className="space-y-3">
            <p className="text-xs text-[color:var(--text-secondary)]">Current: <span className="font-mono">{u?.phone}</span></p>
            <input type="tel" pattern="[0-9]{11}" maxLength={11} required value={phoneForm.new_phone}
              onChange={(e) => setPhoneForm({ new_phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
              data-testid="phone-new" className="w-full input-base font-mono" placeholder="11-digit phone" />
            <DialogFooter>
              <button type="button" onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">Cancel</button>
              <button type="submit" data-testid="phone-submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--accent-main)] text-white">Update phone</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function TabBody({ tab, items }) {
  if (tab === "investments") return (
    <Table cols={["Product", "Amount", "Daily", "Status", "Started"]}>
      {items.map((i) => (
        <tr key={i.id} className="border-t border-[color:var(--border-default)]">
          <td className="p-3 font-semibold text-[color:var(--text-primary)]">{i.product_name}</td>
          <td className="p-3 tabular-nums">{formatNaira(i.amount)}</td>
          <td className="p-3 tabular-nums text-[color:var(--brand)] font-bold">{formatNaira(i.daily_profit_amount)}</td>
          <td className="p-3"><span className={`pill ${i.status === "active" ? "pill-success" : "pill-warn"}`}>{i.status}</span></td>
          <td className="p-3 text-xs text-[color:var(--text-tertiary)]">{formatDate(i.start_date || i.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
  if (tab === "deposits") return (
    <Table cols={["Amount", "Gateway", "Status", "Reference", "Created"]}>
      {items.map((d) => (
        <tr key={d.id} className="border-t border-[color:var(--border-default)]">
          <td className="p-3 tabular-nums font-bold">{formatNaira(d.amount)}</td>
          <td className="p-3">
            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]">
              {d.method || "—"}
            </span>
          </td>
          <td className="p-3"><span className={`pill ${d.status === "success" ? "pill-success" : d.status === "failed" ? "pill-error" : "pill-warn"}`}>{d.status}</span></td>
          <td className="p-3 font-mono text-xs text-[color:var(--text-tertiary)]">{d.method === "nekpay" ? (d.pay_order_id || d.gateway_id || "—") : d.reference}</td>
          <td className="p-3 text-xs text-[color:var(--text-tertiary)]">{formatDate(d.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
  if (tab === "withdrawals") return (
    <Table cols={["Amount", "Gateway", "Status", "Bank", "Created"]}>
      {items.map((w) => {
        const gateway = w.paystack_transfer_ref
          ? "paystack"
          : w.nomba_transfer_ref
            ? "nomba"
            : w.status === "paid" || w.status === "success"
              ? "manual"
              : "—";
        return (
          <tr key={w.id} className="border-t border-[color:var(--border-default)]">
            <td className="p-3 tabular-nums font-bold">{formatNaira(w.amount)}</td>
            <td className="p-3">
              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                {gateway}
              </span>
            </td>
            <td className="p-3"><span className={`pill ${w.status === "paid" || w.status === "success" ? "pill-success" : w.status === "rejected" ? "pill-error" : "pill-warn"}`}>{w.status === "success" ? "paid" : w.status}</span></td>
            <td className="p-3 text-xs">{w.bank_name} · <span className="font-mono">{w.account_number}</span></td>
            <td className="p-3 text-xs text-[color:var(--text-tertiary)]">{formatDate(w.created_at)}</td>
          </tr>
        );
      })}
    </Table>
  );
  if (tab === "referrals") return (
    <Table cols={["Name", "Phone", "Balance", "Joined"]}>
      {items.map((r) => (
        <tr key={r.id} className="border-t border-[color:var(--border-default)]">
          <td className="p-3 font-semibold text-[color:var(--text-primary)]">
            <Link to={`/pentest/fuser/users/${r.id}`} className="hover:text-[color:var(--brand)]">{r.name || "—"}</Link>
          </td>
          <td className="p-3 font-mono text-xs">{r.phone}</td>
          <td className="p-3 tabular-nums">{formatNaira(r.wallet_balance)}</td>
          <td className="p-3 text-xs text-[color:var(--text-tertiary)]">{formatDate(r.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
  if (tab === "transactions") return (
    <Table cols={["Type", "Amount", "Description", "Balance after", "Created"]}>
      {items.map((t) => (
        <tr key={t.id} className="border-t border-[color:var(--border-default)]">
          <td className="p-3"><span className="pill pill-warn">{t.type}</span></td>
          <td className={`p-3 tabular-nums font-bold ${t.amount >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>{formatNaira(t.amount)}</td>
          <td className="p-3 text-xs text-[color:var(--text-secondary)]">{t.description}</td>
          <td className="p-3 tabular-nums text-xs">{formatNaira(t.balance_after)}</td>
          <td className="p-3 text-xs text-[color:var(--text-tertiary)]">{formatDate(t.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
  if (tab === "bank") {
    const b = items[0];
    if (!b) return null;
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-[color:var(--surface-alt)] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Bank</div>
          <div className="font-semibold text-[color:var(--text-primary)] mt-1">{b.bank_name}</div>
        </div>
        <div className="rounded-xl bg-[color:var(--surface-alt)] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Account number</div>
          <div className="font-mono font-semibold text-[color:var(--text-primary)] mt-1">{b.account_number}</div>
        </div>
        <div className="rounded-xl bg-[color:var(--surface-alt)] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Account name</div>
          <div className="font-semibold text-[color:var(--text-primary)] mt-1">{b.account_name}</div>
        </div>
      </div>
    );
  }
  return null;
}

function Table({ cols, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead><tr className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">
          {cols.map((c) => <th key={c} className="text-left p-3">{c}</th>)}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
