import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import {
  Megaphone, Info, CheckCircle2, AlertTriangle, ShieldAlert,
  X, ArrowRight, ExternalLink,
} from "lucide-react";

const STYLE = {
  info:     { Icon: Info,         grad: "from-[#1E3A8A] via-[#3730A3] to-[#5B5BD6]", btn: "bg-[color:var(--accent-main)]" },
  success:  { Icon: CheckCircle2, grad: "from-[#064E3B] via-[#0F766E] to-[#10B981]", btn: "bg-[color:var(--success)]"     },
  warning:  { Icon: AlertTriangle,grad: "from-[#7c4807] via-[#a36a08] to-[#F59E0B]", btn: "bg-[color:var(--warning)]"     },
  critical: { Icon: ShieldAlert,  grad: "from-[#7F1D1D] via-[#B91C1C] to-[#EF4444]", btn: "bg-[color:var(--error)]"       },
};

export default function InAppAnnouncementPopup() {
  const [ann, setAnn] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api.get("/announcements/next")
      .then(({ data }) => { if (!cancelled && data?.announcement) setAnn(data.announcement); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);

  if (!ann) return null;
  const tok = STYLE[ann.style] || STYLE.info;
  const Icon = tok.Icon;

  const dismiss = async () => {
    setBusy(true);
    try { await api.post(`/announcements/${ann.id}/dismiss`); } catch { /* silent */ }
    setAnn(null);
    setBusy(false);
  };

  const cta = async () => {
    if (ann.cta_type === "external" && ann.cta_url) {
      window.open(ann.cta_url, "_blank", "noopener");
    } else if (ann.cta_type === "internal" && ann.cta_url) {
      navigate(ann.cta_url);
    }
    await dismiss();
  };

  return (
    <Dialog open={!!ann} onOpenChange={(o) => !busy && !o && dismiss()}>
      <DialogContent
        className="max-w-md w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0"
        data-testid="in-app-announcement"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Announcement</DialogTitle>
        <div className={`relative bg-gradient-to-br ${tok.grad} text-white p-6`}>
          <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
          <button
            onClick={dismiss}
            data-testid="ann-popup-close"
            className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80 flex items-center gap-1.5">
                <Megaphone className="w-3 h-3" /> Announcement
              </div>
              <div className="font-display font-extrabold text-xl mt-1 leading-tight" data-testid="ann-popup-title">
                {ann.title}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 bg-[color:var(--surface)]">
          <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap" data-testid="ann-popup-message">
            {ann.message}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={dismiss}
              disabled={busy}
              data-testid="ann-popup-dismiss"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70 disabled:opacity-50"
            >
              Dismiss
            </button>
            {ann.cta_type !== "none" && ann.cta_label && (
              <button
                onClick={cta}
                disabled={busy}
                data-testid="ann-popup-cta"
                className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-50 ${tok.btn}`}
              >
                {ann.cta_label}
                {ann.cta_type === "external" ? <ExternalLink className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
