import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Save, Megaphone, Flame, ImagePlus, X, Banknote, Clock, KeyRound,
  ArrowDownToLine, ArrowUpFromLine, Share2, ShieldAlert, Home,
  Sparkles, Check, Gift, LogOut, Database, Eraser, AlertTriangle,
  Lock, MessageCircle, Send,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useBranding } from "@/context/BrandingContext";
import { readCache, writeCache } from "@/hooks/useCachedData";

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL || ""}${url}`;
}

/* ----------------------------------------------------------------------------
 * Reusable bits
 * --------------------------------------------------------------------------*/
function Field({ label, value, onChange, step = "1", text = false, testid, sub, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">{label}</span>
      <input
        type={text ? "text" : "number"} step={step} value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`${testid}-input`}
        className="w-full input-base"
      />
      {sub && <span className="block text-[10px] text-[color:var(--text-tertiary)] mt-1">{sub}</span>}
    </label>
  );
}

function SecretField({ label, value, onChange, placeholder, sub, testid }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">{label}</span>
      <input
        type="password" value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={`${testid}-input`}
        className="w-full input-base font-mono text-sm"
      />
      {sub && <span className="block text-[10px] text-[color:var(--text-tertiary)] mt-1">{sub}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label, hint, testid }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        data-testid={testid}
        aria-pressed={checked}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? "bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA]" : "bg-[color:var(--surface-alt)]"}`}
      >
        <span className={`absolute top-0.5 ${checked ? "left-[22px]" : "left-0.5"} w-5 h-5 rounded-full bg-white shadow transition-all`} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{label}</div>
        {hint && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="card-soft p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)]">{title}</div>
      {hint && <p className="text-xs text-[color:var(--text-secondary)] mt-1.5 leading-relaxed">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Gateway picker card — the signature element from the reference */
function GatewayCard({ active, label, name, sub, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`relative text-left p-4 rounded-2xl border-2 transition-all ${active
        ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] shadow-md ring-2 ring-[color:var(--brand)]/10"
        : "border-[color:var(--border-default)] bg-[color:var(--surface)] hover:border-[color:var(--brand)]/50"}`}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{label}</div>
      <div className={`font-display font-extrabold text-lg mt-0.5 ${active ? "text-[color:var(--brand)]" : "text-[color:var(--text-primary)]"}`}>{name}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
      {active && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[color:var(--brand)] text-white flex items-center justify-center">
          <Check className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

/* ============================================================================
 * MAIN
 * ==========================================================================*/
const TABS = [
  { key: "deposits",    label: "Deposits",     icon: ArrowDownToLine },
  { key: "withdrawals", label: "Withdrawals",  icon: ArrowUpFromLine },
  { key: "daily",       label: "Daily Claim",  icon: Gift },
  { key: "referrals",   label: "Referrals",    icon: Share2 },
  { key: "gateways",    label: "Gateways",     icon: KeyRound },
  { key: "home",        label: "Home",         icon: Home },
  { key: "branding",    label: "Branding",     icon: ImagePlus },
  { key: "password",    label: "Password",     icon: Lock },
  { key: "danger",      label: "Danger zone",  icon: ShieldAlert },
];

export default function AdminSettings() {
  const [s, setS] = useState(() => readCache("/admin/settings") ?? null);
  const [products, setProducts] = useState(() => readCache("/admin/products") ?? []);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("deposits");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const { refresh: refreshBranding } = useBranding();

  useEffect(() => {
    Promise.all([
      api.get("/admin/settings"),
      api.get("/admin/products"),
    ]).then(([{ data: sd }, { data: pd }]) => {
      setS(sd);
      setProducts(pd);
      writeCache("/admin/settings", sd);
      writeCache("/admin/products", pd);
    });
  }, []);

  const uploadAnnouncement = async (e) => {
    return uploadInto("home_announcement_image_url", e);
  };

  const uploadInto = async (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setS((prev) => ({ ...prev, [key]: data.url }));
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (e?.target) e.target.value = "";
    }
  };

  const save = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const payload = {
        welcome_bonus: Number(s.welcome_bonus),
        min_deposit: Number(s.min_deposit),
        min_withdrawal: Number(s.min_withdrawal),
        gen1_percent: Number(s.gen1_percent),
        gen2_percent: Number(s.gen2_percent),
        paystack_public_key: s.paystack_public_key || "",
        paystack_secret_key: s.paystack_secret_key || "",
        nomba_client_id: s.nomba_client_id || "",
        nomba_client_secret: s.nomba_client_secret || "",
        nomba_account_id: s.nomba_account_id || "",
        nomba_environment: s.nomba_environment || "sandbox",
        marasoft_public_key: s.marasoft_public_key || "",
        marasoft_secret_key: s.marasoft_secret_key || "",
        marasoft_encryption_key: s.marasoft_encryption_key || "",
        marasoft_secret_hash: s.marasoft_secret_hash || "",
        budpay_secret_key: s.budpay_secret_key || "",
        budpay_public_key: s.budpay_public_key || "",
        budpay_webhook_secret: s.budpay_webhook_secret || "",
        qorepay_secret_key: s.qorepay_secret_key || "",
        qorepay_public_key: s.qorepay_public_key || "",
        qorepay_brand_id: s.qorepay_brand_id || "",
        juntpay_app_id: s.juntpay_app_id || "",
        juntpay_merchant_id: s.juntpay_merchant_id || "",
        juntpay_secret_key: s.juntpay_secret_key || "",
        juntpay_deposit_way_code: s.juntpay_deposit_way_code || "",
        juntpay_payout_way_code: s.juntpay_payout_way_code || "",
        juntpay_notify_url: s.juntpay_notify_url || "",
        duplo_api_key: s.duplo_api_key || "",
        kora_secret_key: s.kora_secret_key || "",
        kora_public_key: s.kora_public_key || "",
        kora_encryption_key: s.kora_encryption_key || "",
        kora_deposit_method: s.kora_deposit_method || "bank_transfer",
        kora_virtual_account_bank_code: s.kora_virtual_account_bank_code || "035",
        nekpay_mcht_id: s.nekpay_mcht_id || "",
        nekpay_payment_key: s.nekpay_payment_key || "",
        nekpay_secret_key: s.nekpay_secret_key || "",
        nekpay_channel_code: s.nekpay_channel_code || "",
        nekpay_notify_url: s.nekpay_notify_url || "",
        glopay_mch_id: s.glopay_mch_id || "",
        glopay_key: s.glopay_key || "",
        glopay_collection_key: s.glopay_collection_key || "",
        glopay_payment_key: s.glopay_payment_key || "",
        glopay_collection_code: s.glopay_collection_code || "",
        glopay_payment_code: s.glopay_payment_code || "",
        glopay_base_url: s.glopay_base_url || "",
        fossapay_api_key: s.fossapay_api_key || "",
        fossapay_webhook_secret: s.fossapay_webhook_secret || "",
        fossapay_deposit_method: s.fossapay_deposit_method || "virtual_account",
        fixie_proxy_url: s.fixie_proxy_url || "",
        lumenhub_proxy_url: s.lumenhub_proxy_url || "",
        lumenhub_base_url: s.lumenhub_base_url || "",
        gateway_budpay_enabled: !!s.gateway_budpay_enabled,
        gateway_qorepay_enabled: !!s.gateway_qorepay_enabled,
        gateway_juntpay_enabled: !!s.gateway_juntpay_enabled,
        gateway_duplo_enabled: !!s.gateway_duplo_enabled,
        gateway_kora_enabled: !!s.gateway_kora_enabled,
        gateway_nekpay_enabled: !!s.gateway_nekpay_enabled,
        gateway_glopay_enabled: !!s.gateway_glopay_enabled,
        gateway_fossapay_enabled: !!s.gateway_fossapay_enabled,
        deposit_gateway: s.deposit_gateway || "paystack",
        payout_gateway: s.payout_gateway || "paystack",
        payment_mode: s.payment_mode || "mock",
        auto_payout_enabled: !!s.auto_payout_enabled,
        withdrawals_open: s.withdrawals_open !== false,
        withdrawal_start_time: s.withdrawal_start_time || "00:00",
        withdrawal_end_time: s.withdrawal_end_time || "23:59",
        // Iteration 52 — new fields
        deposit_bonus_percent: Number(s.deposit_bonus_percent) || 0,
        deposit_bonus_limit_per_user: Number(s.deposit_bonus_limit_per_user) || 0,
        transfer_description_template: s.transfer_description_template || "",
        multi_gateway_enabled: !!s.multi_gateway_enabled,
        gateway_paystack_enabled: s.gateway_paystack_enabled !== false,
        gateway_nomba_enabled: s.gateway_nomba_enabled !== false,
        gateway_marasoft_enabled: s.gateway_marasoft_enabled !== false,
        referral_commission_mode: s.referral_commission_mode || "first_only",
        referral_commission_cap_n: Number(s.referral_commission_cap_n) || 3,
        brand_logo_url: s.brand_logo_url || "",
        home_featured_plan_enabled: s.home_featured_plan_enabled !== false,
        home_below_featured_mode: s.home_below_featured_mode || "cards",
        home_below_featured_image_url: s.home_below_featured_image_url || "",
        home_secondary_section_enabled: s.home_secondary_section_enabled !== false,
        home_plans_count: Number(s.home_plans_count ?? 0),
        require_security_questions: s.require_security_questions !== false,
        quick_deposit_amounts: (s.quick_deposit_amounts_raw || (s.quick_deposit_amounts || []).join(","))
          .split(",").map((x) => parseInt(String(x).replace(/[^\d]/g, ""), 10)).filter((n) => n > 0),
        require_withdrawal_pin: !!s.require_withdrawal_pin,
        allow_bank_change: s.allow_bank_change !== false,
        max_withdrawal: Number(s.max_withdrawal) || 0,
        withdrawal_fee_percent: Number(s.withdrawal_fee_percent) || 0,
        auto_payout_max_amount: Number(s.auto_payout_max_amount) || 0,
        daily_claim_enabled: !!s.daily_claim_enabled,
        daily_claim_amount: Number(s.daily_claim_amount) || 0,
        telegram_channel_url: s.telegram_channel_url || "",
        telegram_group_url: s.telegram_group_url || "",
        whatsapp_channel_url: s.whatsapp_channel_url || "",
        whatsapp_group_url: s.whatsapp_group_url || "",
        featured_product_id: s.featured_product_id || null,
        home_announcement: s.home_announcement || "",
        home_announcement_active: !!s.home_announcement_active,
        home_announcement_image_url: s.home_announcement_image_url || "",
        telegram_url: s.telegram_url || "",
        welcome_message: s.welcome_message || "",
        welcome_modal_title: s.welcome_modal_title || "",
        welcome_modal_active: s.welcome_modal_active !== false,
      };
      const { data } = await api.put("/admin/settings", payload);
      setS(data);
      refreshBranding?.();
      toast.success("Settings saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!s) return <AdminLayout title="Settings"><div className="text-[color:var(--text-secondary)] p-6">Loading…</div></AdminLayout>;

  const ActiveIcon = (TABS.find((t) => t.key === tab) || TABS[0]).icon;

  return (
    <AdminLayout title="">
      {/* ===== HERO ===== */}
      <div
        className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8"
        style={{ background: "linear-gradient(120deg,#3F0825 0%,#7A0A45 38%,#C81A6E 72%,#E5097F 100%)" }}
        data-testid="settings-hero"
      >
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-48 h-48 rounded-full bg-[#FF5BAA]/30 blur-3xl" />
        {/* Gear-strip decoration */}
        <svg className="absolute inset-y-0 right-0 h-full opacity-[0.10]" viewBox="0 0 200 200" preserveAspectRatio="none">
          <g fill="none" stroke="white" strokeWidth="1.5">
            <circle cx="60" cy="100" r="36" />
            <circle cx="140" cy="60" r="22" />
            <circle cx="140" cy="140" r="22" />
            <circle cx="60" cy="100" r="6" fill="white" />
            <circle cx="140" cy="60" r="4" fill="white" />
            <circle cx="140" cy="140" r="4" fill="white" />
          </g>
        </svg>
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <ActiveIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">Configuration · gateways · limits</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Settings</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">Mode: <span className="font-bold uppercase">{s.payment_mode || "mock"}</span> · Deposit gateway: <span className="font-bold uppercase">{s.deposit_gateway || "paystack"}</span> · Payout gateway: <span className="font-bold uppercase">{s.payout_gateway || "paystack"}</span></div>
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            data-testid="save-settings-btn"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-[color:var(--brand)] font-bold text-sm shadow-lg hover:scale-105 transition-transform disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* ===== Tab pills (horizontal scroll on mobile) ===== */}
      <div className="card-soft p-2 mt-5 flex items-center gap-1 overflow-x-auto" data-testid="settings-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}
              className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${active
                ? "bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white shadow"
                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ===== Tab content ===== */}
      <form onSubmit={save} className="mt-5 space-y-5" data-testid="settings-form">
        {tab === "deposits" && (
          <>
            <Section title="Active deposit gateway" hint="Pick which provider funds users' deposits. Users on /deposit will see the virtual account from this gateway only. Make sure the gateway is also enabled below.">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <GatewayCard active={s.deposit_gateway === "paystack"}  label="Card / Bank" name="Paystack" sub="NGN card + bank transfer" onClick={() => setS({ ...s, deposit_gateway: "paystack" })}  testid="dep-gw-paystack" />
                <GatewayCard active={s.deposit_gateway === "nomba"}     label="Wallet"      name="Nomba"    sub="Virtual account · bank pay-in" onClick={() => setS({ ...s, deposit_gateway: "nomba" })}     testid="dep-gw-nomba" />
                <GatewayCard active={s.deposit_gateway === "marasoft"}  label="9PSB / VAS"  name="Marasoft" sub="Dynamic virtual account" onClick={() => setS({ ...s, deposit_gateway: "marasoft" })} testid="dep-gw-marasoft" />
                <GatewayCard active={s.deposit_gateway === "budpay"}    label="Card · Transfer" name="BudPay"  sub="Hosted checkout · NGN" onClick={() => setS({ ...s, deposit_gateway: "budpay" })}   testid="dep-gw-budpay" />
                <GatewayCard active={s.deposit_gateway === "qorepay"}   label="Transfer"        name="QorePay" sub="Bank transfer · NGN"  onClick={() => setS({ ...s, deposit_gateway: "qorepay" })}  testid="dep-gw-qorepay" />
                <GatewayCard active={s.deposit_gateway === "juntpay"} label="Transfer" name="JuntPay" sub="Bank transfer · NGN" onClick={() => setS({ ...s, deposit_gateway: "juntpay" })} testid="dep-gw-juntpay" />
                <GatewayCard active={s.deposit_gateway === "duplo"} label="Checkout" name="Duplo" sub="Checkout · NGN" onClick={() => setS({ ...s, deposit_gateway: "duplo" })} testid="dep-gw-duplo" />
                <GatewayCard active={s.deposit_gateway === "kora"} label="Transfer" name="Kora" sub="Bank transfer · NGN" onClick={() => setS({ ...s, deposit_gateway: "kora" })} testid="dep-gw-kora" />
                <GatewayCard active={s.deposit_gateway === "nekpay"} label="Transfer" name="Nekpay" sub="Bank transfer · NGN" onClick={() => setS({ ...s, deposit_gateway: "nekpay" })} testid="dep-gw-nekpay" />
                <GatewayCard active={s.deposit_gateway === "glopay"} label="Checkout" name="GloPay" sub="Hosted checkout · NGN" onClick={() => setS({ ...s, deposit_gateway: "glopay" })} testid="dep-gw-glopay" />
                <GatewayCard active={s.deposit_gateway === "fossapay"} label="Transfer" name="FossaPay" sub="Virtual account / checkout" onClick={() => setS({ ...s, deposit_gateway: "fossapay" })} testid="dep-gw-fossapay" />
              </div>
            </Section>

            <Section title="Limits & bonuses">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Min deposit (₦)"    value={s.min_deposit}    onChange={(v) => setS({ ...s, min_deposit: v })}   testid="min-deposit" />
                <Field label="Deposit bonus (%)"  value={s.deposit_bonus_percent} step="0.1" onChange={(v) => setS({ ...s, deposit_bonus_percent: v })} testid="dep-bonus-percent" sub="Credited automatically after each successful deposit. 0 = off." />
                <Field label="Bonus limit per user (₦)" value={s.deposit_bonus_limit_per_user} onChange={(v) => setS({ ...s, deposit_bonus_limit_per_user: v })} testid="dep-bonus-cap" sub="0 = unlimited" />
              </div>
            </Section>

            <Section title="Deposit experience" hint="Controls what users see on the deposit page.">
              <div className="space-y-4">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Transfer description template</span>
                  <input
                    type="text"
                    value={s.transfer_description_template || ""}
                    onChange={(e) => setS({ ...s, transfer_description_template: e.target.value })}
                    placeholder="Furgle deposit"
                    data-testid="transfer-desc-input"
                    className="w-full input-base"
                  />
                  <span className="block text-[10px] text-[color:var(--text-tertiary)] mt-1">Shown on the deposit page as the narration users should use when transferring.</span>
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Quick amounts on user deposit page</span>
                  <input
                    type="text"
                    value={s.quick_deposit_amounts_raw !== undefined ? s.quick_deposit_amounts_raw : (s.quick_deposit_amounts || []).join(", ")}
                    onChange={(e) => setS({ ...s, quick_deposit_amounts_raw: e.target.value })}
                    placeholder="3000, 5000, 10000, 25000, 50000, 100000"
                    data-testid="quick-amounts-input"
                    className="w-full input-base font-mono text-sm"
                  />
                  <span className="block text-[10px] text-[color:var(--text-tertiary)] mt-1">Comma-separated list of preset deposit chips users can tap.</span>
                </label>
                <Toggle checked={!!s.multi_gateway_enabled}     onChange={(v) => setS({ ...s, multi_gateway_enabled: v })} label="Multiple deposit gateways enabled" hint="Allow more than one provider to be active at the same time. With it OFF, only the gateway picked above is used." testid="multi-gw-toggle" />
              </div>
            </Section>

            <Section title="Per-gateway availability" hint="Switch individual providers on or off. Disabled gateways are hidden from the user-side picker even when multiple gateways are enabled.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Toggle checked={s.gateway_paystack_enabled !== false} onChange={(v) => setS({ ...s, gateway_paystack_enabled: v })} label="Paystack" hint="Card + bank transfer (NGN)" testid="gw-enabled-paystack" />
                <Toggle checked={s.gateway_nomba_enabled !== false}    onChange={(v) => setS({ ...s, gateway_nomba_enabled: v })}    label="Nomba"    hint="Virtual account · bank pay-in" testid="gw-enabled-nomba" />
                <Toggle checked={s.gateway_marasoft_enabled !== false} onChange={(v) => setS({ ...s, gateway_marasoft_enabled: v })} label="Marasoft" hint="Dynamic virtual account · 9PSB" testid="gw-enabled-marasoft" />
                <Toggle checked={!!s.gateway_budpay_enabled}            onChange={(v) => setS({ ...s, gateway_budpay_enabled: v })}    label="BudPay"   hint="Card + bank transfer · sk_live_…" testid="gw-enabled-budpay" />
                <Toggle checked={!!s.gateway_qorepay_enabled}           onChange={(v) => setS({ ...s, gateway_qorepay_enabled: v })}   label="QorePay"  hint="Bank transfer · qp_live_…" testid="gw-enabled-qorepay" />
                <Toggle checked={!!s.gateway_juntpay_enabled} onChange={(v) => setS({ ...s, gateway_juntpay_enabled: v })} label="JuntPay" hint="Bank transfer · NGN" testid="gw-enabled-juntpay" />
                <Toggle checked={!!s.gateway_duplo_enabled} onChange={(v) => setS({ ...s, gateway_duplo_enabled: v })} label="Duplo" hint="Checkout · NGN" testid="gw-enabled-duplo" />
                <Toggle checked={!!s.gateway_kora_enabled} onChange={(v) => setS({ ...s, gateway_kora_enabled: v })} label="Kora" hint="Bank transfer · NGN" testid="gw-enabled-kora" />
                <Toggle checked={!!s.gateway_nekpay_enabled} onChange={(v) => setS({ ...s, gateway_nekpay_enabled: v })} label="Nekpay" hint="Bank transfer · NGN" testid="gw-enabled-nekpay" />
                <Toggle checked={!!s.gateway_glopay_enabled} onChange={(v) => setS({ ...s, gateway_glopay_enabled: v })} label="GloPay" hint="Hosted checkout · NGN" testid="gw-enabled-glopay" />
                <Toggle checked={!!s.gateway_fossapay_enabled} onChange={(v) => setS({ ...s, gateway_fossapay_enabled: v })} label="FossaPay" hint="Virtual account / checkout · NGN" testid="gw-enabled-fossapay" />
              </div>
            </Section>
          </>
        )}

        {tab === "withdrawals" && (
          <>
            <Section title="Active payout gateway" hint="Which provider actually sends money out when a withdrawal is approved.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GatewayCard active={s.payout_gateway === "paystack"} label="Transfer" name="Paystack" sub="Paystack Transfers API" onClick={() => setS({ ...s, payout_gateway: "paystack" })} testid="payout-gw-paystack" />
                <GatewayCard active={s.payout_gateway === "nomba"}    label="Wallet"   name="Nomba"    sub="Nomba transfer-to-bank"  onClick={() => setS({ ...s, payout_gateway: "nomba" })}    testid="payout-gw-nomba" />
                <GatewayCard active={s.payout_gateway === "juntpay"} label="Transfer" name="JuntPay" sub="JuntPay transfer-to-bank" onClick={() => setS({ ...s, payout_gateway: "juntpay" })} testid="payout-gw-juntpay" />
                <GatewayCard active={s.payout_gateway === "duplo"} label="Payout" name="Duplo" sub="Duplo bank payout" onClick={() => setS({ ...s, payout_gateway: "duplo" })} testid="payout-gw-duplo" />
                <GatewayCard active={s.payout_gateway === "kora"} label="Payout" name="Kora" sub="Kora bank payout" onClick={() => setS({ ...s, payout_gateway: "kora" })} testid="payout-gw-kora" />
                <GatewayCard active={s.payout_gateway === "nekpay"} label="Payout" name="Nekpay" sub="Nekpay bank payout" onClick={() => setS({ ...s, payout_gateway: "nekpay" })} testid="payout-gw-nekpay" />
                <GatewayCard active={s.payout_gateway === "glopay"} label="Payout" name="GloPay" sub="GloPay bank payout" onClick={() => setS({ ...s, payout_gateway: "glopay" })} testid="payout-gw-glopay" />
                <GatewayCard active={s.payout_gateway === "fossapay"} label="Payout" name="FossaPay" sub="FossaPay master-wallet payout" onClick={() => setS({ ...s, payout_gateway: "fossapay" })} testid="payout-gw-fossapay" />
              </div>
            </Section>

            <Section title="Limits & PIN" hint="Hard floor / ceiling on user withdrawals plus security PIN requirement.">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Field label="Min withdrawal (₦)" value={s.min_withdrawal} onChange={(v) => setS({ ...s, min_withdrawal: v })} testid="min-withdrawal-w" />
                <Field label="Max withdrawal (₦)" value={s.max_withdrawal} onChange={(v) => setS({ ...s, max_withdrawal: v })} testid="max-withdrawal" sub="The largest single payout a user can request in one transaction. Requests above this are rejected outright with an error — they don't queue for admin approval. Use this to cap exposure on any one transfer. Set to 0 to remove the ceiling." />
                <Field label="Withdrawal fee (%)" value={s.withdrawal_fee_percent} step="0.1" onChange={(v) => setS({ ...s, withdrawal_fee_percent: v })} testid="withdrawal-fee-percent" sub="Percentage deducted from each withdrawal as platform revenue. User requests ₦10,000 with fee=5 → wallet debited ₦10,000, bank receives ₦9,500, platform keeps ₦500. Set to 0 to disable." />
                <Field label="Auto-payout limit (₦)" value={s.auto_payout_max_amount} onChange={(v) => setS({ ...s, auto_payout_max_amount: v })} testid="auto-payout-max" sub="Above this, requires admin approval. 0 = no cap." />
              </div>
              <Toggle checked={!!s.require_withdrawal_pin} onChange={(v) => setS({ ...s, require_withdrawal_pin: v })} label="Require 4-digit withdrawal PIN" hint="Users will be prompted for their PIN before each withdrawal. Off = PIN bypassed." testid="require-pin-toggle" />
              <Toggle checked={s.allow_bank_change !== false} onChange={(v) => setS({ ...s, allow_bank_change: v })} label="Users can change their bank details" hint="When OFF, users must contact support to update their bank account after it has been set." testid="allow-bank-change-toggle" />
            </Section>

            <Section title="Automation & opening hours" hint="Auto-payout pushes money out the moment a user requests it. With it off, withdrawals queue for admin approval.">
              <div className="space-y-3">
                <Toggle checked={!!s.auto_payout_enabled}     onChange={(v) => setS({ ...s, auto_payout_enabled: v })} label="Auto-payout enabled"   hint="When ON, user withdrawals process instantly. Failed transfers fall back to pending." testid="auto-payout-toggle" />
                <Toggle checked={s.withdrawals_open !== false} onChange={(v) => setS({ ...s, withdrawals_open: v })}   label="Withdrawals open"      hint="Master kill-switch. Untick to temporarily close withdrawals." testid="withdrawals-open-toggle" />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-5">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Open time (Lagos)</span>
                  <input type="time" value={s.withdrawal_start_time || "00:00"} onChange={(e) => setS({ ...s, withdrawal_start_time: e.target.value })} data-testid="withdrawal-start-input" className="w-full input-base" />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Close time (Lagos)</span>
                  <input type="time" value={s.withdrawal_end_time || "23:59"} onChange={(e) => setS({ ...s, withdrawal_end_time: e.target.value })} data-testid="withdrawal-end-input" className="w-full input-base" />
                </label>
              </div>
              <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">Set to 00:00 → 23:59 for always-on. Overnight windows (e.g. 22:00 → 04:00) supported.</p>
            </Section>
          </>
        )}

        {tab === "daily" && (
          <Section title="Daily sign-in bonus" hint="A small reward users can claim once per day to encourage active sessions.">
            <div className="space-y-4">
              <Toggle checked={!!s.daily_claim_enabled} onChange={(v) => setS({ ...s, daily_claim_enabled: v })} label="Daily claim enabled" hint="When ON, eligible users see a Claim button on their dashboard each day." testid="daily-claim-toggle" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Daily claim amount (₦)" value={s.daily_claim_amount} onChange={(v) => setS({ ...s, daily_claim_amount: v })} testid="daily-amount" />
                <Field label="Welcome bonus (₦)" value={s.welcome_bonus} onChange={(v) => setS({ ...s, welcome_bonus: v })} testid="welcome-bonus" sub="One-time bonus credited at signup. Lives here because it's also a 'first claim' reward." />
              </div>
            </div>
          </Section>
        )}

        {tab === "password" && (
          <>
            <Section title="Registration security questions" hint="The two security questions new users set during sign-up. They power the self-service 'Forgot password' flow. Turn OFF to remove them from registration (users will then rely on admin-assisted password resets).">
              <Toggle
                checked={s.require_security_questions !== false}
                onChange={(v) => setS({ ...s, require_security_questions: v })}
                label="Ask security questions during registration"
                hint="When ON, new users must pick two questions and answers. When OFF, the section is hidden on the registration form and not required."
                testid="require-security-questions-toggle"
              />
            </Section>
            <PasswordSection />
          </>
        )}

        {tab === "referrals" && (
          <>
            <Section title="Bonus percentages" hint="The percentage of a referred user's investment that is paid to the referrer (Level 1 = direct, Level 2 = indirect).">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Level 1 Bonus (%)" value={s.gen1_percent} step="0.1" onChange={(v) => setS({ ...s, gen1_percent: v })} testid="gen1" />
                <Field label="Level 2 Bonus (%)" value={s.gen2_percent} step="0.1" onChange={(v) => setS({ ...s, gen2_percent: v })} testid="gen2" />
              </div>
            </Section>

            <Section title="Commission mode" hint="Controls when a referrer earns commission on a referred user's investment.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { v: "first_only", label: "Legacy",    sub: "First only",  desc: "Pay commission only on the referred user's first investment." },
                  { v: "unlimited",  label: "Unlimited", sub: "Every invest", desc: "Pay commission on every investment the referred user makes." },
                  { v: "capped",     label: "Capped",    sub: "First N",      desc: "Pay commission on the first N investments only." },
                ].map((m) => {
                  const active = (s.referral_commission_mode || "first_only") === m.v;
                  return (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => setS({ ...s, referral_commission_mode: m.v })}
                      data-testid={`ref-mode-${m.v}`}
                      className={`relative text-left p-4 rounded-2xl border-2 transition-all ${active
                        ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] shadow-md ring-2 ring-[color:var(--brand)]/10"
                        : "border-[color:var(--border-default)] bg-[color:var(--surface)] hover:border-[color:var(--brand)]/50"}`}
                    >
                      <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{m.label}</div>
                      <div className={`font-display font-extrabold text-lg mt-0.5 ${active ? "text-[color:var(--brand)]" : "text-[color:var(--text-primary)]"}`}>{m.sub}</div>
                      <div className="text-[11px] text-[color:var(--text-tertiary)] mt-2 leading-snug">{m.desc}</div>
                      {active && (
                        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[color:var(--brand)] text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {(s.referral_commission_mode || "first_only") === "capped" && (
                <div className="mt-4 max-w-xs">
                  <Field label="Cap (N investments)" value={s.referral_commission_cap_n ?? 3} onChange={(v) => setS({ ...s, referral_commission_cap_n: v })} testid="ref-cap-n" sub="Pay commission only on this many of the referred user's investments." />
                </div>
              )}
            </Section>
          </>
        )}

        {tab === "gateways" && (
          <>
            <Section title="Paystack credentials" hint="Required only when a Paystack gateway is active and mode is live.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Public key" value={s.paystack_public_key} text onChange={(v) => setS({ ...s, paystack_public_key: v })} testid="pk-key" />
                <SecretField label="Secret key" value={s.paystack_secret_key} onChange={(v) => setS({ ...s, paystack_secret_key: v })} testid="sk-key" />
              </div>
            </Section>

            <Section title="Nomba credentials" hint="Pick the environment that matches your keys — Nomba sandbox and production are separate.">
              <label className="block mb-4">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Environment</span>
                <select value={s.nomba_environment || "sandbox"} onChange={(e) => setS({ ...s, nomba_environment: e.target.value })} data-testid="nomba-environment-select" className="w-full input-base">
                  <option value="sandbox">Sandbox (sandbox.nomba.com)</option>
                  <option value="production">Production (api.nomba.com)</option>
                </select>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Client ID" value={s.nomba_client_id} text onChange={(v) => setS({ ...s, nomba_client_id: v })} testid="nomba-client-id" />
                <Field label="Account ID" value={s.nomba_account_id} text onChange={(v) => setS({ ...s, nomba_account_id: v })} testid="nomba-account-id" />
                <div className="md:col-span-2">
                  <SecretField label="Client secret" value={s.nomba_client_secret} onChange={(v) => setS({ ...s, nomba_client_secret: v })} testid="nomba-client-secret" />
                </div>
              </div>
            </Section>

            <Section title="Marasoft credentials" hint="Used when deposit gateway is Marasoft. The key prefix (MSFT_Live_ vs MSFT_Test_) determines sandbox vs production automatically.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Public key" value={s.marasoft_public_key} text onChange={(v) => setS({ ...s, marasoft_public_key: v })} testid="marasoft-public-key" />
                <Field label="Encryption key" value={s.marasoft_encryption_key} text onChange={(v) => setS({ ...s, marasoft_encryption_key: v })} testid="marasoft-encryption-key" />
                <div className="md:col-span-2">
                  <SecretField label="Secret key" value={s.marasoft_secret_key} onChange={(v) => setS({ ...s, marasoft_secret_key: v })} testid="marasoft-secret-key" />
                </div>
                <div className="md:col-span-2">
                  <SecretField label="Webhook secret hash" value={s.marasoft_secret_hash} onChange={(v) => setS({ ...s, marasoft_secret_hash: v })} placeholder="Paste the same value you set in Marasoft dashboard → Settings → Secret Hash" sub="Optional but recommended. When set, the webhook rejects requests whose secret_hash field does not match." testid="marasoft-secret-hash" />
                </div>
              </div>
              <div className="mt-4 text-[11px] text-[color:var(--text-tertiary)] bg-[color:var(--surface-alt)] rounded-md p-3">
                <span className="font-bold text-[color:var(--text-primary)]">Webhook URL:</span> <code className="break-all">{(process.env.REACT_APP_BACKEND_URL || "")}/api/deposit/webhook/marasoft</code>
                <div className="mt-1">Add this URL in your Marasoft dashboard so credit events reach the platform.</div>
              </div>
            </Section>

            <Section title="BudPay credentials" hint="Used when deposit gateway is BudPay. Get your sk_live_…/pk_live_… keys at developer.budpay.com under Settings → API Keys & Webhook.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Public key" value={s.budpay_public_key} text onChange={(v) => setS({ ...s, budpay_public_key: v })} placeholder="pk_live_…" testid="budpay-public-key" />
                <div className="md:col-span-2">
                  <SecretField label="Secret key" value={s.budpay_secret_key} onChange={(v) => setS({ ...s, budpay_secret_key: v })} placeholder="sk_live_…" testid="budpay-secret-key" />
                </div>
                <div className="md:col-span-2">
                  <SecretField label="Webhook secret (optional)" value={s.budpay_webhook_secret} onChange={(v) => setS({ ...s, budpay_webhook_secret: v })} sub="Used to HMAC-verify webhook requests. Set the same value in your BudPay dashboard." testid="budpay-webhook-secret" />
                </div>
              </div>
            </Section>

            <Section title="QorePay credentials" hint="Used when deposit gateway is QorePay. Keys come from app.qorepay.com → Settings → API Keys. Brand ID is required by /v1/purchases — get it from Brands.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Public key" value={s.qorepay_public_key} text onChange={(v) => setS({ ...s, qorepay_public_key: v })} placeholder="(optional)" testid="qorepay-public-key" />
                <Field label="Brand ID" value={s.qorepay_brand_id} text onChange={(v) => setS({ ...s, qorepay_brand_id: v })} placeholder="brnd_…" testid="qorepay-brand-id" />
                <div className="md:col-span-2">
                  <SecretField label="Secret key" value={s.qorepay_secret_key} onChange={(v) => setS({ ...s, qorepay_secret_key: v })} placeholder="qp_live_…" testid="qorepay-secret-key" />
                </div>
              </div>
            </Section>

            <Section title="JuntPay credentials" hint="Used for JuntPay deposits & payouts. Credentials come from your JuntPay merchant dashboard (appId / merchantId / secret key).">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="App ID" value={s.juntpay_app_id} text onChange={(v) => setS({ ...s, juntpay_app_id: v })} testid="juntpay-app-id" />
                <Field label="Merchant ID" value={s.juntpay_merchant_id} text onChange={(v) => setS({ ...s, juntpay_merchant_id: v })} testid="juntpay-merchant-id" />
                <div className="md:col-span-2">
                  <SecretField label="Secret key" value={s.juntpay_secret_key} onChange={(v) => setS({ ...s, juntpay_secret_key: v })} placeholder="MD5 signing secret" testid="juntpay-secret-key" />
                </div>
                <Field label="Deposit way code" value={s.juntpay_deposit_way_code} text onChange={(v) => setS({ ...s, juntpay_deposit_way_code: v })} placeholder="e.g. NGN_BANK" testid="juntpay-deposit-waycode" />
                <Field label="Payout way code" value={s.juntpay_payout_way_code} text onChange={(v) => setS({ ...s, juntpay_payout_way_code: v })} placeholder="BANK_ACCOUNT" testid="juntpay-payout-waycode" />
              </div>
              <p className="text-[11px] text-[color:var(--text-tertiary)] mt-3"><span className="font-bold text-[color:var(--text-primary)]">Webhook URL:</span> <code className="break-all">{(process.env.REACT_APP_BACKEND_URL || "")}/api/deposit/webhook/juntpay</code></p>
            </Section>

            <Section title="Duplo credentials" hint="Used for Duplo (Atlas) deposits & payouts. The API key comes from your Duplo dashboard (Settings → Developer).">
              <SecretField label="API key" value={s.duplo_api_key} onChange={(v) => setS({ ...s, duplo_api_key: v })} placeholder="pk_test_..." testid="duplo-api-key" />
              <p className="text-[11px] text-[color:var(--text-tertiary)] mt-3"><span className="font-bold text-[color:var(--text-primary)]">Webhook URL:</span> <code className="break-all">{(process.env.REACT_APP_BACKEND_URL || "")}/api/deposit/webhook/duplo</code></p>
            </Section>

            <Section title="Kora credentials" hint="Used for Kora deposits & payouts.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <SecretField label="Secret key" value={s.kora_secret_key} onChange={(v) => setS({ ...s, kora_secret_key: v })} placeholder="sk_test_..." testid="kora-secret-key" />
                </div>
                <SecretField label="Public key" value={s.kora_public_key} onChange={(v) => setS({ ...s, kora_public_key: v })} placeholder="pk_test_..." testid="kora-public-key" />
                <SecretField label="Encryption key" value={s.kora_encryption_key} onChange={(v) => setS({ ...s, kora_encryption_key: v })} testid="kora-encryption-key" />
              </div>
              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-3">Kora deposit method</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <GatewayCard active={(s.kora_deposit_method || "bank_transfer") === "bank_transfer"} label="Default" name="Bank transfer" sub="Single-use virtual account" onClick={() => setS({ ...s, kora_deposit_method: "bank_transfer" })} testid="kora-method-bank-transfer" />
                  <GatewayCard active={s.kora_deposit_method === "virtual_account"} label="Fixed" name="Virtual account" sub="Permanent account (needs BVN)" onClick={() => setS({ ...s, kora_deposit_method: "virtual_account" })} testid="kora-method-virtual-account" />
                  <GatewayCard active={s.kora_deposit_method === "checkout"} label="Hosted" name="Checkout" sub="Redirect to Kora checkout" onClick={() => setS({ ...s, kora_deposit_method: "checkout" })} testid="kora-method-checkout" />
                </div>
              </div>
              {s.kora_deposit_method === "virtual_account" && (
                <div className="mt-4">
                  <Field label="Virtual account bank code" value={s.kora_virtual_account_bank_code} text onChange={(v) => setS({ ...s, kora_virtual_account_bank_code: v })} placeholder="035" sub="Bank providing the fixed virtual account (035=Wema, 070=Fidelity, 103=Globus, 033=UBA, 214=FCMB)." testid="kora-va-bank-code" />
                </div>
              )}
            </Section>

            <Section title="Nekpay credentials" hint="Used for Nekpay deposits (collection) & payouts (payment on behalf). Credentials come from your Nekpay merchant backend.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Merchant ID" value={s.nekpay_mcht_id} text onChange={(v) => setS({ ...s, nekpay_mcht_id: v })} testid="nekpay-mcht-id" />
                <Field label="Channel code" value={s.nekpay_channel_code} text onChange={(v) => setS({ ...s, nekpay_channel_code: v })} placeholder="e.g. 523" testid="nekpay-channel-code" />
                <SecretField label="Payment key (collection)" value={s.nekpay_payment_key} onChange={(v) => setS({ ...s, nekpay_payment_key: v })} testid="nekpay-payment-key" />
                <SecretField label="Secret key (payout)" value={s.nekpay_secret_key} onChange={(v) => setS({ ...s, nekpay_secret_key: v })} testid="nekpay-secret-key" />
              </div>
              <p className="text-[11px] text-[color:var(--text-tertiary)] mt-3"><span className="font-bold text-[color:var(--text-primary)]">Webhook URL:</span> <code className="break-all">{(process.env.REACT_APP_BACKEND_URL || "")}/api/deposit/webhook/nekpay</code></p>
            </Section>

            <Section title="GloPay credentials" hint="Used for GloPay deposits (collection) & payouts (payment). Credentials come from your GloPay merchant backend. Calls go directly to GloPay (not routed through LumenHub).">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Merchant ID" value={s.glopay_mch_id} text onChange={(v) => setS({ ...s, glopay_mch_id: v })} testid="glopay-mch-id" />
                <SecretField label="Collection key (collection)" value={s.glopay_collection_key} onChange={(v) => setS({ ...s, glopay_collection_key: v })} testid="glopay-collection-key" />
                <SecretField label="Payment key (payout)" value={s.glopay_payment_key} onChange={(v) => setS({ ...s, glopay_payment_key: v })} testid="glopay-payment-key" />
                <Field label="Collection channel code" value={s.glopay_collection_code} text onChange={(v) => setS({ ...s, glopay_collection_code: v })} placeholder="e.g. 423" testid="glopay-collection-code" />
                <Field label="Payment channel code" value={s.glopay_payment_code} text onChange={(v) => setS({ ...s, glopay_payment_code: v })} placeholder="e.g. 523" testid="glopay-payment-code" />
              </div>
              <p className="text-[11px] text-[color:var(--text-tertiary)] mt-3"><span className="font-bold text-[color:var(--text-primary)]">Webhook URL:</span> <code className="break-all">{(process.env.REACT_APP_BACKEND_URL || "")}/api/deposit/webhook/glopay</code></p>
            </Section>

            <Section title="FossaPay credentials" hint="Used for FossaPay deposits (virtual account / checkout) & payouts (master wallet). Requests are routed through the LumenHub proxy.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SecretField label="API key" value={s.fossapay_api_key} onChange={(v) => setS({ ...s, fossapay_api_key: v })} placeholder="fk_production_..." testid="fossapay-api-key" />
                <SecretField label="Webhook secret" value={s.fossapay_webhook_secret} onChange={(v) => setS({ ...s, fossapay_webhook_secret: v })} placeholder="HMAC-SHA256 secret" testid="fossapay-webhook-secret" />
              </div>
              <div className="mt-3">
                <label className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wide">Deposit method</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <GatewayCard active={(s.fossapay_deposit_method || "virtual_account") === "virtual_account"} label="Fixed" name="Virtual account" sub="Persistent customer account" onClick={() => setS({ ...s, fossapay_deposit_method: "virtual_account" })} testid="fossapay-method-virtual-account" />
                  <GatewayCard active={s.fossapay_deposit_method === "checkout"} label="One-time" name="Checkout" sub="30-minute checkout account" onClick={() => setS({ ...s, fossapay_deposit_method: "checkout" })} testid="fossapay-method-checkout" />
                </div>
              </div>
              <p className="text-[11px] text-[color:var(--text-tertiary)] mt-3"><span className="font-bold text-[color:var(--text-primary)]">Webhook URL:</span> <code className="break-all">{(process.env.REACT_APP_BACKEND_URL || "")}/api/deposit/webhook/fossapay</code></p>
            </Section>

            <Section title="Fixie outbound proxy" hint="Used only by JuntPay and Nekpay. Paste the full Fixie URL (including the http://…token@host:port part).">
              <SecretField
                label="Fixie proxy URL"
                value={s.fixie_proxy_url}
                onChange={(v) => setS({ ...s, fixie_proxy_url: v })}
                placeholder="http://fixie:TOKEN@your-proxy.fixie.io:80"
                sub="Routes JuntPay + Nekpay requests through Fixie. Leave empty to call them directly."
                testid="fixie-proxy-url"
              />
            </Section>

            <Section title="LumenHub outbound proxy" hint="Used by Paystack, Nomba, Duplo, Kora and FossaPay. Paste the full proxy URL (e.g. your lumenhubtech.com forward proxy).">
              <SecretField
                label="LumenHub proxy URL"
                value={s.lumenhub_proxy_url}
                onChange={(v) => setS({ ...s, lumenhub_proxy_url: v })}
                placeholder="http://user:pass@www.lumenhubtech.com:8080"
                sub="Routes Paystack + Nomba + Duplo + Kora requests through this proxy. Leave empty to call them directly."
                testid="lumenhub-proxy-url"
              />
              <div className="mt-4">
                <Field
                  label="LumenHub base URL"
                  value={s.lumenhub_base_url}
                  text
                  onChange={(v) => setS({ ...s, lumenhub_base_url: v })}
                  placeholder="https://www.lumenhub.com"
                  sub="Public origin of the lumenhub server. Gateway callback/redirect URLs point here so gateways never link directly to furgle."
                  testid="lumenhub-base-url"
                />
              </div>
            </Section>
          </>
        )}

        {tab === "home" && (
          <>
            <Section title="Home page banner" hint="Pinned promo banner that appears at the top of the user dashboard. Toggle off to hide it without losing the text.">
              <div className="space-y-4">
                <Toggle checked={!!s.home_announcement_active} onChange={(v) => setS({ ...s, home_announcement_active: v })} label="Show banner on home" testid="home-announcement-toggle" />
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Banner text</span>
                  <textarea rows={3} value={s.home_announcement || ""} onChange={(e) => setS({ ...s, home_announcement: e.target.value })} data-testid="home-announcement-input" className="w-full input-base resize-none" placeholder="e.g. 🎉 5% extra on every deposit this weekend." />
                </label>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Banner image</span>
                  {s.home_announcement_image_url ? (
                    <div className="relative inline-block">
                      <img src={resolveImg(s.home_announcement_image_url)} alt="" className="max-h-40 rounded-xl" />
                      <button type="button" onClick={() => setS({ ...s, home_announcement_image_url: "" })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[color:var(--error)] text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[color:var(--border-default)] cursor-pointer hover:bg-[color:var(--surface-alt)]">
                      <ImagePlus className="w-5 h-5 text-[color:var(--brand)]" />
                      <span className="text-sm font-semibold text-[color:var(--text-primary)]">{uploading ? "Uploading…" : "Click to upload image"}</span>
                      <input ref={fileRef} type="file" accept="image/*" onChange={uploadAnnouncement} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Welcome modal" hint="Shown to new users when they first log in. Use it to greet, link Telegram, or push the headline product.">
              <div className="space-y-4">
                <Toggle checked={s.welcome_modal_active !== false} onChange={(v) => setS({ ...s, welcome_modal_active: v })} label="Show welcome modal to new users" testid="welcome-modal-toggle" />
                <Field label="Modal title" text value={s.welcome_modal_title} onChange={(v) => setS({ ...s, welcome_modal_title: v })} testid="welcome-modal-title" />
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Welcome message</span>
                  <textarea rows={3} value={s.welcome_message || ""} onChange={(e) => setS({ ...s, welcome_message: e.target.value })} data-testid="welcome-message-input" className="w-full input-base resize-none" />
                </label>
                <Field label="Telegram URL" text value={s.telegram_url} onChange={(v) => setS({ ...s, telegram_url: v })} testid="telegram-url" sub="Shows as a 'Join Telegram' button inside the welcome modal. Leave empty to hide." />
              </div>
            </Section>

            <Section title="Social channels" hint="Linked from the user profile and welcome modal. Leave blank to hide a row.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Telegram channel URL" text value={s.telegram_channel_url} onChange={(v) => setS({ ...s, telegram_channel_url: v })} testid="tg-channel-url" />
                <Field label="Telegram group URL"   text value={s.telegram_group_url}   onChange={(v) => setS({ ...s, telegram_group_url: v })}   testid="tg-group-url" />
                <Field label="WhatsApp channel URL" text value={s.whatsapp_channel_url} onChange={(v) => setS({ ...s, whatsapp_channel_url: v })} testid="wa-channel-url" />
                <Field label="WhatsApp group URL"   text value={s.whatsapp_group_url}   onChange={(v) => setS({ ...s, whatsapp_group_url: v })}   testid="wa-group-url" />
              </div>
            </Section>

            <Section title="Featured plan visibility" hint="Controls ONLY the 'Featured Plan' poster + Invest CTA on the user home page. This is independent of the section below it.">
              <Toggle
                checked={s.home_featured_plan_enabled !== false}
                onChange={(v) => setS({ ...s, home_featured_plan_enabled: v })}
                label="Show featured plan on home"
                hint="Turn OFF to hide just the featured-plan poster. The secondary section (cards/image) is unaffected."
                testid="featured-plan-toggle"
              />
            </Section>

            <Section title="Featured product" hint="Pinned to the top of the Invest tab. Resets to highest ROI when set to None.">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Pick a product</span>
                <select value={s.featured_product_id || ""} onChange={(e) => setS({ ...s, featured_product_id: e.target.value || null })} data-testid="featured-product-select" className="w-full input-base">
                  <option value="">— None (auto-pick highest ROI) —</option>
                  {products.map((p) => (<option key={p.id} value={p.id}>{p.name} · {p.daily_profit_percent}%/day · {p.duration_days} days</option>))}
                </select>
                <span className="block text-[10px] text-[color:var(--text-tertiary)] mt-1">Currently selected: <span className="font-bold text-[color:var(--text-primary)]">{products.find((p) => p.id === s.featured_product_id)?.name || "— None —"}</span></span>
              </label>
            </Section>

            <Section title="Investment plans on home" hint="How many plan cards to show in the 'Investment plans' row on the user dashboard. The full list is always available on the Invest tab.">
              <Field
                label="Number of plans to show"
                value={s.home_plans_count ?? 0}
                step="1"
                onChange={(v) => setS({ ...s, home_plans_count: v })}
                testid="home-plans-count"
                sub="Default 0. Set how many plans appear on the home page."
              />
            </Section>

            <Section title="Section below featured plan" hint="An independent section on the user dashboard. Toggle it on/off separately from the featured plan, then choose the default action cards (Team / Coupon / Packages) or a custom image (e.g. a poster of your investment packages).">
              <Toggle
                checked={s.home_secondary_section_enabled !== false}
                onChange={(v) => setS({ ...s, home_secondary_section_enabled: v })}
                label="Show this section on home"
                hint="Independent of the featured-plan toggle above. Turn OFF to hide the cards / packages image entirely."
                testid="secondary-section-toggle"
              />
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 transition-opacity ${s.home_secondary_section_enabled === false ? "opacity-40 pointer-events-none" : ""}`}>
                {[
                  { v: "cards", label: "Default cards", desc: "Team · Coupon · Packages CTAs" },
                  { v: "image", label: "Custom image",  desc: "Upload a poster, banner, or package collage" },
                ].map((m) => {
                  const active = (s.home_below_featured_mode || "cards") === m.v;
                  return (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => setS({ ...s, home_below_featured_mode: m.v })}
                      data-testid={`home-below-mode-${m.v}`}
                      className={`relative text-left p-4 rounded-2xl border-2 transition-all ${active
                        ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] shadow-md ring-2 ring-[color:var(--brand)]/10"
                        : "border-[color:var(--border-default)] bg-[color:var(--surface)] hover:border-[color:var(--brand)]/50"}`}
                    >
                      <div className={`font-display font-extrabold text-base ${active ? "text-[color:var(--brand)]" : "text-[color:var(--text-primary)]"}`}>{m.label}</div>
                      <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{m.desc}</div>
                      {active && (
                        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[color:var(--brand)] text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {(s.home_below_featured_mode || "cards") === "image" && (
                <div className="mt-4">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Image</span>
                  {s.home_below_featured_image_url ? (
                    <div className="relative inline-block">
                      <img src={resolveImg(s.home_below_featured_image_url)} alt="" className="max-h-48 rounded-xl" data-testid="home-below-image-preview" />
                      <button type="button" onClick={() => setS({ ...s, home_below_featured_image_url: "" })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[color:var(--error)] text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[color:var(--border-default)] cursor-pointer hover:bg-[color:var(--surface-alt)]">
                      <ImagePlus className="w-5 h-5 text-[color:var(--brand)]" />
                      <span className="text-sm font-semibold text-[color:var(--text-primary)]">{uploading ? "Uploading…" : "Click to upload image"}</span>
                      <input type="file" accept="image/*" onChange={(e) => uploadInto("home_below_featured_image_url", e)} className="hidden" data-testid="home-below-image-upload" />
                    </label>
                  )}
                </div>
              )}
            </Section>
          </>
        )}

        {tab === "branding" && (
          <Section title="Brand logo" hint="Used on the admin sidebar, the admin login page, the user sign-in / register / forgot-password screens, and the browser favicon (rel icon). Square images work best — 256×256 PNG or JPG. Leave empty to fall back to the default Furgle logo.">
            <div className="flex items-start gap-6 flex-wrap">
              <div>
                <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Current logo</span>
                <div className="w-28 h-28 rounded-2xl bg-black flex items-center justify-center overflow-hidden shadow-lg" data-testid="brand-logo-preview">
                  <img
                    src={s.brand_logo_url ? resolveImg(s.brand_logo_url) : `${process.env.PUBLIC_URL || ""}/evoque-nova-logo.png`}
                    alt="Brand logo"
                    className="w-full h-full object-contain p-1"
                  />
                </div>
                {s.brand_logo_url && (
                  <button
                    type="button"
                    onClick={() => setS({ ...s, brand_logo_url: "" })}
                    data-testid="brand-logo-reset"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[color:var(--error)] hover:underline"
                  >
                    <X className="w-3 h-3" /> Reset to default
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-[240px]">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Upload new logo</span>
                <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[color:var(--border-default)] cursor-pointer hover:bg-[color:var(--surface-alt)]">
                  <ImagePlus className="w-5 h-5 text-[color:var(--brand)]" />
                  <span className="text-sm font-semibold text-[color:var(--text-primary)]">{uploading ? "Uploading…" : "Click to upload image"}</span>
                  <input type="file" accept="image/*" onChange={(e) => uploadInto("brand_logo_url", e)} className="hidden" data-testid="brand-logo-upload" />
                </label>
                <div className="mt-3 text-[11px] text-[color:var(--text-tertiary)] leading-relaxed">
                  After saving, the new logo appears immediately across the app (admin layout, login pages, user layout, and browser tab favicon). On returning visitors, the browser may cache the old favicon for a few minutes.
                </div>
              </div>
            </div>
          </Section>
        )}

        {tab === "danger" && (
          <DangerZone s={s} setS={setS} />
        )}

        {/* Sticky save bar at the bottom */}
        <div className="sticky bottom-3 mt-6 card-soft p-3 flex items-center gap-3 border border-[color:var(--brand)]/20 shadow-lg bg-[color:var(--surface)]">
          <Sparkles className="w-4 h-4 text-[color:var(--brand)]" />
          <span className="text-xs text-[color:var(--text-secondary)] flex-1">Changes apply across the whole app the moment you save.</span>
          <button
            type="submit"
            disabled={saving}
            data-testid="save-settings-btn-bottom"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white hover:opacity-90 disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}

/* ----------------------------------------------------------------------------
 * Password change (separate component to keep its own local state)
 * --------------------------------------------------------------------------*/
function PasswordSection() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (next.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (next !== confirm) { toast.error("New passwords don't match"); return; }
    setBusy(true);
    try {
      await api.post("/admin/change-password", { current_password: cur, new_password: next });
      toast.success("Password changed");
      setCur(""); setNext(""); setConfirm("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Change failed");
    } finally { setBusy(false); }
  };
  return (
    <Section title="Change admin password" hint="You'll stay signed in. Use a strong, unique password.">
      <form onSubmit={submit} className="space-y-3 max-w-md">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Current password</span>
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="pw-current" className="w-full input-base" required />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">New password</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="pw-new" className="w-full input-base" required minLength={6} />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Confirm new password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="pw-confirm" className="w-full input-base" required minLength={6} />
        </label>
        <button type="submit" disabled={busy || !cur || !next || !confirm} data-testid="pw-submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white disabled:opacity-50">
          <Lock className="w-4 h-4" /> {busy ? "Changing…" : "Change password"}
        </button>
      </form>
    </Section>
  );
}

/* ----------------------------------------------------------------------------
 * Danger zone — payment mode + destructive actions
 * --------------------------------------------------------------------------*/
function DangerZone({ s, setS }) {
  const navigate = useNavigate();
  const [confirmKind, setConfirmKind] = useState(null); // 'logout' | 'clear-users' | 'clear-db'
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const TOKENS = { "clear-users": "CLEAR_USER_DATA", "clear-db": "CLEAR_ALL_DATA" };
  const meta = {
    "logout":      { title: "Logout all users",        tone: "warn", body: "Forces every non-admin user to sign back in. You stay logged in." },
    "clear-users": { title: "Clear all user data",     tone: "error", body: "Deletes every deposit, withdrawal, investment, transaction, referral and zeros wallets. User accounts remain.", token: "CLEAR_USER_DATA" },
    "clear-db":    { title: "Clear database (NUKE)",   tone: "error", body: "Permanently deletes every non-admin user and all transactional collections. Admins, settings, and gateway credentials remain.", token: "CLEAR_ALL_DATA" },
  };

  const run = async () => {
    setBusy(true);
    try {
      if (confirmKind === "logout") {
        const { data } = await api.post("/admin/system/logout-all-users");
        toast.success(`Logged out ${data.affected} user(s)`);
      } else if (confirmKind === "clear-users") {
        const { data } = await api.post("/admin/system/clear-user-data", { confirm_token: confirmText });
        toast.success(`Cleared user data · ${Object.values(data.deleted || {}).reduce((a, b) => a + b, 0)} records removed · ${data.users_zeroed} wallets zeroed`);
      } else if (confirmKind === "clear-db") {
        const { data } = await api.post("/admin/system/clear-database", { confirm_token: confirmText });
        toast.success(`Database cleared · ${Object.values(data.deleted || {}).reduce((a, b) => a + b, 0)} records removed`);
        // After a nuke, navigate away to avoid stale state
        setTimeout(() => navigate("/pentest/fuser"), 800);
      }
      setConfirmKind(null);
      setConfirmText("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    } finally { setBusy(false); }
  };

  return (
    <>
      <Section title="Payment mode">
        <select value={s.payment_mode || "mock"} onChange={(e) => setS({ ...s, payment_mode: e.target.value })} data-testid="payment-mode-select" className="w-full input-base font-semibold">
          <option value="mock">Mock — deposits auto-succeed, payouts simulated (testing only)</option>
          <option value="live">Live — real Paystack / Nomba / Marasoft calls</option>
        </select>
        <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">Mock mode never moves real money. Switch to Live only after you've added gateway credentials and tested a real deposit.</p>
      </Section>

      <Section title="Destructive actions" hint="Each action is logged in Activity Log. The two clear-data actions require a typed confirmation token.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button type="button" onClick={() => { setConfirmKind("logout"); setConfirmText(""); }}
            data-testid="logout-all-btn"
            className="card-soft p-4 text-left border border-[color:var(--warning)]/30 hover:bg-[color:var(--gold-soft)] transition-colors">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--gold-soft)] text-[color:var(--warning)]">
              <LogOut className="w-3 h-3" /> Soft
            </div>
            <div className="font-display font-bold text-base mt-2 text-[color:var(--text-primary)]">Logout all users</div>
            <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1">Bumps session epoch — everyone signs back in.</p>
          </button>
          <button type="button" onClick={() => { setConfirmKind("clear-users"); setConfirmText(""); }}
            data-testid="clear-users-btn"
            className="card-soft p-4 text-left border border-[color:var(--error)]/30 hover:bg-[color:var(--error-soft)] transition-colors">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--error-soft)] text-[color:var(--error)]">
              <Eraser className="w-3 h-3" /> Hard
            </div>
            <div className="font-display font-bold text-base mt-2 text-[color:var(--text-primary)]">Clear all user data</div>
            <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1">Wipes deposits, withdrawals, investments, transactions. Accounts remain.</p>
          </button>
          <button type="button" onClick={() => { setConfirmKind("clear-db"); setConfirmText(""); }}
            data-testid="clear-db-btn"
            className="card-soft p-4 text-left border border-[color:var(--error)]/60 hover:bg-[color:var(--error-soft)] transition-colors">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--error)] text-white">
              <Database className="w-3 h-3" /> Nuke
            </div>
            <div className="font-display font-bold text-base mt-2 text-[color:var(--text-primary)]">Clear database</div>
            <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1">Deletes non-admin users, products, coupons, everything except settings.</p>
          </button>
        </div>
      </Section>

      <Dialog open={!!confirmKind} onOpenChange={(o) => !busy && !o && setConfirmKind(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0">
          {confirmKind && (() => { const m = meta[confirmKind]; return (
            <>
              <div className={`relative bg-gradient-to-br ${m.tone === "warn" ? "from-[#7c4807] via-[#a36a08] to-[#F59E0B]" : "from-[#7F1D1D] via-[#B91C1C] to-[#EF4444]"} text-white p-6`}>
                <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0"><ShieldAlert className="w-5 h-5" /></div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">Confirm</div>
                    <div className="font-display font-extrabold text-2xl mt-1">{m.title}</div>
                  </div>
                </div>
              </div>
              <div className="p-5 bg-[color:var(--surface)] space-y-3">
                <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed">{m.body}</p>
                {m.token && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Type <span className="font-mono text-[color:var(--error)]">{m.token}</span> to confirm</label>
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} data-testid="danger-confirm-input"
                      className="w-full input-base font-mono" placeholder={m.token} />
                  </div>
                )}
                <div className="rounded-lg bg-[color:var(--error-soft)] text-[color:var(--error)] p-2.5 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>This action is irreversible and logged to Activity Log.</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => setConfirmKind(null)} disabled={busy}
                    className="px-3 py-2 rounded-md text-xs font-semibold bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] disabled:opacity-50">Cancel</button>
                  <button onClick={run} disabled={busy || (m.token && confirmText !== m.token)} data-testid="danger-confirm-run"
                    className={`ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider text-white ${m.tone === "warn" ? "bg-[color:var(--warning)]" : "bg-[color:var(--error)]"} disabled:opacity-50 disabled:cursor-not-allowed`}>
                    {busy ? "Working…" : "Run"}
                  </button>
                </div>
              </div>
            </>
          ); })()}
        </DialogContent>
      </Dialog>
    </>
  );
}


