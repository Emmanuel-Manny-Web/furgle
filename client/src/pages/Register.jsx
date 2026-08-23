import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/ui";
import { SECURITY_QUESTIONS } from "../constants";

export default function Register() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState("");
  const [q1, setQ1] = useState("");
  const [a1, setA1] = useState("");
  const [q2, setQ2] = useState("");
  const [a2, setA2] = useState("");
  const [requireSecQ, setRequireSecQ] = useState(false);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    api("/settings/public", { auth: false })
      .then((s) => setRequireSecQ(!!s.require_security_questions))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ref = searchParams.get("ref") || searchParams.get("referral_code");
    if (ref) setReferral(ref.toUpperCase());
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) return toast("Phone must be 11 digits", "error");
    if (!name.trim()) return toast("Please enter your name", "error");
    if (password.length < 6) return toast("Password must be at least 6 characters", "error");
    if (requireSecQ && (!q1 || !a1.trim() || !q2 || !a2.trim())) {
      return toast("Please complete all security questions", "error");
    }
    setBusy(true);
    try {
      const r = await api("/auth/register", {
        method: "POST",
        body: {
          phone,
          name: name.trim(),
          password,
          referral_code: referral.trim() || undefined,
          question_1: requireSecQ ? q1 : undefined,
          answer_1: requireSecQ ? a1.trim() : undefined,
          question_2: requireSecQ ? q2 : undefined,
          answer_2: requireSecQ ? a2.trim() : undefined,
        },
        auth: false,
      });
      login(r.token, r.user);
      toast("Welcome! ₦1,000 bonus credited");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="box">
        <div className="brand">
          <div className="logo">Furgle<span>.</span></div>
          <p>Grow your money daily</p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>Create account</h2>
          <p className="page-sub" style={{ marginBottom: 18 }}>Start earning daily returns</p>

          <form onSubmit={submit}>
            <div className="field">
              <label>Full name</label>
              <input className="input" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Phone number</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={11}
                placeholder="08012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>Referral code (optional)</label>
              <input className="input" placeholder="Enter referral code (optional)" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} />
            </div>

            {requireSecQ && (
              <>
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0 14px", paddingTop: 14 }}>
                  <div className="page-sub" style={{ marginBottom: 12 }}>
                    Set security questions — you'll need these to recover your password.
                  </div>
                  <div className="field">
                    <label>Security question 1</label>
                    <select className="input select" value={q1} onChange={(e) => setQ1(e.target.value)}>
                      <option value="">Select a question</option>
                      {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Answer 1</label>
                    <input className="input" value={a1} onChange={(e) => setA1(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Security question 2</label>
                    <select className="input select" value={q2} onChange={(e) => setQ2(e.target.value)}>
                      <option value="">Select a question</option>
                      {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Answer 2</label>
                    <input className="input" value={a2} onChange={(e) => setA2(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <button className="btn primary block lg" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-2)" }}>
            Already have an account? <Link to="/login" style={{ color: "var(--brand)", fontWeight: 700 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
