import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { formatNaira } from "@/lib/format";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowDownToLine, ArrowUpFromLine, Users, Ticket, Sparkles, Flame, ArrowRight,
  Megaphone, Send, Sparkle, Briefcase, Check, Coins, Calendar, TrendingUp, Wallet, ChevronRight,
  Leaf, Sprout, TreePine, Trees, Mountain, Flower2, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const WELCOME_ART = "https://images.unsplash.com/photo-1777576968636-efa4ed929c9a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwbW9uZXklMjB3ZWFsdGglMjBjb25jZXB0JTIwdGVycmFjb3R0YSUyMHNhbmR8ZW58MHx8fHwxNzgxMjczMDgzfDA&ixlib=rb-4.1.0&q=85";

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL || ""}${url}`;
}

function fmtCountdown(sec) {
  if (sec <= 0) return "Ready";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* Daily reward — slim claim strip */
function DailyClaimBanner({ onClaimed }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get("/daily-claim/status").then(({ data }) => { if (!cancelled) setStatus(data); }).catch(() => {});
    const t = setInterval(() => setStatus((s) => s ? { ...s, cooldown_remaining_sec: Math.max(0, s.cooldown_remaining_sec - 1) } : s), 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  if (!status || !status.enabled) return null;
  const ready = status.can_claim || status.cooldown_remaining_sec === 0;
  const claim = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/daily-claim/claim");
      toast.success(`+${data.amount.toLocaleString()} added to wallet`);
      setJustClaimed(true);
      setTimeout(() => setJustClaimed(false), 1400);
      const fresh = await api.get("/daily-claim/status");
      setStatus(fresh.data);
      onClaimed?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Claim failed");
    } finally { setBusy(false); }
  };
  return (
    <div
      className="mt-4 rounded-[var(--radius)] p-3.5 sm:p-4 border border-[color:var(--gold)]/40 bg-[color:var(--gold-soft)] flex items-center gap-3 animate-fade-up"
      data-testid="daily-claim-card"
    >
      <div className="w-10 h-10 rounded-xl bg-[color:var(--gold)]/20 text-[color:var(--gold)] flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display font-semibold text-[color:var(--text-primary)] leading-tight">
          Daily reward · {formatNaira(status.amount)}
        </div>
        <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
          {ready ? "Available now — claim before it resets" : `Next claim in ${fmtCountdown(status.cooldown_remaining_sec)}`}
        </div>
      </div>
      <button
        onClick={claim}
        disabled={!ready || busy}
        data-testid="daily-claim-btn"
        className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
          justClaimed
            ? "bg-[color:var(--success)] text-white"
            : ready
              ? "bg-[color:var(--gold)] text-white hover:brightness-95 hover:-translate-y-0.5"
              : "bg-[color:var(--surface-2)] text-[color:var(--text-tertiary)] cursor-not-allowed"
        } disabled:cursor-not-allowed`}
      >
        {justClaimed ? <><Check className="w-4 h-4" /> Done</> : busy ? "Claiming…" : ready ? "Claim" : "Locked"}
      </button>
    </div>
  );
}

const NATURE_ICONS = [Leaf, Sprout, TreePine, Trees, Mountain, Flower2];

