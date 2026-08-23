import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Lock, Phone, ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";
import { useBranding } from "@/context/BrandingContext";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const { logoUrl } = useBranding();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { phone, password });
      if (!data.user.is_admin) {
        toast.error("This account does not have admin access.");
        setLoading(false);
        return;
      }
      setSession(data.token, data.user, "admin");
      navigate("/pentest/fuser", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid credentials");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[color:var(--app-bg)] text-[color:var(--text-primary)]">
      {/* Left panel: dark, ops-grade */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden bg-[#0B0B1F] text-white">
        <div className="absolute inset-0 opacity-30" style={{
          background: "radial-gradient(60% 80% at 0% 0%, rgba(244,114,182,0.35) 0%, transparent 60%), radial-gradient(60% 80% at 100% 100%, rgba(99,102,241,0.4) 0%, transparent 60%)",
        }} />
        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center overflow-hidden shadow-xl">
              <img src={logoUrl} alt="Furgle" className="w-full h-full object-contain p-0.5" />
            </div>
            <div>
              <div className="font-display font-extrabold text-xl tracking-tight">FURGLE</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/60 mt-0.5">Admin Console</div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-white/70 bg-white/5 backdrop-blur border border-white/10 rounded-full px-3 py-1.5">
            <ShieldCheck className="w-3 h-3" /> Restricted area
          </div>
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold tracking-tight mt-4 leading-[1.05]">
            Mission control<br />for Furgle.
          </h1>
          <p className="text-white/70 mt-4 max-w-md text-sm leading-relaxed">
            Approve withdrawals, monitor deposits in real time, manage plans, fraud signals and platform profit — all from one console.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/80">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#F472B6]" /> Live deposit & withdrawal pipeline</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#818CF8]" /> Platform profit and 24h payout projections</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" /> Manual adjustments + fraud monitor</li>
          </ul>
        </div>

        <div className="text-[11px] text-white/40 relative">© Furgle · Operations only</div>
      </div>

      {/* Right panel: login form */}
      <div className="flex-1 flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link to="/login" data-testid="admin-back-user-login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]">
            <ArrowLeft className="w-3.5 h-3.5" /> User sign-in
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center">
          <form onSubmit={submit} className="w-full max-w-md mx-auto" data-testid="admin-login-form">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] text-[10px] uppercase tracking-[0.18em] font-bold">
              <ShieldCheck className="w-3 h-3" /> Admin sign-in
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-3">Restricted access</h2>
            <p className="text-sm text-[color:var(--text-secondary)] mt-2">Use your admin credentials. Non-admin accounts will be rejected.</p>

            <label className="block mt-6 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Admin phone (11 digits)</label>
            <div className="relative mt-2">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
              <input
                type="tel" required pattern="[0-9]{11}" inputMode="numeric" maxLength={11}
                value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="08012345678"
                data-testid="admin-phone-input"
                className="w-full pl-10 pr-3 py-3 input-base"
              />
            </div>

            <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Password</label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="admin-password-input"
                className="w-full pl-10 pr-3 py-3 input-base"
              />
            </div>

            <button type="submit" disabled={loading}
              data-testid="admin-login-submit"
              className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[color:var(--accent-main)] to-[color:var(--brand)] hover:from-[color:var(--accent-hover)] hover:to-[color:var(--brand-hover)] text-white font-semibold rounded-xl px-5 py-3 shadow-lg shadow-[color:var(--accent-main)]/25 disabled:opacity-60 transition-all">
              {loading ? "Signing in…" : (<>Enter admin console <ArrowRight className="w-4 h-4" /></>)}
            </button>

            <p className="text-[11px] text-[color:var(--text-tertiary)] mt-6 text-center">This page is for administrators only. All access is logged.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
