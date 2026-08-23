import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import { Icon } from "../components/ui";
import { useCachedData } from "../useCache";

export default function More() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: settings } = useCachedData("/settings/public", () => api("/settings/public", { auth: false }));

  const items = [
    { to: "/referrals", label: "Referrals & team", icon: <Icon.Team /> },
    { to: "/coupons", label: "Promo codes", icon: <Icon.Gift /> },
    { to: "/my-packages", label: "My packages", icon: <Icon.Invest /> },
    { to: "/history", label: "Transaction history", icon: <Icon.History /> },
  ];

  const socials = [
    { key: "telegram_url", label: "Telegram", href: settings?.telegram_url, color: "#229ED9", icon: <Icon.Send /> },
    { key: "telegram_channel_url", label: "Telegram channel", href: settings?.telegram_channel_url, color: "#229ED9", icon: <Icon.Send /> },
    { key: "telegram_group_url", label: "Telegram group", href: settings?.telegram_group_url, color: "#229ED9", icon: <Icon.Send /> },
    { key: "whatsapp_channel_url", label: "WhatsApp channel", href: settings?.whatsapp_channel_url, color: "#25D366", icon: <Icon.MessageCircle /> },
    { key: "whatsapp_group_url", label: "WhatsApp group", href: settings?.whatsapp_group_url, color: "#25D366", icon: <Icon.MessageCircle /> },
  ].filter((s) => s.href);

  return (
    <>
      <h1 className="page-title">More</h1>
      <p className="page-sub">Everything else in one place</p>

      <div className="list">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="row">
            <div className="ic accent">{i.icon}</div>
            <div className="body"><div className="t">{i.label}</div></div>
            <Icon.ChevronRight />
          </Link>
        ))}
      </div>

      {socials.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 8 }}>
            <h3>Join our community</h3>
          </div>
          <div className="list">
            {socials.map((s) => (
              <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" className="row">
                <div className="ic" style={{ background: s.color, color: "#fff" }}>{s.icon}</div>
                <div className="body"><div className="t">{s.label}</div></div>
                <Icon.ChevronRight />
              </a>
            ))}
          </div>
        </>
      )}

      <button
        className="btn danger block lg"
        style={{ marginTop: 16 }}
        onClick={() => { logout(); navigate("/login"); }}
      >
        <Icon.Logout /> Sign out
      </button>
    </>
  );
}