/* Investment plan card */
function PlanCard({ p, idx = 0, onInvest }) {
  const totalRoi = (p.daily_profit_percent * p.duration_days).toFixed(0);
  const NatureIcon = NATURE_ICONS[idx % NATURE_ICONS.length];
  return (
    <div
      className="snap-start shrink-0 w-[80%] xs:w-[72%] sm:w-auto card-soft overflow-hidden group hover:-translate-y-0.5 transition-transform"
      data-testid={`plan-card-${p.id}`}
    >
      <div className="aspect-[16/9] w-full bg-[color:var(--surface-alt)] overflow-hidden relative">
        {p.image_url ? (
          <img src={resolveUrl(p.image_url)} alt={p.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 hero-gradient flex items-center justify-center">
            <NatureIcon className="w-9 h-9 text-white/85" />
          </div>
        )}
        <div className="absolute top-3 right-3 pill pill-accent backdrop-blur shadow-md">
          <Flame className="w-3 h-3" /> {totalRoi}% ROI
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold text-base leading-tight text-[color:var(--text-primary)] truncate">{p.name}</div>
            <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">{p.daily_profit_percent}% daily · {p.duration_days} days</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">From</div>
            <div className="font-display font-bold text-sm text-[color:var(--brand)] leading-tight">{formatNaira(p.price)}</div>
          </div>
        </div>
        <button
          onClick={() => onInvest(p)}
          data-testid={`plan-invest-${p.id}`}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] py-2.5 rounded-full font-semibold shadow-md shadow-[color:var(--brand)]/20 transition-all"
        >
          <TrendingUp className="w-4 h-4" /> Invest
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [welcomeOpen, setWelcomeOpen] = useState(settings.welcome_modal_active !== false);

  useEffect(() => {
    (async () => {
      await refresh();
      try {
        const { data: ps } = await api.get("/products");
        setProducts(ps);
      } catch { /* noop */ }
      try {
        const { data: inv } = await api.get("/investments");
        setActiveCount((inv || []).filter((i) => i.status === "active").length);
      } catch { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeWelcome = () => setWelcomeOpen(false);
  const goInvest = () => navigate("/invest");

  const firstName = user?.name?.split(" ")[0] || "Investor";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" });
  const featuredEnabled = settings.home_featured_plan_enabled !== false;
  const secondaryEnabled = settings.home_secondary_section_enabled !== false;
  const plansCount = Number(settings.home_plans_count) || 3;
  const showImage = settings.home_below_featured_mode === "image" && settings.home_below_featured_image_url;

  const featured =
    products.find((p) => p.id === settings.featured_product_id) ||
    [...products].sort((a, b) => (b.daily_profit_percent * b.duration_days) - (a.daily_profit_percent * a.duration_days))[0];
  const otherPlans = products.filter((p) => !featured || p.id !== featured.id);

  const stats = [
    { icon: Coins, label: "Total earned", value: formatNaira(user?.total_earnings || 0, { compact: true }), tone: "accent", testid: "stat-earnings" },
    { icon: Briefcase, label: "Active plans", value: String(activeCount), tone: "brand", testid: "stat-packages", to: "/my-packages" },
    { icon: Users, label: "Referral bonus", value: formatNaira(user?.referral_earnings || 0, { compact: true }), tone: "gold", testid: "stat-referral", to: "/team" },
  ];
  const toneMap = {
    brand: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    accent: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    gold: "bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
  };

  return (
    <UserLayout>
      <div data-testid="dashboard-hero">
        {/* ===== Greeting ===== */}
        <div className="flex items-center justify-between gap-3 animate-fade-up">
          <div>
            <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">{today}</div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1 text-[color:var(--text-primary)]">Hi, {firstName} 👋</h1>
          </div>
        </div>

        {/* ===== Wallet card ===== */}
        <div
          className="mt-5 relative overflow-hidden rounded-[var(--radius)] hero-gradient text-white p-6 sm:p-7 shadow-lg animate-fade-up"
          data-testid="wallet-card"
        >
          <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-8 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 text-white/75 text-[11px] uppercase tracking-[0.2em] font-semibold">
              <Wallet className="w-3.5 h-3.5" /> Wallet balance
            </div>
            <div className="font-display font-extrabold text-4xl sm:text-5xl tracking-tight mt-2.5 break-all" data-testid="hero-balance">
              {formatNaira(user?.wallet_balance)}
            </div>
            <div className="flex gap-3 mt-6">
              <Link
                to="/deposit"
                data-testid="hero-deposit-btn"
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white text-[color:var(--brand)] font-semibold shadow-md hover:-translate-y-0.5 transition-transform"
              >
                <ArrowDownToLine className="w-4 h-4" /> Deposit
              </Link>
              <Link
                to="/withdraw"
                data-testid="hero-withdraw-btn"
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white/15 backdrop-blur border border-white/30 text-white font-semibold hover:bg-white/25 transition-colors"
              >
                <ArrowUpFromLine className="w-4 h-4" /> Withdraw
              </Link>
            </div>
          </div>
        </div>

        {/* ===== Stat tiles ===== */}
        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3 animate-fade-up">
          {stats.map((s) => {
            const Inner = (
              <>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${toneMap[s.tone]}`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <div className="mt-2.5">
                  <div className="font-display font-bold text-base sm:text-lg text-[color:var(--text-primary)] leading-none">{s.value}</div>
                  <div className="text-[10px] sm:text-xs text-[color:var(--text-secondary)] mt-1 leading-tight">{s.label}</div>
                </div>
              </>
            );
            return s.to ? (
              <Link key={s.testid} to={s.to} data-testid={s.testid} className="card-soft p-3 sm:p-4 flex flex-col hover:-translate-y-0.5 transition-transform">{Inner}</Link>
            ) : (
              <div key={s.testid} data-testid={s.testid} className="card-soft p-3 sm:p-4 flex flex-col">{Inner}</div>
            );
          })}
        </div>

        {/* ===== Daily reward ===== */}
        <DailyClaimBanner onClaimed={refresh} />

        {/* ===== Announcement ===== */}
        {settings.home_announcement_active && (settings.home_announcement || settings.home_announcement_image_url) && (
          <div className="mt-4 rounded-[var(--radius)] overflow-hidden border border-[color:var(--border-light)] bg-[color:var(--brand-soft)] animate-fade-up" data-testid="home-announcement">
            {settings.home_announcement_image_url && (
              <img src={resolveUrl(settings.home_announcement_image_url)} alt="Announcement" className="w-full max-h-56 object-cover" data-testid="home-announcement-image" />
            )}
            {settings.home_announcement && (
              <div className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[color:var(--surface)] text-[color:var(--brand)] flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="text-sm text-[color:var(--text-primary)] whitespace-pre-wrap">{settings.home_announcement}</div>
              </div>
            )}
          </div>
        )}

        {/* ===== Featured plan — highlight banner ===== */}
        {featured && featuredEnabled && (
          <div className="mt-7 animate-fade-up">
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mb-3">Featured plan</div>
            <div className="card-soft overflow-hidden grid grid-cols-1 sm:grid-cols-12" data-testid="featured-plan">
              <div className="sm:col-span-5 relative min-h-[150px]">
                {featured.image_url ? (
                  <img src={resolveUrl(featured.image_url)} alt={featured.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 hero-gradient" />
                )}
                <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[color:var(--accent-main)] text-white text-[10px] font-bold uppercase tracking-wider shadow">
                  <Flame className="w-3 h-3" /> Hot pick
                </span>
              </div>
              <div className="sm:col-span-7 p-5">
                <h3 className="font-display text-xl sm:text-2xl font-bold text-[color:var(--text-primary)] leading-tight">{featured.name}</h3>
                <p className="text-sm text-[color:var(--text-secondary)] mt-1.5 line-clamp-2">{featured.description}</p>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    { label: "Daily", value: `${featured.daily_profit_percent}%`, icon: Coins },
                    { label: "Days", value: featured.duration_days, icon: Calendar },
                    { label: "ROI", value: `${(featured.daily_profit_percent * featured.duration_days).toFixed(0)}%`, icon: TrendingUp },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl bg-[color:var(--surface-alt)] border border-[color:var(--border-light)] px-2 py-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">{m.label}</div>
                      <div className="font-display font-bold text-sm mt-0.5 text-[color:var(--text-primary)]">{m.value}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={goInvest}
                  data-testid="featured-cta"
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[color:var(--brand)] text-[color:var(--brand-ink)] font-semibold hover:bg-[color:var(--brand-hover)] hover:-translate-y-0.5 transition-all"
                >
                  Invest from {formatNaira(featured.price)} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Plans — scrollable list ===== */}
        {products.length > 0 && (
          <div className="mt-7 animate-fade-up" data-testid="plans-section">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">Investment plans</div>
              <Link to="/invest" data-testid="see-all-plans" className="inline-flex items-center gap-0.5 text-sm font-semibold text-[color:var(--brand)] hover:gap-1.5 transition-all">
                See all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-x-auto sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 snap-x pb-1">
              {(featuredEnabled ? otherPlans : products).slice(0, plansCount).map((p, i) => (
                <PlanCard key={p.id} p={p} idx={i} onInvest={goInvest} />
              ))}
            </div>
          </div>
        )}

        {/* ===== Secondary quick actions / custom image ===== */}
        {secondaryEnabled && (
          showImage ? (
            <div className="mt-6 rounded-[var(--radius)] overflow-hidden border border-[color:var(--border-default)] animate-fade-up" data-testid="home-below-featured-image">
              <img src={resolveUrl(settings.home_below_featured_image_url)} alt="Investment packages" className="w-full object-cover" />
            </div>
          ) : (
            <div className="mt-7 animate-fade-up">
              <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mb-3">More</div>
              <div className="grid grid-cols-2 gap-3">
                <Link to="/team" data-testid="cta-team" className="card-soft p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform">
                  <div className="w-10 h-10 rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand)] flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></div>
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-[color:var(--text-primary)] text-sm">Invite & earn</div>
                    <div className="text-xs text-[color:var(--text-secondary)] mt-0.5 truncate">{settings.gen1_percent || 10}% / {settings.gen2_percent || 5}% bonus</div>
                  </div>
                </Link>
                <Link to="/coupons" data-testid="cta-coupon" className="card-soft p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform">
                  <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] flex items-center justify-center shrink-0"><Ticket className="w-5 h-5" /></div>
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-[color:var(--text-primary)] text-sm">Redeem coupon</div>
                    <div className="text-xs text-[color:var(--text-secondary)] mt-0.5 truncate">Promo codes for cash</div>
                  </div>
                </Link>
              </div>
            </div>
          )
        )}
      </div>

      {/* ===== Welcome modal ===== */}
      <Dialog open={welcomeOpen} onOpenChange={(o) => { if (!o) closeWelcome(); }}>
        <DialogContent
          data-testid="welcome-modal"
          className="user-theme duration-500 w-[calc(100vw-2rem)] max-w-md rounded-[1.25rem] overflow-hidden p-0 border border-[color:var(--border-default)] shadow-2xl bg-[color:var(--surface)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative h-40 overflow-hidden">
            <img src={WELCOME_ART} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--surface)] via-transparent to-transparent" />
            <button
              type="button"
              onClick={closeWelcome}
              data-testid="welcome-close-btn"
              aria-label="Close"
              className="absolute right-3 top-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/45 hover:bg-black/65 text-white backdrop-blur-sm transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-6 pt-4 pb-6">
            <div className="inline-flex items-center gap-1.5 text-[color:var(--accent-main)] text-[10px] uppercase tracking-[0.18em] font-bold">
              <Sparkle className="w-3 h-3" /> Welcome aboard
            </div>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl md:text-3xl font-semibold mt-2 text-[color:var(--text-primary)]" data-testid="welcome-modal-title">
                {(() => {
                  const tpl = settings.welcome_modal_title;
                  if (tpl && tpl.trim()) return tpl.replace(/\{name\}/g, firstName);
                  return `Hi ${firstName} — welcome to Furgle`;
                })()}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap" data-testid="welcome-message">
              {settings.welcome_message ||
                "Earn daily returns on every plan you fund. Top up your wallet, pick a plan, and watch your profit land every 24 hours. Refer friends to earn across 2 generations."}
            </p>
            <DialogFooter className="flex-col sm:flex-col gap-3 mt-5">
              <Link
                to="/deposit"
                onClick={closeWelcome}
                data-testid="welcome-bonus-cta"
                className="w-full inline-flex items-center justify-center gap-2 bg-[color:var(--accent-main)] hover:bg-[color:var(--accent-hover)] text-white font-semibold rounded-full px-5 py-3 shadow-md shadow-[color:var(--accent-main)]/25 transition-colors"
              >
                <Sparkles className="w-4 h-4" /> Get started — claim your {formatNaira(settings.welcome_bonus ?? 750)} bonus
              </Link>
              {settings.telegram_url && (
                <a
                  href={settings.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeWelcome}
                  data-testid="welcome-telegram-btn"
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#229ED9] hover:bg-[#1f8fc4] text-white font-semibold rounded-full px-5 py-3 shadow-md transition-colors"
                >
                  <Send className="w-4 h-4" /> Join our Telegram group
                </a>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
}
