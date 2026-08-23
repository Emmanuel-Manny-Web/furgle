import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Phone, Lock, ArrowRight, ShieldQuestion, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import AuthShell from "@/components/AuthShell";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("questions"); // "questions" or "admin"
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState(1);
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchQuestions = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/auth/security-questions/${phone}`);
      setQ1(data.question_1);
      setQ2(data.question_2);
      setStep(2);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Could not fetch security questions";
      toast.error(msg);
      if (msg.includes("does not have security questions")) setMode("admin");
    } finally { setLoading(false); }
  };

  const resetWithQuestions = async (e) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      toast.error("New password must be at least 4 characters");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-with-questions", {
        phone, answer_1: a1, answer_2: a2, new_password: newPassword,
      });
      toast.success("Password reset successfully — please sign in.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reset failed");
    } finally { setLoading(false); }
  };

  const submitAdminReset = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }
    if (newPassword.length < 4) {
      toast.error("New password must be at least 4 characters");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { phone, new_password: newPassword, reason });
      toast.success("Reset request submitted. An admin will review shortly.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not submit request");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell
      title="Recover account"
      subtitle="Reset your password securely"
      testid="forgot-card"
      footer={<Link to="/login" className="text-[color:var(--brand)] font-semibold underline underline-offset-2">← Back to sign in</Link>}
    >
      <div className="grid grid-cols-2 gap-2 bg-[color:var(--surface-alt)] p-1 rounded-xl" data-testid="recovery-mode-tabs">
          <button onClick={() => { setMode("questions"); setStep(1); }} data-testid="mode-questions"
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "questions" ? "bg-[color:var(--surface)] text-[color:var(--brand)] shadow-sm" : "text-[color:var(--text-secondary)]"}`}>
            <ShieldQuestion className="w-4 h-4 inline-block mr-1" /> Questions
          </button>
          <button onClick={() => setMode("admin")} data-testid="mode-admin"
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "admin" ? "bg-[color:var(--surface)] text-[color:var(--brand)] shadow-sm" : "text-[color:var(--text-secondary)]"}`}>
            <MessageSquare className="w-4 h-4 inline-block mr-1" /> Admin reset
          </button>
        </div>

        {mode === "questions" ? (
          step === 1 ? (
            <form onSubmit={fetchQuestions} className="mt-5 space-y-4" data-testid="forgot-step1">
              <p className="text-sm text-[color:var(--text-secondary)]">Enter your 11-digit phone number to fetch your security questions.</p>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Phone number</label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                <input type="tel" required inputMode="numeric" pattern="\d{11}" maxLength={11}
                  value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="08012345678" data-testid="forgot-phone-input"
                  className="w-full pl-10 pr-3 py-3 input-base font-mono" />
              </div>
              <button type="submit" disabled={loading} data-testid="fetch-questions-btn"
                className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
                {loading ? "Looking up…" : (<>Continue <ArrowRight className="w-4 h-4" /></>)}
              </button>
            </form>
          ) : (
            <form onSubmit={resetWithQuestions} className="mt-5 space-y-3" data-testid="forgot-step2">
              <div className="p-3 rounded-lg bg-[color:var(--brand-soft)] text-xs text-[color:var(--text-primary)]">
                Account: <span className="font-mono font-semibold">{phone}</span>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">{q1}</label>
              <input value={a1} onChange={(e)=>setA1(e.target.value)} required data-testid="answer-1-input"
                placeholder="Your answer" className="w-full input-base" />
              <label className="block mt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">{q2}</label>
              <input value={a2} onChange={(e)=>setA2(e.target.value)} required data-testid="answer-2-input"
                placeholder="Your answer" className="w-full input-base" />
              <label className="block mt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">New password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                <input type="password" required minLength={4} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)}
                  data-testid="forgot-newpwd-input" placeholder="At least 4 characters"
                  className="w-full pl-10 pr-3 input-base" />
              </div>
              <button type="submit" disabled={loading} data-testid="reset-questions-btn"
                className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
                {loading ? "Resetting…" : "Reset password"}
              </button>
              <button type="button" onClick={() => setStep(1)} className="w-full text-xs text-[color:var(--text-tertiary)] underline underline-offset-2">
                Use a different phone number
              </button>
            </form>
          )
        ) : (
          <form onSubmit={submitAdminReset} className="mt-5 space-y-3" data-testid="forgot-admin-form">
            <p className="text-sm text-[color:var(--text-secondary)]">
              Submit a request and an admin will verify your identity manually.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Phone number</label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
              <input type="tel" required inputMode="numeric" pattern="\d{11}" maxLength={11}
                value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="08012345678" data-testid="forgot-admin-phone"
                className="w-full pl-10 pr-3 py-3 input-base font-mono" />
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">New password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
              <input type="password" required minLength={4} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)}
                data-testid="forgot-admin-newpwd" placeholder="At least 4 characters"
                className="w-full pl-10 pr-3 py-3 input-base" />
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Reason / details (optional)</label>
            <textarea rows={3} value={reason} onChange={(e)=>setReason(e.target.value)} maxLength={300}
              data-testid="forgot-admin-reason" placeholder="Briefly describe why you need a reset…"
              className="w-full input-base" />
            <button type="submit" disabled={loading} data-testid="forgot-admin-submit"
              className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
              {loading ? "Submitting…" : "Submit request"}
            </button>
          </form>
        )}
    </AuthShell>
  );
}
