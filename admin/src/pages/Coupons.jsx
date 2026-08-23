import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Ticket, Gift } from "lucide-react";
import { toast } from "sonner";
import { formatNaira } from "@/lib/format";

export default function Coupons() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeInvestments, setActiveInvestments] = useState(null); // null = loading

  useEffect(() => {
    api.get("/investments")
      .then(({ data }) => setActiveInvestments(
        Array.isArray(data) ? data.filter(i => i.status === "active").length : 0
      ))
      .catch(() => setActiveInvestments(0));
  }, []);
  const locked = activeInvestments === 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/coupons/redeem", { code });
      toast.success(`Coupon credited: ${formatNaira(data.amount)}`);
      setCode("");
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not redeem coupon");
    } finally { setBusy(false); }
  };

  return (
    <UserLayout>
      <div className="text-label">Bonuses</div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">Coupons</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Redeem a promo code to credit your wallet instantly.</p>

      {locked && (
        <div className="mt-4 card-soft p-5 border-l-4 border-[color:var(--warning)]" data-testid="coupon-locked-banner">
          <div className="font-semibold text-[color:var(--text-primary)]">Coupons unlock after your first active investment</div>
          <div className="text-sm text-[color:var(--text-secondary)] mt-1">
            You need at least one running plan to redeem a coupon code. Once your investment is active, coupons will credit your wallet instantly.
          </div>
          <Link to="/invest" data-testid="coupons-go-invest" className="mt-4 inline-block btn-primary text-sm">
            Browse plans
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <form onSubmit={submit} className="card-soft p-6" data-testid="coupon-form">
          <div className="flex items-center gap-2 text-label"><Ticket className="w-3.5 h-3.5" /> Redeem code</div>
          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Coupon code</label>
          <input value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} required
            data-testid="coupon-input"
            placeholder="e.g. NAIJA2026"
            className="w-full mt-2 px-3 py-3 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)] uppercase font-mono" />
          <button type="submit" disabled={busy || locked} data-testid="redeem-btn"
            className="mt-5 w-full bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] py-3 rounded-full font-semibold disabled:opacity-60">
            {busy ? "Redeeming…" : "Redeem coupon"}
          </button>
        </form>
        <div className="card-soft p-6 bg-[color:var(--surface-alt)]">
          <Gift className="w-8 h-8 text-[color:var(--gold)]" />
          <div className="mt-3 font-display text-xl font-semibold">Earn more, easily</div>
          <p className="text-sm text-[color:var(--text-secondary)] mt-2">Codes are released during promotions on our social channels. Each coupon can be redeemed once per account.</p>
          <div className="mt-4 text-sm">Current wallet: <span className="font-semibold">{formatNaira(user?.wallet_balance)}</span></div>
        </div>
      </div>
    </UserLayout>
  );
}
