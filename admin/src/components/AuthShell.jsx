import React from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { useBranding } from "@/context/BrandingContext";

/* Shared auth chrome — a single centered glass card floating over a full-bleed
 * botanical background (light + dark variants), used by Login / Register /
 * ForgotPassword. */
const LIGHT_BG =
  "https://images.unsplash.com/photo-1463320726281-696a485928c7?auto=format&fit=crop&w=1600&q=80";
const DARK_BG =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80";

export default function AuthShell({ title, subtitle, children, footer, testid }) {
  const { logoUrl } = useBranding();
  return (
    <div className="user-theme min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden bg-[color:var(--app-bg)]">
      <img src={LIGHT_BG} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover dark:hidden" />
      <img src={DARK_BG} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover hidden dark:block" />
      <div className="absolute inset-0 bg-[color:var(--app-bg)]/55 backdrop-blur-md dark:bg-black/55 dark:backdrop-blur-xl" />

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-up">
        <div
          className="bg-[color:var(--surface)]/90 backdrop-blur-2xl border border-[color:var(--border-light)] shadow-2xl rounded-3xl p-7 sm:p-9"
          data-testid={testid}
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl overflow-hidden ring-1 ring-[color:var(--border-default)] bg-white flex items-center justify-center">
              <img src={logoUrl} alt="Furgle" className="w-full h-full object-contain p-1" />
            </div>
            <div className="font-display text-2xl font-bold tracking-tight mt-3 text-[color:var(--brand)]">
              Natura<span className="text-[color:var(--accent-main)]">lis</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-5 text-[color:var(--text-primary)]">{title}</h1>
            {subtitle && <p className="text-sm text-[color:var(--text-secondary)] mt-2">{subtitle}</p>}
          </div>

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-[color:var(--text-secondary)]">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
