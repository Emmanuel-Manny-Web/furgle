import React, { useEffect, useMemo, useRef, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Lock, Building2, Save, Search, ChevronDown, Check, Loader2, BadgeCheck, Pencil, KeyRound, ShieldCheck } from "lucide-react";

function BankPicker({ value, banks, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Focus search when the dropdown opens
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = useMemo(() => banks.find((b) => b.code === value?.bank_code) || banks.find((b) => b.name === value?.bank_name) || null, [banks, value]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(ql) || b.code.includes(ql));
  }, [banks, q]);

  const pick = (b) => {
    onSelect(b);
    setOpen(false);
    setQ("");
    // Return focus to the trigger so the page is not in a stuck focus state
    setTimeout(() => rootRef.current?.querySelector('[data-testid="bank-picker-trigger"]')?.focus(), 0);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="bank-picker-trigger"
        className="w-full mt-2 flex items-center justify-between gap-3 px-3 py-2.5 input-base text-left"
      >
        <span className={selected ? "text-[color:var(--text-primary)] font-semibold truncate" : "text-[color:var(--text-tertiary)] truncate"}>
          {selected ? selected.name : "Select your bank"}
        </span>
        <ChevronDown className={`w-4 h-4 text-[color:var(--text-tertiary)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-40 left-0 right-0 mt-2 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border-default)] shadow-2xl flex flex-col" style={{ maxHeight: "min(60vh, 420px)" }} data-testid="bank-picker-dropdown">
          <div className="px-3 py-2 border-b border-[color:var(--border-default)] bg-[color:var(--surface)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
              <input
                ref={searchRef}
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${banks.length} banks…`}
                data-testid="bank-search"
                className="w-full pl-8 pr-3 py-2 text-sm bg-[color:var(--surface-alt)] border border-[color:var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]"
              />
            </div>
          </div>
          <div className="overflow-y-auto" data-testid="bank-options-scroll">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-[color:var(--text-tertiary)]">No bank matches "{q}"</div>
            )}
            {filtered.map((b) => {
              const active = selected?.code === b.code;
              return (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => pick(b)}
                  data-testid={`bank-option-${b.code}`}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[color:var(--surface-alt)] transition-colors ${active ? "bg-[color:var(--brand-soft)]" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--text-primary)] truncate">{b.name}</div>
                  </div>
                  {active && <Check className="w-4 h-4 text-[color:var(--brand)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const [banks, setBanks] = useState([]);
  const hasSavedBank = !!(user?.bank_name && user?.account_number && user?.account_name);
  const [editing, setEditing] = useState(!hasSavedBank);
  const [bank, setBank] = useState({ bank_name: "", bank_code: "", account_number: "", account_name: "" });
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [pwd, setPwd] = useState({ old_password: "", new_password: "" });
  const [pinState, setPinState] = useState({ has_pin: false });
  const [pinForm, setPinForm] = useState({ pin: "", password: "" });
  const [changePinForm, setChangePinForm] = useState({ old_pin: "", new_pin: "" });
  const [pinBusy, setPinBusy] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [recoveryQs, setRecoveryQs] = useState(null); // {question_1, question_2}
  const [recoveryErr, setRecoveryErr] = useState("");
  const [resetForm, setResetForm] = useState({ answer_1: "", answer_2: "", new_pin: "" });
  const [settings, setSettings] = useState({});
  // PIN UI defaults to HIDDEN until /settings/public confirms it's required.
  // Using `=== true` instead of `!== false` prevents the card from flashing
  // for a frame while `settings` is still its empty initial value.
  const pinRequired = settings.require_withdrawal_pin === true;

  useEffect(() => {
    api.get("/banks").then(({ data }) => setBanks(data)).catch(() => setBanks([]));
    api.get("/profile/withdrawal-pin/status").then(({ data }) => setPinState(data)).catch(() => {});
    api.get("/settings/public").then(({ data }) => setSettings(data)).catch(() => {});
  }, []);

  // When edit mode toggles on, start with a cleared form
  useEffect(() => {
    if (editing) {
      setBank({ bank_name: "", bank_code: "", account_number: "", account_name: "" });
      setResolved(false);
    }
  }, [editing]);

  // Auto-resolve account name when bank + 10-digit number are present
  useEffect(() => {
    setResolved(false);
    const num = (bank.account_number || "").trim();
    if (!bank.bank_code || num.length !== 10 || !/^\d{10}$/.test(num)) {
      return;
    }
    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.post("/banks/resolve", { account_number: num, bank_code: bank.bank_code });
        if (cancelled) return;
        setBank((b) => ({ ...b, account_name: data.account_name }));
        setResolved(true);
      } catch (e) {
        if (cancelled) return;
        setBank((b) => ({ ...b, account_name: "" }));
        toast.error(e?.response?.data?.detail || "Could not verify account");
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank.bank_code, bank.account_number]);

  const saveBank = async (e) => {
    e.preventDefault();
    if (!bank.account_name) {
      toast.error("Verify your account first");
      return;
    }
    try {
      await api.put("/profile/bank", bank);
      toast.success("Bank details updated");
      await refresh();
      setEditing(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  const changePwd = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/change-password", pwd);
      toast.success("Password changed");
      setPwd({ old_password: "", new_password: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const submitSetPin = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pinForm.pin)) { toast.error("PIN must be 4 digits"); return; }
    setPinBusy(true);
    try {
      await api.post("/profile/withdrawal-pin/set", pinForm);
      toast.success("Withdrawal PIN set successfully");
      setPinState({ has_pin: true });
      setPinForm({ pin: "", password: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to set PIN");
    } finally { setPinBusy(false); }
  };

  const submitChangePin = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(changePinForm.new_pin)) { toast.error("New PIN must be 4 digits"); return; }
    setPinBusy(true);
    try {
      await api.post("/profile/withdrawal-pin/change", changePinForm);
      toast.success("Withdrawal PIN updated");
      setChangePinForm({ old_pin: "", new_pin: "" });
      setShowChangePin(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to change PIN");
    } finally { setPinBusy(false); }
  };

  const openForgotPin = async () => {
    setShowForgotPin(true);
    setShowChangePin(false);
    setRecoveryErr("");
    setRecoveryQs(null);
    setResetForm({ answer_1: "", answer_2: "", new_pin: "" });
    try {
      const { data } = await api.get("/profile/withdrawal-pin/recovery-questions");
      setRecoveryQs(data);
    } catch (e) {
      setRecoveryErr(e?.response?.data?.detail || "Recovery unavailable. Please contact admin.");
    }
  };

  const submitResetPin = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(resetForm.new_pin)) { toast.error("New PIN must be 4 digits"); return; }
    setPinBusy(true);
    try {
      await api.post("/profile/withdrawal-pin/reset", resetForm);
      toast.success("Withdrawal PIN reset successfully");
      setShowForgotPin(false);
      setResetForm({ answer_1: "", answer_2: "", new_pin: "" });
      setPinState({ has_pin: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to reset PIN");
    } finally { setPinBusy(false); }
  };

  return (
    <UserLayout>
      <div className="text-label">Account</div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="card-soft p-6">
          <div className="text-label">Account info</div>
          <div className="mt-3 space-y-2 text-sm">
            <div><span className="text-[color:var(--text-tertiary)]">Name:</span> <span className="font-semibold">{user?.name}</span></div>
            <div><span className="text-[color:var(--text-tertiary)]">Phone:</span> <span className="font-mono">{user?.phone}</span></div>
            <div><span className="text-[color:var(--text-tertiary)]">Referral code:</span> <span className="font-mono font-semibold text-[color:var(--brand)]">{user?.referral_code}</span></div>
          </div>
        </div>

        {!editing && hasSavedBank ? (
          <div className="card-soft p-6 lg:col-span-2 relative overflow-hidden" data-testid="saved-bank-card">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent-main)]" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-[color:var(--success-soft)] text-[color:var(--success)] flex items-center justify-center shrink-0">
                  <BadgeCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-label">Payout bank · verified</div>
                  <div className="font-display font-bold text-lg text-[color:var(--text-primary)] mt-0.5 truncate">{user.bank_name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                data-testid="change-bank-btn"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--surface-alt)] hover:bg-[color:var(--brand-soft)] hover:text-[color:var(--brand)] text-[color:var(--text-secondary)] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Change
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              <div className="rounded-xl bg-[color:var(--surface-alt)] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Account number</div>
                <div className="font-mono font-bold text-[color:var(--text-primary)] mt-1" data-testid="saved-acct-number">{user.account_number}</div>
              </div>
              <div className="rounded-xl bg-[color:var(--surface-alt)] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Account name</div>
                <div className="font-bold uppercase text-[color:var(--text-primary)] mt-1 truncate" data-testid="saved-acct-name">{user.account_name}</div>
              </div>
            </div>
            <p className="text-[11px] text-[color:var(--text-tertiary)] mt-3">All withdrawals will be sent to this account.</p>
          </div>
        ) : (
        <form onSubmit={saveBank} className="card-soft p-6 lg:col-span-2" data-testid="bank-form">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-label"><Building2 className="w-3.5 h-3.5" /> {hasSavedBank ? "Change payout bank" : "Add payout bank"}</div>
            {hasSavedBank && (
              <button type="button" onClick={() => setEditing(false)} data-testid="cancel-bank-edit"
                className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]">Cancel</button>
            )}
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Pick your bank then enter your 10-digit account number — we'll auto-verify the account name.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Bank</label>
              <BankPicker
                value={bank}
                banks={banks}
                onSelect={(b) => setBank((prev) => ({ ...prev, bank_name: b.name, bank_code: b.code, account_name: "" }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Account number</label>
              <input
                value={bank.account_number}
                onChange={(e) => setBank({ ...bank, account_number: e.target.value.replace(/\D/g, "").slice(0, 10), account_name: "" })}
                inputMode="numeric" pattern="[0-9]{10}" maxLength={10}
                placeholder="0123456789"
                required
                data-testid="bank-account-input"
                className="w-full mt-2 input-base font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Account name</label>
              <div className="mt-2 relative">
                <input
                  value={resolving ? "" : bank.account_name}
                  readOnly
                  placeholder={resolving ? "Verifying with bank…" : "Auto-filled after entering account number"}
                  data-testid="bank-account-name-input"
                  className="w-full input-base pr-10 font-semibold uppercase"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {resolving && <Loader2 className="w-4 h-4 text-[color:var(--brand)] animate-spin" />}
                  {!resolving && resolved && bank.account_name && (
                    <BadgeCheck className="w-5 h-5 text-[color:var(--success)]" data-testid="bank-verified-badge" />
                  )}
                </div>
              </div>
              {resolved && bank.account_name && (
                <div className="text-[11px] text-[color:var(--success)] mt-1 font-semibold">✓ Verified with bank</div>
              )}
            </div>
          </div>

          <button type="submit" disabled={!bank.account_name || resolving}
            data-testid="save-bank-btn"
            className="mt-5 flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] disabled:opacity-50 text-[color:var(--brand-ink)] px-5 py-2.5 rounded-full font-semibold">
            <Save className="w-4 h-4" /> Save bank
          </button>
        </form>
        )}
      </div>

      <form onSubmit={changePwd} className="card-soft p-6 mt-6 max-w-xl" data-testid="pwd-form">
        <div className="flex items-center gap-2 text-label"><Lock className="w-3.5 h-3.5" /> Change password</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <input type="password" placeholder="Current password" value={pwd.old_password}
            onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })} required
            data-testid="pwd-old-input"
            className="w-full input-base" />
          <input type="password" placeholder="New password (min 6 chars)" value={pwd.new_password}
            onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} required minLength={6}
            data-testid="pwd-new-input"
            className="w-full input-base" />
        </div>
        <button data-testid="save-pwd-btn" className="mt-5 flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] px-5 py-2.5 rounded-full font-semibold">
          <Save className="w-4 h-4" /> Update password
        </button>
      </form>

      {/* Withdrawal PIN card — hidden when admin has disabled PIN requirement */}
      {pinRequired && (
      <div className="card-soft p-6 mt-6 max-w-xl relative overflow-hidden" data-testid="withdrawal-pin-card">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent-main)]" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-label"><KeyRound className="w-3.5 h-3.5" /> Withdrawal PIN</div>
          {pinState.has_pin && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--success)]" data-testid="pin-status-set">
              <ShieldCheck className="w-3.5 h-3.5" /> PIN set
            </span>
          )}
        </div>
        <p className="text-xs text-[color:var(--text-secondary)] mt-1">
          {pinState.has_pin
            ? "Your 4-digit PIN is required every time you request a withdrawal."
            : "Set a 4-digit PIN. You'll need it to authorise every withdrawal."}
        </p>

        {!pinState.has_pin && (
          <form onSubmit={submitSetPin} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" data-testid="set-pin-form">
            <input
              type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
              placeholder="4-digit PIN"
              value={pinForm.pin}
              onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              required
              data-testid="set-pin-input"
              className="w-full input-base font-mono tracking-[0.5em] text-center"
            />
            <input
              type="password" placeholder="Confirm with your password"
              value={pinForm.password}
              onChange={(e) => setPinForm({ ...pinForm, password: e.target.value })}
              required
              data-testid="set-pin-password"
              className="w-full input-base"
            />
            <button
              type="submit" disabled={pinBusy || pinForm.pin.length !== 4 || !pinForm.password}
              data-testid="set-pin-submit"
              className="md:col-span-2 mt-1 flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] disabled:opacity-50 text-[color:var(--brand-ink)] px-5 py-2.5 rounded-full font-semibold">
              <Save className="w-4 h-4" /> {pinBusy ? "Saving…" : "Set withdrawal PIN"}
            </button>
          </form>
        )}

        {pinState.has_pin && !showChangePin && !showForgotPin && (
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button" onClick={() => setShowChangePin(true)}
              data-testid="show-change-pin-btn"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--brand)] hover:text-[color:var(--brand-hover)]"
            >
              <Pencil className="w-3.5 h-3.5" /> Change PIN
            </button>
            <button
              type="button" onClick={openForgotPin}
              data-testid="forgot-pin-btn"
              className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]"
            >
              Forgot PIN?
            </button>
          </div>
        )}

        {/* "Forgot PIN?" recovery form is also reachable when no PIN is set yet — useful if previously locked */}
        {!pinState.has_pin && !showForgotPin && (
          <button
            type="button" onClick={openForgotPin}
            data-testid="forgot-pin-btn-empty"
            className="mt-3 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--brand)] underline"
          >
            Already had a PIN? Reset it with security questions.
          </button>
        )}

        {showForgotPin && (
          <div className="mt-4 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-alt)] p-4" data-testid="forgot-pin-form">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Reset PIN via security questions</div>
              <button type="button" onClick={() => setShowForgotPin(false)} className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]">Cancel</button>
            </div>
            {recoveryErr && (
              <div className="mt-3 text-sm text-[color:var(--error)] bg-[color:var(--error-soft)] rounded-lg p-3" data-testid="recovery-err">
                {recoveryErr}
              </div>
            )}
            {!recoveryQs && !recoveryErr && (
              <div className="mt-3 text-sm text-[color:var(--text-secondary)] flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading your security questions…
              </div>
            )}
            {recoveryQs && (
              <form onSubmit={submitResetPin} className="space-y-3 mt-3">
                <div>
                  <label className="block text-xs text-[color:var(--text-secondary)] font-medium">{recoveryQs.question_1}</label>
                  <input
                    value={resetForm.answer_1}
                    onChange={(e) => setResetForm({ ...resetForm, answer_1: e.target.value })}
                    required
                    data-testid="reset-answer-1"
                    className="w-full mt-1 input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[color:var(--text-secondary)] font-medium">{recoveryQs.question_2}</label>
                  <input
                    value={resetForm.answer_2}
                    onChange={(e) => setResetForm({ ...resetForm, answer_2: e.target.value })}
                    required
                    data-testid="reset-answer-2"
                    className="w-full mt-1 input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[color:var(--text-secondary)] font-medium">New 4-digit PIN</label>
                  <input
                    type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                    value={resetForm.new_pin}
                    onChange={(e) => setResetForm({ ...resetForm, new_pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    required
                    data-testid="reset-new-pin"
                    className="w-full mt-1 input-base font-mono tracking-[0.5em] text-center"
                  />
                </div>
                <button
                  type="submit" disabled={pinBusy || resetForm.new_pin.length !== 4 || !resetForm.answer_1 || !resetForm.answer_2}
                  data-testid="reset-pin-submit"
                  className="w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] disabled:opacity-50 text-[color:var(--brand-ink)] px-5 py-2.5 rounded-full font-semibold">
                  <Save className="w-4 h-4" /> {pinBusy ? "Resetting…" : "Reset PIN"}
                </button>
              </form>
            )}
          </div>
        )}

        {pinState.has_pin && showChangePin && (
          <form onSubmit={submitChangePin} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" data-testid="change-pin-form">
            <input
              type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
              placeholder="Current PIN"
              value={changePinForm.old_pin}
              onChange={(e) => setChangePinForm({ ...changePinForm, old_pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              required
              data-testid="change-pin-old"
              className="w-full input-base font-mono tracking-[0.5em] text-center"
            />
            <input
              type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
              placeholder="New PIN"
              value={changePinForm.new_pin}
              onChange={(e) => setChangePinForm({ ...changePinForm, new_pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              required
              data-testid="change-pin-new"
              className="w-full input-base font-mono tracking-[0.5em] text-center"
            />
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit" disabled={pinBusy}
                data-testid="change-pin-submit"
                className="flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] disabled:opacity-50 text-[color:var(--brand-ink)] px-5 py-2.5 rounded-full font-semibold">
                <Save className="w-4 h-4" /> {pinBusy ? "Updating…" : "Update PIN"}
              </button>
              <button
                type="button" onClick={() => { setShowChangePin(false); setChangePinForm({ old_pin: "", new_pin: "" }); }}
                className="px-4 py-2.5 rounded-full font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"
              >Cancel</button>
            </div>
          </form>
        )}
      </div>
      )}
    </UserLayout>
  );
}
