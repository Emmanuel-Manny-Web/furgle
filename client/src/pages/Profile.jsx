import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon, Modal } from "../components/ui";
import { SECURITY_QUESTIONS } from "../constants";
import { useCachedData } from "../useCache";

export default function Profile() {
  const { user, refresh, setUser } = useAuth();
  const toast = useToast();

  const { data: banks } = useCachedData("/banks", () => api("/banks", { auth: false }));
  const bankList = banks || [];
  const { data: settings } = useCachedData("/settings/public", () => api("/settings/public", { auth: false }));
  const requirePin = !!settings?.require_withdrawal_pin;
  const allowBankChange = settings?.allow_bank_change !== false;

  const [bankModal, setBankModal] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [acctNo, setAcctNo] = useState("");
  const [acctName, setAcctName] = useState("");
  const [resolving, setResolving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [manualName, setManualName] = useState(false);

  const [pinStatus, setPinStatus] = useState(null);
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPinValue] = useState("");

  const [pwModal, setPwModal] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");

  const [secqModal, setSecqModal] = useState(false);
  const [sq1, setSq1] = useState("");
  const [sa1, setSa1] = useState("");
  const [sq2, setSq2] = useState("");
  const [sa2, setSa2] = useState("");
  const [savingSecQ, setSavingSecQ] = useState(false);

  useEffect(() => {
    api("/profile/withdrawal-pin/status").then(setPinStatus).catch(() => {});
  }, []);

  const resolve = async () => {
    if (!acctNo || !bankCode) return toast("Enter account number and bank", "error");
    setResolving(true);
    try {
      const bank = bankList.find((b) => b.code === bankCode);
      const r = await api("/banks/resolve", { method: "POST", body: { account_number: acctNo, bank_code: bankCode, bank_name: bank?.name || "" } });
      setAcctName(r.account_name);
      setManualName(false);
    } catch (err) {
      if (err.data && err.data.manual) {
        setManualName(true);
      } else {
        toast(err.message, "error");
      }
    } finally {
      setResolving(false);
    }
  };

  const saveBank = async () => {
    if (!acctName) return toast("Resolve the account name first", "error");
    const bank = bankList.find((b) => b.code === bankCode);
    setSavingBank(true);
    try {
      const u = await api("/profile/bank", {
        method: "PUT",
        body: { bank_name: bank?.name || bankCode, account_number: acctNo, account_name: acctName, bank_code: bankCode },
      });
      setUser(u);
      toast("Bank account saved", "success");
      setBankModal(false);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingBank(false);
    }
  };

  const setPin = async () => {
    if (pin.length !== 4) return toast("PIN must be 4 digits", "error");
    try {
      await api("/profile/withdrawal-pin/set", { method: "POST", body: { pin } });
      toast("Withdrawal PIN set", "success");
      setPinModal(false);
      setPinValue("");
      setPinStatus({ has_pin: true });
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const changePw = async () => {
    if (!curPw || newPw.length < 6) return toast("Enter current password and a new one (6+ chars)", "error");
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: curPw, new_password: newPw } });
      toast("Password changed", "success");
      setPwModal(false);
      setCurPw("");
      setNewPw("");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const openSecQ = () => {
    setSq1(user?.security_question_1 || "");
    setSq2(user?.security_question_2 || "");
    setSa1("");
    setSa2("");
    setSecqModal(true);
  };

  const saveSecQ = async () => {
    if (!sq1 || !sa1.trim() || !sq2 || !sa2.trim()) return toast("Complete both questions and answers", "error");
    setSavingSecQ(true);
    try {
      await api("/profile/security-questions/set", {
        method: "POST",
        body: { question_1: sq1, answer_1: sa1.trim(), question_2: sq2, answer_2: sa2.trim() },
      });
      toast("Security questions updated", "success");
      await refresh();
      setSecqModal(false);
      setSa1("");
      setSa2("");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingSecQ(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Profile</h1>

      <div className="card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{(user?.name || "U")[0].toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 18 }}>{user?.name || "User"}</h3>
          <div className="page-sub">{user?.phone}</div>
        </div>
        <span className="pill success">Balance {money(user?.wallet_balance)}</span>
      </div>

      {/* Bank account */}
      <div className="section-head" style={{ marginTop: 6 }}><h3>Bank account</h3></div>
      <div className="card">
        {user?.bank_name ? (
          <>
            <div className="row" style={{ boxShadow: "none", border: 0, padding: 0 }}>
              <div className="ic brand"><Icon.Bank /></div>
              <div className="body">
                <div className="t">{user.bank_name}</div>
                <div className="s">{user.account_name}</div>
              </div>
              <div className="end">
                <div className="a" style={{ fontFamily: "var(--font-display)", letterSpacing: 1 }}>{user.account_number}</div>
                {allowBankChange ? (
                  <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setBankModal(true)}>Change</button>
                ) : (
                  <div className="s" style={{ marginTop: 6, maxWidth: 140, textAlign: "right" }}>
                    Contact support to change your bank details
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <button className="btn primary block" onClick={() => setBankModal(true)}>+ Add bank account</button>
        )}
      </div>

      {/* Security */}
      <div className="section-head" style={{ marginTop: 6 }}><h3>Security</h3></div>
      <div className="list">
        {requirePin && (
          <button className="row" style={{ border: 0, cursor: "pointer", width: "100%", textAlign: "left" }}
            onClick={() => setPinModal(true)}>
            <div className="ic gold"><Icon.Shield /></div>
            <div className="body">
              <div className="t">Withdrawal PIN</div>
              <div className="s">{pinStatus?.has_pin ? "Set" : "Not set"}</div>
            </div>
            <Icon.ChevronRight />
          </button>
        )}
        <button className="row" style={{ border: 0, cursor: "pointer", width: "100%", textAlign: "left" }} onClick={() => setPwModal(true)}>
          <div className="ic gold"><Icon.Shield /></div>
          <div className="body">
            <div className="t">Change password</div>
            <div className="s">Update your login password</div>
          </div>
          <Icon.ChevronRight />
        </button>
        <button className="row" style={{ border: 0, cursor: "pointer", width: "100%", textAlign: "left" }} onClick={openSecQ}>
          <div className="ic gold"><Icon.Shield /></div>
          <div className="body">
            <div className="t">Security questions</div>
            <div className="s">{user?.security_question_1 ? "Set" : "Not set"} — used for password recovery</div>
          </div>
          <Icon.ChevronRight />
        </button>
        <Link to="/more" className="row">
          <div className="ic accent"><Icon.Spark /></div>
          <div className="body"><div className="t">More</div><div className="s">Referrals, coupons & more</div></div>
          <Icon.ChevronRight />
        </Link>
      </div>

      {/* Bank modal */}
      <Modal open={bankModal} onClose={() => setBankModal(false)} title="Bank account">
        <div className="field">
          <label>Bank</label>
          <select className="input select" value={bankCode} onChange={(e) => { setBankCode(e.target.value); setAcctName(""); setManualName(false); }}>
            <option value="">Select bank</option>
            {bankList.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Account number</label>
          <input className="input" inputMode="numeric" value={acctNo} onChange={(e) => { setAcctNo(e.target.value.replace(/\D/g, "").slice(0, 10)); setAcctName(""); setManualName(false); }} />
        </div>
        {manualName && (
          <div className="field">
            <label>Account name</label>
            <input className="input" value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="Enter account holder name" />
            <div className="page-sub" style={{ marginTop: 6 }}>Automatic verification isn't available for this payout method — enter the name exactly as it appears on the account.</div>
          </div>
        )}
        {acctName && (
          <div className="card tint" style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <Icon.Check />
            <div>
              <div style={{ fontWeight: 700 }}>{acctName}</div>
              <div className="page-sub">{manualName ? "Account name (entered manually)" : "Verified account name"}</div>
            </div>
          </div>
        )}
        {!acctName ? (
          <button className="btn ghost block" onClick={resolve} disabled={resolving}>{resolving ? "Resolving…" : "Resolve account name"}</button>
        ) : (
          <button className="btn primary block" onClick={saveBank} disabled={savingBank}>{savingBank ? "Saving…" : "Save bank account"}</button>
        )}
      </Modal>

      {/* PIN modal */}
      <Modal open={pinModal} onClose={() => setPinModal(false)} title={pinStatus?.has_pin ? "Change PIN" : "Set PIN"}>
        <div className="field">
          <label>4-digit PIN</label>
          <input className="input" type="password" inputMode="numeric" maxLength={4} placeholder="••••"
            value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))} style={{ letterSpacing: 6, fontSize: 20, textAlign: "center" }} />
        </div>
        <button className="btn primary block" onClick={setPin}>{pinStatus?.has_pin ? "Update PIN" : "Set PIN"}</button>
      </Modal>

      {/* Password modal */}
      <Modal open={pwModal} onClose={() => setPwModal(false)} title="Change password">
        <div className="field">
          <label>Current password</label>
          <input className="input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
        </div>
        <div className="field">
          <label>New password</label>
          <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </div>
        <button className="btn primary block" onClick={changePw}>Update password</button>
      </Modal>

      {/* Security questions modal */}
      <Modal open={secqModal} onClose={() => setSecqModal(false)} title="Security questions">
        <p className="page-sub" style={{ marginBottom: 14 }}>You'll need these answers to recover your password.</p>
        <div className="field">
          <label>Question 1</label>
          <select className="input select" value={sq1} onChange={(e) => setSq1(e.target.value)}>
            <option value="">Select a question</option>
            {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Answer 1</label>
          <input className="input" value={sa1} onChange={(e) => setSa1(e.target.value)} />
        </div>
        <div className="field">
          <label>Question 2</label>
          <select className="input select" value={sq2} onChange={(e) => setSq2(e.target.value)}>
            <option value="">Select a question</option>
            {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Answer 2</label>
          <input className="input" value={sa2} onChange={(e) => setSa2(e.target.value)} />
        </div>
        <button className="btn primary block" onClick={saveSecQ} disabled={savingSecQ}>
          {savingSecQ ? "Saving…" : "Save questions"}
        </button>
      </Modal>
    </>
  );
}
