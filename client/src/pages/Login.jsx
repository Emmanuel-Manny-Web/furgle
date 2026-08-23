import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, setSession } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/ui";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Admin "login as user" issues a token via ?_token=<jwt>
  useEffect(() => {
    const token = params.get("_token");
    if (!token) return;
    (async () => {
      try {
        setSession(token, null);
        const u = await api("/auth/me");
        if (u?.is_admin) return;
        login(token, u);
        navigate("/dashboard", { replace: true });
      } catch {
        /* invalid token — fall through to normal login */
      }
    })();
  }, [params, login, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) return toast("Phone must be 11 digits", "error");
    setBusy(true);
    try {
      const r = await api("/auth/login", { method: "POST", body: { phone, password }, auth: false });
      if (r.user?.is_admin) return toast("Invalid credentials", "error");
      login(r.token, r.user);
      toast(`Welcome back, ${r.user.name || ""}`);
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
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>Welcome back</h2>
          <p className="page-sub" style={{ marginBottom: 18 }}>Sign in to your account</p>

          <form onSubmit={submit}>
            <div className="field">
              <label>Phone number</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={11}
                placeholder="08012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                autoFocus
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn primary block lg" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="divider">or</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "center" }}>
            <Link to="/forgot-password" style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600 }}>
              Forgot password?
            </Link>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>
              New here? <Link to="/register" style={{ color: "var(--brand)", fontWeight: 700 }}>Create account</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
