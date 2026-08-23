import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../auth";
import { useToast, Icon } from "../components/ui";
import { useCachedData } from "../useCache";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [claiming, setClaiming] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const { data: settings } = useCachedData("/settings/public", () => api("/settings/public", { auth: false }));
  const { data: products } = useCachedData("/products", () => api("/products", { auth: false }));
  const { data: investments } = useCachedData("/investments", () => api("/investments"));
  const { data: claim, reload: reloadClaim } = useCachedData("/daily-claim/status", () => api("/daily-claim/status"));

  const productList = products || [];
  const activeCount = (investments || []).filter((x) => x.status === "active").length;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (settings?.welcome_modal_active) setWelcomeOpen(true);
  }, [settings]);

  const doClaim = async () => {
    setClaiming(true);
    try {
      const r = await api("/daily-claim/claim", { method: "POST" });
      toast(`${money(r.amount)} claimed!`, "success");
      await refresh();
      reloadClaim();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setClaiming(false);
    }
  };

  const firstName = (user?.name || "Investor").split(" ")[0];
  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

  const welcomeTitle =
    (settings?.welcome_modal_title || "").replace(/\{name\}/g, firstName) ||
    `Hi ${firstName} — welcome to Furgle`;
  const welcomeMsg =
    settings?.welcome_message ||
    "Earn daily returns on every plan you fund. Top up your wallet, pick a plan, and watch your profit land every 24 hours.";

  const showFeatured = !!settings?.home_featured_plan_enabled;
  const featured = showFeatured
    ? productList.find((p) => p.id === settings?.featured_product_id) || productList[0]
    : null;
  const others = productList.filter((p) => p.id !== featured?.id);
  const plansCount = Number(settings?.home_plans_count ?? 0);

  const quick = [
    { to: "/my-packages", label: "My Packages", icon: <Icon.Package />, tone: "brand" },
    { to: "/invest", label: "Invest", icon: <Icon.Invest />, tone: "gold" },
    { to: "/history", label: "History", icon: <Icon.History />, tone: "accent" },
    { to: "/referrals", label: "Refer", icon: <Icon.Team />, tone: "brand" },
  ];

  return (
    <>
      {/* Greeting */}
      <div className="greeting">
        <div className="avatar-lg">{(firstName || "U")[0].toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div className="hello">{greet}</div>
          <div className="name">{firstName}</div>
        </div>
        <div className="page-sub" style={{ textAlign: "right" }}>{date}</div>
      </div>

      {/* Balance card */}
      <div className="hero">
        <div className="eyebrow">Available balance</div>
        <div className="balance">{money(user?.wallet_balance)}</div>
        <div className="actions">
          <Link to="/deposit" className="btn" style={{ flex: 1, background: "#fff", color: "var(--brand)" }}>
            <Icon.ArrowDown /> Deposit
          </Link>
          <Link to="/withdraw" className="btn" style={{ flex: 1, background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}>
            <Icon.ArrowUp /> Withdraw
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div className="quick">
        {quick.map((q) => (
          <Link key={q.label} to={q.to} className="q">
            <div className={`qc ic ${q.tone}`}>{q.icon}</div>
            <span>{q.label}</span>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="stats">
        <div className="stat">
          <div className="ic accent"><Icon.Spark /></div>
          <div className="v">{money(user?.total_earnings, { compact: true })}</div>
          <div className="l">Total earned</div>
        </div>
        <Link to="/my-packages" className="stat" style={{ display: "block" }}>
          <div className="ic brand"><Icon.Package /></div>
          <div className="v">{activeCount}</div>
          <div className="l">Active plans</div>
        </Link>
        <Link to="/referrals" className="stat" style={{ display: "block" }}>
          <div className="ic gold"><Icon.Team /></div>
          <div className="v">{money(user?.referral_earnings, { compact: true })}</div>
          <div className="l">Referrals</div>
        </Link>
      </div>

      {/* Daily claim */}
      {claim?.enabled && (
        <button
          className="btn block soft"
          disabled={!claim.can_claim || claiming}
          onClick={doClaim}
          style={{ justifyContent: "space-between" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon.Gift /> Daily claim — {money(claim.amount)}</span>
          {claim.can_claim ? <span>Claim →</span> : claiming ? "…" : "Claimed"}
        </button>
      )}

      {/* Featured plan */}
      {featured && (
        <section>
          <div className="section-head">
            <h3>Featured plan</h3>
            <Link to="/invest" className="link">See all</Link>
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {featured.image_url && (
              <img src={featured.image_url} alt={featured.name} style={{ width: "100%", height: 130, objectFit: "cover" }} />
            )}
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 18 }}>{featured.name}</h3>
                <span className="pill accent">{featured.daily_profit_percent}% daily</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
                {featured.duration_days} days · from {money(featured.price)}
              </div>
              <Link to="/invest" className="btn primary block" style={{ marginTop: 14 }}>Invest now</Link>
            </div>
          </div>
        </section>
      )}

      {/* Section below featured plan */}
      {settings?.home_secondary_section_enabled &&
        (settings?.home_below_featured_mode === "image" && settings?.home_below_featured_image_url ? (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <img
              src={settings.home_below_featured_image_url}
              alt="Investment packages"
              style={{ width: "100%", display: "block" }}
            />
          </div>
        ) : (
          <section>
            <div className="section-head"><h3>More</h3></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Link to="/referrals" className="row">
                <div className="ic brand"><Icon.Team /></div>
                <div className="body">
                  <div className="t">Invite & earn</div>
                  <div className="s">{settings?.gen1_percent || 20}% / {settings?.gen2_percent || 5}% bonus</div>
                </div>
              </Link>
              <Link to="/coupons" className="row">
                <div className="ic accent"><Icon.Gift /></div>
                <div className="body">
                  <div className="t">Redeem coupon</div>
                  <div className="s">Promo codes for cash</div>
                </div>
              </Link>
            </div>
          </section>
        ))}

      {/* Investment plans */}
      {plansCount > 0 && others.length > 0 && (
        <section>
          <div className="section-head">
            <h3>Investment plans</h3>
            <Link to="/invest" className="link">See all</Link>
          </div>
          <div className="list">
            {others.slice(0, plansCount).map((p) => (
              <Link to="/invest" key={p.id} className="row">
                <div className="ic brand"><Icon.Invest /></div>
                <div className="body">
                  <div className="t">{p.name}</div>
                  <div className="s">{p.daily_profit_percent}% daily · {p.duration_days} days</div>
                </div>
                <div className="end">
                  <div className="a">{money(p.price)}</div>
                  <div className="s">from</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Welcome modal */}
      {welcomeOpen && (
        <div className="wmodal" onClick={() => setWelcomeOpen(false)}>
          <div className="wmodal-card" onClick={(e) => e.stopPropagation()}>
            <div className="wmodal-hero">
              <button className="wmodal-close" onClick={() => setWelcomeOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="wmodal-body">
              <div className="wmodal-eyebrow">Welcome aboard</div>
              <h2 className="wmodal-title">{welcomeTitle}</h2>
              <p className="wmodal-msg">{welcomeMsg}</p>
              <Link to="/deposit" className="btn accent block lg" onClick={() => setWelcomeOpen(false)}>
                Get started — claim your {money(settings?.welcome_bonus ?? 1000)} bonus
              </Link>
              {settings?.telegram_url && (
                <a
                  href={settings.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn block"
                  style={{ background: "#229ED9", color: "#fff", marginTop: 10 }}
                  onClick={() => setWelcomeOpen(false)}
                >
                  <Icon.Send /> Join our Telegram group
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
