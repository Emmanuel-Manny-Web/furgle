import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { User, Phone, Lock, Gift, ArrowRight, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { SECURITY_QUESTIONS } from "@/lib/securityQuestions";
import { formatNaira } from "@/lib/format";
import AuthShell from "@/components/AuthShell";

export default function Register() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const { settings, loaded: settingsLoaded } = useSettings();
  const [sp] = useSearchParams();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [q1, setQ1] = useState(SECURITY_QUESTIONS[0]);
  const [a1, setA1] = useState("");
  const [q2, setQ2] = useState(SECURITY_QUESTIONS[1]);
  const [a2, setA2] = useState("");
  const [loading, setLoading] = useState(false);

  const welcomeBonus = typeof settings.welcome_bonus === "number" ? settings.welcome_bonus : 750;
  const secEnabled = settings.require_security_questions !== false;

  useEffect(() => {
    const ref = sp.get("ref");
    if (ref) setReferralCode(ref);
  }, [sp]);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }
    if (secEnabled) {
      if (q1 === q2) {
        toast.error("Please choose two different security questions");
        return;
      }
      if (!a1.trim() || !a2.trim()) {
        toast.error("Please answer both security questions");
        return;
      }
    }
    setLoading(true);
    try {
      const payload = {
        phone, name, password,
        referral_code: referralCode || null,
      };
      if (secEnabled) {
        payload.security_question_1 = q1;
        payload.security_answer_1 = a1.trim();
        payload.security_question_2 = q2;
        payload.security_answer_2 = a2.trim();
      }
      const { data } = await api.post("/auth/register", payload);
      setSession(data.token, data.user);
      toast.success(`Welcome! ${formatNaira(welcomeBonus)} welcome bonus credited`);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Registration failed");
    } finally { setLoading(false); }
  };

  const otherQuestions = (current) => SECURITY_QUESTIONS.filter((q) => q !== current);

  return (
    <AuthShell
      title="Get started"
      subtitle={<>Get a <span className="font-semibold text-[color:var(--accent-main)]">{formatNaira(welcomeBonus)}</span> welcome bonus when you join</>}
      testid="register-card"
      footer={<>Already have an account? <Link to="/login" data-testid="go-login-link" className="text-[color:var(--brand)] font-semibold underline underline-offset-2">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" data-testid="register-form">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Full name</label>
          <div className="relative mt-2">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input required value={name} onChange={(e)=>setName(e.target.value)} placeholder="Adaeze Okafor"
              data-testid="register-name-input"
              className="w-full pl-10 pr-3 py-3 input-base" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Phone number (11 digits)</label>
          <div className="relative mt-2">
            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input type="tel" required inputMode="numeric" pattern="\d{11}" maxLength={11}
              value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="08012345678"
              data-testid="register-phone-input"
              className="w-full pl-10 pr-3 py-3 input-base font-mono" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Password</label>
          <div className="relative mt-2">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input type="password" required minLength={4} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="At least 4 characters"
              data-testid="register-password-input"
              className="w-full pl-10 pr-3 py-3 input-base" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Referral code <span className="lowercase text-[color:var(--text-tertiary)]">(optional)</span></label>
          <div className="relative mt-2">
            <Gift className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input value={referralCode} onChange={(e)=>setReferralCode(e.target.value.toUpperCase())} placeholder="e.g. NAIJA01"
              data-testid="register-referral-input"
              className="w-full pl-10 pr-3 py-3 input-base uppercase" />
          </div>
        </div>

        {settingsLoaded && secEnabled && (
        <div className="p-4 rounded-xl bg-[color:var(--brand-soft)] border border-[color:var(--border-default)]" data-testid="security-block">
          <div className="flex items-center gap-2 text-[color:var(--brand)] font-semibold text-sm">
            <ShieldQuestion className="w-4 h-4" /> Security questions
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">
            Used to recover your account if you forget your password. Pick two — answers are case-insensitive.
          </p>

          <label className="block mt-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Question 1</label>
          <select value={q1} onChange={(e)=>setQ1(e.target.value)} data-testid="register-q1-select" className="w-full mt-1 input-base">
            {[q1, ...otherQuestions(q1).filter(q => q !== q2)].map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
          <input value={a1} onChange={(e)=>setA1(e.target.value)} required data-testid="register-a1-input"
            placeholder="Your answer" className="w-full mt-2 input-base" />

          <label className="block mt-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Question 2</label>
          <select value={q2} onChange={(e)=>setQ2(e.target.value)} data-testid="register-q2-select" className="w-full mt-1 input-base">
            {[q2, ...otherQuestions(q2).filter(q => q !== q1)].map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
          <input value={a2} onChange={(e)=>setA2(e.target.value)} required data-testid="register-a2-input"
            placeholder="Your answer" className="w-full mt-2 input-base" />
        </div>
        )}

        <button type="submit" disabled={loading}
          data-testid="register-submit-btn"
          className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
          {loading ? "Creating…" : (<>Create account <ArrowRight className="w-4 h-4" /></>)}
        </button>
      </form>
    </AuthShell>
  );
}
