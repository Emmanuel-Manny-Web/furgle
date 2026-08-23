import React, { useState } from "react";
import { api, money, timeAgo } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon } from "../components/ui";
import { useCachedData } from "../useCache";

export default function Referrals() {
  const { user } = useAuth();
  const toast = useToast();
  const [level, setLevel] = useState("1");
  const { data } = useCachedData("/referrals", () => api("/referrals"));

  const copy = async () => {
    try {
      const link = `${window.location.origin}/register?ref=${data.referral_code}`;
      await navigator.clipboard.writeText(link);
      toast("Referral link copied", "success");
    } catch {
      toast("Copy failed", "error");
    }
  };

  const gen1 = data?.gen1?.users || [];
  const gen2 = data?.gen2?.users || [];
  const members = level === "1" ? gen1.map((u) => ({ ...u, lvl: 1 })) : gen2.map((u) => ({ ...u, lvl: 2 }));

  return (
    <>
      <h1 className="page-title">Referrals</h1>
      <p className="page-sub">Earn {data?.gen1?.percent ?? 20}% on every direct referral's investment</p>

      <div className="hero" style={{ borderRadius: 22, padding: 20 }}>
        <div className="eyebrow">Your referral code</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>{data?.referral_code}</div>
          <button className="btn sm" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }} onClick={copy}><Icon.Copy /> Copy</button>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: "rgba(255,255,255,.8)" }}>
          Total referral earnings: <strong>{money(data?.total_referral_earnings)}</strong>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div
          className="stat"
          onClick={() => setLevel("1")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLevel("1")}
          style={{ cursor: "pointer", outline: level === "1" ? "2px solid var(--brand)" : "2px solid transparent", outlineOffset: -2 }}
        >
          <div className="ic brand"><Icon.Team /></div>
          <div className="v">{gen1.length}</div>
          <div className="l">Level 1</div>
        </div>
        <div
          className="stat"
          onClick={() => setLevel("2")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLevel("2")}
          style={{ cursor: "pointer", outline: level === "2" ? "2px solid var(--brand)" : "2px solid transparent", outlineOffset: -2 }}
        >
          <div className="ic gold"><Icon.Team /></div>
          <div className="v">{gen2.length}</div>
          <div className="l">Level 2</div>
        </div>
      </div>

      <div className="section-head"><h3>Your team — Level {level}</h3></div>
      {members.length === 0 ? (
        <div className="empty">
          {level === "1" ? "No level 1 referrals yet. Share your link to start earning." : "No level 2 referrals yet."}
        </div>
      ) : (
        <div className="list">
          {members.map((u) => (
            <div key={u.id + u.lvl} className="row">
              <div className={`ic ${u.lvl === 1 ? "brand" : "gold"}`}>
                <Icon.Profile />
              </div>
              <div className="body">
                <div className="t">{u.name || u.phone}</div>
                <div className="s">Level {u.lvl} · joined {timeAgo(u.joined_at)}</div>
              </div>
              <div className="end">
                <div className="a">{money(u.total_invested, { compact: true })}</div>
                <div className="s">invested</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
