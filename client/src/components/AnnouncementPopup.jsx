import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Icon } from "./ui";

const STYLES = {
  info: { grad: "linear-gradient(135deg,#0f766e,#14b8a6)", chip: "Announcement" },
  success: { grad: "linear-gradient(135deg,#15803d,#22c55e)", chip: "Update" },
  warning: { grad: "linear-gradient(135deg,#b45309,#f59e0b)", chip: "Notice" },
  critical: { grad: "linear-gradient(135deg,#b91c1c,#ef4444)", chip: "Important" },
};

export default function AnnouncementPopup() {
  const [ann, setAnn] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const a = await api("/announcements/next");
        if (!mounted || !a) return;
        const key = "ni_ann_dismissed_" + a.id;
        const last = Number(localStorage.getItem(key) || 0);
        const reshowMinutes = Number(a.reshow_interval_minutes || 0);
        if (last) {
          // 0 = show once, never again; otherwise re-show after the interval.
          if (reshowMinutes === 0) return;
          if (Date.now() - last < reshowMinutes * 60 * 1000) return;
        }
        setAnn(a);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ann) return null;

  const style = STYLES[ann.style] || STYLES.info;
  const hasCta = ann.cta_type !== "none" && !!ann.cta_label;

  const dismiss = () => {
    if (ann.id) localStorage.setItem("ni_ann_dismissed_" + ann.id, String(Date.now()));
    setAnn(null);
  };

  const onCta = () => {
    if (ann.cta_type === "external" && ann.cta_url) {
      window.open(ann.cta_url, "_blank", "noopener,noreferrer");
    } else if (ann.cta_type === "internal" && ann.cta_url) {
      navigate(ann.cta_url);
    }
    dismiss();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,5,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
      onClick={dismiss}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 480, padding: 0, overflow: "hidden", animation: "slideUp .2s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ background: style.grad, padding: "18px 20px", color: "#fff", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon.MessageCircle />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".14em", opacity: .85 }}>{style.chip}</div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{ann.title}</div>
            </div>
            <button onClick={dismiss} style={{ background: "transparent", border: 0, color: "#fff", fontSize: 24, cursor: "pointer", lineHeight: 1 }} aria-label="Dismiss">×</button>
          </div>
        </div>
        <div style={{ padding: 18 }}>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>{ann.message}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {hasCta && (
              <button className="btn primary block" onClick={onCta} style={{ flex: 1 }}>
                {ann.cta_label}
                {ann.cta_type === "external" ? " ↗" : ""}
              </button>
            )}
            <button className="btn ghost block" onClick={dismiss} style={{ flex: hasCta ? 0 : 1 }}>Dismiss</button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(30px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
    </div>
  );
}
