import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/ui";

export default function ForgotPassword() {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [questions, setQuestions] = useState(null);
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [pw, setPw] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const lookup = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api(`/auth/security-questions/${phone}`, { auth: false });
      if (!r.question_1 && !r.question_2) {
        setQuestions(null);
        setStep("request");
      } else {
        setQuestions(r);
        setStep("questions");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/auth/reset-with-questions", {
        method: "POST",
        body: { phone, answer_1: a1, answer_2: a2, new_password: pw },
        auth: false,
      });
      toast("Password reset. Sign in.");
      navigate("/login");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return toast("New password must be at least 6 characters", "error");
    setBusy(true);
    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: { phone, reason, new_password: pw },
        auth: false,
      });
      toast("Reset request submitted. An admin will review it.", "success");
      navigate("/login");
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
          <p>Reset your password</p>
        </div>

        <div className="card">
          {step === "phone" ? (
            <form onSubmit={lookup}>
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>Forgot password</h2>
              <p className="page-sub" style={{ marginBottom: 18 }}>Enter your phone number to continue</p>
              <div className="field">
                <label>Phone number</label>
                <input className="input" inputMode="numeric" maxLength={11} placeholder="08012345678"
                  value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} />
              </div>
              <button className="btn primary block lg" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
            </form>
          ) : step === "questions" ? (
            <form onSubmit={reset}>
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>Answer questions</h2>
              <p className="page-sub" style={{ marginBottom: 18 }}>Verify it's you</p>
              {questions?.question_1 && (
                <div className="field">
                  <label>{questions.question_1}</label>
                  <input className="input" value={a1} onChange={(e) => setA1(e.target.value)} />
                </div>
              )}
              {questions?.question_2 && (
                <div className="field">
                  <label>{questions.question_2}</label>
                  <input className="input" value={a2} onChange={(e) => setA2(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label>New password</label>
                <input className="input" type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              <button className="btn primary block lg" disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
            </form>
          ) : (
            <form onSubmit={submitRequest}>
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>Request password reset</h2>
              <p className="page-sub" style={{ marginBottom: 18 }}>No security questions are set on this account. An admin will review your request.</p>
              <div className="field">
                <label>New password</label>
                <input className="input" type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              <div className="field">
                <label>Reason (optional)</label>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot my password" />
              </div>
              <button className="btn primary block lg" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
            </form>
          )}

          <div style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
            <Link to="/login" style={{ color: "var(--brand)", fontWeight: 700 }}>Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
